"""Client for Ignis, the owner's local AI engine (``kaikydev1-jpg/Ignis``).

Ignis runs models on the person's own GPU (Vulkan for AMD and Intel, CUDA on
NVIDIA, ROCm on Linux) and serves an OpenAI-compatible API on loopback. The
contract this module speaks is ``docs/IGNIS_PARA_AZURIA.md`` in the Ignis
repository (Ignis 0.3.0): ``/motor/*`` for state and preparation,
``/v1/audio/*`` for voice (OmniVoice) and transcription (Whisper).

Only loopback hosts are ever contacted, and requests bypass any configured
HTTP proxy: nothing here leaves the machine. Standard library only.
"""
from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from collections.abc import Mapping
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

DEFAULT_PORT = 11470
DEFAULT_BASE_URL = f"http://127.0.0.1:{DEFAULT_PORT}"
DOWNLOAD_URL = "https://github.com/kaikydev1-jpg/Ignis/releases/latest"
FLATPAK_ID = "io.github.kaikydev1jpg.Ignis"
_LOOPBACK = {"127.0.0.1", "localhost", "::1"}

CLOSED_MESSAGE = (
    "Ignis is not open. Open Ignis (it stays near the clock) and try again."
)
NOT_PREPARED_MESSAGE = (
    "The voice is not prepared in Ignis yet. Prepare it in Settings → Performance "
    "(Prepare in Ignis) or in the Ignis window, then try again."
)


class IgnisError(Exception):
    """An Ignis failure in the OpenAI error shape, or the engine being closed.

    ``status`` is the HTTP status (0 when Ignis did not answer), ``code`` the
    machine-readable reason (``audio_nao_preparado``, ``motor_sem_resposta``,
    ``ignis_fechado``…) and ``message`` text fit to show the person.
    """

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _config_paths(env: Mapping[str, str], home: Path) -> list[Path]:
    paths: list[Path] = []
    appdata = env.get("APPDATA")
    if appdata:
        paths.append(Path(appdata) / "ignis" / "config.json")
    xdg = env.get("XDG_CONFIG_HOME")
    if xdg:
        paths.append(Path(xdg) / "ignis" / "config.json")
    paths.append(home / ".config" / "ignis" / "config.json")
    paths.append(home / ".var" / "app" / FLATPAK_ID / "config" / "ignis" / "config.json")
    return paths


def _loopback_base(url: str) -> str | None:
    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return None
    if parts.scheme != "http" or (parts.hostname or "") not in _LOOPBACK:
        return None
    try:
        port = parts.port
    except ValueError:
        return None
    host = parts.hostname if parts.hostname != "::1" else "[::1]"
    return f"http://{host}:{port or DEFAULT_PORT}"


def discover_base_url(env: Mapping[str, str] | None = None, home: Path | None = None) -> str:
    """Where this machine's Ignis listens, without the ``/v1`` suffix.

    ``IGNIS_BASE_URL`` (loopback only) wins, then the ``porta`` saved in the
    first Ignis ``config.json`` found (Windows ``%APPDATA%``, Linux
    ``~/.config``, Flatpak ``~/.var/app/…``), then the default port 11470.
    """
    env = os.environ if env is None else env
    home = Path.home() if home is None else home
    override = env.get("IGNIS_BASE_URL")
    if override:
        base = _loopback_base(override)
        if base:
            return base
    for path in _config_paths(env, home):
        try:
            port = json.loads(path.read_text(encoding="utf-8")).get("porta")
        except (OSError, ValueError, AttributeError):
            continue
        if isinstance(port, int) and 0 < port < 65536:
            return f"http://127.0.0.1:{port}"
    return DEFAULT_BASE_URL


# Loopback only: never route the local engine through a configured proxy.
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class IgnisClient:
    def __init__(self, base_url: str | None = None, timeout: float = 5.0) -> None:
        base = _loopback_base(base_url) if base_url else None
        self.base_url = base or discover_base_url()
        self.timeout = timeout

    # ── transport ────────────────────────────────────────────────────────
    def _request(self, method: str, path: str, body: Any = None,
                 timeout: float | None = None) -> tuple[bytes, str]:
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(self.base_url + path, data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with _OPENER.open(req, timeout=timeout or self.timeout) as resp:  # nosec B310 - loopback http only
                return resp.read(), resp.headers.get("Content-Type", "")
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            code, message = "erro", f"Ignis answered HTTP {exc.code}."
            try:
                err = json.loads(raw or b"{}").get("error") or {}
                code = str(err.get("code") or code)
                message = str(err.get("message") or message)
            except (ValueError, AttributeError):
                # Not the OpenAI error shape (proxy page, empty body): keep the
                # generic "Ignis answered HTTP <status>" message set above.
                pass
            if exc.code == 503 and code == "audio_nao_preparado":
                message = NOT_PREPARED_MESSAGE
            raise IgnisError(exc.code, code, message) from None
        except (urllib.error.URLError, OSError) as exc:
            raise IgnisError(0, "ignis_fechado", CLOSED_MESSAGE) from exc

    def _json(self, method: str, path: str, body: Any = None) -> Any:
        raw, _ = self._request(method, path, body)
        try:
            return json.loads(raw or b"{}")
        except ValueError as exc:
            raise IgnisError(502, "resposta_invalida", "Ignis sent an unreadable answer.") from exc

    # ── state ────────────────────────────────────────────────────────────
    def version(self) -> dict | None:
        """``/motor/versao``, or None when Ignis is closed."""
        try:
            data = self._json("GET", "/motor/versao")
        except IgnisError as exc:
            if exc.status == 0:
                return None
            raise
        return data if isinstance(data, dict) and data.get("nome") == "Ignis" else None

    def models(self) -> list[str]:
        data = self._json("GET", "/v1/models")
        return [str(m.get("id")) for m in data.get("data", []) if isinstance(m, dict)]

    def state(self) -> dict:
        return self._json("GET", "/motor/estado")

    def audio_plan(self) -> dict:
        return self._json("GET", "/motor/audio")

    def prepare(self, families: list[str]) -> dict:
        return self._json("POST", "/motor/audio/preparar", {"familias": list(families)})

    def unload_audio(self) -> None:
        self._json("POST", "/motor/audio/descarregar", {})

    # ── voices and speech ────────────────────────────────────────────────
    def voices(self) -> list[str]:
        data = self._json("GET", "/v1/audio/voices")
        return [str(v.get("name")) for v in data.get("data", []) if isinstance(v, dict)]

    def register_voice(self, name: str, ref_text: str, wav: bytes) -> None:
        self._json("POST", "/v1/audio/voices", {
            "name": name,
            "ref_text": ref_text,
            "wav_b64": base64.b64encode(wav).decode("ascii"),
        })

    def speech(self, text: str, *, voice: str | None, language: str | None,
               seed: int | None, timeout: float) -> bytes:
        body: dict[str, Any] = {"model": "omnivoice", "input": text}
        if voice:
            body["voice"] = voice
        if language:
            body["language"] = language
        body["response_format"] = "wav"
        if seed is not None:
            body["seed"] = int(seed)
        raw, _ = self._request("POST", "/v1/audio/speech", body, timeout=timeout)
        if raw[:4] != b"RIFF":
            raise IgnisError(502, "resposta_invalida", "Ignis did not return WAV audio.")
        return raw
