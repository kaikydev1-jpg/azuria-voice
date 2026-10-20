"""Build and check platform icon containers from the exported 1024px app icon."""

from pathlib import Path

from PIL import Image


root = Path(__file__).resolve().parents[2]
source = Image.open(root / "assets/brand/app-icon-1024.png").convert("RGBA")
sizes = (16, 24, 32, 48, 64, 128, 256)
ico_path = root / "electron/build/icons/icon.ico"
icns_path = root / "electron/build/icons/icon.icns"
source.save(ico_path, format="ICO", sizes=[(size, size) for size in sizes])
source.save(icns_path, format="ICNS", sizes=[(size, size) for size in (16, 32, 64, 128, 256, 512, 1024)])
with Image.open(ico_path) as container:
    actual = sorted(container.ico.sizes())
    expected = [(size, size) for size in sizes]
    assert actual == expected, (actual, expected)
    for size in actual:
        frame = container.ico.getimage(size)
        assert frame.mode == "RGBA" and frame.size == size
with Image.open(icns_path) as container:
    assert container.format == "ICNS" and container.size == (1024, 1024)
    assert any(width * scale == height * scale == 1024
               for width, height, scale in container.info["sizes"])
print("ICO verified: " + ", ".join(str(size) for size in sizes))
print("ICNS verified: maximum 1024px; RGBA source")
