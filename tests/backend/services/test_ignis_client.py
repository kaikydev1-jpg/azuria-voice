"""Ignis client: discovery of the local port and the HTTP contract (Ignis 0.3.0)."""
from __future__ import annotations

import base64
import json
import socket

import pytest

from .ignis_fake import FakeIgnis


@pytest.fixture
def ignis():
    fake = FakeIgnis().start()
    yield fake
    fake.stop()


@pytest.fixture
def client_mod():
    from services import ignis_client

    return ignis_client


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_discover_defaults_to_11470(client_mod, tmp_path):
    assert client_mod.discover_base_url(env={}, home=tmp_path) == "http://127.0.0.1:11470"


def test_discover_reads_port_from_linux_config(client_mod, tmp_path):
    cfg = tmp_path / ".config" / "ignis" / "config.json"
    cfg.parent.mkdir(parents=True)
    cfg.write_text(json.dumps({"porta": 12000}))
    assert client_mod.discover_base_url(env={}, home=tmp_path) == "http://127.0.0.1:12000"


def test_discover_flatpak_config(client_mod, tmp_path):
    cfg = tmp_path / ".var/app/io.github.kaikydev1jpg.Ignis/config/ignis/config.json"
    cfg.parent.mkdir(parents=True)
    cfg.write_text(json.dumps({"porta": 12345}))
    assert client_mod.discover_base_url(env={}, home=tmp_path) == "http://127.0.0.1:12345"


def test_discover_windows_appdata(client_mod, tmp_path):
    cfg = tmp_path / "Roaming" / "ignis" / "config.json"
    cfg.parent.mkdir(parents=True)
    cfg.write_text(json.dumps({"porta": 13000}))
    env = {"APPDATA": str(tmp_path / "Roaming")}
    assert client_mod.discover_base_url(env=env, home=tmp_path / "nohome") == "http://127.0.0.1:13000"


def test_discover_ignores_broken_config(client_mod, tmp_path):
    cfg = tmp_path / ".config" / "ignis" / "config.json"
    cfg.parent.mkdir(parents=True)
    cfg.write_text("{not json")
    assert client_mod.discover_base_url(env={}, home=tmp_path) == "http://127.0.0.1:11470"


def test_discover_env_override_strips_v1(client_mod, tmp_path):
    env = {"IGNIS_BASE_URL": "http://localhost:14000/v1/"}
    assert client_mod.discover_base_url(env=env, home=tmp_path) == "http://localhost:14000"


def test_discover_rejects_remote_env(client_mod, tmp_path):
    env = {"IGNIS_BASE_URL": "http://example.com:11470"}
    assert client_mod.discover_base_url(env=env, home=tmp_path) == "http://127.0.0.1:11470"


def test_version_none_when_closed(client_mod):
    client = client_mod.IgnisClient(f"http://127.0.0.1:{_free_port()}", timeout=1.0)
    assert client.version() is None


def test_version_and_models(client_mod, ignis):
    client = client_mod.IgnisClient(ignis.base_url)
    assert client.version()["nome"] == "Ignis"
    assert "omnivoice" in client.models()


def test_speech_returns_wav(client_mod, ignis):
    wav = client_mod.IgnisClient(ignis.base_url).speech(
        "Olá", voice=None, language="Portuguese", seed=7, timeout=5.0
    )
    assert wav[:4] == b"RIFF"
    body = ignis.calls("POST", "/v1/audio/speech")[0]
    assert body == {"model": "omnivoice", "input": "Olá", "language": "Portuguese",
                    "response_format": "wav", "seed": 7}


def test_503_maps_to_audio_nao_preparado(client_mod, ignis):
    ignis.voice_ready = False
    with pytest.raises(client_mod.IgnisError) as err:
        client_mod.IgnisClient(ignis.base_url).speech("Olá", voice=None, language=None, seed=None, timeout=5.0)
    assert (err.value.status, err.value.code) == (503, "audio_nao_preparado")


def test_closed_maps_to_ignis_fechado(client_mod):
    client = client_mod.IgnisClient(f"http://127.0.0.1:{_free_port()}", timeout=1.0)
    with pytest.raises(client_mod.IgnisError) as err:
        client.speech("Olá", voice=None, language=None, seed=None, timeout=1.0)
    assert (err.value.status, err.value.code) == (0, "ignis_fechado")


def test_register_voice_sends_base64(client_mod, ignis):
    client = client_mod.IgnisClient(ignis.base_url)
    client.register_voice("azuria-abc", "texto de referência", b"RIFFxxxx")
    body = ignis.calls("POST", "/v1/audio/voices")[0]
    assert body["name"] == "azuria-abc"
    assert body["ref_text"] == "texto de referência"
    assert base64.b64decode(body["wav_b64"]) == b"RIFFxxxx"
    assert client.voices() == ["azuria-abc"]


def test_prepare_passes_families(client_mod, ignis):
    client_mod.IgnisClient(ignis.base_url).prepare(["voz", "transcricao"])
    assert ignis.calls("POST", "/motor/audio/preparar") == [{"familias": ["voz", "transcricao"]}]


def test_loopback_requests_bypass_proxies(client_mod, ignis, monkeypatch):
    # A corporate proxy must never see (or break) calls to the local engine.
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:9")
    monkeypatch.setenv("http_proxy", "http://127.0.0.1:9")
    assert client_mod.IgnisClient(ignis.base_url).version()["nome"] == "Ignis"
