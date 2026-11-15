"""Quick-look montage of SWAN cutouts with MOST predicted positions marked (diagnostic only)."""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

ROOT = Path(__file__).resolve().parents[1]
rows = json.loads((ROOT / "data/raw/swan/most_matches.json").read_text())
rows.sort(key=lambda r: (r["sequence"], r["mjd_start"]))
out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data/work/swan_quicklook.png"
out.parent.mkdir(parents=True, exist_ok=True)

n = len(rows)
cols = 4
fig, axes = plt.subplots((n + cols - 1) // cols, cols, figsize=(16, 4 * ((n + cols - 1) // cols)))
for ax, r in zip(axes.flat, rows):
    with fits.open(ROOT / r["local_file"]) as h:
        img = h["IMAGE"].data.astype(float)
        w = WCS(h["IMAGE"].header)
    x, y = w.world_to_pixel_values(r["ra_pred"], r["dec_pred"])
    v = img[np.isfinite(img)]
    lo, hi = np.percentile(v, [5, 99.5])
    ax.imshow(np.arcsinh((img - lo) / (hi - lo) * 10), origin="lower", cmap="gray")
    ax.plot(x, y, "o", mfc="none", mec="r", ms=18, mew=1.2)
    ax.set_title(f"{r['productid']}\n{r['start_date'][11:19]} pred=({x:.1f},{y:.1f})", fontsize=9)
    ax.set_xticks([]); ax.set_yticks([])
for ax in list(axes.flat)[n:]:
    ax.axis("off")
plt.tight_layout()
plt.savefig(out, dpi=70)
print("wrote", out)
