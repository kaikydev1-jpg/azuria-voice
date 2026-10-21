"""Public error responses and request-derived logs must not expose diagnostics."""
from __future__ import annotations

import asyncio
import json
import logging
import sys
import types

import pytest


_PRIVATE = "private-canary /srv/private/model.bin\nTraceback: internal source"


@pytest.mark.usefixtures("asr_model_installed")
@pytest.mark.parametrize("stage", ["tts", "asr"])
def test_transcribe_preflight_withholds_private_diagnostics(tmp_path, monkeypatch, stage):
    from api.routers import dub_core as dc

    audio = tmp_path / "audio.wav"
    audio.write_bytes(b"unused: model loading fails before audio decoding")
    monkeypatch.setitem(dc._dub_jobs, "security-preflight", {"audio_path": str(audio)})
    monkeypatch.setattr(dc, "should_preload_tts_asr", lambda: stage == "tts")

    async def tts_failure():
        raise RuntimeError(_PRIVATE)

    def asr_failure(**_kwargs):
        raise RuntimeError(_PRIVATE)

    monkeypatch.setattr(dc, "get_model", tts_failure)
    monkeypatch.setattr("services.asr_backend.load_active_asr_backend", asr_failure)

    async def collect():
        response = await dc.dub_transcribe_stream("security-preflight")
        return "".join([
            chunk.decode() if isinstance(chunk, bytes) else chunk
            async for chunk in response.body_iterator
        ])

    body = asyncio.run(collect())
    assert "event: error" in body and "event: done" in body
    assert "private-canary" not in body
    assert "/srv/private" not in body
    assert "Traceback" not in body


def test_watermark_api_withholds_detector_exception(monkeypatch):
    import torch
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from api.routers import watermark as route
    from services import watermark

    monkeypatch.setattr(route, "_check_available", lambda: True)
    monkeypatch.setattr(watermark, "_check_available", lambda: True)
    monkeypatch.setattr("services.audio_io.load_audio", lambda _path: (torch.zeros(1, 160), 16000))

    def failed_detector():
        raise RuntimeError(_PRIVATE)

    monkeypatch.setattr(watermark, "_get_detector", failed_detector)
    app = FastAPI()
    app.include_router(route.router)
    response = TestClient(app).post(
        "/watermark/detect", files={"file": ("sample.wav", b"unused", "audio/wav")}
    )
    assert response.status_code == 200
    assert response.json()["is_watermarked"] is False
    assert response.json()["error"]
    assert "private-canary" not in response.text
    assert "/srv/private" not in response.text


def _fake_argos(monkeypatch, failure=None):
    root = types.ModuleType("argostranslate")
    package = types.ModuleType("argostranslate.package")
    translate = types.ModuleType("argostranslate.translate")

    def installed_packages():
        if failure is not None:
            raise failure(_PRIVATE)
        return []

    package.get_installed_packages = installed_packages
    root.package = package
    root.translate = translate
    for mod in (root, package, translate):
        monkeypatch.setitem(sys.modules, mod.__name__, mod)
    monkeypatch.setattr("core.execstack.ensure_ctranslate2_loadable", lambda: None)


@pytest.mark.parametrize("failure", [ImportError, ValueError])
def test_argos_package_failure_withholds_private_diagnostics(monkeypatch, failure):
    from api.routers.dub_translate import dub_translate
    from schemas.requests import TranslateRequest

    _fake_argos(monkeypatch, failure)
    response = asyncio.run(dub_translate(TranslateRequest(
        provider="argos", source_lang="en", target_lang="es",
        segments=[{"id": "s1", "text": "hello"}],
    )))
    assert response.status_code == 422
    assert json.loads(response.body)["error"]
    assert b"private-canary" not in response.body
    assert b"/srv/private" not in response.body


@pytest.mark.parametrize("lang, expected", [
    ("zh-TW", "Argos does not provide Traditional Chinese; choose NLLB for this script"),
    ("invalid!", "Choose a valid source and target language"),
])
def test_argos_validation_still_returns_actionable_language_error(monkeypatch, lang, expected):
    from api.routers.dub_translate import dub_translate
    from schemas.requests import TranslateRequest

    _fake_argos(monkeypatch)
    response = asyncio.run(dub_translate(TranslateRequest(
        provider="argos", source_lang="en", target_lang=lang,
        segments=[{"id": "s1", "text": "hello"}],
    )))
    assert response.status_code == 422
    assert json.loads(response.body)["error"] == expected


def test_capture_fallback_mode_cannot_forge_log_line(monkeypatch, caplog):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from api.routers import capture

    def missing(*, purpose, **_kwargs):
        return {"code": "asr_model_missing"} if purpose == "dictation" else None

    class Backend:
        id = "test-asr"

        def transcribe(self, _path, **_kwargs):
            return {"text": "hello", "segments": [], "language": "en"}

    monkeypatch.setattr("services.asr_backend.asr_model_missing_error", missing)
    monkeypatch.setattr("services.asr_backend.load_active_asr_backend", Backend)
    app = FastAPI()
    app.include_router(capture.router)
    caplog.set_level(logging.INFO, logger=capture.logger.name)
    response = TestClient(app).post(
        "/transcribe", files={"audio": ("a.wav", b"unused", "audio/wav")},
        data={"mode": "fast\nforged-entry\r\x1b[31m"},
    )
    assert response.status_code == 200, response.text
    messages = [r.getMessage() for r in caplog.records if "Capture transcription done" in r.getMessage()]
    assert len(messages) == 1
    assert "\n" not in messages[0] and "\r" not in messages[0] and "\x1b" not in messages[0]
