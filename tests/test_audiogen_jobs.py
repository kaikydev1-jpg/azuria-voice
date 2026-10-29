"""Queue, real cancellation, failure reporting and saving of music / SFX jobs.

The worker is replaced by a tiny script speaking the same JSON-lines protocol,
so no model, Torch or network is involved in the process-control paths.
"""
import sys
import textwrap
import time

import pytest

from services.audiogen import catalog, jobs, params, policy, runtime

FAKE_WORKER = textwrap.dedent('''
    import json, sys, time, os
    req = json.load(open(sys.argv[1]))
    def emit(**e):
        sys.stdout.write(json.dumps(e) + "\\n"); sys.stdout.flush()
    mode = req["prompt"]
    emit(event="stage", stage="loading")
    if mode == "crash":
        sys.stderr.write("boom from the model\\n"); sys.exit(7)
    if mode == "error":
        emit(event="error", code="out_of_memory", message="not enough memory"); sys.exit(1)
    if mode == "hang":
        emit(event="stage", stage="generating")
        open(os.path.join(req["outdir"], "started"), "w").write("1")
        time.sleep(120)
    import numpy as np, soundfile as sf
    files = []
    for i in range(req["variations"]):
        emit(event="progress", variation=i + 1, variations=req["variations"], fraction=0.5)
        p = os.path.join(req["outdir"], f"take_{i + 1}.wav")
        sf.write(p, np.zeros((4800, 2), dtype="float32") + 0.1, 48000, subtype="FLOAT")
        files.append(p)
    emit(event="result", files=files, sample_rate=48000, channels=2, device="cpu", seconds=0.5, fell_back=False)
''')


