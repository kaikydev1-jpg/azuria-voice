"""Music / sound-effects catalogue: engine behaviour joined to the legal registry.

The licence facts (declared licence, exact weight revision, evidence documents)
come ONLY from ``config/model_licenses.json`` through
:func:`services.model_licenses.disclosure`; ``config/audiogen.json`` adds what
the registry does not know (runtime, limits, quality profiles, hardware).

Classification is conservative and explained, never optimistic:

``commercial``             declared permissive licence AND complete local evidence
``commercial_conditions``  commercial use exists only under the licensor's own
                           registration / revenue conditions
``noncommercial``          the weights forbid commercial use
``unconfirmed``            anything else: missing or conflicting evidence, an
                           unmapped licence, a revision that differs from the pin

A label on a model never certifies an output; it states what the declared
licence of the selected weights says (see ``services.audiogen.policy``).
"""
from __future__ import annotations

import copy
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "audiogen.json"
MEASURED_PATH = Path(__file__).resolve().parents[2] / "config" / "audiogen_measured.json"

COMMERCIAL = "commercial"
COMMERCIAL_CONDITIONS = "commercial_conditions"
NONCOMMERCIAL = "noncommercial"
UNCONFIRMED = "unconfirmed"
LICENSE_CLASSES = (COMMERCIAL, COMMERCIAL_CONDITIONS, NONCOMMERCIAL, UNCONFIRMED)

KINDS = ("music", "sfx")
PROFILE_NAMES = ("fast", "balanced", "high")

_SHA = re.compile(r"[0-9a-f]{40}\Z")
_DIGEST = re.compile(r"[0-9a-f]{64}\Z")
_ID = re.compile(r"[a-z0-9][a-z0-9.-]{0,63}\Z")


class CatalogError(ValueError):
    """The bundled catalogue is malformed (a packaging bug, never user input)."""


@lru_cache(maxsize=1)
def _config() -> dict:
    try:
        value = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise CatalogError("audiogen.json unreadable") from exc
    _validate_config(value)
    return value


def reload() -> None:
    """Drop the cached config (tests and hot edits)."""
    _config.cache_clear()
    _measured.cache_clear()


def _validate_config(value: dict) -> None:
    models = value.get("models")
    if value.get("schema_version") != 1 or not isinstance(models, list) or not models:
        raise CatalogError("audiogen.json: bad schema")
    seen: set[str] = set()
    runtimes = value.get("runtimes") or {}
    for model in models:
        mid = model.get("id")
        if not isinstance(mid, str) or not _ID.fullmatch(mid) or mid in seen:
            raise CatalogError(f"audiogen.json: bad or duplicate id {mid!r}")
        seen.add(mid)
        if model.get("kind") not in KINDS:
            raise CatalogError(f"{mid}: kind")
        if model.get("runtime") not in runtimes:
            raise CatalogError(f"{mid}: runtime")
        limits = model.get("limits") or {}
        if not (0 < limits.get("duration_min_s", 0) <= limits.get("duration_default_s", 0)
                <= limits.get("duration_max_s", 0)):
            raise CatalogError(f"{mid}: duration limits")
        profiles = model.get("profiles") or {}
        if not profiles or set(profiles) - set(PROFILE_NAMES):
            raise CatalogError(f"{mid}: profiles")
        if model.get("default_profile") not in profiles:
            raise CatalogError(f"{mid}: default_profile")
        audio = model.get("audio") or {}
        if audio.get("channels") not in (1, 2) or not audio.get("sample_rate"):
            raise CatalogError(f"{mid}: audio")
        for name, spec in (model.get("custom_params") or {}).items():
            if spec.get("type") not in ("int", "float") or spec["min"] > spec["max"]:
                raise CatalogError(f"{mid}: custom param {name}")
        # Every profile may only set parameters the engine declares tunable.
        tunable = set(model.get("custom_params") or {})
        for profile, params in profiles.items():
            if set(params) - tunable:
                raise CatalogError(f"{mid}: profile {profile} sets an undeclared parameter")


@lru_cache(maxsize=1)
def _measured() -> dict:
    try:
        return json.loads(MEASURED_PATH.read_text(encoding="utf-8")).get("models", {})
    except (OSError, ValueError):
        return {}


def _registry_row(repo_id: str) -> Optional[dict]:
    from services import model_licenses

    try:
        return next(
            (r for r in model_licenses.load_registry()["models"] if r["id"] == repo_id), None
        )
    except (model_licenses.ModelTermsError, KeyError):
        return None


def _pinned_revision(repo_id: str) -> Optional[str]:
    from services import hf_revisions

    try:
        return hf_revisions.revision_for(repo_id)
    except ValueError:
        return None


def evidence_problems(repo_id: str) -> list[str]:
    """Why the recorded evidence cannot back a positive (commercial) label.

    Empty means complete. The check is structural: it proves the registry holds
    a dated, hashed evidence set for the exact revision the app downloads, not
    that the licence is legally sufficient for any particular use.
    """
    row = _registry_row(repo_id)
    if row is None:
        return ["record_missing"]
    problems: list[str] = []
    pin = _pinned_revision(repo_id)
    revision = row.get("revision")
    if not (isinstance(pin, str) and _SHA.fullmatch(pin)):
        problems.append("revision_not_pinned")
    elif row.get("runtime_revision") != pin or revision != pin:
        problems.append("revision_mismatch")
    evidence = row.get("audiogen_evidence")
    if not isinstance(evidence, dict) or not evidence.get("verified_at"):
        return problems + ["evidence_missing"]
    documents = evidence.get("evidence_documents")
    if not isinstance(documents, list) or not documents:
        problems.append("documents_missing")
    else:
        for document in documents:
            if not (isinstance(document, dict) and str(document.get("url", "")).startswith("https://")
                    and _DIGEST.fullmatch(str(document.get("sha256", "")))):
                problems.append("document_unhashed")
                break
    if evidence.get("conflicts"):
        problems.append("conflicting_terms")
    return problems


