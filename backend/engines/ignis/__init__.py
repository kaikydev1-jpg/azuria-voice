"""Ignis TTS engine — OmniVoice on the person's own GPU through Ignis.

Ignis (``kaikydev1-jpg/Ignis``) is the owner's local AI engine: it runs
omnivoice.cpp on Vulkan (AMD and Intel, including cards PyTorch cannot use on
Windows such as the RX 580), CUDA or the CPU, and serves it on loopback. This
engine is a thin client of that server (``services.ignis_client``):

1. available only when Ignis answers ``/motor/versao`` and lists ``omnivoice``
   in ``/v1/models``;
2. a cloned voice is uploaded once to ``POST /v1/audio/voices`` under a name
   derived from the reference audio + transcript, so a changed reference is a
   new voice and an unchanged one is never re-sent;
3. speech comes from ``POST /v1/audio/speech`` as 24 kHz mono WAV.

Nothing changes for people without Ignis: the engine just reports itself
unavailable. Weights are OmniVoice's (CC BY-NC 4.0, non-commercial), which the
display name and docs/engines/ignis.md state up front.
"""
from __future__ import annotations

import hashlib
import io
import logging
import threading
from pathlib import Path
from typing import TYPE_CHECKING

from services.ignis_client import CLOSED_MESSAGE, IgnisClient, IgnisError
from services.tts_backend import TTSBackend, TTSInputError

if TYPE_CHECKING:  # pragma: no cover
    import torch

logger = logging.getLogger("omnivoice.engines.ignis")

ENGINE_ID = "ignis"
_SAMPLE_RATE = 24000
#: Voices this process already knows Ignis holds, per Ignis address.
_KNOWN_VOICES: dict[str, set[str]] = {}
_KNOWN_LOCK = threading.Lock()


def voice_name(wav: bytes, ref_text: str) -> str:
    """Stable Ignis voice name for one reference clip and its transcript."""
    digest = hashlib.sha256(wav + b"\0" + ref_text.encode("utf-8")).hexdigest()
    return "azuria-" + digest[:16]


class IgnisTTSBackend(TTSBackend):
    """OmniVoice served by a running Ignis on this machine."""

    id = ENGINE_ID
    display_name = (
        "Ignis · OmniVoice on your GPU (AMD, NVIDIA, Intel; "
        "voice weights CC BY-NC 4.0, non-commercial)"
    )
    supports_cloning = True
    supports_voice_design = False
    # Same conditioning window as OmniVoice: the generation router trims the
    # reference to its best 20 s before it reaches generate().
    max_ref_seconds = 20.0
    ref_strategy = "best_window"
    gpu_compat = ("cpu",)  # PyTorch-side; Ignis owns the GPU itself
    runs_out_of_process = True

    def __init__(self) -> None:
        self._client = IgnisClient()

    # ── availability ────────────────────────────────────────────────────
    @classmethod
    def is_available(cls) -> tuple[bool, str]:
        client = IgnisClient(timeout=2.0)
        try:
            if client.version() is None:
                return False, CLOSED_MESSAGE
            if "omnivoice" not in client.models():
                return False, (
                    "Ignis is open but does not offer the OmniVoice voice yet "
                    "(needs Ignis 0.3.0 or newer)."
                )
        except IgnisError as exc:
            return False, exc.message
        return True, "ready"

    @property
    def sample_rate(self) -> int:
        return _SAMPLE_RATE

    @property
    def supported_languages(self) -> list[str]:
        return ["multi"]  # OmniVoice: zero-shot across 600+ languages

    def model_identity(self) -> str | None:
        return "ignis:omnivoice"

    # ── voices ──────────────────────────────────────────────────────────
    def _ensure_voice(self, ref_audio: str, ref_text: str) -> str:
        try:
            wav = Path(ref_audio).read_bytes()
        except OSError as exc:
            raise TTSInputError(f"Ignis: the reference audio could not be read ({exc}).") from exc
        name = voice_name(wav, ref_text)
        base = self._client.base_url
        with _KNOWN_LOCK:
            known = _KNOWN_VOICES.setdefault(base, set())
            if name in known:
                return name
        if name not in self._client.voices():
            self._client.register_voice(name, ref_text, wav)
        with _KNOWN_LOCK:
            _KNOWN_VOICES.setdefault(base, set()).add(name)
        return name

    # ── synthesis ───────────────────────────────────────────────────────
    def generate(self, text: str, **kw) -> "torch.Tensor":
        if not text or not text.strip():
            raise TTSInputError("Ignis: the input contains no speakable text — send at least one word.")
        from services.model_manager import generate_timeout_s, report_generate_progress

        language = kw.get("language")
        if not language or str(language).strip().lower() == "auto":
            language = None
        ref_audio = kw.get("ref_audio")
        if kw.get("instruct") or kw.get("description"):
            logger.info("Ignis: voice direction/design is not supported; ignoring instructions.")
        if kw.get("speed", 1.0) not in (None, 1.0):
            logger.info("Ignis: speed is not supported; ignoring.")
        timeout = max(120.0, generate_timeout_s(text) - 5.0)
        try:
            voice = (
                self._ensure_voice(str(ref_audio), str(kw.get("ref_text") or ""))
                if ref_audio else None
            )
            report_generate_progress()
            raw = self._speech_with_one_retry(text, voice, language, kw.get("seed"), timeout)
        except IgnisError as exc:
            if exc.status in (0, 400, 503):
                raise TTSInputError(exc.message) from None
            raise RuntimeError(f"Ignis could not generate this audio: {exc.message}") from None
        return self._decode(raw)

    def _speech_with_one_retry(self, text, voice, language, seed, timeout) -> bytes:
        try:
            return self._client.speech(text, voice=voice, language=language, seed=seed, timeout=timeout)
        except IgnisError as exc:
            if exc.code != "motor_sem_resposta":
                raise
            # Ignis restarts its voice server (on the CPU if the GPU failed).
            logger.info("Ignis voice server restarted; retrying once.")
            return self._client.speech(text, voice=voice, language=language, seed=seed, timeout=timeout)

    def _decode(self, raw: bytes) -> "torch.Tensor":
        import soundfile as sf
        import torch

        data, rate = sf.read(io.BytesIO(raw), dtype="float32", always_2d=True)
        if rate != _SAMPLE_RATE:
            logger.info("Ignis returned %s Hz audio; expected %s Hz.", rate, _SAMPLE_RATE)
        mono = data.mean(axis=1)
        return torch.from_numpy(mono).unsqueeze(0)

    def unload(self) -> None:
        try:
            self._client.unload_audio()
        except IgnisError as exc:
            logger.debug("Ignis unload skipped: %s", exc.message)
