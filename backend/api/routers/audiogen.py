"""Local text-to-music and text-to-sound-effects (``/audio-gen``).

Every client (desktop UI, HTTP API, MCP) goes through the same checks here:
the declared purpose is enforced against the selected model's licence class on
the server, weights are never downloaded by a status call, and generation runs
as a cancellable job in the model's isolated runtime.
"""
from __future__ import annotations

import asyncio
import io
import os
import zipfile
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from core.browser_guard import reject_cross_site_get
from core.config import OUTPUTS_DIR
from core.db import db_conn
from services.audiogen import catalog, params, policy, provenance, runtime
from services.audiogen.jobs import MAX_QUEUED, manager

router = APIRouter(prefix="/audio-gen", tags=["audio-gen"])


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str = Field(..., max_length=64)
    prompt: str = Field(..., max_length=params.MAX_PROMPT_CHARS + 200)
    lyrics: Optional[str] = Field(None, max_length=8000)
    duration_s: Optional[float] = None
    seed: Optional[int] = None
    variations: Optional[int] = None
    profile: Optional[str] = Field(None, max_length=16)
    custom: Optional[dict] = None
    purpose: Optional[str] = Field(None, max_length=16)
    content_preset: Optional[str] = Field(None, max_length=48)
    conditions_acknowledged: bool = False
    device: Literal["auto", "cpu", "cuda", "mps"] = "auto"


async def _bind_loop() -> None:
    """Runs on the event loop (unlike the sync handlers) so the job manager can reach it."""
    manager.bind_loop(asyncio.get_running_loop())


def _raise(exc: policy.PolicyError):
    raise HTTPException(status_code=exc.status, detail=exc.detail())


def _model_card(model: dict) -> dict:
    from services import model_acceptance

    card = catalog.describe(model)
    card["status"] = runtime.model_status(model)
    try:
        card["acceptance"] = model_acceptance.status(model["repo_id"])
    except Exception:  # noqa: BLE001 — an unreadable registry must not hide the catalogue
        card["acceptance"] = {"required": True, "accepted": False}
    return card


@router.get("/catalog", dependencies=[Depends(reject_cross_site_get)])
def get_catalog(kind: Optional[Literal["music", "sfx"]] = None):
    """Models, licence classes, profiles and install state. Never downloads anything."""
    data = catalog.public_catalog(kind)
    data["models"] = [_model_card(m) for m in catalog.entries(kind)]
    return data


def _start(kind: str, req: GenerateRequest):
    try:
        decision = policy.decide(req.model, kind, req.purpose, req.conditions_acknowledged)
        plan = params.build_plan(
            decision.model, prompt=req.prompt, lyrics=req.lyrics, duration_s=req.duration_s,
            seed=req.seed, variations=req.variations, profile=req.profile, custom=req.custom,
        )
        preset = req.content_preset
        if preset is not None and preset not in {p["id"] for p in catalog.content_presets(kind)}:
            raise policy.PolicyError(422, "invalid_content_preset")
        policy.require_license_acceptance(decision.model)
        job = manager.submit(plan, decision, content_preset=preset, device=req.device)
    except policy.PolicyError as exc:
        _raise(exc)
    return JSONResponse(job, status_code=202)


@router.post("/music", dependencies=[Depends(_bind_loop)])
def generate_music(req: GenerateRequest):
    return _start("music", req)


@router.post("/sfx", dependencies=[Depends(_bind_loop)])
def generate_sfx(req: GenerateRequest):
    return _start("sfx", req)


@router.get("/jobs", dependencies=[Depends(reject_cross_site_get)])
def list_jobs():
    return {"jobs": manager.list(), "queue_limit": MAX_QUEUED}


@router.get("/jobs/{job_id}", dependencies=[Depends(reject_cross_site_get)])
def get_job(job_id: str):
    job = manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail={"code": "unknown_job"})
    return job


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    job = manager.cancel(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail={"code": "unknown_job"})
    return job


def _take(take_id: str) -> dict:
    with db_conn() as conn:
        row = conn.execute(
            "SELECT id, text, mode, audio_path, provenance FROM generation_history WHERE id=? AND mode IN ('music','sfx')",
            (take_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "unknown_take"})
    return dict(row)


@router.get("/takes/{take_id}/provenance", dependencies=[Depends(reject_cross_site_get)])
def get_provenance(take_id: str, format: Literal["json", "text"] = "json"):
    row = _take(take_id)
    record = provenance.loads(row["provenance"])
    if format == "text":
        return Response(provenance.render_text(record, prompt=row["text"]), media_type="text/plain; charset=utf-8")
    return record


@router.get("/takes/{take_id}/export", dependencies=[Depends(reject_cross_site_get)])
def export_take(take_id: str):
    """ZIP with the WAV, ``provenance.json`` and a readable ``provenance.txt``."""
    row = _take(take_id)
    wav = os.path.join(OUTPUTS_DIR, os.path.basename(row["audio_path"]))
    if not os.path.isfile(wav):
        raise HTTPException(status_code=404, detail={"code": "audio_missing"})
    record = provenance.loads(row["provenance"])
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as archive:
        archive.write(wav, f"{take_id}.wav")
        archive.writestr(f"{take_id}.provenance.json", provenance.dumps(record) if record.get("recorded") else '{"recorded":false}')
        archive.writestr(f"{take_id}.provenance.txt", provenance.render_text(record, prompt=row["text"]))
    return Response(
        buffer.getvalue(), media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="azuria-{take_id}.zip"'},
    )