def classify(repo_id: str) -> tuple[str, list[str]]:
    """``(licence class, reasons it is not positive)`` for a catalogue repo."""
    from services import model_licenses

    try:
        info = model_licenses.disclosure(repo_id)
    except (model_licenses.ModelTermsError, KeyError):
        return UNCONFIRMED, ["registry_unreadable"]
    category = info.get("license_category")
    if category == "noncommercial":
        return NONCOMMERCIAL, []
    problems = evidence_problems(repo_id)
    if category == "commercial":
        return (COMMERCIAL, []) if not problems else (UNCONFIRMED, problems)
    if category == "conditions" and info.get("commercial_inference") == "separate_permission_required":
        return (COMMERCIAL_CONDITIONS, []) if not problems else (UNCONFIRMED, problems)
    return UNCONFIRMED, problems or ["licence_not_mapped"]


def _catalogue_model(repo_id: str) -> dict:
    from api.routers.setup.models import get_model_catalog

    return get_model_catalog().get(repo_id) or {}


def _license_block(repo_id: str) -> dict:
    from services import model_licenses

    klass, problems = classify(repo_id)
    row = _registry_row(repo_id) or {}
    evidence = row.get("audiogen_evidence") or {}
    info = model_licenses.safe_disclosure(repo_id)
    block = {
        "class": klass,
        "problems": problems,
        "license": info.get("license") or row.get("license"),
        "credit": row.get("credit"),
        "source_url": row.get("source_url"),
        "revision": row.get("runtime_revision"),
        "verified_at": evidence.get("verified_at"),
        "documents": copy.deepcopy(evidence.get("evidence_documents") or []),
        "code_license": evidence.get("code_license"),
        "components": list(evidence.get("components") or []),
        "output_terms": evidence.get("output_terms"),
        "scope_limits": evidence.get("scope_limits"),
        "upstream_access": row.get("upstream_access", "unknown"),
    }
    if klass == COMMERCIAL_CONDITIONS:
        block["conditions"] = {
            "revenue_threshold_usd": evidence.get("revenue_threshold_usd"),
            "registration_required": bool(evidence.get("registration_required_for_commercial")),
            "official_url": next((d["url"] for d in block["documents"]), None),
        }
    return block


def _hardware(model: dict) -> dict:
    hardware = copy.deepcopy(model.get("hardware") or {})
    measured = _measured().get(model["id"])
    if isinstance(measured, dict):
        hardware["measured"] = copy.deepcopy(measured)
    return hardware


def describe(model: dict) -> dict:
    """The public, JSON-safe description of one catalogue entry."""
    catalogue = _catalogue_model(model["repo_id"])
    return {
        "id": model["id"],
        "kind": model["kind"],
        "repo_id": model["repo_id"],
        "label": catalogue.get("label") or model["id"],
        "runtime": model["runtime"],
        "audio": copy.deepcopy(model["audio"]),
        "prompt_languages": list(model["prompt_languages"]),
        "lyrics": copy.deepcopy(model.get("lyrics") or {"supported": False}),
        "limits": copy.deepcopy(model["limits"]),
        "devices": list(model["devices"]),
        "mps_validated": bool(model.get("mps_validated")),
        "hardware": _hardware(model),
        "profiles": copy.deepcopy(model["profiles"]),
        "default_profile": model["default_profile"],
        "custom_params": copy.deepcopy(model.get("custom_params") or {}),
        "license": _license_block(model["repo_id"]),
        "download": {
            "size_gb": catalogue.get("size_gb"),
            "gated": bool(catalogue.get("gated")),
            "requires_hf_token": bool(catalogue.get("requires_hf_token")),
            "note": catalogue.get("note"),
        },
    }


def entries(kind: Optional[str] = None) -> list[dict]:
    return [m for m in _config()["models"] if kind is None or m["kind"] == kind]


def get(model_id: str) -> Optional[dict]:
    if not isinstance(model_id, str):
        return None
    return next((m for m in _config()["models"] if m["id"] == model_id), None)


def runtime_for(model: dict) -> dict:
    return _config()["runtimes"][model["runtime"]]


def purposes() -> tuple[list[str], str]:
    config = _config()
    return list(config["purposes"]), config["default_purpose"]


def content_presets(kind: str) -> list[dict]:
    return copy.deepcopy(_config()["content_presets"].get(kind, []))


def public_catalog(kind: Optional[str] = None) -> dict:
    """What GET /audio-gen/catalog returns. Pure configuration: no download, no disk scan."""
    available, default = purposes()
    return {
        "purposes": available,
        "default_purpose": default,
        "models": [describe(m) for m in entries(kind)],
        "presets": {k: content_presets(k) for k in KINDS if kind in (None, k)},
    }
