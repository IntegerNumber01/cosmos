"""Build the small, offline Earth ephemeris used for catalogue-parallax correction.

Astropy's bundled ERFA ephemeris needs no downloaded kernel. Values are barycentric
ICRS AU, sampled every four UTC days. The browser interpolates, never extrapolates.
This is observer geometry, not a distance measurement from SPHEREx.
"""
import json
from pathlib import Path

import numpy as np
from astropy.coordinates import get_body_barycentric
from astropy.time import Time

ROOT = Path(__file__).resolve().parents[1]
start = float(Time("2024-01-01", scale="utc").mjd)
mjd = np.arange(start, float(Time("2028-01-05", scale="utc").mjd) + 1, 4)
xyz = get_body_barycentric("earth", Time(mjd, format="mjd", scale="utc"), ephemeris="builtin").xyz.value.T
data = {"source": "Astropy get_body_barycentric('earth'), bundled ERFA epv00; ICRS barycentric AU",
        "startMjd": start, "stepDays": 4, "xyz": xyz.round(10).tolist()}
(ROOT / "web/src/lib/engine/earth-barycentric.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
# Independent off-grid checks retained for Node regressions.
checks = mjd[:-1:19] + 1.731
truth = get_body_barycentric("earth", Time(checks, format="mjd", scale="utc"), ephemeris="builtin").xyz.value.T
fixture = {"source": data["source"], "checks": [{"mjd": float(t), "xyz": list(p)} for t, p in zip(checks, truth)]}
(ROOT / "web/scripts/fixtures/earth-barycentric.json").write_text(json.dumps(fixture, indent=2), encoding="utf-8")
print(f"Wrote {len(mjd)} samples and {len(checks)} independent interpolation checks.")
