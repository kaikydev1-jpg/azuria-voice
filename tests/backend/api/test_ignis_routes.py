"""`/api/settings/ignis/*`: status, turning "use the GPU through Ignis" on and
off, and preparing its voice — against a fake Ignis on loopback."""
from __future__ import annotations

import socket
import sys

import pytest

@pytest.fixture
def ignis(monkeypatch):
    from ..services.ignis_fake import FakeIgnis as Fake

    fake = Fake().start()
    monkeypatch.setenv("IGNIS_BASE_URL", fake.base_url)
    yield fake
    fake.stop()


@pytest.fixture
def app(monkeypatch, tmp_path):
    monkeypatch.setenv("OMNIVOICE_DATA_DIR", str(tmp_path))
    for name in ("LLM_DEFAULT_PROVIDER", "OMNIVOICE_LLM_BACKEND", "OMNIVOICE_TTS_BACKEND",
                 "OMNIVOICE_ASR_BACKEND", "IGNIS_MODEL"):
        monkeypatch.delenv(name, raising=False)
    for mod in list(sys.modules):
        if mod in ("core", "services", "api", "engines") or mod.startswith(
            ("core.", "services.", "api.", "engines.")
        ):
            del sys.modules[mod]
    from core import db

    db.init_db()
    from fastapi import FastAPI
    from api.routers import ignis as ignis_router

    application = FastAPI()
    application.include_router(ignis_router.router)
    return application


def _client(app):
    from fastapi.testclient import TestClient

    return TestClient(app, client=("127.0.0.1", 12345))


def _choices():
    from core import prefs
    from services import llm_providers, settings_store

    return {
        "tts": prefs.get("tts_backend"),
        "asr": prefs.get("asr_backend"),
        "llm": prefs.get("llm_backend"),
        "provider": llm_providers.stored_active_provider_id(),
        "asr_url": settings_store.get_text("asr.openai_compat.base_url"),
        "asr_model": settings_store.get_text("asr.openai_compat.model"),
    }


def test_status_reports_open_ignis_and_gpu(app, ignis):
    body = _client(app).get("/api/settings/ignis/status").json()
    assert body["open"] is True
    assert body["enabled"] is False
    assert body["gpu"] == "AMD Radeon RX 580"
    assert body["voice"]["ready"] is True
    assert body["voice"]["license"] == "CC BY-NC 4.0"
    assert body["transcription"]["ready"] is True
    assert body["download_url"].startswith("https://github.com/kaikydev1-jpg/Ignis/")


def test_status_when_ignis_is_closed(app, monkeypatch):
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    monkeypatch.setenv("IGNIS_BASE_URL", f"http://127.0.0.1:{port}")
    body = _client(app).get("/api/settings/ignis/status").json()
    assert body["open"] is False and body["gpu"] is None


def test_status_on_macos_says_unsupported(app, ignis, monkeypatch):
    from services import ignis_mode

    monkeypatch.setattr(ignis_mode.sys, "platform", "darwin")
    assert _client(app).get("/api/settings/ignis/status").json()["platform_supported"] is False


def test_enable_then_disable_restores_previous_choices(app, ignis):
    from core import prefs
    from services import llm_providers, settings_store

    prefs.set_("tts_backend", "kittentts")
    prefs.set_("asr_backend", "faster-whisper")
    llm_providers.set_active_provider("ollama")
    settings_store.set_text("asr.openai_compat.base_url", "http://127.0.0.1:9000/v1")
    before = _choices()

    client = _client(app)
    on = client.post("/api/settings/ignis/enable")
    assert on.status_code == 200, on.text
    assert on.json()["enabled"] is True
    applied = _choices()
    assert applied["tts"] == "ignis"
    assert applied["asr"] == "openai-compat-asr"
    assert (applied["llm"], applied["provider"]) == ("openai-compat", "ignis")
    assert applied["asr_url"] == ignis.base_url + "/v1"
    assert applied["asr_model"] == "whisper-1"

    # Enabling twice must not overwrite the remembered choices with Ignis's.
    assert client.post("/api/settings/ignis/enable").status_code == 200
    off = client.post("/api/settings/ignis/disable")
    assert off.status_code == 200 and off.json()["enabled"] is False
    assert _choices() == before


def test_enable_with_ignis_closed_changes_nothing(app, monkeypatch):
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    monkeypatch.setenv("IGNIS_BASE_URL", f"http://127.0.0.1:{port}")
    before = _choices()
    r = _client(app).post("/api/settings/ignis/enable")
    assert r.status_code == 409
    assert _choices() == before


def test_enable_skips_families_ignis_does_not_serve(app, ignis):
    from core import prefs

    prefs.set_("asr_backend", "faster-whisper")
    ignis.models = ["omnivoice", "qwen3-4b"]  # no whisper-1
    assert _client(app).post("/api/settings/ignis/enable").status_code == 200
    assert prefs.get("tts_backend") == "ignis"
    assert prefs.get("asr_backend") == "faster-whisper"


def test_prepare_forwards_families(app, ignis):
    r = _client(app).post("/api/settings/ignis/prepare", json={"families": ["voz"]})
    assert r.status_code == 200
    assert ignis.calls("POST", "/motor/audio/preparar") == [{"familias": ["voz"]}]


def test_prepare_rejects_unknown_family(app, ignis):
    r = _client(app).post("/api/settings/ignis/prepare", json={"families": ["musica"]})
    assert r.status_code == 422


def test_routes_refuse_non_loopback(app, ignis):
    from fastapi.testclient import TestClient

    r = TestClient(app, client=("203.0.113.9", 1)).get("/api/settings/ignis/status")
    assert r.status_code in (401, 403)
