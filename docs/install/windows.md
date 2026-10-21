# Azúria Voice — Windows

Azúria Voice is an independent Electron distribution of VoiceStudio. It keeps
the original speech engines and local runtime behavior.

## Install

Use Windows 10 or 11 on an Intel/AMD x64 PC. An NVIDIA GPU and driver enable
CUDA; CPU operation is supported. Windows on ARM remains experimental and runs
the x64 Python backend under emulation, on CPU.

Download `Azuria-Voice-Electron-0.5.7-win-x64.exe` from
[Azúria Voice Releases](https://github.com/kaikydev1-jpg/azuria-voice/releases).
The version number changes with each published update. When a release is not
published yet, download the `Azuria-Voice-Windows-x64` artifact from the latest
successful [Windows build](https://github.com/kaikydev1-jpg/azuria-voice/actions/workflows/azuria-windows.yml)
and extract it first.

The artifact/release also contains `SHA256SUMS.txt`. Check the installer hash
with `Get-FileHash -Algorithm SHA256` before opening it. The installer runs for
the current user and lets you select an installation folder. Builds without a
configured Windows signing certificate are unsigned.

The release installer can also be downloaded and verified by the repository
script:

```powershell
irm https://raw.githubusercontent.com/kaikydev1-jpg/azuria-voice/main/scripts/install.ps1 | iex
```

This command requires a published release; Actions artifacts are downloaded
through the GitHub Actions page.

## First launch

1. Open Azúria Voice and review the environment location and download region.
2. Start the local runtime installation. It downloads managed Python 3.11 and
   the locked dependencies. The app selects CPU-only PyTorch when it cannot
   detect an NVIDIA driver. Allow at least 5 GiB free for CPU setup or 9 GiB
   for the CUDA environment, plus space for the models you select.
3. Complete the model setup. Model weights are separate downloads, selected
   in the app; they are not bundled in the installer. Light engines such as
   KittenTTS, Supertonic-3 or PocketTTS suit CPU machines. Choose a small
   Whisper model for transcription on CPU.
4. Choose a saved voice or provide a clean reference recording, enter text,
   and generate. After the selected runtime and models are installed, local
   generation works offline. Optional cloud features retain their own setup.

The installer does not require a system Python, FFmpeg, CUDA Toolkit, or
developer toolchain. Media tools are managed by the app. For gated models,
provide your Hugging Face token in Settings; model licenses remain separate
from the application license.

## Updates and saved data

Settings checks application updates from
[`kaikydev1-jpg/azuria-voice`](https://github.com/kaikydev1-jpg/azuria-voice/releases).
Download an offered update, then install it when ready to restart. You can
also run a newer Azúria Voice installer over the existing installation.

Application files are replaced while downloaded models, voices, projects,
settings and the managed Python environment remain in their persistent
locations. Keep the application identity `com.azuria.voice.desktop` and product
name `Azúria Voice` stable in future versions. Do not delete these directories
when updating:

| Content | Default Windows location |
| --- | --- |
| Electron preferences, browser storage and runtime location | `%APPDATA%\Azuria Voice` |
| Managed Python project/environment | `%APPDATA%\Azuria Voice\runtime\project` |
| Runtime download cache and managed Python | Adjacent `runtime\.uv-cache` and `runtime\.python` |
| Voices, generated files, settings database and engine environments | `%APPDATA%\OmniVoice` |
| Hugging Face model cache | `%LOCALAPPDATA%\OmniVoice\hf_cache` |
| Custom data/cache overrides | `%USERPROFILE%\.config\omnivoice\env` |

The `OmniVoice` backend directory names and `OMNIVOICE_*` environment variables
are retained for compatibility. Existing environment overrides and paths
selected in Settings take precedence. Azúria Voice does not migrate or remove
an existing VoiceStudio Electron profile.

For another drive, select **Change…** beside **App environment** before the
first installation. The chosen folder holds the environment and its download
caches, plus `data`, `models` and `tmp`. Existing installations are not moved
by choosing a new folder; use Settings → Storage for relocation afterwards.
`OMNIVOICE_DATA_DIR`, `OMNIVOICE_CACHE_DIR`, `OMNIVOICE_ENGINES_DIR` and explicit
temporary-directory variables remain supported. Keep an external drive
connected whenever the app runs.

Use Windows Settings → Apps, or `scripts/install.ps1 -Uninstall`, to remove the
application while preserving data. The historical clean-uninstaller scripts
target the original shared backend directories; they are not an update step.

## Build from source

Install Git for Windows, Node.js 22+, Bun 1.4.2, Rust/Cargo with the
`x86_64-pc-windows-msvc` target, and Visual Studio 2022 C++ Build Tools with the
**Desktop development with C++** workload. Source backend development also
needs uv; the maintained workflow pins uv 0.12.13. ARM64 builds additionally
need the ARM64 C++ tools and the `aarch64-pc-windows-msvc` Rust target.

```powershell
git clone https://github.com/kaikydev1-jpg/azuria-voice.git
cd azuria-voice
bun install --frozen-lockfile
bun run setup:api
bun run dev
```

To build a local installer:

```powershell
bun run dist
```

This creates `electron/release/Azuria-Voice-Electron-<version>-win-x64.exe`
on an x64 build host without publishing. The Rust helper is compiled during
packaging. To include uv in the installer, copy the pinned `uv.exe` to
`electron/build/uv/uv-x86_64-pc-windows-msvc.exe` before packaging. Without a
bundled executable, first-run setup can download the same pinned version.

The [Windows workflow](https://github.com/kaikydev1-jpg/azuria-voice/actions/workflows/azuria-windows.yml)
provides this toolchain and bundles uv. Every push to `main` builds a reviewable
artifact. Manual dispatch defaults to `publish: false`; selecting `publish`
creates the versioned release and updater feed after validation. A version
already published cannot be overwritten by that workflow. Change the root
`package.json` version and maintained mirrors together before a future release.

## Troubleshooting

Check Settings → About → Run self-check and the setup log. Model downloads may
need a Hugging Face token or a different mirror. CPU execution is slower;
AMD integrated graphics and NPUs do not accelerate the PyTorch backend on
Windows. Windows ARM support has not been fully validated on real hardware.

Report issues in the
[Azúria Voice issue tracker](https://github.com/kaikydev1-jpg/azuria-voice/issues).
