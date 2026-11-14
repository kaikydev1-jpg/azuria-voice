""""Use the GPU through Ignis": one switch over three engine choices.

Turning it on points the voice engine at ``ignis``, the language model at the
``ignis`` provider and the OpenAI-compatible transcription engine at Ignis's
Whisper — each only when Ignis actually serves that family. The choices that
were in place before are remembered, and turning it off puts exactly those
back. Ignis being closed changes nothing. See docs/engines/ignis.md.
"""
from __future__ import annotations

import json
import sys
from typing import Any

from services.ignis_client import DOWNLOAD_URL, IgnisClient, IgnisError

_ENABLED_KEY = "ignis.enabled"
_PREVIOUS_KEY = "ignis.previous"
_ASR_BASE_URL_KEY = "asr.openai_compat.base_url"
_ASR_MODEL_KEY = "asr.openai_compat.model"
ASR_ENGINE = "openai-compat-asr"
FAMILIES = ("voz", "transcricao")


class IgnisClosed(Exception):
    """Ignis did not answer; nothing was changed."""


def platform_supported(platform: str | None = None) -> bool:
    """Ignis ships for Windows and Linux; macOS has no build yet."""
    return (platform or sys.platform) != "darwin"


def is_enabled() -> bool:
    from services import settings_store

    return settings_store.get_text(_ENABLED_KEY) == "1"


def status() -> dict[str, Any]:
    client = IgnisClient(timeout=2.0)
    out: dict[str, Any] = {
        "open": False,
        "enabled": is_enabled(),
        "version": None,
        "gpu": None,
        "base_url": client.base_url,
        "voice": {"ready": False, "backend": None, "missing_bytes": 0, "license": None,
                  "commercial_use": None},
        "transcription": {"ready": False, "missing_bytes": 0},
        "download_url": DOWNLOAD_URL,
        "platform_supported": platform_supported(),
    }
    try:
        version = client.version()
        if version is None:
            return out
        out["open"] = True
        out["version"] = version.get("versao")
        state = client.state()
        out["gpu"] = (state.get("placa") or {}).get("nome")
        plan = client.audio_plan()
    except IgnisError:
        return out
    voice = plan.get("voz") or {}
    model = voice.get("modelo") or {}
    out["voice"] = {
        "ready": bool(voice.get("preparado")),
        "backend": (voice.get("rodando") or {}).get("backend"),
        "missing_bytes": int(voice.get("falta_baixar") or 0),
        "license": model.get("licenca"),
        "commercial_use": model.get("uso_comercial"),
    }
    transcription = plan.get("transcricao") or {}
    out["transcription"] = {
        "ready": bool(transcription.get("preparado")),
        "missing_bytes": int(transcription.get("falta_baixar") or 0),
    }
    return out


def _current_choices() -> dict[str, Any]:
    from core import prefs
    from services import llm_providers, settings_store

    return {
        "tts_backend": prefs.get("tts_backend"),
        "asr_backend": prefs.get("asr_backend"),
        "llm_backend": prefs.get("llm_backend"),
        "llm_provider": llm_providers.stored_active_provider_id(),
        "asr_base_url": settings_store.get_text(_ASR_BASE_URL_KEY),
        "asr_model": settings_store.get_text(_ASR_MODEL_KEY),
    }


def enable() -> dict[str, Any]:
    from core import prefs
    from services import llm_providers, settings_store

    client = IgnisClient(timeout=3.0)
    try:
        if client.version() is None:
            raise IgnisClosed()
        models = set(client.models())
    except IgnisError as exc:
        raise IgnisClosed() from exc
    if not is_enabled():
        settings_store.set_text(_PREVIOUS_KEY, json.dumps(_current_choices()))
    llm_providers.set_active_provider("ignis")
    prefs.set_("llm_backend", "openai-compat")
    if "omnivoice" in models:
        prefs.set_("tts_backend", "ignis")
    if "whisper-1" in models:
        settings_store.set_text(_ASR_BASE_URL_KEY, client.base_url + "/v1")
        settings_store.set_text(_ASR_MODEL_KEY, "whisper-1")
        prefs.set_("asr_backend", ASR_ENGINE)
    settings_store.set_text(_ENABLED_KEY, "1")
    return status()


def disable() -> dict[str, Any]:
    from core import prefs
    from services import llm_providers, settings_store

    try:
        previous = json.loads(settings_store.get_text(_PREVIOUS_KEY) or "{}")
    except ValueError:
        previous = {}
    if is_enabled() and isinstance(previous, dict):
        for key in ("tts_backend", "asr_backend", "llm_backend"):
            prefs.set_(key, previous.get(key))
        provider = previous.get("llm_provider")
        if provider and llm_providers.get_provider(provider):
            llm_providers.set_active_provider(provider)
        else:
            settings_store.clear_text(llm_providers._ACTIVE_PROVIDER_KEY)
        for key, field in ((_ASR_BASE_URL_KEY, "asr_base_url"), (_ASR_MODEL_KEY, "asr_model")):
            if previous.get(field) is None:
                settings_store.clear_text(key)
            else:
                settings_store.set_text(key, previous[field])
    settings_store.set_text(_ENABLED_KEY, "0")
    settings_store.clear_text(_PREVIOUS_KEY)
    return status()


def prepare(families: list[str]) -> dict[str, Any]:
    unknown = [f for f in families if f not in FAMILIES]
    if unknown or not families:
        raise ValueError(f"Unknown Ignis families: {unknown or families}")
    try:
        return IgnisClient(timeout=5.0).prepare(families)
    except IgnisError as exc:
        if exc.status == 0:
            raise IgnisClosed() from exc
        raise
