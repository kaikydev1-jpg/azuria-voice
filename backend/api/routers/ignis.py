"""Settings → Performance: "Use the GPU through Ignis" (docs/engines/ignis.md).

Loopback/admin-guarded like every settings route. Talks only to the Ignis
running on this machine (services.ignis_client); nothing leaves it.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.dependencies import require_admin

router = APIRouter(
    prefix="/api/settings/ignis",
    tags=["settings"],
    dependencies=[Depends(require_admin)],
)


class _PrepareBody(BaseModel):
    families: list[Literal["voz", "transcricao"]] = Field(..., min_length=1, max_length=2)


@router.get("/status")
def ignis_status():
    from services import ignis_mode

    return ignis_mode.status()


@router.post("/enable")
def ignis_enable():
    from services import ignis_mode

    try:
        return ignis_mode.enable()
    except ignis_mode.IgnisClosed:
        raise HTTPException(status_code=409, detail="Ignis is not open.") from None


@router.post("/disable")
def ignis_disable():
    from services import ignis_mode

    return ignis_mode.disable()


@router.post("/prepare")
def ignis_prepare(body: _PrepareBody):
    from services import ignis_mode
    from services.ignis_client import IgnisError

    try:
        return ignis_mode.prepare(list(body.families))
    except ignis_mode.IgnisClosed:
        raise HTTPException(status_code=409, detail="Ignis is not open.") from None
    except IgnisError as exc:
        raise HTTPException(status_code=502, detail=exc.message) from None
