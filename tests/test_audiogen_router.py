"""/audio-gen: server-side purpose enforcement, no downloads from status, provenance export."""
import io
import sqlite3
import zipfile

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import core.config as config
import core.db as core_db
from api.routers import audiogen as router_mod
from services import model_acceptance
from services.audiogen import provenance


@pytest.fixture
def client(tmp_path, monkeypatch):
    db = tmp_path / "t.db"

    def connect():
        conn = sqlite3.connect(str(db))
        conn.row_factory = sqlite3.Row
        return conn

    monkeypatch.setattr(core_db, "get_db", connect)
    core_db.ensure_schema()
    monkeypatch.setattr(router_mod, "OUTPUTS_DIR", str(tmp_path))
    app = FastAPI()
    app.include_router(router_mod.router)
    return TestClient(app, base_url="http://testserver")


@pytest.fixture
def accepted(monkeypatch):
    monkeypatch.setattr(router_mod.policy, "require_license_acceptance", lambda model: None)


@pytest.fixture
def submitted(monkeypatch):
    seen = []

    def fake(plan, decision, *, content_preset, device):
        seen.append((plan, decision, content_preset, device))
        return {"id": "abc123abc123", "state": "queued"}

    monkeypatch.setattr(router_mod.manager, "submit", fake)
    return seen


def body(**kw):
    return {"model": "ace-step-v1", "prompt": "calm piano", **kw}


def test_catalog_never_downloads(client, monkeypatch):
    import huggingface_hub

    def boom(*a, **k):
        raise AssertionError("catalog must not download")

    for name in ("snapshot_download", "hf_hub_download"):
        monkeypatch.setattr(huggingface_hub, name, boom)
    data = client.get("/audio-gen/catalog").json()
    ids = {m["id"]: m for m in data["models"]}
    assert set(ids) == {"ace-step-v1", "musicgen-small", "musicgen-stereo-medium", "stable-audio-open-1.0", "audioldm2"}
    assert ids["stable-audio-open-1.0"]["license"]["class"] == "commercial_conditions"
    assert ids["ace-step-v1"]["status"]["weights"]["state"] in ("missing", "ready", "revision_mismatch")
    assert client.get("/audio-gen/catalog?kind=music").json()["models"][0]["kind"] == "music"


def test_commercial_with_noncommercial_model_is_403(client, accepted, submitted):
    r = client.post("/audio-gen/music", json=body(model="musicgen-small", purpose="commercial"))
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "model_not_eligible_for_commercial"
    assert r.json()["detail"]["alternatives"] == ["ace-step-v1"]
    assert submitted == []


def test_conditions_model_needs_acknowledgement(client, accepted, submitted):
    r = client.post("/audio-gen/sfx", json=body(model="stable-audio-open-1.0", purpose="commercial"))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "commercial_conditions_confirmation_required"
    r = client.post("/audio-gen/sfx", json=body(model="stable-audio-open-1.0", purpose="commercial", conditions_acknowledged=True))
    assert r.status_code == 202
    assert submitted[0][1].conditions_acknowledged is True


def test_personal_default_is_recorded_as_personal(client, accepted, submitted):
    r = client.post("/audio-gen/music", json=body(model="musicgen-small"))
    assert r.status_code == 202
    assert submitted[0][1].purpose == "personal"


def test_noncommercial_licence_must_be_accepted_first(client, submitted, monkeypatch):
    monkeypatch.setattr(model_acceptance, "ensure_accepted",
                        lambda repos: (_ for _ in ()).throw(model_acceptance.ModelLicenceNotAccepted([{"repo_id": "facebook/musicgen-small"}])))
    r = client.post("/audio-gen/music", json=body(model="musicgen-small"))
    assert r.status_code == 403 and r.json()["detail"]["code"] == model_acceptance.ERROR_CODE
    assert submitted == []


def test_wrong_kind_unknown_model_and_bad_input(client, accepted, submitted):
    assert client.post("/audio-gen/sfx", json=body(model="ace-step-v1")).status_code == 404
    assert client.post("/audio-gen/music", json=body(model="nope")).status_code == 404
    assert client.post("/audio-gen/music", json=body(purpose="enterprise")).status_code == 422
    assert client.post("/audio-gen/music", json=body(extra="x")).status_code == 422
    assert client.post("/audio-gen/music", json=body(duration_s=9999)).status_code == 422
    assert client.post("/audio-gen/music", json=body(content_preset="nope")).status_code == 422
    assert client.post("/audio-gen/music", json=body(profile="custom")).status_code == 422
    assert submitted == []


def test_generate_hands_the_event_loop_to_the_job_manager(client, accepted, submitted):
    # The sync route runs in a worker thread with no loop; the dependency must
    # supply it or resident TTS engines are never unloaded before the music model loads.
    router_mod.manager._loop = None
    assert client.post("/audio-gen/music", json=body(model="musicgen-small")).status_code == 202
    assert router_mod.manager._loop is not None


def test_job_list_reports_the_queue_limit(client):
    data = client.get("/audio-gen/jobs").json()
    assert data["queue_limit"] == router_mod.MAX_QUEUED and isinstance(data["jobs"], list)


def test_cancel_and_get_unknown_job(client):
    assert client.post("/audio-gen/jobs/deadbeef0000/cancel").status_code == 404
    assert client.get("/audio-gen/jobs/deadbeef0000").status_code == 404


def _insert(take_id, mode, prov, audio="x.wav"):
    with core_db.db_conn() as conn:
        conn.execute("INSERT INTO generation_history (id, text, mode, audio_path, provenance, created_at) VALUES (?,?,?,?,?,1)",
                     (take_id, "a prompt", mode, audio, prov))


def test_old_take_provenance_is_not_recorded(client, tmp_path):
    _insert("old1", "music", None)
    assert client.get("/audio-gen/takes/old1/provenance").json() == {"recorded": False}
    assert "not recorded" in client.get("/audio-gen/takes/old1/provenance?format=text").text.lower()


def test_only_music_and_sfx_takes_are_served(client):
    _insert("tts1", "clone", None)
    assert client.get("/audio-gen/takes/tts1/provenance").status_code == 404


def test_export_zip_has_wav_and_both_provenance_files(client, tmp_path):
    from services.audiogen import catalog, params, policy

    model = catalog.get("ace-step-v1")
    record = provenance.build(params.build_plan(model, prompt="p", seed=1), policy.decide("ace-step-v1", "music", None),
                              content_preset=None, audio={"sample_rate": 48000, "channels": 2},
                              runtime={"device": "cpu"}, variation=0, app_version="0.5.11")
    (tmp_path / "t.wav").write_bytes(b"RIFFxxxx")
    _insert("take1", "music", provenance.dumps(record), "t.wav")
    r = client.get("/audio-gen/takes/take1/export")
    assert r.status_code == 200
    names = zipfile.ZipFile(io.BytesIO(r.content)).namelist()
    assert names == ["take1.wav", "take1.provenance.json", "take1.provenance.txt"]
