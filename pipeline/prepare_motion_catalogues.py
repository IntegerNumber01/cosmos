"""Prepare Gaia reference fields from original validation ECSV, without network access."""
import json
import math
from pathlib import Path

from astropy.table import Table

ROOT = Path(__file__).resolve().parents[1]


def number(row, key):
    value = float("nan") if getattr(row[key], "mask", False) else float(row[key])
    return value if math.isfinite(value) else None


for raw in (ROOT / "data/raw/validation").glob("*/gaia_field.ecsv"):
    directory = ROOT / "web/public/cache" / raw.parent.name
    prepared = json.loads((directory / "prepared.json").read_text(encoding="utf-8"))
    stars = []
    for row in Table.read(raw):
        stars.append({
            "source_id": str(int(row["source_id"])), "g": number(row, "phot_g_mean_mag"),
            "ra_epoch": number(row, "ra"), "dec_epoch": number(row, "dec"),
            "pmra": number(row, "pmra") or 0, "pmdec": number(row, "pmdec") or 0,
            "parallax": number(row, "parallax"), "parallax_error": number(row, "parallax_error"),
            "variable": str(row["phot_variable_flag"]) == "VARIABLE",
        })
    data = {
        "source": "ESA Gaia DR3 (gaiadr3.gaia_source via ESA TAP), queried for the independent validation; positions at J2016.0",
        "query": {**prepared["target"], "radius_deg": 0.16, "gmax": 18, "epoch_mjd": 57388.5},
        "raw": str(raw.relative_to(ROOT)).replace("\\", "/"), "stars": stars,
    }
    (directory / "calib_stars.json").write_text(json.dumps(data, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(raw.parent.name, len(stars))
