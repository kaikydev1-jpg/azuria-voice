# Azúria Voice artwork

An original M-shaped audio waveform in silver and blue, with a tiny black hole
at its upper right. The dark circular center has a restrained tilted accretion
ring in silver and blue. The bold continuous wave stays recognizable at small
sizes. There are
no gradients, shadows, highlights, embedded raster images, or external assets.

| Color | Value | Use |
|---|---|---|
| Silver | `#CBD5E1` | Left wave, back ring, light text |
| Blue | `#2563EB` | Right wave, front ring |
| Deep navy | `#0B1220` | App tile, dark text, monochrome |
| White | `#FFFFFF` | Light monochrome |

## Deliverables

| Asset | File |
|---|---|
| Editable vector symbol, transparent | `symbol.svg` |
| High resolution transparent symbol | `symbol.png` — 2048 × 2048 RGBA |
| Horizontal wordmark, outlined | `wordmark.svg` |
| Horizontal wordmark, editable live text | `wordmark-editable.svg` |
| High resolution transparent wordmark | `wordmark.png` — 3072px wide |
| One color symbols | `symbol-dark.svg`, `symbol-light.svg`, matching 2048px PNGs |
| One color wordmarks | `wordmark-dark.svg`, `wordmark-light.svg` |
| Platform icon source, dark rounded tile | `app-icon.svg` |
| Platform icon PNGs | `app-icon-{16,24,32,48,64,128,256,1024}.png` |
| Contact sheet: light, dark, monochrome, small sizes | `preview.png` |

The wordmark reads **Azúria Voice**, including the acute accent. Its outlined
distribution file contains actual vector glyph paths and works without installed
fonts. The live text source uses Segoe UI: bold for “Azúria”, regular for “Voice”.
It is editable in an SVG editor; install that font to retain identical typography.
No font files are redistributed.

## Application copies

`electron/public/favicon.svg` is copied from `app-icon.svg`.
`electron/build/icons/icon.png` is 512 × 512 RGBA. `32x32.png` is the idle tray icon.
The Windows `icon.ico` contains **16, 24, 32, 48, 64, 128 and 256px** frames. The
macOS `icon.icns` includes standard and Retina sizes up to 1024px. Transparent
corners are preserved in every icon.

`tray-recording.png` remains a distinct red recording indicator with a white rim;
it is derived from `recording-indicator.svg` and is not part of the brand palette.
The recording and idle tray icons both remain 32 × 32.

`docs/logo.svg`, `docs/logo.png` (512px), and `docs/logo-256.png` use the transparent
symbol. Use the shared files instead of recreating the geometry in individual
screens. Keep a clear area at least the thickness of the wave around the symbol.
At 16px the audio waveform is the primary recognition cue; the black hole is
deliberately secondary. Use the dark tile icon where the background is unknown.

## Reproduce the exports

Requirements: Node.js with `sharp`, Python 3 with Pillow. The repository's runtime
dependencies are unchanged by this artwork kit. From the repository root:

```powershell
node scripts/brand/export.cjs
```

When the tools are installed outside Node/Python's default search paths, point to
them with `AZURIA_SHARP_MODULE` (the absolute `sharp` package directory) and
`AZURIA_PYTHON` (the Python executable). The exporter rasterizes the native SVG
sources, copies all application derivatives, creates the preview, and validates
every ICO frame and the largest ICNS representation. It uses no network access.

To change the typography itself on Windows, edit
`scripts/brand/outline-wordmark.ps1`, run that script with Segoe UI available, then
run the exporter. This optional step updates both live text and outlined vector
wordmarks. Ordinary exports use the committed outlined SVG and need no fonts.
