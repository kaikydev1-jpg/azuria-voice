"""scripts/instalar.sh — the one-line Linux installer (owner's standard §6b).

Runs the real script with --simular (prints the plan, touches nothing, no
network) against fake os-release files for each family it must recognise.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "instalar.sh"

pytestmark = pytest.mark.skipif(shutil.which("bash") is None, reason="needs bash")


def run(tmp_path: Path, os_release: str, *, ostree: bool = False, uname: str = "Linux",
        arch: str = "x86_64", args: tuple[str, ...] = ("--simular",)) -> subprocess.CompletedProcess:
    release = tmp_path / "os-release"
    release.write_text(os_release)
    mark = tmp_path / "ostree-booted"
    if ostree:
        mark.write_text("")
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(tmp_path / "home"),
        "AZURIA_OS_RELEASE": str(release),
        "AZURIA_OSTREE_MARK": str(mark),
        "AZURIA_UNAME": uname,
        # CI also runs this on macOS arm64 runners: pin the machine like the OS.
        "AZURIA_ARCH": arch,
    }
    return subprocess.run(["bash", str(SCRIPT), *args], capture_output=True, text=True, env=env, timeout=30)


def test_matsu_os_gets_its_own_appimage_in_applications(tmp_path):
    out = run(tmp_path, 'NAME="Matsu 27 OS"\nID=matsu\nID_LIKE=fedora\n')
    assert out.returncode == 0, out.stderr
    assert "Matsu OS" in out.stdout
    assert "releases/latest/download/Azuria-Voice-Matsu-OS-x64.AppImage" in out.stdout
    assert str(tmp_path / "home" / "Applications" / "Azuria-Voice.AppImage") in out.stdout
    assert "azuria-voice.desktop" in out.stdout
    assert "SHA256SUMS.txt" in out.stdout
    assert not (tmp_path / "home" / "Applications").exists()  # --simular changes nothing


def test_every_matsu_year_is_recognised(tmp_path):
    for name in ("Matsu 28 OS", "matsu-29-os", "MatsuOS"):
        out = run(tmp_path, f'NAME="{name}"\nID=fedora\n')
        assert "Azuria-Voice-Matsu-OS-x64.AppImage" in out.stdout, name


def test_fedora_atomic_uses_the_appimage_without_rpm_ostree(tmp_path):
    out = run(tmp_path, "NAME=Fedora Linux\nID=fedora\nVARIANT_ID=silverblue\n", ostree=True)
    assert out.returncode == 0, out.stderr
    assert "Fedora Atomic" in out.stdout
    assert "Azuria-Voice-Matsu-OS-x64.AppImage" in out.stdout
    assert "rpm-ostree" not in out.stdout


@pytest.mark.parametrize("release", [
    'NAME="Ubuntu"\nID=ubuntu\nID_LIKE=debian\n',
    'NAME="Linux Mint"\nID=linuxmint\nID_LIKE="ubuntu debian"\n',
    'NAME="Debian GNU/Linux"\nID=debian\n',
])
def test_debian_family_installs_the_deb(tmp_path, release):
    out = run(tmp_path, release)
    assert out.returncode == 0, out.stderr
    assert "-linux-x64.deb" in out.stdout
    assert "sudo apt install" in out.stdout


def test_other_distros_get_the_appimage(tmp_path):
    out = run(tmp_path, "NAME=Arch Linux\nID=arch\n")
    assert out.returncode == 0, out.stderr
    assert "-linux-x64.AppImage" in out.stdout
    assert str(tmp_path / "home" / "Applications" / "Azuria-Voice.AppImage") in out.stdout


def test_refuses_other_systems_with_a_pointer_to_the_releases(tmp_path):
    out = run(tmp_path, "", uname="Darwin")
    assert out.returncode != 0
    assert "github.com/kaikydev1-jpg/azuria-voice/releases" in out.stderr


def test_unknown_option_is_rejected(tmp_path):
    out = run(tmp_path, "ID=arch\n", args=("--xyz",))
    assert out.returncode == 2


def test_refuses_non_x86_64_machines(tmp_path):
    out = run(tmp_path, "ID=arch\n", arch="aarch64")
    assert out.returncode != 0
    assert "x86_64" in out.stderr
