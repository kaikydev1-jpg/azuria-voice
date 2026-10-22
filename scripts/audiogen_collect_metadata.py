"""Collect public evidence for the music / sound-effects model catalogue.

Runs in CI (the development sandbox cannot reach huggingface.co). Read-only and
anonymous: it fetches repository metadata, file listings with LFS digests, the
license files that are publicly readable, and PyPI metadata for the candidate
runtime packages. Nothing is accepted, registered or downloaded beyond small
text files. Output is one JSON document plus the raw license texts.

    python scripts/audiogen_collect_metadata.py OUT_DIR
"""
from __future__ import annotations

import hashlib
import html.parser
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HF = "https://huggingface.co"
MODELS = [
    "ACE-Step/ACE-Step-v1-3.5B",
    "stabilityai/stable-audio-open-1.0",
    "facebook/musicgen-small",
    "facebook/musicgen-stereo-small",
    "facebook/musicgen-medium",
    "facebook/musicgen-stereo-medium",
    "facebook/musicgen-melody",
    "cvssp/audioldm2",
    "cvssp/audioldm2-large",
    "cvssp/audioldm2-music",
    "google/umt5-base",
]
TEXT_FILES = ("LICENSE", "LICENSE.md", "LICENSE.txt", "README.md", "model_index.json",
              "model_config.json", "config.json")
PYPI = ["ace-step", "diffusers", "transformers", "torch", "accelerate", "soundfile",
        "scipy", "huggingface-hub", "safetensors", "stable-audio-tools", "audiocraft"]
GITHUB_RAW = [
    ("ace-step/ACE-Step", "main", "LICENSE"),
    ("ace-step/ACE-Step", "main", "requirements.txt"),
    ("ace-step/ACE-Step", "main", "pyproject.toml"),
    ("ace-step/ACE-Step", "main", "setup.py"),
    ("facebookresearch/audiocraft", "main", "LICENSE_weights"),
    ("facebookresearch/audiocraft", "main", "LICENSE"),
    ("Stability-AI/stable-audio-tools", "main", "LICENSE"),
    ("huggingface/diffusers", "main", "LICENSE"),
]


PAGES = [
    "https://stability.ai/license",
    "https://stability.ai/community-license-agreement",
    "https://huggingface.co/stabilityai/stable-audio-open-1.0",
    "https://huggingface.co/ACE-Step/ACE-Step-v1-3.5B/blob/main/LICENSE",
]


