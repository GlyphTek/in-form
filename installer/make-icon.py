"""Draws installer/inform.ico: four squares (the four RAKE channels) on a dark tile.

    python3 installer/make-icon.py

Needs Pillow. The .ico is committed, so this only has to be run to change the design.
"""
from pathlib import Path
from PIL import Image, ImageDraw

SIZE = 1024
BG = (5, 5, 5, 255)
GREEN = (0, 255, 136, 255)
CYAN = (0, 212, 255, 255)

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=210, fill=BG)
d.rounded_rectangle((36, 36, SIZE - 37, SIZE - 37), radius=180, outline=(0, 255, 136, 90), width=14)

gap, margin = 64, 210
cell = (SIZE - 2 * margin - gap) // 2
for row in range(2):
    for col in range(2):
        x = margin + col * (cell + gap)
        y = margin + row * (cell + gap)
        colour = CYAN if (row, col) == (1, 1) else GREEN
        d.rounded_rectangle((x, y, x + cell, y + cell), radius=46, fill=colour)

out = Path(__file__).with_name("inform.ico")
img.save(out, format="ICO", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
print("wrote", out, out.stat().st_size, "bytes")
