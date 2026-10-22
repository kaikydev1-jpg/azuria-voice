#!/usr/bin/env python3
"""Validate Electron artifacts and immutable Tauri sunset feeds."""
import base64
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlparse
from check_electron_release_assets import parse_targets, select_targets, verify_release

def release_notes(version, changelog_path=Path("CHANGELOG.md")):
    """Require the authored UTF-8 notes for the exact release version."""
    section = re.search(rf"^## \[{re.escape(version)}\][^\n]*\n(.*?)(?=^## |\Z)",
                        changelog_path.read_text(encoding="utf-8"), re.M | re.S)
    if not section or not section[1].strip():
        raise ValueError("Write versioned CHANGELOG notes before release")
    return section[1].strip() + "\n"


def validate_sunset(manifest, tag):
    if manifest.get("version") != tag.removeprefix("v"):
        raise ValueError("Tauri version must match sunset tag")
    if not manifest.get("platforms"):
        raise ValueError("Missing Tauri platforms")
    for entry in manifest["platforms"].values():
        url = urlparse(entry.get("url", ""))
        prefix = f"/debpalash/VoiceStudio/releases/download/{tag}/"
        if url.scheme != "https" or url.netloc != "github.com" or not url.path.startswith(prefix):
            raise ValueError("Tauri URLs must point to immutable sunset assets")
        if not entry.get("signature"):
            raise ValueError("Missing Tauri signature")

def required_installers(targets=None):
    """Installers a user downloads besides each target's updater payload."""
    suffixes = []
    for _manifest, os_token, arch, extension in select_targets(targets).values():
        if os_token == "mac":
            suffixes.append(f"mac-{arch}.dmg")
        elif os_token == "linux":
            suffixes.append(f"linux-{arch}.deb")
    return suffixes


def prepare(assets, tag, sunset_tag=None, targets=None, notes=True):
    version = json.loads(Path("package.json").read_text())["version"]
    if tag != f"v{version}":
        raise ValueError("Tag must match package version")
    files = [p for p in assets.iterdir() if p.is_file()]
    release = {"tagName": tag, "isPrerelease": False, "assets": [
        {"name": p.name, "size": p.stat().st_size,
         "digest": "sha256:" + hashlib.sha256(p.read_bytes()).hexdigest()}
        for p in files]}
    verify_release(release, assets, channel="stable", version=version, targets=targets)
    for manifest in assets.glob("electron-stable-*.yml"):
        text = manifest.read_text()
        artifact = re.search(r"^\s+- url:\s*(.+)$", text, re.M)[1].strip().strip("'\"")
        expected = re.search(r"^\s{4}sha512:\s*(.+)$", text, re.M)[1].strip().strip("'\"")
        actual = base64.b64encode(hashlib.sha512((assets / artifact).read_bytes()).digest()).decode()
        if actual != expected:
            raise ValueError("Updater payload checksum mismatch")
    for suffix in required_installers(targets):
        if not (assets / f"Azuria-Voice-Electron-{version}-{suffix}").is_file():
            raise ValueError(f"Missing installer: {suffix}")
    if sunset_tag:
        for name in ("latest.json", "latest-user.json"):
            validate_sunset(json.loads((assets / name).read_text()), sunset_tag)
    if notes:
        (assets / "RELEASE_NOTES.md").write_text(release_notes(version), encoding="utf-8")
    (assets / "SHA256SUMS.txt").write_text("\n".join(
        f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}" for p in sorted(files)
        if p.name not in {"SHA256SUMS.txt", "RELEASE_NOTES.md"}) + "\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", type=Path, required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--sunset-tag")
    parser.add_argument("--targets", help="comma-separated subset, e.g. linux-x64,darwin-arm64")
    parser.add_argument("--no-notes", action="store_true", help="validate test builds without release notes")
    args = parser.parse_args()
    prepare(args.assets, args.tag, args.sunset_tag, parse_targets(args.targets), not args.no_notes)
