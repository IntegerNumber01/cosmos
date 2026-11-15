"""Download SPHEREx DR1 cutouts for every MOST-matched frame of comet C/2025 R2 (SWAN).

Input : data/raw/most/swan_brief.txt  (MOST "Brief" IPAC table, catalog=spherex)
Output: data/raw/swan/<productid>.fits and data/raw/swan/most_matches.json

Each cutout is centred on the MEAN predicted position of its observation sequence
(same OBSID prefix + detector), so background stars stay fixed and any moving
source should drift across the cutout. Predicted positions are kept separately
and are never treated as detections.
"""
from __future__ import annotations

import json
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import requests
from astropy.io import ascii, fits

ROOT = Path(__file__).resolve().parents[1]
MOST = ROOT / "data/raw/most/swan_brief.txt"
OUT = ROOT / "data/raw/swan"
SIZE_DEG = 0.25
# default: the bright Oct 27-28 2025 apparition (vmag ~11.3); pass --all for every match
MJD_MAX = 1e9 if "--all" in sys.argv else 60980.0


def load_most(path: Path):
    t = ascii.read(path, format="ipac")
    rows = []
    for r in t:
        rows.append(
            dict(
                productid=str(r["observationid"]).strip() + str(r["productid"]).strip(),
                observationid=str(r["observationid"]).strip(),
                start_date=str(r["start_date"]).strip(),
                mjd_start=float(r["mjd_start"]),
                mjd_end=float(r["mjd_end"]),
                ra_pred=float(r["ra_obj"]),
                dec_pred=float(r["dec_obj"]),
                vmag_pred=float(r["vmag"]),
                sun_dist_au=float(r["sun_dist"]),
                geo_dist_au=float(r["geo_dist"]),
                uri="https://irsa.ipac.caltech.edu/" + str(r["uri"]).strip().lstrip("/"),
            )
        )
    return t, rows


def seq_key(pid: str) -> str:
    # e.g. 2025W44_1A_0045_1D1 -> 2025W44_1A_0045 + D1
    base, det = pid[:-2], pid[-2:]
    return base.rsplit("_", 1)[0] + "_" + det


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    t, rows = load_most(MOST)
    rows = [r for r in rows if r["mjd_start"] < MJD_MAX]
    print("MOST columns:", t.colnames)
    groups = defaultdict(list)
    for r in rows:
        groups[seq_key(r["productid"])].append(r)
    for key, rs in groups.items():
        ra_c = float(np.mean([r["ra_pred"] for r in rs]))
        dec_c = float(np.mean([r["dec_pred"] for r in rs]))
        for r in rs:
            r["sequence"] = key
            r["cutout_center"] = [ra_c, dec_c]
            r["cutout_size_deg"] = SIZE_DEG
            url = f"{r['uri']}?center={ra_c:.6f},{dec_c:.6f}d&size={SIZE_DEG}"
            r["cutout_url"] = url
            dest = OUT / f"{r['productid']}.fits"
            r["local_file"] = str(dest.relative_to(ROOT)).replace("\\", "/")
    todo = [r for r in rows if not ((ROOT / r["local_file"]).exists() and (ROOT / r["local_file"]).stat().st_size > 10000)]

    def fetch(r):
        dest = ROOT / r["local_file"]
        for attempt in range(3):
            try:
                resp = requests.get(r["cutout_url"], timeout=180)
                resp.raise_for_status()
                if not resp.content.startswith(b"SIMPLE"):
                    raise RuntimeError(f"not FITS: {resp.content[:120]!r}")
                dest.write_bytes(resp.content)
                print("ok ", r["productid"], len(resp.content), flush=True)
                return
            except Exception as e:  # noqa: BLE001
                print("ERR", r["productid"], attempt, e, flush=True)
                time.sleep(5 * (attempt + 1))

    with ThreadPoolExecutor(3) as ex:
        list(ex.map(fetch, todo))
    # verify every file opens and record header facts
    for r in rows:
        p = ROOT / r["local_file"]
        if not p.exists():
            r["status"] = "missing"
            continue
        with fits.open(p) as h:
            hdr = h["IMAGE"].header
            r["status"] = "ok"
            r["detector"] = int(hdr["DETECTOR"])
            r["date_avg"] = hdr["DATE-AVG"]
            r["mjd_avg"] = float(hdr["MJD-AVG"])
            r["shape"] = list(h["IMAGE"].data.shape)
    (OUT / "most_matches.json").write_text(json.dumps(rows, indent=2))
    print("wrote", OUT / "most_matches.json", len(rows), "rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
