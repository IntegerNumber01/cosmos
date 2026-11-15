"""Export the SPHEREx WCS-WAVE lookup tables (one per detector; identical across dates) for the
browser/server engine, in a layout verified against astropy's own -TAB evaluation.

Output: web/src/data/wave_tables.json
  { "<det>": { "x": [...], "y": [...], "wl": [[...]] (ny x nx), "bw": [[...]] } }
Lookup coordinates are 1-based RAW detector pixels: raw = active0 + 1, where for a cutout pixel p0
(0-based) active0 = p0 - CRPIX1W + ... see engine/wcs.ts. We verify with astropy at random pixels.
"""
from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import numpy as np
from astropy.io import fits

sys.path.insert(0, str(Path(__file__).parent))
from spherex_io import _wave_wcs  # noqa: E402

logging.getLogger("astropy").setLevel(logging.ERROR)
ROOT = Path(__file__).resolve().parents[1]
SRC = {
    1: "data/raw/swan/2025W44_1A_0045_1D1.fits",
    2: "data/raw/swan/2025W44_1A_0101_1D2.fits",
    3: "data/raw/wise0855_may2025_d3_cutout.fits",
    4: "data/raw/swan/2025W44_1A_0045_1D4.fits",
    5: "data/raw/swan/2025W44_1A_0101_1D5.fits",
    6: "data/raw/wavetables/d6_ref.fits",
}

out = {}
for det, rel in SRC.items():
    with fits.open(ROOT / rel) as h:
        hdr = h["IMAGE"].header
        tab = h["WCS-WAVE"].data
        X = np.asarray(tab["X"][0]).astype(float)
        Y = np.asarray(tab["Y"][0]).astype(float)
        V = np.asarray(tab["VALUES"][0]).astype(float)
        nx, ny = len(X), len(Y)
        w = _wave_wcs(hdr, h)
        crpx, crpy = float(hdr["CRPIX1W"]), float(hdr["CRPIX2W"])
        # FITS -TAB: VALUES array has shape (2, ny, nx) in C order [k][j][i] or similar; find the layout
        layouts = {
            "k_j_i": V.reshape(ny, nx, 2) if False else None,
        }
        cands = {
            "(ny,nx,2)": V.reshape(ny, nx, 2).transpose(2, 0, 1),
            "(nx,ny,2)": V.reshape(nx, ny, 2).transpose(2, 1, 0),
            "(2,ny,nx)": V.reshape(2, ny, nx),
            "(2,nx,ny)": V.reshape(2, nx, ny).transpose(0, 2, 1),
        }

        def interp(grid, rx, ry):
            ix = np.clip(np.searchsorted(X, rx) - 1, 0, nx - 2)
            iy = np.clip(np.searchsorted(Y, ry) - 1, 0, ny - 2)
            tx = (rx - X[ix]) / (X[ix + 1] - X[ix])
            ty = (ry - Y[iy]) / (Y[iy + 1] - Y[iy])
            return (grid[iy, ix] * (1 - tx) * (1 - ty) + grid[iy, ix + 1] * tx * (1 - ty)
                    + grid[iy + 1, ix] * (1 - tx) * ty + grid[iy + 1, ix + 1] * tx * ty)

        rng = np.random.default_rng(det)
        n0, n1 = h["IMAGE"].data.shape
        ps = rng.uniform(0, [n1 - 1, n0 - 1], size=(40, 2))
        ref = np.array([w.pixel_to_world_values(px, py) for px, py in ps])
        best = None
        for name, g in cands.items():
            # raw coordinate (FITS -TAB with CRVAL=1, CDELT=1): raw = (p0 + 1) - CRPIX + 1
            rx = ps[:, 0] + 1 - crpx + 1
            ry = ps[:, 1] + 1 - crpy + 1
            est = np.stack([interp(g[0], rx, ry), interp(g[1], rx, ry)], 1)
            err = np.abs(est - ref).max()
            if best is None or err < best[0]:
                best = (err, name, g)
        print(f"D{det}: nx={nx} ny={ny} layout={best[1]} max|Δ| vs astropy = {best[0]:.2e} µm")
        assert best[0] < 1e-6, "layout not verified"
        g = best[2]
        out[str(det)] = dict(x=X.tolist(), y=Y.tolist(), wl=np.round(g[0], 6).tolist(), bw=np.round(g[1], 6).tolist())

dest = ROOT / "web/src/data/wave_tables.json"
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(out, separators=(",", ":")))
print("wrote", dest)
