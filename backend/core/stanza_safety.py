"""Fail closed when Stanza tries an unsafe checkpoint unpickling fallback.

Stanza <= 1.12.1 (GHSA-v5jw-96jm-7h2c) retries several model loaders with
``torch.load(..., weights_only=False)`` after PyTorch's secure unpickler
rejects a file, and its lemma classifier calls ``torch.load`` without the
flag. A crafted checkpoint can then execute code. Argos Translate 1.11 pins
Stanza 1.10.1, so the fixed release cannot be resolved alongside it yet.

The guard applies the policy of the upstream fix (1.12.2 raises instead of
falling back) to calls made from Stanza modules only. Every other
``torch.load`` caller passes through unchanged, and genuine weights-only
checkpoints, such as the tokenizer models shipped in Argos packages, still
load on every device.
"""
from __future__ import annotations

import functools
import sys

_GUARD_MARKER = "_azuria_stanza_guard"


class UnsafeCheckpointError(RuntimeError):
    """A Stanza checkpoint needed the unsafe pickle loader and was refused."""


def _called_from_stanza(depth: int) -> bool:
    try:
        module = sys._getframe(depth).f_globals.get("__name__", "")
    except ValueError:
        return False
    return module == "stanza" or module.startswith("stanza.")


def install_stanza_checkpoint_guard() -> bool:
    """Wrap ``torch.load`` once so Stanza can only use weights-only loading.

    Returns ``False`` when PyTorch is unavailable, which leaves nothing for
    Stanza to load with. Safe to call repeatedly and from several threads:
    the worst race installs an extra wrapper with the same behaviour.
    """
    try:
        import torch
    except Exception:  # noqa: BLE001 - missing or broken torch has no loader
        return False
    current = torch.load
    if getattr(current, _GUARD_MARKER, False):
        return True

    @functools.wraps(current)
    def guarded_load(*args, **kwargs):
        if _called_from_stanza(2):
            if kwargs.get("weights_only") is False:
                raise UnsafeCheckpointError(
                    "Refused a Stanza checkpoint that requires unsafe pickle "
                    "loading. Reinstall the language package from a trusted source."
                )
            kwargs["weights_only"] = True
        return current(*args, **kwargs)

    setattr(guarded_load, _GUARD_MARKER, True)
    torch.load = guarded_load
    return True
