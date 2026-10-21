"""Stanza must not fall back to unsafe checkpoint unpickling (GHSA-v5jw-96jm-7h2c).

The payload below only appends to a list in this module; it proves whether
unpickling ran a callable without doing anything harmful.
"""
from __future__ import annotations

import importlib.metadata
import pickle

import pytest

torch = pytest.importorskip("torch")

from core import stanza_safety  # noqa: E402

_HITS: list[str] = []


def _record(tag):
    _HITS.append(tag)
    return {"emb": None, "vocab": None}


class _Payload:
    def __reduce__(self):
        return (_record, ("executed",))


@pytest.fixture
def unguarded_load(monkeypatch):
    original = torch.load
    while getattr(original, stanza_safety._GUARD_MARKER, False):
        original = original.__wrapped__
    monkeypatch.setattr(torch, "load", original)
    _HITS.clear()
    return original


def _stanza_caller(source: str):
    namespace = {"__name__": "stanza.models.fake_loader", "torch": torch}
    exec(compile(source, "<stanza-fake>", "exec"), namespace)
    return namespace["load"]


def _save(tmp_path, obj, name="checkpoint.pt"):
    path = tmp_path / name
    torch.save(obj, path)
    return str(path)


def test_stanza_fallback_to_unsafe_unpickling_is_refused(tmp_path, unguarded_load):
    path = _save(tmp_path, {"payload": _Payload()})
    load = _stanza_caller(
        "def load(path):\n"
        "    try:\n"
        "        return torch.load(path, weights_only=True)\n"
        "    except __import__('pickle').UnpicklingError:\n"
        "        return torch.load(path, weights_only=False)\n"
    )
    load(path)
    assert _HITS == ["executed"], "control: the unguarded fallback runs the payload"

    _HITS.clear()
    assert stanza_safety.install_stanza_checkpoint_guard()
    with pytest.raises(stanza_safety.UnsafeCheckpointError):
        load(path)
    assert _HITS == []


def test_stanza_call_without_weights_only_flag_is_forced_safe(tmp_path, unguarded_load):
    path = _save(tmp_path, {"payload": _Payload()})
    load = _stanza_caller("def load(path):\n    return torch.load(path)\n")
    stanza_safety.install_stanza_checkpoint_guard()
    with pytest.raises(pickle.UnpicklingError):
        load(path)
    assert _HITS == []


def test_weights_only_stanza_checkpoint_still_loads(tmp_path, unguarded_load):
    path = _save(tmp_path, {"weights": torch.ones(2), "config": {"lang": "en"}})
    load = _stanza_caller(
        "def load(path):\n    return torch.load(path, lambda s, loc: s, weights_only=True)\n"
    )
    stanza_safety.install_stanza_checkpoint_guard()
    data = load(path)
    assert torch.equal(data["weights"], torch.ones(2))
    assert data["config"] == {"lang": "en"}


def test_other_callers_keep_their_loading_mode(tmp_path, unguarded_load):
    path = _save(tmp_path, {"plain": [1, 2, 3]})
    stanza_safety.install_stanza_checkpoint_guard()
    assert torch.load(path, weights_only=False) == {"plain": [1, 2, 3]}


def test_guard_is_installed_once(unguarded_load):
    assert stanza_safety.install_stanza_checkpoint_guard()
    first = torch.load
    assert stanza_safety.install_stanza_checkpoint_guard()
    assert torch.load is first
    assert first.__wrapped__ is unguarded_load


def test_real_stanza_pretrain_loader_is_guarded(tmp_path, unguarded_load):
    pretrain = pytest.importorskip("stanza.models.common.pretrain")
    path = _save(tmp_path, {"payload": _Payload()}, "pretrain.pt")
    version = tuple(int(p) for p in importlib.metadata.version("stanza").split(".")[:3])
    if version <= (1, 12, 1):
        with pytest.raises(Exception):
            pretrain.Pretrain(path, save_to_file=False).load()
        assert _HITS == ["executed"], "control: Stanza <=1.12.1 runs the payload"
        _HITS.clear()

    stanza_safety.install_stanza_checkpoint_guard()
    with pytest.raises((stanza_safety.UnsafeCheckpointError, pickle.UnpicklingError, RuntimeError)):
        pretrain.Pretrain(path, save_to_file=False).load()
    assert _HITS == []


def test_argos_paths_install_the_guard(monkeypatch, tmp_path, unguarded_load):
    from services import translation_engines

    monkeypatch.setenv("OMNIVOICE_CACHE_DIR", str(tmp_path))
    translation_engines._configure_argos_cache()
    assert getattr(torch.load, stanza_safety._GUARD_MARKER, False)
