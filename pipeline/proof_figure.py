"""Proof figure: one SWAN sequence reprojected onto a common sky grid (stars aligned),
with predicted (mid-exposure) and measured comet positions, plus a difference image."""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from reproject import reproject_interp

from spherex_io import load_l2

ROOT = Path(__file__).resolve().parents[1]
seq = sys.argv[1] if len(sys.argv) > 1 else "2025W44_1A_0045_D1"
M = json.loads((ROOT / "data/work/swan_measurements.json").read_text())
fr = sorted([f for f in M["frames"] if f["sequence"] == seq], key=lambda f: f["mjd_avg"])
ims = [load_l2(ROOT / "data/raw/swan" / f"{f['productid']}.fits") for f in fr]
ref = ims[0]
shape = ref.image.shape
stack = []
for im in ims:
    arr, _ = reproject_interp((np.where(np.isfinite(im.image), im.image, np.nan), im.wcs), ref.wcs, shape_out=shape)
    stack.append(arr)
stack = np.array(stack)
c = shape[0] // 2
half = 32
sl = (slice(c - half, c + half), slice(c - half, c + half))
lo, hi = np.nanpercentile(stack[:, sl[0], sl[1]], [3, 99.7])
fig, axes = plt.subplots(1, len(fr) + 1, figsize=(4 * (len(fr) + 1), 4.3))
for ax, f, arr in zip(axes, fr, stack):
    ax.imshow(np.arcsinh((arr[sl] - lo) / (hi - lo) * 8), origin="lower", cmap="magma")
    for key, mk, col in (("pred_mid", "+", "cyan"), ("meas", "o", "lime")):
        x, y = ref.wcs.world_to_pixel_values(f[key]["ra"], f[key]["dec"])
        ax.plot(x - (c - half), y - (c - half), mk, ms=14 if mk == "o" else 18, mfc="none", mec=col, mew=1.5)
    ax.set_title(f"{f['date_avg'][11:19]} UTC  λ={f['wavelength_um']:.3f}µm", fontsize=10)
    ax.set_xticks([]); ax.set_yticks([])
diff = stack[-1] - stack[0]
v = np.nanpercentile(np.abs(diff[sl]), 99.5)
axes[-1].imshow(diff[sl], origin="lower", cmap="RdBu_r", vmin=-v, vmax=v)
axes[-1].set_title("last − first (stars cancel)", fontsize=10)
axes[-1].set_xticks([]); axes[-1].set_yticks([])
fig.suptitle(f"C/2025 R2 (SWAN) — SPHEREx DR1 {seq}   cyan + = MOST prediction (mid-exposure), green ○ = measured", fontsize=11)
plt.tight_layout()
out = ROOT / f"data/work/proof_{seq}.png"
plt.savefig(out, dpi=80)
print("wrote", out)
