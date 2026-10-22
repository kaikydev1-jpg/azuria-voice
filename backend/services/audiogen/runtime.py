"""Where a catalogue model runs: its isolated venv and its pinned weights.

Nothing here downloads or installs; it only reports what is on disk so the
status endpoints stay cheap and never start a download (the UI shows the state
and the person chooses to install).
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from services.audiogen import catalog

WORKER_SCRIPT = Path(__file__).resolve().parents[2] / "engines" / "audiogen" / "worker.py"


def _spec(model: dict):
    from services import sidecar_install

    return sidecar_install.get_spec(catalog.runtime_for(model)["engine_id"])


def venv_python(model: dict) -> Optional[Path]:
    """The runtime interpreter, only when the installer finished (marker present)."""
    from services import sidecar_install

    spec = _spec(model)
    if spec is None:
        return None
    return sidecar_install.engine_venv_python(spec.env_var)


def runtime_status(model: dict) -> dict:
    from services import sidecar_install

    spec = _spec(model)
    if spec is None:
        return {"engine_id": catalog.runtime_for(model)["engine_id"], "installed": False, "supported": False,
                "reason": "runtime_not_registered"}
    supported, reason = sidecar_install.host_support(spec)
    installed = venv_python(model) is not None
    return {
        "engine_id": spec.engine_id, "installed": installed, "supported": supported,
        "reason": None if supported else reason,
        "install_endpoint": f"/engines/{spec.engine_id}/install",
        "approx_download_gb": catalog.runtime_for(model).get("approx_download_gb"),
    }


def weights_status(model: dict) -> dict:
    """``missing`` | ``ready`` | ``revision_mismatch`` for the pinned weights."""
    from api.routers.setup.models import installed_snapshot_path
    from services import hf_revisions

    repo = model["repo_id"]
    try:
        pin = hf_revisions.revision_for(repo)
    except ValueError:
        return {"state": "missing", "snapshot": None, "pinned_revision": None}
    snapshot = installed_snapshot_path(repo)
    if snapshot is None:
        return {"state": "missing", "snapshot": None, "pinned_revision": pin}
    if os.path.basename(snapshot) != pin:
        return {"state": "revision_mismatch", "snapshot": None, "pinned_revision": pin}
    return {"state": "ready", "snapshot": snapshot, "pinned_revision": pin}


def model_status(model: dict) -> dict:
    return {"runtime": runtime_status(model), "weights": {k: v for k, v in weights_status(model).items() if k != "snapshot"}}
