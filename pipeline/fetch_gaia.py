"""Fetch a Gaia DR3 sample with MEASURED parallaxes for the 3D 'Fly' layer.

Two synchronous ADQL queries against the ESA Gaia archive (public, no login):
  A) the solar neighbourhood: parallax > 20 mas (< 50 pc), parallax_over_error > 10
  B) bright stars: G < 6.5 with parallax_over_error > 5 (recognisable naked-eye stars)
Distances are 1/parallax (valid because parallax_over_error is high); the fractional
distance uncertainty ~ parallax_error/parallax is kept per star. Positions are Gaia DR3
epoch J2016.0.
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

import requests
from astropy.table import Table, unique, vstack

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/raw/gaia"
TAP = "https://gea.esac.esa.int/tap-server/tap/sync"
COLS = ("source_id, ra, dec, parallax, parallax_error, parallax_over_error, pmra, pmdec, "
        "radial_velocity, phot_g_mean_mag, bp_rp, teff_gspphot, ruwe")
QUERIES = {
    "near50pc": f"SELECT {COLS} FROM gaiadr3.gaia_source WHERE parallax > 20 AND parallax_over_error > 10",
    "bright": f"SELECT {COLS} FROM gaiadr3.gaia_source WHERE phot_g_mean_mag < 6.5 AND parallax_over_error > 5",
}


def run(adql: str) -> Table:
    r = requests.post(TAP, data=dict(REQUEST="doQuery", LANG="ADQL", FORMAT="votable", QUERY=adql), timeout=600)
    r.raise_for_status()
    return Table.read(io.BytesIO(r.content), format="votable")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    tabs = []
    for name, q in QUERIES.items():
        t = run(q)
        print(name, len(t))
        t["sample"] = name
        t.write(OUT / f"gaia_{name}.ecsv", overwrite=True)
        tabs.append(t)
    allt = unique(vstack(tabs), keys="SOURCE_ID")
    allt.write(OUT / "gaia_dr3_sample.ecsv", overwrite=True)
    (OUT / "queries.txt").write_text("\n\n".join(f"-- {k}\n{v}" for k, v in QUERIES.items()) + f"\n\nendpoint: {TAP}\n")
    print("total unique", len(allt))
    return 0


if __name__ == "__main__":
    sys.exit(main())
