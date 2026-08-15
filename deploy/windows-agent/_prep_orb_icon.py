"""One-shot: orb HUD → PNG transparent pour tray / panel."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent / "assets"
SRC = ROOT / "orb-source.jpg"
OUT = ROOT / "orb-tray.png"
OUT_PANEL = ROOT / "orb-panel.png"


def _knockout_black(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            lum = (r + g + b) / 3
            if lum < 14:
                px[x, y] = (r, g, b, 0)
            elif lum < 32:
                px[x, y] = (r, g, b, max(0, min(255, int((lum - 14) * 14))))
    return im


def main() -> None:
    im = Image.open(SRC)
    side = min(im.size)
    left = (im.size[0] - side) // 2
    top = (im.size[1] - side) // 2
    im = im.crop((left, top, left + side, top + side))
    # Downscale avant knockout (5000² trop lent)
    work = im.resize((512, 512), Image.Resampling.LANCZOS)
    work = _knockout_black(work)
    work.resize((256, 256), Image.Resampling.LANCZOS).save(OUT)
    work.resize((128, 128), Image.Resampling.LANCZOS).save(OUT_PANEL)
    print("wrote", OUT, OUT_PANEL)


if __name__ == "__main__":
    main()
