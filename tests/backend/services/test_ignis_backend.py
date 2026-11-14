"""The `ignis` TTS engine: OmniVoice on the person's GPU through Ignis.

Hermetic: a fake Ignis on loopback (ignis_fake.py) plays the engine. Covers
availability, one-time voice registration, re-registration when the reference
changes, a closed engine and the error contract of IGNIS_PARA_AZURIA.md §5.
"""
from __future__ import annotations

import socket
import time

import pytest

from .ignis_fake import FakeIgnis, tiny_wav


@pytest.fixture
def ignis(monkeypatch):
    fake = FakeIgnis().start()
    monkeypatch.setenv("IGNIS_BASE_URL", fake.base_url)
    yield fake
    fake.stop()


@pytest.fixture
def engine_cls():
    from engines.ignis import IgnisTTSBackend

    return IgnisTTSBackend


def _ref(tmp_path, name: str, seconds: float) -> str:
    path = tmp_path / name
    path.write_bytes(tiny_wav(seconds))
    return str(path)


def test_registered_in_the_engine_registry(engine_cls):
    from services import tts_backend

    assert tts_backend.get_backend_class("ignis") is engine_cls
    assert engine_cls.id == "ignis"
    assert "CC BY-NC 4.0" in engine_cls.display_name
    assert engine_cls.supports_cloning is True
    assert engine_cls.supports_voice_design is False


def test_available_only_with_omnivoice(engine_cls, ignis):
    assert engine_cls.is_available()[0] is True
    ignis.models = ["whisper-1"]
    ok, why = engine_cls.is_available()
    assert ok is False and "omnivoice" in why.lower()


def test_unavailable_when_ignis_closed(engine_cls, monkeypatch):
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    monkeypatch.setenv("IGNIS_BASE_URL", f"http://127.0.0.1:{port}")
    ok, why = engine_cls.is_available()
    assert ok is False and "Open Ignis" in why


def test_generate_returns_24k_audio(engine_cls, ignis):
    wav = engine_cls().generate("Olá, mundo.", language="Portuguese")
    assert wav.dim() == 2 and wav.shape[0] == 1 and wav.shape[1] > 0
    assert engine_cls().sample_rate == 24000
    assert ignis.calls("POST", "/v1/audio/speech")[0]["language"] == "Portuguese"


def test_auto_language_is_not_sent(engine_cls, ignis):
    engine_cls().generate("Olá.", language="auto")
    assert "language" not in ignis.calls("POST", "/v1/audio/speech")[0]


def test_clone_registers_once(engine_cls, ignis, tmp_path):
    ref = _ref(tmp_path, "a.wav", 0.2)
    engine = engine_cls()
    engine.generate("Um.", ref_audio=ref, ref_text="referência")
    engine.generate("Dois.", ref_audio=ref, ref_text="referência")
    registered = ignis.calls("POST", "/v1/audio/voices")
    assert len(registered) == 1
    name = registered[0]["name"]
    assert name.startswith("azuria-")
    speech = ignis.calls("POST", "/v1/audio/speech")
    assert [body["voice"] for body in speech] == [name, name]


def test_known_voice_is_not_uploaded_again_after_restart(engine_cls, ignis, tmp_path):
    ref = _ref(tmp_path, "a.wav", 0.2)
    engine_cls().generate("Um.", ref_audio=ref, ref_text="r")
    engine_cls().generate("Dois.", ref_audio=ref, ref_text="r")  # fresh instance, same voice
    assert len(ignis.calls("POST", "/v1/audio/voices")) == 1


def test_changed_reference_registers_new_voice(engine_cls, ignis, tmp_path):
    engine = engine_cls()
    engine.generate("Um.", ref_audio=_ref(tmp_path, "a.wav", 0.2), ref_text="r")
    engine.generate("Dois.", ref_audio=_ref(tmp_path, "b.wav", 0.3), ref_text="r")
    names = [body["name"] for body in ignis.calls("POST", "/v1/audio/voices")]
    assert len(names) == 2 and names[0] != names[1]


def test_closed_mid_session_fails_fast(engine_cls, ignis):
    from engines.ignis import TTSInputError

    engine = engine_cls()
    engine.generate("Um.")
    ignis.stop()
    started = time.monotonic()
    with pytest.raises(TTSInputError, match="Open Ignis"):
        engine.generate("Dois.")
    assert time.monotonic() - started < 5


def test_503_message_tells_to_prepare(engine_cls, ignis):
    from engines.ignis import TTSInputError

    ignis.voice_ready = False
    with pytest.raises(TTSInputError, match="Prepare in Ignis"):
        engine_cls().generate("Olá.")


def test_400_passes_ignis_message_through(engine_cls, ignis):
    from engines.ignis import TTSInputError

    ignis.speech_errors = [(400, "pedido_invalido", "Texto vazio depois da limpeza.")]
    with pytest.raises(TTSInputError, match="Texto vazio"):
        engine_cls().generate("Olá.")


def test_502_retries_once(engine_cls, ignis):
    ignis.speech_errors = [(502, "motor_sem_resposta", "O servidor de voz caiu.")]
    wav = engine_cls().generate("Olá.")
    assert wav.shape[1] > 0
    assert len(ignis.calls("POST", "/v1/audio/speech")) == 2


def test_two_502_in_a_row_surface(engine_cls, ignis):
    ignis.speech_errors = [(502, "motor_sem_resposta", "caiu"), (502, "motor_sem_resposta", "caiu")]
    with pytest.raises(RuntimeError, match="Ignis"):
        engine_cls().generate("Olá.")


def test_empty_text_is_refused_before_calling_ignis(engine_cls, ignis):
    from engines.ignis import TTSInputError

    with pytest.raises(TTSInputError):
        engine_cls().generate("   ")
    assert ignis.calls("POST", "/v1/audio/speech") == []


def test_unload_frees_ignis_audio(engine_cls, ignis):
    engine_cls().unload()
    assert ignis.calls("POST", "/motor/audio/descarregar") == [{}]
