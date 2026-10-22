"""Validation of a generation request against the model's real limits.

Everything a client sends is checked here, on the server, against
``config/audiogen.json``: duration, variations, seed, quality profile and the
few engine parameters declared tunable. Unknown fields never reach an engine.
"""
from __future__ import annotations

import math
import random
import re
from dataclasses import dataclass, field
from typing import Optional

from services.audiogen.policy import PolicyError

MAX_PROMPT_CHARS = 1000
MAX_SEED = 2**31 - 1
CUSTOM = "custom"
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class ParamError(PolicyError):
    def __init__(self, code: str, **extra):
        super().__init__(422, code, **extra)


@dataclass(frozen=True)
class Plan:
    model: dict
    prompt: str
    lyrics: str
    duration_s: float
    seed: int
    variations: int
    profile: str
    params: dict = field(default_factory=dict)


def _clean_text(value, *, name: str, limit: int, required: bool) -> str:
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ParamError("invalid_" + name)
    text = _CONTROL.sub("", value).replace("\r\n", "\n").strip()
    if required and not text:
        raise ParamError("empty_" + name)
    if len(text) > limit:
        raise ParamError(name + "_too_long", max_chars=limit)
    return text


def _number(value, *, name: str, kind: str, lo: float, hi: float):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ParamError("invalid_" + name)
    if isinstance(value, float) and not math.isfinite(value):
        raise ParamError("invalid_" + name)
    if kind == "int":
        if isinstance(value, float) and not value.is_integer():
            raise ParamError("invalid_" + name)
        value = int(value)
    else:
        value = float(value)
    if not lo <= value <= hi:
        raise ParamError(name + "_out_of_range", min=lo, max=hi)
    return value


def build_plan(
    model: dict,
    *,
    prompt,
    lyrics=None,
    duration_s=None,
    seed=None,
    variations=None,
    profile=None,
    custom: Optional[dict] = None,
) -> Plan:
    limits = model["limits"]
    text = _clean_text(prompt, name="prompt", limit=MAX_PROMPT_CHARS, required=True)
    lyric_spec = model.get("lyrics") or {}
    if lyrics not in (None, ""):
        if not lyric_spec.get("supported"):
            raise ParamError("lyrics_not_supported")
        lyric_text = _clean_text(lyrics, name="lyrics", limit=int(lyric_spec.get("max_chars", 4000)), required=False)
    else:
        lyric_text = ""

    duration = limits["duration_default_s"] if duration_s is None else _number(
        duration_s, name="duration", kind="float",
        lo=limits["duration_min_s"], hi=limits["duration_max_s"],
    )
    count = 1 if variations is None else _number(
        variations, name="variations", kind="int", lo=1, hi=limits["variations_max"],
    )
    chosen_seed = random.SystemRandom().randrange(MAX_SEED + 1) if seed is None else _number(
        seed, name="seed", kind="int", lo=0, hi=MAX_SEED - count,
    )

    profile_name = profile or model["default_profile"]
    if not isinstance(profile_name, str):
        raise ParamError("invalid_profile")
    tunable = model.get("custom_params") or {}
    if profile_name == CUSTOM:
        base = dict(model["profiles"][model["default_profile"]])
        overrides = custom or {}
        if not isinstance(overrides, dict) or not overrides:
            raise ParamError("custom_params_required")
    elif profile_name in model["profiles"]:
        base = dict(model["profiles"][profile_name])
        overrides = {}
        if custom:
            raise ParamError("custom_params_need_custom_profile")
    else:
        raise ParamError("unknown_profile", allowed=[*model["profiles"], CUSTOM])
    for key, value in overrides.items():
        if key not in tunable:
            raise ParamError("unknown_param", param=str(key)[:40])
        spec = tunable[key]
        base[key] = _number(value, name=key, kind=spec["type"], lo=spec["min"], hi=spec["max"])
    params = {**base, **(model.get("fixed_params") or {})}
    return Plan(model, text, lyric_text, float(duration), chosen_seed, int(count), profile_name, params)
