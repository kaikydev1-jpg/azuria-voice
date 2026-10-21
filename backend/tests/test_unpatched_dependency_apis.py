"""App code must not start calling dependency APIs with unpatched advisories.

Each entry is an advisory without a usable fixed release in the locked
dependency set (see docs/security/2026-10-21-followup.md). The app is not
affected only because it never calls these APIs; this keeps it that way.
Remove an entry once the lock carries the fixed version.
"""
from __future__ import annotations

import ast
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
_SOURCES = ("backend", "omnivoice")

_UNPATCHED = {
    # GHSA-4j2p-28q2-5m79: sharded-index weight_map paths are not contained.
    "load_checkpoint_in_model": "accelerate",
    "load_checkpoint_and_dispatch": "accelerate",
    # GHSA-8mgp-746c-j5xp: model persistence bypasses nltk.pathsec.
    "TransitionParser": "nltk",
    "AveragedPerceptron": "nltk",
    "PerceptronTagger": "nltk",
    "save_maxent_params": "nltk",
    # GHSA-rrmf-rvhw-rf47, GHSA-qfhq-4f3w-5fph, GHSA-vgrw-7cvw-pwgx: torch 2.8.
    "jit.script": "torch",
    "lstm_cell": "torch",
    "unpack_sequence": "torch",
}


def _dotted(node: ast.AST) -> str:
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    return ".".join(reversed(parts))


def _uses(tree: ast.AST):
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            root = node.module.split(".")[0]
            for alias in node.names:
                full = f"{node.module}.{alias.name}"
                if any(full.endswith("." + name) and package == root
                       for name, package in _UNPATCHED.items()):
                    yield node.lineno, full
            if node.module == "nltk.parse.transitionparser":
                yield node.lineno, node.module
        elif isinstance(node, (ast.Attribute, ast.Name)):
            dotted = _dotted(node)
            for name in _UNPATCHED:
                if dotted == name or dotted.endswith("." + name):
                    yield node.lineno, dotted


def _python_sources():
    for top in _SOURCES:
        for path in sorted((_ROOT / top).rglob("*.py")):
            if "tests" not in path.relative_to(_ROOT).parts:
                yield path


def test_no_app_code_calls_apis_with_unpatched_advisories():
    hits = []
    for path in _python_sources():
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        hits += [f"{path.relative_to(_ROOT)}:{line} {name}" for line, name in _uses(tree)]
    assert not hits, (
        "These dependency APIs have unpatched advisories; validate inputs and "
        "update docs/security before using them:\n" + "\n".join(hits)
    )


@pytest.mark.parametrize("source", [
    "from accelerate import load_checkpoint_and_dispatch",
    "import accelerate\naccelerate.load_checkpoint_in_model(m, p)",
    "from nltk.parse.transitionparser import TransitionParser",
    "from nltk.tag import PerceptronTagger",
    "import torch\ntorch.jit.script(f)",
    "from torch.jit import script",
    "import torch\ntorch.nn.utils.rnn.unpack_sequence(x)",
])
def test_detector_flags_each_unpatched_api(source):
    assert list(_uses(ast.parse(source)))
