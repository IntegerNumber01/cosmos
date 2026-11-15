"""Find SPHEREx frames of the SAME sky position on OTHER dates at (nearly) the SAME wavelength.

SPHEREx's linear variable filter means a sky position's wavelength depends on where it lands
on the detector, so two dates are only comparable if their wavelengths at that position match.
For every SIA2 frame covering the position we read only the first 100 kB of the full
Level-2 FITS (HTTP range request: primary + IMAGE header), compute the detector pixel of the
position with the frame's own WCS, and evaluate the WCS-WAVE lookup table (taken from a
same-detector cutout; validated below against frames with known cutout wavelengths).

Output: data/work/timetravel_candidates.json
"""
from __future__ import annotations

import csv
import io
import json
import sys
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import requests
from astropy.io import fits
from astropy.wcs import WCS, FITSFixedWarning

warnings.simplefilter("ignore", FITSFixedWarning)
import logging

logging.getLogger("astropy").setLevel(logging.ERROR)

ROOT = Path(__file__).resolve().parents[1]
SIA = ROOT / "data/raw/timetravel/swan_field_sia2.csv"
RA, DEC = 314.2422, -5.6897  # centre of the 2025W44_1A_0045 SWAN grid
REF_CUTOUT = {1: "data/raw/swan/2025W44_1A_0045_1D1.fits", 4: "data/raw/swan/2025W44_1A_0045_1D4.fits",
              2: "data/raw/swan/2025W44_1A_0101_1D2.fits", 5: "data/raw/swan/2025W44_1A_0101_1D5.fits"}


def read_image_header(url: str) -> fits.Header:
    r = requests.get(url, headers={"Range": "bytes=0-119999"}, timeout=120)
    r.raise_for_status()
    buf = r.content
    # primary header
    end = buf.find(b"END" + b" " * 77)
    p_end = ((end + 80 + 2879) // 2880) * 2880
    h2 = buf[p_end:]
    end2 = h2.find(b"END" + b" " * 77)
    return fits.Header.fromstring(h2[: end2 + 80].decode("ascii"))


def wave_at(hdr: fits.Header, det: int, x: float, y: float):
    with fits.open(ROOT / REF_CUTOUT[det]) as ref:
        tab = ref["WCS-WAVE"].copy()
    hdul = fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(header=hdr), tab])
    w = WCS(hdr, fobj=hdul, key="W")
    w.sip = None
    wl, bw = w.pixel_to_world_values(x, y)
    return float(wl), float(bw)


def evaluate(row):
    det = int(row["energy_bandpassname"][-1])
    if det not in REF_CUTOUT:
        return None
    try:
        hdr = read_image_header(row["access_url"])
    except Exception as e:  # noqa: BLE001
        return dict(obs_id=row["obs_id"], det=det, error=str(e))
    w = WCS(hdr)
    x, y = (float(v) for v in w.world_to_pixel_values(RA, DEC))
    inside = 40 <= x <= hdr["NAXIS1"] - 41 and 40 <= y <= hdr["NAXIS2"] - 41
    wl, bw = wave_at(hdr, det, x, y) if inside else (None, None)
    return dict(obs_id=row["obs_id"], det=det, url=row["access_url"], date_avg=hdr["DATE-AVG"], mjd_avg=float(hdr["MJD-AVG"]),
                x=x, y=y, inside=inside, wavelength_um=wl, bandwidth_um=bw, l2dqa=str(hdr.get("L2DQAFLG", "")))


def main():
    rows = list(csv.DictReader(open(SIA, encoding="utf-8-sig")))
    dets = {int(d) for d in (sys.argv[1].split(",") if len(sys.argv) > 1 else ["1", "4"])}
    rows = [r for r in rows if int(r["energy_bandpassname"][-1]) in dets]
    print("candidates", len(rows))
    with ThreadPoolExecutor(4) as ex:
        res = [r for r in ex.map(evaluate, rows) if r]
    out = ROOT / "data/work/timetravel_candidates.json"
    prev = json.loads(out.read_text()) if out.exists() else []
    keep = {(p["obs_id"], p["det"]): p for p in prev}
    for r in res:
        keep[(r["obs_id"], r["det"])] = r
    out.write_text(json.dumps(list(keep.values()), indent=1))
    ok = [r for r in res if r.get("inside")]
    print("inside detector:", len(ok), "errors:", sum(1 for r in res if "error" in r))
    for r in sorted(ok, key=lambda r: (r["det"], r["wavelength_um"])):
        print(f"D{r['det']} {r['obs_id']:22s} {r['date_avg'][:16]}  lam={r['wavelength_um']:.4f}  bw={r['bandwidth_um']:.4f}  {r['l2dqa']}")


if __name__ == "__main__":
    main()
