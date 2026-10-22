"""What is stored with every music / sound-effect output.

The record states the model, its exact weight revision, the licence class and
documents at generation time, the use the person DECLARED, and the parameters.
It is a record, not a licence: changing a selector afterwards never changes the
rights of an earlier output, and the file says so in plain words.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from services.audiogen import catalog
from services.audiogen.params import Plan
from services.audiogen.policy import Decision, declared_use

SCHEMA = 1

NOTICE_EN = (
    "This file records the model, weight revision, licence class and declared use "
    "at the time of generation. It is not a licence and was not issued by Azuria Voice "
    "or by the model's licensor. Check the linked terms for what they allow."
)
NOTICE_PT = (
    "Este arquivo registra o modelo, a revisão dos pesos, a classe de licença e a "
    "finalidade declarada no momento da geração. Não é uma licença e não foi emitido "
    "pelo Azúria Voice nem pelo titular do modelo. Consulte os termos indicados."
)


def build(
    plan: Plan,
    decision: Decision,
    *,
    content_preset: Optional[str],
    audio: dict,
    runtime: dict,
    variation: int,
    app_version: Optional[str],
) -> dict:
    model = plan.model
    block = catalog.describe(model)["license"]
    return {
        "schema": SCHEMA,
        "recorded": True,
        "kind": model["kind"],
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": {
            "id": model["id"],
            "repo_id": model["repo_id"],
            "revision": block["revision"],
        },
        "license": {
            "class": decision.license_class,
            "name": block["license"],
            "verified_at": block["verified_at"],
            "documents": [
                {"name": d.get("name"), "url": d.get("url"), "sha256": d.get("sha256")}
                for d in block["documents"]
            ],
            "conditions": block.get("conditions"),
        },
        "declared_use": declared_use(decision, content_preset),
        "parameters": {
            "profile": plan.profile,
            "seed": plan.seed + variation,
            "variation": variation,
            "duration_s": plan.duration_s,
            "engine_params": plan.params,
            "prompt_chars": len(plan.prompt),
        },
        "audio": audio,
        "runtime": runtime,
        "app_version": app_version,
    }


def dumps(record: dict) -> str:
    return json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def loads(raw: Optional[str]) -> dict:
    """Parse a stored record. Old or unreadable rows are 'not recorded': no rights are inferred."""
    if not raw:
        return {"recorded": False}
    try:
        value = json.loads(raw)
    except ValueError:
        return {"recorded": False}
    return value if isinstance(value, dict) and value.get("schema") == SCHEMA else {"recorded": False}


def render_text(record: dict, *, prompt: Optional[str] = None) -> str:
    """Plain-text companion file shipped with an export."""
    if not record.get("recorded"):
        return (
            "Provenance: not recorded for this take.\n"
            "Provenância: não registrada para esta geração.\n"
            "No model, licence or permitted use is implied.\n"
        )
    lic = record["license"]
    use = record["declared_use"]
    params = record["parameters"]
    lines = [
        NOTICE_EN, NOTICE_PT, "",
        f"Model: {record['model']['repo_id']}",
        f"Revision: {record['model']['revision']}",
        f"Licence: {lic['name']}  [{lic['class']}]  (checked {lic['verified_at']})",
        f"Declared use: {use['purpose']}"
        + ("  (conditions acknowledged)" if use.get("conditions_acknowledged") else ""),
        f"Profile: {params['profile']}  seed: {params['seed']}  duration: {params['duration_s']} s",
        f"Audio: {record['audio']['sample_rate']} Hz, {record['audio']['channels']} ch",
        f"Generated on device: {record['runtime'].get('device')}",
        "",
        "Licence documents:",
    ]
    lines += [f"  - {d['name']}: {d['url']}  (sha256 {d['sha256']})" for d in lic["documents"]]
    if lic.get("conditions"):
        conditions = lic["conditions"]
        lines += ["", "Conditions of the licence for commercial use:"]
        if conditions.get("registration_required"):
            lines.append("  - registration with the licensor is required")
        if conditions.get("revenue_threshold_usd"):
            lines.append(f"  - applies below USD {conditions['revenue_threshold_usd']:,} annual revenue "
                         "(you and affiliates); above it a separate licence is needed")
    if prompt:
        lines += ["", f"Prompt: {prompt}"]
    return "\n".join(lines) + "\n"