class _Text(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip and data.strip():
            self.parts.append(data.strip())


def page_text(raw: str) -> str:
    parser = _Text()
    parser.feed(raw)
    return "\n".join(parser.parts)


def get(url: str, *, binary: bool = False):
    request = urllib.request.Request(url, headers={"User-Agent": "azuria-audiogen-research/1"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read()
                return response.status, (body if binary else body.decode("utf-8", "replace"))
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 500, 502, 503) and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            return exc.code, ""
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt < 2:
                time.sleep(2 ** attempt)
                continue
            return 0, str(exc)
    return 0, ""


def hf_json(path: str):
    status, body = get(HF + path)
    try:
        return status, json.loads(body) if status == 200 else None
    except json.JSONDecodeError:
        return status, None


def tree(repo: str, revision: str) -> list[dict]:
    rows, url = [], f"/api/models/{repo}/tree/{revision}?recursive=true&expand=true"
    while url:
        request = urllib.request.Request(HF + url, headers={"User-Agent": "azuria-audiogen-research/1"})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                rows += json.loads(response.read().decode())
                link = response.headers.get("Link", "")
        except urllib.error.HTTPError as exc:
            return [{"error": exc.code}]
        url = None
        for part in link.split(","):
            if 'rel="next"' in part:
                url = part.split(";")[0].strip()[1:-1].replace(HF, "")
    return [{"path": r.get("path"), "type": r.get("type"), "size": r.get("size"),
             "lfs_sha256": (r.get("lfs") or {}).get("oid"), "oid": r.get("oid")} for r in rows]


def print_report(report: dict, out: Path) -> None:
    """Compact, log-friendly view (the CI log is the only channel back to the sandbox)."""
    for repo, e in report["models"].items():
        print(f"## {repo} status={e.get('api_status')} sha={e.get('sha')} license={e.get('license')!r} "
              f"name={e.get('license_name')!r} link={e.get('license_link')!r} gated={e.get('gated')!r} "
              f"lib={e.get('library')} pipe={e.get('pipeline')}")
        for f in e.get("files", []):
            if f.get("type") == "file" and ((f.get("size") or 0) > 5_000_000 or f["path"].endswith(
                    (".json", ".md", ".txt")) or f["path"].upper().startswith("LICENSE")):
                print(f"   {f['path']} {f.get('size')} {(f.get('lfs_sha256') or '')[:16]}")
        print("   texts:", {k: v["status"] for k, v in e.get("texts", {}).items()})
    for package, d in report["pypi"].items():
        print(f"pypi {package} {d.get('version')} py{d.get('requires_python')} license={d.get('license')!r}")
    ace = report["pypi"].get("ace-step", {})
    print("ace-step requires_dist:", json.dumps(ace.get("requires_dist")))
    for url, d in report.get("pages", {}).items():
        print("page", url, d["status"], d["chars"], (d["sha256"] or "")[:16])
    for key, d in report["github"].items():
        print("github", key, d["status"], (d["sha256"] or "")[:16])


def print_evidence(texts: Path) -> None:
    """Full digests of the license documents and the capability statements the catalogue cites."""
    for path in sorted(texts.iterdir()):
        data = path.read_bytes()
        print(f"sha256 {hashlib.sha256(data).hexdigest()} {len(data):>7} {path.name}")
    for name, patterns in (
        ("ACE-Step__ACE-Step-v1-3.5B__README.md", r"licen|lyric|language|minute|second|duration|limit|bf16|memory|vram|step|speed|rtf"),
        ("facebook__musicgen-small__README.md", r"licen|limitation|vocal|lyric|english|32|second|sample|mono|stereo"),
        ("facebook__musicgen-stereo-medium__README.md", r"licen|stereo|32|second|sample"),
        ("cvssp__audioldm2__README.md", r"licen|second|16|sampl|step|negative|waveform|english|prompt"),
        ("ace-step__ACE-Step__setup.py", r"python_requires|install_requires|name=|version"),
    ):
        path = texts / name
        print(f"--- {name}")
        if path.exists():
            hits = [line.strip()[:240] for line in path.read_text(encoding="utf-8").splitlines()
                    if re.search(patterns, line, re.I)]
            print("\n".join(hits[:22]))


def main(out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    (out / "texts").mkdir(exist_ok=True)
    report: dict = {"collected_at": datetime.now(timezone.utc).isoformat(), "models": {},
                    "pypi": {}, "github": {}}
    for repo in MODELS:
        status, info = hf_json(f"/api/models/{repo}")
        entry: dict = {"api_status": status}
        if info:
            sha = info.get("sha")
            card = info.get("cardData") or {}
            entry |= {"sha": sha, "license": card.get("license"), "license_name": card.get("license_name"),
                      "license_link": card.get("license_link"), "gated": info.get("gated"),
                      "tags": info.get("tags"), "library": info.get("library_name"),
                      "pipeline": info.get("pipeline_tag"), "last_modified": info.get("lastModified"),
                      "downloads_30d": info.get("downloads")}
            entry["files"] = tree(repo, sha)
            entry["texts"] = {}
            for name in TEXT_FILES:
                s, body = get(f"{HF}/{repo}/raw/{sha}/{name}")
                entry["texts"][name] = {"status": s}
                if s == 200:
                    digest = hashlib.sha256(body.encode()).hexdigest()
                    entry["texts"][name]["sha256"] = digest
                    (out / "texts" / f"{repo.replace('/', '__')}__{name}").write_text(body, encoding="utf-8")
        report["models"][repo] = entry
    for package in PYPI:
        status, body = get(f"https://pypi.org/pypi/{package}/json")
        if status != 200:
            report["pypi"][package] = {"status": status}
            continue
        data = json.loads(body)
        info = data["info"]
        report["pypi"][package] = {
            "version": info["version"], "license": info.get("license_expression") or info.get("license"),
            "requires_python": info.get("requires_python"),
            "requires_dist": info.get("requires_dist"),
            "upload": [f["upload_time_iso_8601"] for f in data["urls"]][:1],
        }
    for repo, ref, path in GITHUB_RAW:
        s, body = get(f"https://raw.githubusercontent.com/{repo}/{ref}/{path}")
        report["github"][f"{repo}/{path}"] = {"status": s, "sha256": hashlib.sha256(body.encode()).hexdigest() if s == 200 else None}
        if s == 200:
            (out / "texts" / f"{repo.replace('/', '__')}__{path}").write_text(body, encoding="utf-8")
    report["pages"] = {}
    for url in PAGES:
        status, body = get(url)
        text = page_text(body) if status == 200 else ""
        report["pages"][url] = {"status": status, "chars": len(text),
                                "sha256": hashlib.sha256(text.encode()).hexdigest() if text else None}
        if text:
            name = re.sub(r"[^A-Za-z0-9]+", "_", url.split("//", 1)[1])
            (out / "texts" / f"page__{name}.txt").write_text(text, encoding="utf-8")
    (out / "metadata.json").write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    buffer = io.StringIO()
    stdout, sys.stdout = sys.stdout, buffer
    try:
        print_report(report, out)
    finally:
        sys.stdout = stdout
    (out / "summary.txt").write_text(buffer.getvalue(), encoding="utf-8")
    print(f"collected {len(report['models'])} models")
    return 0


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[2] == "--evidence":
        print_evidence(Path(sys.argv[1]) / "texts")
        sys.exit(0)
    sys.exit(main(Path(sys.argv[1] if len(sys.argv) > 1 else "audiogen-metadata")))
