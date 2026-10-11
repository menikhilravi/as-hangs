#!/usr/bin/env python3
# sheet.py — contact sheet of screenshots: sheet.py out.png cols scale img1 img2 ... (labels = file names)
import sys
from PIL import Image, ImageDraw
out, cols, scale = sys.argv[1], int(sys.argv[2]), float(sys.argv[3])
files = sys.argv[4:]
ims = [Image.open(f).convert('RGB') for f in files]
w, h = int(ims[0].width * scale), int(ims[0].height * scale)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + 18)), (20, 20, 20))
d = ImageDraw.Draw(sheet)
for k, (im, f) in enumerate(zip(ims, files)):
    x, y = (k % cols) * w, (k // cols) * (h + 18)
    sheet.paste(im.resize((w, h), Image.LANCZOS), (x, y + 18))
    d.text((x + 4, y + 3), f.split('/')[-1], fill=(230, 230, 230))
sheet.save(out)
print(out, sheet.size)
