"""Real generation check for one music / sound-effects model (CI only).

Installs the model's isolated runtime exactly as the app does (same pins), fetches
the pinned weights, runs the real worker and measures wall time and peak memory.
Writes a JSON result; the exit code is non-zero if the audio is wrong.

    python scripts/audiogen_integration.py MODEL_ID RESULT.json
"""
from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import numpy as np  # noqa: E402
import psutil  # noqa: E402
import soundfile as sf  # noqa: E402

SECONDS = {"ace-step-v1": 10, "musicgen-small": 5, "musicgen-stereo-medium": 5,
           "stable-audio-open-1.0": 3, "audioldm2": 3}
PROMPTS = {"music": "calm acoustic guitar, warm, steady tempo", "sfx": "a wooden door slamming shut"}


def run(argv, **kw):
    print("+", " ".join(map(str, argv)), flush=True)
    subprocess.run(argv, check=True, **kw)


def install_runtime(spec, venv: Path) -> Path:
    from services import sidecar_install as si

    run(["uv", "venv", str(venv), *spec.venv_args])
    py = si._venv_python(venv)
    target = list(spec.install_args)
    if spec.torch_pins:
        target += si._torch_pin_args(spec)
    run(["uv", "pip", "install", "--python", str(py), *target])
    return py


def fetch_weights(model: dict) -> str:
    from huggingface_hub import snapshot_download

    from api.routers.setup.models import get_model_catalog
    from services import hf_revisions

    repo = model["repo_id"]
    meta = get_model_catalog()[repo]
    return snapshot_download(repo, revision=hf_revisions.revision_for(repo),
                             allow_patterns=list(meta.get("allow_patterns") or []) or None,
                             token=os.environ.get("HF_TOKEN") or None)


def peak_rss(proc: subprocess.Popen, out_peak: list) -> None:
    ps = psutil.Process(proc.pid)
    while proc.poll() is None:
        try:
            total = ps.memory_info().rss + sum(c.memory_info().rss for c in ps.children(recursive=True))
            out_peak[0] = max(out_peak[0], total)
        except psutil.Error:
            pass
        time.sleep(0.5)


def main(model_id: str, result_path: str) -> int:
    from services.audiogen import catalog, params

    model = catalog.get(model_id)
    spec_id = catalog.runtime_for(model)["engine_id"]
    from services import sidecar_install as si

    spec = si.get_spec(spec_id)
    result = {"model": model_id, "os": platform.platform(), "machine": platform.machine(),
              "cpus": os.cpu_count(), "ram_gb": round(psutil.virtual_memory().total / 2**30, 1),
              "device": "cpu", "status": "failed"}
    work = Path(tempfile.mkdtemp(prefix="audiogen-ci-"))
    t0 = time.time()
    py = install_runtime(spec, work / "venv")
    result["install_s"] = round(time.time() - t0, 1)
    t0 = time.time()
    try:
        snapshot = fetch_weights(model)
    except Exception as exc:  # noqa: BLE001 — gated model without token is a skip, not a pass
        result.update(status="skipped", reason=f"weights unavailable: {type(exc).__name__}")
        Path(result_path).write_text(json.dumps(result, indent=1))
        print(result)
        return 0
    result["download_s"] = round(time.time() - t0, 1)
    plan = params.build_plan(model, prompt=PROMPTS[model["kind"]], duration_s=SECONDS[model_id],
                             profile="fast" if "fast" in model["profiles"] else model["default_profile"], seed=1)
    out = work / "out"
    out.mkdir()
    request = {"engine": model["engine"], "devices": ["cpu"], "device": "cpu",
               "model": {"repo_id": model["repo_id"], "path": snapshot}, "prompt": plan.prompt,
               "lyrics": "[instrumental]" if model["lyrics"].get("supported") else "",
               "duration_s": plan.duration_s, "seed": plan.seed, "variations": 1, "params": plan.params,
               "outdir": str(out)}
    (work / "request.json").write_text(json.dumps(request))
    worker = ROOT / "backend" / "engines" / "audiogen" / "worker.py"
    peak = [0]
    t0 = time.time()
    proc = subprocess.Popen([str(py), str(worker), str(work / "request.json")], stdout=subprocess.PIPE,
                            text=True, env={**os.environ, "PYTHONUTF8": "1"})
    import threading

    threading.Thread(target=peak_rss, args=(proc, peak), daemon=True).start()
    events = [json.loads(line) for line in proc.stdout if line.startswith("{")]
    proc.wait()
    result["generate_s"] = round(time.time() - t0, 1)
    result["peak_rss_gb"] = round(peak[0] / 2**30, 2)
    done = next((e for e in events if e.get("event") == "result"), None)
    err = next((e for e in events if e.get("event") == "error"), None)
    if done is None:
        result.update(reason=(err or {}).get("code", f"exit {proc.returncode}"), detail=str((err or {}).get("message", ""))[:300])
        Path(result_path).write_text(json.dumps(result, indent=1))
        print(result)
        return 1
    data, rate = sf.read(done["files"][0], dtype="float32", always_2d=True)
    seconds = data.shape[0] / rate
    rms = float(np.sqrt(np.mean(data ** 2)))
    ok = (np.isfinite(data).all() and rms > 1e-4 and abs(seconds - plan.duration_s) < 1.0
          and rate == model["audio"]["sample_rate"] and data.shape[1] == model["audio"]["channels"])
    result.update(status="passed" if ok else "bad_audio", sample_rate=int(rate), channels=int(data.shape[1]),
                  audio_seconds=round(seconds, 2), rms=round(rms, 5), steps=plan.params.get("infer_step") or plan.params.get("num_inference_steps"))
    Path(result_path).write_text(json.dumps(result, indent=1))
    print(result)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
