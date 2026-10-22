"""One music / sound-effects generation, in a process of its own.

Launched as ``<audiogen venv python> worker.py REQUEST.json`` by
``services/audiogen/jobs.py``. It imports nothing from the app: the venv holds
Torch plus the model libraries and nothing else, so this file may use only the
standard library and those. One process per job is what makes cancellation
real: the parent kills the process tree and every byte of model memory goes
back to the OS.

Protocol: one JSON object per line on the ORIGINAL stdout; everything a library
prints is redirected to stderr first so it can never corrupt the stream.

    {"event": "stage", "stage": "loading" | "generating" | "saving"}
    {"event": "progress", "variation": 1, "variations": 2, "fraction": 0.4}
    {"event": "result", "files": [...], "sample_rate": N, "channels": N, "device": "cpu", ...}
    {"event": "error", "code": "...", "message": "..."}

Models load strictly from the pinned snapshot directory in the local Hugging Face cache;
a missing file is an error, never a download.
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback

_REAL_STDOUT = sys.stdout
sys.stdout = sys.stderr  # library chatter goes to the log, not the protocol

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")


def emit(**event) -> None:
    _REAL_STDOUT.write(json.dumps(event, separators=(",", ":")) + "\n")
    _REAL_STDOUT.flush()


class WorkerError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def pick_devices(requested: str, allowed: list[str]) -> list[str]:
    """Devices to try, best first. CPU is always the last resort when allowed."""
    import torch

    available = []
    if torch.cuda.is_available():
        available.append("cuda")
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        available.append("mps")
    available.append("cpu")
    if requested != "auto":
        if requested not in available or requested not in allowed:
            raise WorkerError("device_unavailable", f"Device {requested!r} is not available for this model on this machine.")
        return [requested] if requested == "cpu" else [requested, "cpu"] if "cpu" in allowed else [requested]
    return [d for d in available if d in allowed]


def _generator(device: str, seed: int):
    import torch

    return torch.Generator("cpu" if device == "mps" else device).manual_seed(seed)


class Progress:
    def __init__(self, variation: int, variations: int):
        self.variation, self.variations = variation, variations
        self._last = -1.0

    def __call__(self, fraction: float) -> None:
        fraction = max(0.0, min(1.0, fraction))
        if fraction - self._last >= 0.01 or fraction >= 1.0:
            self._last = fraction
            emit(event="progress", variation=self.variation, variations=self.variations,
                 fraction=round(fraction, 3))


def _write(path: str, samples, rate: int) -> None:
    """``samples``: float array shaped (frames, channels)."""
    import numpy as np
    import soundfile as sf

    data = np.asarray(samples, dtype="float32")
    if data.ndim == 1:
        data = data[:, None]
    if not np.isfinite(data).all():
        raise WorkerError("invalid_audio", "The model produced non-finite samples.")
    sf.write(path, data, rate, subtype="FLOAT", format="WAV")


# ── engines ────────────────────────────────────────────────────────────────


def run_musicgen(req: dict, device: str, outdir: str) -> dict:
    import torch
    from transformers import AutoProcessor, MusicgenForConditionalGeneration, StoppingCriteria, StoppingCriteriaList

    model_req = req["model"]
    path = model_req["path"]
    dtype = torch.float16 if device == "cuda" else torch.float32
    emit(event="stage", stage="loading")
    processor = AutoProcessor.from_pretrained(path, local_files_only=True)
    model = MusicgenForConditionalGeneration.from_pretrained(
        path, local_files_only=True, torch_dtype=dtype
    ).to(device).eval()
    rate = int(model.config.audio_encoder.sampling_rate)
    frame_rate = int(model.config.audio_encoder.frame_rate)
    tokens = max(1, int(round(req["duration_s"] * frame_rate)))
    params = req["params"]
    files, channels = [], 1
    emit(event="stage", stage="generating")
    for index in range(req["variations"]):
        progress = Progress(index + 1, req["variations"])

        class Count(StoppingCriteria):
            def __init__(self):
                self.steps = 0

            def __call__(self, input_ids, scores, **kwargs):
                self.steps += 1
                progress(self.steps / tokens)
                return torch.zeros(input_ids.shape[0], dtype=torch.bool, device=input_ids.device)

        torch.manual_seed(req["seed"] + index)
        inputs = processor(text=[req["prompt"]], padding=True, return_tensors="pt").to(device)
        with torch.inference_mode():
            audio = model.generate(
                **inputs, max_new_tokens=tokens, do_sample=bool(params.get("do_sample", True)),
                guidance_scale=float(params["guidance_scale"]), top_k=int(params["top_k"]),
                temperature=float(params["temperature"]),
                stopping_criteria=StoppingCriteriaList([Count()]),
            )
        take = audio[0].float().cpu().numpy().T  # (frames, channels)
        channels = int(take.shape[1])
        path = os.path.join(outdir, f"take_{index + 1}.wav")
        _write(path, take, rate)
        files.append(path)
        progress(1.0)
    return {"files": files, "sample_rate": rate, "channels": channels}


def _diffusers_pipeline(req: dict, device: str, cls_name: str):
    import torch
    import diffusers

    model_req = req["model"]
    dtype = torch.float16 if device == "cuda" else torch.float32
    emit(event="stage", stage="loading")
    pipe = getattr(diffusers, cls_name).from_pretrained(
        model_req["path"], local_files_only=True, torch_dtype=dtype
    )
    return pipe.to(device)


def run_diffusers_audio(req: dict, device: str, outdir: str, cls_name: str) -> dict:
    import torch

    pipe = _diffusers_pipeline(req, device, cls_name)
    params = req["params"]
    steps = int(params["num_inference_steps"])
    if cls_name == "StableAudioPipeline":
        rate, length_kwarg = int(pipe.vae.sampling_rate), "audio_end_in_s"
    else:
        rate, length_kwarg = int(pipe.vocoder.config.sampling_rate), "audio_length_in_s"
    files, channels = [], 1
    emit(event="stage", stage="generating")
    for index in range(req["variations"]):
        progress = Progress(index + 1, req["variations"])

        def on_step(step, timestep, latents, _p=progress):
            _p((step + 1) / steps)

        kwargs = {
            "prompt": req["prompt"],
            "negative_prompt": params.get("negative_prompt"),
            "num_inference_steps": steps,
            "guidance_scale": float(params["guidance_scale"]),
            length_kwarg: float(req["duration_s"]),
            "num_waveforms_per_prompt": 1,
            "generator": _generator(device, req["seed"] + index),
            "callback": on_step,
            "callback_steps": 1,
        }
        with torch.inference_mode():
            audio = pipe(**kwargs).audios[0]
        audio = audio.float().cpu().numpy() if hasattr(audio, "float") else audio
        if audio.ndim == 2:  # (channels, frames) -> (frames, channels)
            audio = audio.T
        frames = int(round(req["duration_s"] * rate))
        audio = audio[:frames]
        channels = 1 if audio.ndim == 1 else audio.shape[1]
        path = os.path.join(outdir, f"take_{index + 1}.wav")
        _write(path, audio, rate)
        files.append(path)
        progress(1.0)
    return {"files": files, "sample_rate": rate, "channels": int(channels)}


def run_acestep(req: dict, device: str, outdir: str) -> dict:
    import soundfile as sf
    from acestep.pipeline_ace_step import ACEStepPipeline

    model_req = req["model"]
    emit(event="stage", stage="loading")
    checkpoint = model_req["path"]
    pipeline = ACEStepPipeline(
        checkpoint_dir=checkpoint, dtype="bfloat16" if device == "cuda" else "float32",
        torch_compile=False, cpu_offload=False, overlapped_decode=False,
    )
    params = req["params"]
    files, rate, channels = [], 48000, 2
    emit(event="stage", stage="generating")
    for index in range(req["variations"]):
        out = os.path.join(outdir, f"take_{index + 1}.wav")
        pipeline(
            format="wav", audio_duration=float(req["duration_s"]), prompt=req["prompt"],
            lyrics=req.get("lyrics") or "[instrumental]", infer_step=int(params["infer_step"]),
            guidance_scale=float(params["guidance_scale"]), scheduler_type=params["scheduler_type"],
            cfg_type=params["cfg_type"], omega_scale=float(params["omega_scale"]),
            manual_seeds=str(req["seed"] + index), guidance_interval=float(params["guidance_interval"]),
            guidance_interval_decay=0.0, min_guidance_scale=3.0,
            use_erg_tag=True, use_erg_lyric=True, use_erg_diffusion=True, oss_steps="",
            guidance_scale_text=0.0, guidance_scale_lyric=0.0, save_path=out,
        )
        info = sf.info(out)
        rate, channels = int(info.samplerate), int(info.channels)
        files.append(out)
        emit(event="progress", variation=index + 1, variations=req["variations"], fraction=1.0)
    return {"files": files, "sample_rate": rate, "channels": channels}


RUNNERS = {
    "musicgen": lambda req, dev, out: run_musicgen(req, dev, out),
    "stableaudio": lambda req, dev, out: run_diffusers_audio(req, dev, out, "StableAudioPipeline"),
    "audioldm2": lambda req, dev, out: run_diffusers_audio(req, dev, out, "AudioLDM2Pipeline"),
    "acestep": lambda req, dev, out: run_acestep(req, dev, out),
}


def _is_oom(exc: BaseException) -> bool:
    text = f"{type(exc).__name__} {exc}".lower()
    return "out of memory" in text or "outofmemory" in text or "alloc" in text and "memory" in text


def main(request_path: str) -> int:
    with open(request_path, encoding="utf-8") as handle:
        req = json.load(handle)
    runner = RUNNERS.get(req["engine"])
    if runner is None:
        emit(event="error", code="unknown_engine", message=req["engine"])
        return 2
    started = time.time()
    try:
        devices = pick_devices(req.get("device", "auto"), req["devices"])
    except WorkerError as exc:
        emit(event="error", code=exc.code, message=str(exc))
        return 3
    last_error = None
    for position, device in enumerate(devices):
        try:
            result = runner(req, device, req["outdir"])
            emit(event="result", device=device, seconds=round(time.time() - started, 2),
                 fell_back=position > 0, **result)
            return 0
        except WorkerError as exc:
            emit(event="error", code=exc.code, message=str(exc))
            return 3
        except Exception as exc:  # noqa: BLE001 — report, then maybe retry on CPU
            last_error = exc
            traceback.print_exc(file=sys.stderr)
            if _is_oom(exc) and device != "cpu" and "cpu" in devices:
                continue
            if device == "mps" and "cpu" in devices:
                continue
            break
    code = "out_of_memory" if last_error is not None and _is_oom(last_error) else "generation_failed"
    emit(event="error", code=code, message=str(last_error)[:500] if last_error else "no device")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
