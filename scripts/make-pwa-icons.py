"""Draws the phone home-screen icons in public/icons from the same four-square design as installer/inform.ico.

    python3 scripts/make-pwa-icons.py

Needs Pillow. The PNGs are committed, so this only has to be run to change the design.

  icon-192.png, icon-512.png      the rounded tile, for browsers ("any")
  icon-maskable-512.png           full square, artwork kept inside the central 60%, so Android can
                                  crop it to a circle or squircle without cutting anything off
  apple-touch-icon.png (180)      full square with no transparency; iOS rounds the corners itself
  favicon-32.png                  browser tab
"""
from pathlib import Path
from PIL import Image, ImageDraw

BG = (5, 5, 5, 255)
GREEN = (0, 255, 136, 255)
CYAN = (0, 212, 255, 255)
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
SS = 1024  # draw large, then shrink for smooth edges


def squares(d, left, top, size):
    gap = size * 0.1
    cell = (size - gap) / 2
    for row in range(2):
        for col in range(2):
            x = left + col * (cell + gap)
            y = top + row * (cell + gap)
            d.rounded_rectangle((x, y, x + cell, y + cell), radius=cell * 0.2, fill=CYAN if (row, col) == (1, 1) else GREEN)


def tile(rounded):
    img = Image.new("RGBA", (SS, SS), (0, 0, 0, 0) if rounded else BG)
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle((0, 0, SS - 1, SS - 1), radius=210, fill=BG)
        d.rounded_rectangle((36, 36, SS - 37, SS - 37), radius=180, outline=(0, 255, 136, 90), width=14)
    return img, d


def make(name, px, rounded, art):
    img, d = tile(rounded)
    squares(d, (SS - SS * art) / 2, (SS - SS * art) / 2, SS * art)
    img.resize((px, px), Image.LANCZOS).save(OUT / name)
    print("wrote", OUT / name)


OUT.mkdir(parents=True, exist_ok=True)
make("icon-512.png", 512, True, 0.59)
make("icon-192.png", 192, True, 0.59)
make("icon-maskable-512.png", 512, False, 0.5)
make("apple-touch-icon.png", 180, False, 0.58)
make("favicon-32.png", 32, True, 0.66)
