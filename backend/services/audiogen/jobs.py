"""Queue, execution and cancellation for music / sound-effect generation.

One generation = one worker process (``engines/audiogen/worker.py``) in the
model's isolated venv. Jobs run one at a time in submission order; cancelling a
running job kills the worker's whole process tree, so memory is returned to the
OS and nothing is left half-written in history. Finished audio goes through
``mark_synthetic`` like every other synthetic output before it is saved.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import queue
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from services.audiogen import provenance, runtime
from services.audiogen.params import Plan
from services.audiogen.policy import Decision, PolicyError

logger = logging.getLogger("omnivoice.audiogen")

MAX_QUEUED = 20
KEEP_FINISHED_S = 3600.0
_LOG_TAIL_CHARS = 600

TERMINAL = ("done", "failed", "cancelled")


def _stall_s() -> float:
    try:
        return max(30.0, float(os.environ.get("OMNIVOICE_AUDIOGEN_STALL_S", "1800")))
    except ValueError:
        return 1800.0


def _max_total_s() -> float:
    try:
        return max(60.0, float(os.environ.get("OMNIVOICE_AUDIOGEN_MAX_S", "7200")))
    except ValueError:
        return 7200.0


class Manager:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._jobs: dict[str, dict] = {}
        self._order: list[str] = []
        self._queue: "queue.Queue[str]" = queue.Queue()
        self._thread: Optional[threading.Thread] = None
        self._procs: dict[str, Any] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    # ── public API ────────────────────────────────────────────────────────

    def submit(self, plan: Plan, decision: Decision, *, content_preset: Optional[str], device: str) -> dict:
        model = plan.model
        python = runtime.venv_python(model)
        if python is None:
            raise PolicyError(409, "runtime_not_installed", engine_id=runtime.runtime_status(model)["engine_id"])
        weights = runtime.weights_status(model)
        if weights["state"] != "ready":
            raise PolicyError(409, "weights_" + weights["state"], repo_id=model["repo_id"])
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            pass
        with self._lock:
            self._purge()
            if sum(1 for j in self._jobs.values() if j["state"] in ("queued", "running")) >= MAX_QUEUED:
                raise PolicyError(429, "queue_full", limit=MAX_QUEUED)
            job_id = uuid.uuid4().hex[:12]
            job = {
                "id": job_id, "kind": model["kind"], "model_id": model["id"], "state": "queued",
                "stage": "queued", "fraction": None, "variation": 0, "variations": plan.variations,
                "created_at": time.time(), "started_at": None, "finished_at": None,
                "error": None, "takes": [], "device": None, "fell_back": False,
                "_plan": plan, "_decision": decision, "_preset": content_preset,
                "_device": device, "_cancel": threading.Event(),
            }
            self._jobs[job_id] = job
            self._order.append(job_id)
            self._queue.put(job_id)
            self._ensure_thread()
            return self._public(job)

    def get(self, job_id: str) -> Optional[dict]:
        with self._lock:
            job = self._jobs.get(job_id)
            return self._public(job) if job else None

    def list(self) -> list[dict]:
        with self._lock:
            return [self._public(self._jobs[j]) for j in self._order if j in self._jobs]

    def cancel(self, job_id: str) -> Optional[dict]:
        """Cancel a queued or running job. Returns the job, or None when unknown."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if job["state"] in TERMINAL:
                return self._public(job)
            job["_cancel"].set()
            if job["state"] == "queued":
                self._finish(job, "cancelled")
            proc = self._procs.get(job_id)
        if proc is not None:
            self._kill(proc)
        return self.get(job_id)

    # ── internals ─────────────────────────────────────────────────────────

    def _public(self, job: dict) -> dict:
        out = {k: v for k, v in job.items() if not k.startswith("_")}
        out["queue_position"] = self._position(job)
        return out

    def _position(self, job: dict) -> int:
        if job["state"] != "queued":
            return -1
        ahead = 0
        for jid in self._order:
            other = self._jobs.get(jid)
            if other is None or other["state"] != "queued":
                continue
            if jid == job["id"]:
                return ahead
            ahead += 1
        return -1

    def _purge(self) -> None:
        cutoff = time.time() - KEEP_FINISHED_S
        drop = [j for j in self._order if (job := self._jobs.get(j)) and job["state"] in TERMINAL
                and (job["finished_at"] or 0) < cutoff]
        for jid in drop:
            self._jobs.pop(jid, None)
        self._order = [j for j in self._order if j in self._jobs]

    def _ensure_thread(self) -> None:
        if self._thread is None or not self._thread.is_alive():
            self._thread = threading.Thread(target=self._loop_forever, name="audiogen-worker", daemon=True)
            self._thread.start()

    def _finish(self, job: dict, state: str, error: Optional[dict] = None) -> None:
        with self._lock:
            job["state"], job["stage"] = state, state
            job["error"], job["finished_at"] = error, time.time()
            self._procs.pop(job["id"], None)

    def _loop_forever(self) -> None:
        while True:
            job_id = self._queue.get()
            with self._lock:
                job = self._jobs.get(job_id)
            if job is None or job["state"] != "queued":
                continue
            try:
                self._run(job)
            except Exception as exc:  # noqa: BLE001 — a bug here must not kill the queue
                logger.exception("audiogen job %s crashed", job_id)
                self._finish(job, "failed", {"code": "internal_error", "message": type(exc).__name__})

    @staticmethod
    def _kill(proc) -> None:
        try:
            proc.kill()
            proc.wait(timeout=10)
        except Exception:  # noqa: BLE001 — already gone
            pass

    def _free_memory(self) -> None:
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            from services.engine_memory import evict_all_tts_engines

            asyncio.run_coroutine_threadsafe(evict_all_tts_engines(), loop).result(timeout=60)
        except Exception:  # noqa: BLE001 — freeing memory is best effort
            logger.warning("audiogen: could not free resident TTS engines", exc_info=True)

    def _run(self, job: dict) -> None:
        from core.config import DATA_DIR
        from core.contained_subprocess import spawn_owned

        plan: Plan = job["_plan"]
        model = plan.model
        with self._lock:
            if job["_cancel"].is_set():
                return self._finish(job, "cancelled")
            job["state"], job["stage"], job["started_at"] = "running", "preparing", time.time()
        python = runtime.venv_python(model)
        weights = runtime.weights_status(model)
        if python is None or weights["state"] != "ready":
            return self._finish(job, "failed", {"code": "runtime_or_weights_missing", "message": ""})
        self._free_memory()

        workdir = Path(DATA_DIR) / "audiogen_tmp" / job["id"]
        workdir.mkdir(parents=True, exist_ok=True)
        request = {
            "engine": model["engine"], "devices": model["devices"], "device": job["_device"],
            "model": {"repo_id": model["repo_id"], "path": weights["snapshot"]},
            "prompt": plan.prompt, "lyrics": plan.lyrics, "duration_s": plan.duration_s,
            "seed": plan.seed, "variations": plan.variations, "params": plan.params,
            "outdir": str(workdir),
        }
        request_path = workdir / "request.json"
        request_path.write_text(json.dumps(request), encoding="utf-8")
        log_path = workdir / "worker.log"
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8",
               "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1"}
        result: Optional[dict] = None
        error: Optional[dict] = None
        try:
            with open(log_path, "wb") as log:
                proc = spawn_owned(
                    [str(python), str(runtime.WORKER_SCRIPT), str(request_path)],
                    stdout=subprocess.PIPE, stderr=log, env=env, text=True, encoding="utf-8", errors="replace",
                )
                with self._lock:
                    self._procs[job["id"]] = proc
                    if job["_cancel"].is_set():
                        self._kill(proc)
                last_event = [time.time()]
                started = time.time()
                reason: list[str] = []

                def watchdog() -> None:
                    while proc.poll() is None:
                        now = time.time()
                        if job["_cancel"].is_set():
                            break
                        if now - last_event[0] > _stall_s():
                            reason.append("stalled")
                            break
                        if now - started > _max_total_s():
                            reason.append("timeout")
                            break
                        time.sleep(0.5)
                    if proc.poll() is None:
                        self._kill(proc)

                threading.Thread(target=watchdog, name="audiogen-watchdog", daemon=True).start()
                for line in proc.stdout:
                    last_event[0] = time.time()
                    try:
                        event = json.loads(line)
                    except ValueError:
                        continue
                    kind = event.get("event")
                    with self._lock:
                        if kind == "stage":
                            job["stage"] = event.get("stage", job["stage"])
                        elif kind == "progress":
                            job["variation"] = event.get("variation", job["variation"])
                            job["fraction"] = event.get("fraction")
                    if kind == "result":
                        result = event
                    elif kind == "error":
                        error = {"code": event.get("code", "generation_failed"), "message": str(event.get("message", ""))[:500]}
                try:
                    proc.wait(timeout=30)
                except Exception:  # noqa: BLE001
                    self._kill(proc)
                if reason and error is None and result is None:
                    error = {"code": reason[0], "message": ""}
            if job["_cancel"].is_set():
                return self._finish(job, "cancelled")
            if result is None:
                if error is None:
                    tail = log_path.read_text(encoding="utf-8", errors="replace")[-_LOG_TAIL_CHARS:]
                    error = {"code": "worker_exited", "message": tail}
                return self._finish(job, "failed", error)
            with self._lock:
                job["stage"], job["device"], job["fell_back"] = "saving", result.get("device"), bool(result.get("fell_back"))
            takes = self._save_takes(job, plan, result)
            if job["_cancel"].is_set():
                self._discard(takes)
                return self._finish(job, "cancelled")
            with self._lock:
                job["takes"], job["fraction"] = takes, 1.0
            self._finish(job, "done")
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    def _discard(self, takes: list[dict]) -> None:
        from core.config import OUTPUTS_DIR
        from core.db import db_conn

        with db_conn() as conn:
            for take in takes:
                conn.execute("DELETE FROM generation_history WHERE id=?", (take["id"],))
        for take in takes:
            Path(OUTPUTS_DIR, take["audio_path"]).unlink(missing_ok=True)

    def _save_takes(self, job: dict, plan: Plan, result: dict) -> list[dict]:
        import soundfile as sf
        import torch

        from core.config import OUTPUTS_DIR
        from core.db import db_conn
        from core.version import APP_VERSION
        from services.generation_audio import save_generation_wav
        from services.watermark import mark_synthetic

        takes: list[dict] = []
        per_take_time = round(float(result.get("seconds", 0.0)) / max(1, len(result["files"])), 2)
        runtime_info = {"device": result.get("device"), "fell_back_to_cpu": bool(result.get("fell_back")),
                        "engine_runtime": plan.model["runtime"]}
        for index, path in enumerate(result["files"]):
            data, rate = sf.read(path, dtype="float32", always_2d=True)
            waveform = torch.from_numpy(data.T.copy())
            waveform = mark_synthetic(waveform, int(rate), context="audiogen.finalize")
            take_id = uuid.uuid4().hex[:8]
            filename = f"{take_id}.wav"
            target = os.path.join(OUTPUTS_DIR, filename)
            save_generation_wav(target, waveform, int(rate), bits=24)
            record = provenance.build(
                plan, job["_decision"], content_preset=job["_preset"],
                audio={"sample_rate": int(rate), "channels": int(waveform.shape[0])},
                runtime=runtime_info, variation=index, app_version=APP_VERSION,
            )
            with db_conn() as conn:
                conn.execute(
                    "INSERT INTO generation_history (id, text, mode, language, instruct, profile_id, audio_path,"
                    " duration_seconds, generation_time, seed, design_recipe, provenance, created_at)"
                    " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (take_id, plan.prompt[:200], plan.model["kind"], "en", "", None, filename,
                     round(waveform.shape[-1] / rate, 2), per_take_time, plan.seed + index, None,
                     provenance.dumps(record), time.time()),
                )
            takes.append({"id": take_id, "audio_path": filename, "audio_url": f"/audio/{filename}",
                          "seed": plan.seed + index, "duration_seconds": round(waveform.shape[-1] / rate, 2),
                          "sample_rate": int(rate), "channels": int(waveform.shape[0])})
        try:
            from core import event_bus

            for take in takes:
                event_bus.emit("generation_history", {"action": "created", "id": take["id"]})
        except Exception:  # noqa: BLE001
            pass
        return takes


manager = Manager()
