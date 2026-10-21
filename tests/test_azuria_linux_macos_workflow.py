"""Contract for the Azúria Linux/macOS packaging workflow.

The workflow builds installers for users, so its safety properties are fixed
here: pinned actions, native runners, offline unit tests, the AppImage update
metadata before hashing, and a test archive that can never become a release.
"""
from __future__ import annotations

import re
from pathlib import Path

import yaml

_ROOT = Path(__file__).parents[1]
_PATH = _ROOT / ".github" / "workflows" / "azuria-linux-macos.yml"
_TEXT = _PATH.read_text(encoding="utf-8")
_WORKFLOW = yaml.load(_TEXT, Loader=yaml.BaseLoader)
_PACKAGE = _WORKFLOW["jobs"]["package"]
_DRAFT = _WORKFLOW["jobs"]["test-draft"]


def _steps(job: dict) -> dict[str, dict]:
    return {step.get("name") or step.get("uses"): step for step in job["steps"]}


def test_every_action_is_pinned_to_a_full_commit_sha():
    uses = re.findall(r"uses:\s*(\S+)", _TEXT)
    assert uses
    for ref in uses:
        assert re.fullmatch(r"[\w.-]+/[\w./-]+@[0-9a-f]{40}", ref), ref


def test_primary_targets_run_natively_and_independently():
    strategy = _PACKAGE["strategy"]
    assert strategy["fail-fast"] == "false"
    legs = {(leg["platform"], leg["arch"]): leg for leg in strategy["matrix"]["include"]}
    assert legs[("linux", "x64")]["runner"] == "ubuntu-24.04"
    assert legs[("darwin", "arm64")]["runner"] == "macos-15"
    for key in (("linux", "x64"), ("darwin", "arm64")):
        assert legs[key]["optional"] == "false"
        assert legs[key]["local_runtime"] == "true"
    # Intel Macs: interface with a remote backend only, never blocking.
    intel = legs[("darwin", "x64")]
    assert intel["optional"] == "true" and intel["local_runtime"] == "false"
    assert not any(leg["arch"] == "arm64" and leg["platform"] == "linux" for leg in legs.values())
    assert "Confirm the native runner system and architecture" in _steps(_PACKAGE)


def test_only_the_draft_job_can_write_and_it_never_publishes():
    assert _WORKFLOW["permissions"] == {"contents": "read"}
    assert "permissions" not in _PACKAGE
    assert _DRAFT["permissions"] == {"contents": "write"}
    script = _steps(_DRAFT)["Create or refresh the unpublished test draft"]["run"]
    assert "--draft --prerelease --latest=false" in script
    assert "--draft=false" not in _TEXT and "--latest " not in script
    assert "git tag" not in _TEXT and "git push" not in _TEXT
    assert 'TAG="test-linux-macos-$SHORT"' in script
    assert "Refusing to touch a published release" in script


def test_unit_tests_stay_offline_and_downloads_are_a_separate_step():
    steps = _steps(_PACKAGE)
    unit = steps["Backend, security and packaging regressions (offline, empty HF cache)"]
    assert unit["env"]["HF_HUB_OFFLINE"] == "1"
    assert "empty-hf-cache" in unit["env"]["HF_HUB_CACHE"]
    generate = steps["Download a small test model and generate audio (network, test only)"]
    assert "--generate" in generate["run"]
    assert "azuria-test-profile" in generate["env"]["VOICESTUDIO_TEST_PROFILE"]
    for name, step in steps.items():
        if name != generate.get("name"):
            assert "--generate" not in step.get("run", ""), name


def test_appimage_metadata_is_final_before_any_checksum():
    names = list(_steps(_PACKAGE))
    build = _steps(_PACKAGE)["Build packages (ad hoc signing on macOS, never published)"]["run"]
    assert build.index("embed-appimage-update.mjs") < build.index("update-package-contract.mjs")
    assert names.index("Build packages (ad hoc signing on macOS, never published)") < names.index(
        "Write SHA-256 checksums"
    )


def test_macos_is_ad_hoc_signed_without_apple_credentials():
    for secret in ("CSC_LINK", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"):
        assert f"secrets.{secret}" not in _TEXT
        assert f"secrets.ELECTRON_MACOS" not in _TEXT
    verify = _steps(_PACKAGE)["Verify macOS ad hoc signature, DMG and ZIP"]["run"]
    assert "grep -qx 'Signature=adhoc'" in verify
    assert "codesign --verify --deep --strict" in verify


def test_draft_only_carries_fully_validated_legs():
    validate = _steps(_DRAFT)["Validate the combined packages"]["run"]
    assert "validated.txt" in validate
    assert "--targets" in validate and "linux-x64,darwin-arm64" in validate
    assert "sha256sum -c SHA256SUMS.txt" in validate