@pytest.fixture
def mgr(tmp_path, monkeypatch):
    script = tmp_path / "fake_worker.py"
    script.write_text(FAKE_WORKER)
    import core.config as config

    monkeypatch.setattr(config, "DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setattr(runtime, "venv_python", lambda model: sys.executable)
    monkeypatch.setattr(runtime, "WORKER_SCRIPT", script)
    monkeypatch.setattr(runtime, "weights_status", lambda model: {"state": "ready", "snapshot": str(tmp_path), "pinned_revision": "x"})
    monkeypatch.setattr(runtime, "runtime_status", lambda model: {"engine_id": model["runtime"], "installed": True})
    saved = []
    monkeypatch.setattr(jobs.Manager, "_save_takes", lambda self, job, plan, result: saved.append(result) or [{"id": "t1"}])
    m = jobs.Manager()
    m.saved = saved
    return m


def submit(m, prompt, mid="ace-step-v1", variations=1):
    model = catalog.get(mid)
    decision = policy.decide(mid, model["kind"], "personal")
    plan = params.build_plan(model, prompt=prompt, variations=variations, seed=1)
    return m.submit(plan, decision, content_preset=None, device="auto")


def wait(m, job_id, states=jobs.TERMINAL, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        job = m.get(job_id)
        if job["state"] in states:
            return job
        time.sleep(0.05)
    raise AssertionError(f"job stuck: {m.get(job_id)}")


def test_success_reports_device_and_hands_files_to_saving(mgr):
    job = wait(mgr, submit(mgr, "calm", variations=2)["id"])
    assert job["state"] == "done" and job["device"] == "cpu"
    assert job["takes"] == [{"id": "t1"}]
    assert len(mgr.saved[0]["files"]) == 2


def test_public_job_shows_what_was_asked_for(mgr):
    job = wait(mgr, submit(mgr, "calm piano")["id"])
    assert job["prompt"] == "calm piano" and job["profile"] == "balanced" and job["duration_s"] == 30.0
    assert not any(key.startswith("_") for key in job)


def test_worker_error_event_is_reported_with_its_code(mgr):
    job = wait(mgr, submit(mgr, "error")["id"])
    assert job["state"] == "failed" and job["error"]["code"] == "out_of_memory"


def test_worker_crash_reports_log_tail(mgr):
    job = wait(mgr, submit(mgr, "crash")["id"])
    assert job["state"] == "failed" and job["error"]["code"] == "worker_exited"
    assert "boom from the model" in job["error"]["message"]


def test_cancel_running_job_kills_the_worker_and_leaves_no_output(mgr, tmp_path):
    job = submit(mgr, "hang")
    wait(mgr, job["id"], states=("running",))
    for _ in range(100):  # until the worker is really inside "generating"
        if (tmp_path / "data" / "audiogen_tmp" / job["id"] / "started").exists():
            break
        time.sleep(0.05)
    started = time.time()
    mgr.cancel(job["id"])
    done = wait(mgr, job["id"], timeout=15)
    assert done["state"] == "cancelled" and time.time() - started < 15
    assert mgr.saved == []
    assert not (tmp_path / "data" / "audiogen_tmp" / job["id"]).exists()


def test_cancel_queued_job_never_runs_and_queue_continues(mgr):
    first = submit(mgr, "hang")
    second = submit(mgr, "calm")
    wait(mgr, first["id"], states=("running",))
    assert mgr.get(second["id"])["queue_position"] == 0
    assert mgr.cancel(second["id"])["state"] == "cancelled"
    mgr.cancel(first["id"])
    wait(mgr, first["id"])
    third = wait(mgr, submit(mgr, "calm")["id"])
    assert third["state"] == "done"
    assert mgr.get(second["id"])["state"] == "cancelled"


def test_jobs_run_one_at_a_time_in_order(mgr):
    a, b = submit(mgr, "calm"), submit(mgr, "calm")
    wait(mgr, a["id"]); done_b = wait(mgr, b["id"])
    assert mgr.get(a["id"])["finished_at"] <= done_b["started_at"] + 0.01


def test_unknown_job_cancel_is_none(mgr):
    assert mgr.cancel("deadbeef0000") is None


def test_stalled_worker_is_killed(mgr, monkeypatch):
    monkeypatch.setattr(jobs, "_stall_s", lambda: 1.0)
    job = wait(mgr, submit(mgr, "hang")["id"])
    assert job["state"] == "failed" and job["error"]["code"] == "stalled"


def test_submit_refuses_when_runtime_or_weights_are_missing(mgr, monkeypatch):
    monkeypatch.setattr(runtime, "venv_python", lambda model: None)
    with pytest.raises(policy.PolicyError) as err:
        submit(mgr, "calm")
    assert err.value.status == 409 and err.value.code == "runtime_not_installed"
    monkeypatch.setattr(runtime, "venv_python", lambda model: sys.executable)
    monkeypatch.setattr(runtime, "weights_status", lambda model: {"state": "missing", "snapshot": None})
    with pytest.raises(policy.PolicyError) as err:
        submit(mgr, "calm")
    assert err.value.code == "weights_missing"


def test_queue_has_a_limit(mgr, monkeypatch):
    monkeypatch.setattr(jobs, "MAX_QUEUED", 2)
    ids = [submit(mgr, "hang")["id"], submit(mgr, "hang")["id"]]
    with pytest.raises(policy.PolicyError) as err:
        submit(mgr, "hang")
    assert err.value.status == 429
    for i in ids:
        mgr.cancel(i)


def test_successful_job_saves_marked_audio_history_and_provenance(tmp_path, monkeypatch):
    pytest.importorskip("torch")
    import sqlite3

    import core.config as config
    import core.db as core_db

    monkeypatch.setattr(config, "OUTPUTS_DIR", str(tmp_path / "out"))
    (tmp_path / "out").mkdir()
    db = tmp_path / "t.db"

    def connect():
        conn = sqlite3.connect(str(db)); conn.row_factory = sqlite3.Row
        return conn

    monkeypatch.setattr(core_db, "get_db", connect)
    core_db.ensure_schema()
    marked = []
    import services.watermark as watermark

    monkeypatch.setattr(watermark, "mark_synthetic", lambda w, r, *, context, force=False: marked.append(context) or w)
    import numpy as np, soundfile as sf

    wav = tmp_path / "take_1.wav"
    sf.write(wav, np.zeros((4800, 2), dtype="float32") + 0.1, 48000, subtype="FLOAT")
    model = catalog.get("stable-audio-open-1.0")
    decision = policy.decide("stable-audio-open-1.0", "sfx", "commercial", conditions_ack=True)
    plan = params.build_plan(model, prompt="door slam", seed=5)
    job = {"_decision": decision, "_preset": "game_sfx", "id": "j"}
    takes = jobs.Manager()._save_takes(job, plan, {"files": [str(wav)], "seconds": 1.0, "device": "cpu"})
    assert marked == ["audiogen.finalize"]
    assert (tmp_path / "out" / takes[0]["audio_path"]).is_file()
    with core_db.db_conn() as conn:
        row = conn.execute("SELECT mode, text, seed, provenance FROM generation_history").fetchone()
    from services.audiogen import provenance

    record = provenance.loads(row["provenance"])
    assert row["mode"] == "sfx" and row["seed"] == 5
    assert record["declared_use"] == {"purpose": "commercial", "conditions_acknowledged": True,
                                      "content_preset": "game_sfx", "license_class": "commercial_conditions"}
