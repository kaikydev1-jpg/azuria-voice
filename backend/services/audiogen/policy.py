"""Declared-use policy, enforced on the server for every client (UI, API, MCP).

The caller states what the audio is for (``personal`` or ``commercial``). The
policy only decides whether the SELECTED model may be used for that stated
purpose; it never relabels an output and never swaps a model:

* ``personal`` (the default for clients that send nothing) allows any model.
  A default is not an authorisation: the stored record says the use was
  declared personal, so the output is never presented as commercial-cleared.
* ``commercial`` allows ``commercial`` models, allows
  ``commercial_conditions`` models only with an explicit per-request
  acknowledgement, and refuses ``noncommercial`` and ``unconfirmed`` ones.

Nothing here contacts anyone: the acknowledgement is a local declaration by the
person generating, not an approval from the licensor, and registering or paying
a licensor stays the person's own action.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from services.audiogen import catalog

PERSONAL = "personal"
COMMERCIAL = "commercial"


class PolicyError(Exception):
    """A request the policy refuses. ``code`` is stable and safe for clients."""

    def __init__(self, status: int, code: str, **extra):
        super().__init__(code)
        self.status = status
        self.code = code
        self.extra = extra

    def detail(self) -> dict:
        return {"code": self.code, **self.extra}


@dataclass(frozen=True)
class Decision:
    model: dict
    license_class: str
    purpose: str
    conditions_acknowledged: bool


def resolve_purpose(value: Optional[str]) -> str:
    available, default = catalog.purposes()
    if value is None:
        return default
    if not isinstance(value, str) or value not in available:
        raise PolicyError(422, "invalid_purpose", allowed=available)
    return value


def eligible_alternatives(kind: str, purpose: str) -> list[str]:
    """Catalogue ids that could serve ``purpose`` (commercial first, then conditional)."""
    if purpose != COMMERCIAL:
        return [m["id"] for m in catalog.entries(kind)]
    ranked = []
    for model in catalog.entries(kind):
        klass, _ = catalog.classify(model["repo_id"])
        if klass == catalog.COMMERCIAL:
            ranked.append((0, model["id"]))
        elif klass == catalog.COMMERCIAL_CONDITIONS:
            ranked.append((1, model["id"]))
    return [mid for _, mid in sorted(ranked)]


def decide(model_id: str, kind: str, purpose: Optional[str], conditions_ack: bool = False) -> Decision:
    """Resolve and authorise one request, or raise :class:`PolicyError`."""
    model = catalog.get(model_id)
    if model is None or model["kind"] != kind:
        raise PolicyError(404, "unknown_model")
    resolved = resolve_purpose(purpose)
    klass, problems = catalog.classify(model["repo_id"])
    acknowledged = conditions_ack is True  # a truthy string must not count
    if resolved == COMMERCIAL:
        if klass == catalog.NONCOMMERCIAL:
            raise PolicyError(
                403, "model_not_eligible_for_commercial", license_class=klass,
                alternatives=eligible_alternatives(kind, resolved),
            )
        if klass == catalog.UNCONFIRMED:
            raise PolicyError(
                403, "model_license_unconfirmed", license_class=klass, problems=problems,
                alternatives=eligible_alternatives(kind, resolved),
            )
        if klass == catalog.COMMERCIAL_CONDITIONS and not acknowledged:
            raise PolicyError(
                409, "commercial_conditions_confirmation_required", license_class=klass,
            )
    return Decision(model, klass, resolved, acknowledged and klass == catalog.COMMERCIAL_CONDITIONS)


def require_license_acceptance(model: dict) -> None:
    """The app's existing per-model licence acknowledgement (non-commercial categories).

    Acceptance of another engine's terms never covers this one: the record is
    keyed by the exact repository.
    """
    from services import model_acceptance

    try:
        model_acceptance.ensure_accepted([model["repo_id"]])
    except model_acceptance.ModelLicenceNotAccepted as exc:
        raise PolicyError(403, model_acceptance.ERROR_CODE, models=exc.models) from exc


def declared_use(decision: Decision, content_preset: Optional[str]) -> dict:
    """The declaration stored with an output (what was SAID, not a clearance)."""
    return {
        "purpose": decision.purpose,
        "conditions_acknowledged": decision.conditions_acknowledged,
        "content_preset": content_preset,
        "license_class": decision.license_class,
    }
