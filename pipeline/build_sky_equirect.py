"""Convert the SPHEREx DR1 HiPS 'Allsky' image (order 3, 64 px tiles) into an equirectangular
texture for the 3D backdrop in Fly. Display only: projected at infinity, no depth.

The within-tile pixel orientation is selected empirically: among the 8 possible flips/transposes,
the correct one gives the smoothest image across tile boundaries (lowest seam discontinuity).
Output: web/public/img/sky-equirect-<frame>.webp  (x: RA 0->360 left->right, y: Dec +90 top -> -90 bottom)
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

import numpy as np
import requests
from astropy import units as u
from astropy_healpix import HEALPix
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
HIPS = "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube"
W, H = 2048, 1024


def deinterleave(v):
    x = np.zeros_like(v)
    y = np.zeros_like(v)
    for b in range(6):
        x |= ((v >> (2 * b)) & 1) << b
        y |= ((v >> (2 * b + 1)) & 1) << b
    return x, y


def build(frame: int):
    url = f"{HIPS}/Norder3/Allsky{'' if frame == 0 else '_' + str(frame)}.png"
    img = np.asarray(Image.open(io.BytesIO(requests.get(url, timeout=120).content)).convert("L")).astype(np.float32)
    tiles_per_row = img.shape[1] // 64
    hp = HEALPix(nside=2 ** 9, order="nested")
    ra = (np.arange(W) + 0.5) / W * 360.0
    dec = 90.0 - (np.arange(H) + 0.5) / H * 180.0
    RA, DEC = np.meshgrid(ra, dec)
    ipix = hp.lonlat_to_healpix(RA * u.deg, DEC * u.deg).astype(np.int64)
    tile = ipix // 4096
    sub = ipix % 4096
    x, y = deinterleave(sub)
    trow, tcol = tile // tiles_per_row, tile % tiles_per_row
    options = {
        "x,y": (x, y), "y,x": (y, x), "x,63-y": (x, 63 - y), "63-y,x": (63 - y, x),
        "63-x,y": (63 - x, y), "y,63-x": (y, 63 - x), "63-x,63-y": (63 - x, 63 - y), "63-y,63-x": (63 - y, 63 - x),
    }
    best = None
    for name, (c, r) in options.items():
        out = img[trow * 64 + r, tcol * 64 + c]
        tv = float(np.mean(np.abs(np.diff(out, axis=0))) + np.mean(np.abs(np.diff(out, axis=1))))
        print(f"  {name:10s} roughness={tv:.3f}")
        if best is None or tv < best[0]:
            best = (tv, name, out)
    print("frame", frame, "chosen", best[1])
    out = best[2]
    dest = ROOT / f"web/public/img/sky-equirect-{frame}.webp"
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(dest, quality=82)
    print("wrote", dest)


if __name__ == "__main__":
    for f in [int(a) for a in sys.argv[1:]] or [47]:
        build(f)
