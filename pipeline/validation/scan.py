"""Inventory every SPHEREx DR1 frame covering a target and the exact wavelength AT the target.

For each SIA2 row we read only the first 120 kB of the full Level-2 FITS (HTTP Range: primary +
IMAGE header), place the target (propagated to the frame's DATE-AVG) with that frame's WCS, and
evaluate the WCS-WAVE lookup table there. WCS-WAVE tables are identical across dates for a given
detector, so one reference cutout per detector (cached in data/raw/validation/_wave_ref/) is
used; every cutout downloaded later is re-checked with its OWN table (see measure stage).
"""
from __future__ import annotations

import csv
import io
import json
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS

from .common import RAW, SIA, http_get, target_position

EDGE_MARGIN = 15  # px; target must be at least this far inside the 2040x2040 frame
WAVE_REF_DIR = RAW / "_wave_ref"


def sia_rows(tid: str, ra: float, dec: float, refresh=False) -> list[dict]:
    path = RAW / tid / "sia2.csv"
    if refresh or not path.exists():
        r = http_get(SIA.format(ra=ra, dec=dec, r=0.01), check=lambda r: r.text.startswith("s_ra"))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(r.content)
    return list(csv.DictReader(io.StringIO(path.read_text(encoding="utf-8-sig"))))


def read_image_header(url: str) -> fits.Header:
    r = http_get(url, headers={"Range": "bytes=0-119999"}, timeout=120)
    buf = r.content
    end = buf.find(b"END" + b" " * 77)
    p_end = ((end + 80 + 2879) // 2880) * 2880
    h2 = buf[p_end:]
    end2 = h2.find(b"END" + b" " * 77)
    if end2 < 0:
        raise RuntimeError("IMAGE header not within first 120 kB")
    return fits.Header.fromstring(h2[: end2 + 80].decode("ascii"))


_wave_tabs: dict[int, fits.BinTableHDU] = {}


def wave_table(det: int):
    if det not in _wave_tabs:
        with fits.open(WAVE_REF_DIR / f"D{det}.fits") as ref:
            _wave_tabs[det] = ref["WCS-WAVE"].copy()
    return _wave_tabs[det]


def wave_at_header(hdr: fits.Header, det: int, x: float, y: float):
    hdul = fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(header=hdr), wave_table(det)])
    w = WCS(hdr, fobj=hdul, key="W")
    w.sip = None  # the alternate 'W' WCS must not inherit the celestial SIP terms
    wl, bw = w.pixel_to_world_values(x, y)
    return float(wl), float(bw)


def ensure_wave_refs(rows: list[dict]):
    """Download one small cutout per detector (any date) to serve as the WCS-WAVE reference."""
    WAVE_REF_DIR.mkdir(parents=True, exist_ok=True)
    for det in range(1, 7):
        dest = WAVE_REF_DIR / f"D{det}.fits"
        if dest.exists() and dest.stat().st_size > 10000:
            continue
        row = next(r for r in rows if int(r["energy_bandpassname"][-1]) == det)
        url = f"{row['access_url']}?center={float(row['s_ra']):.5f},{float(row['s_dec']):.5f}d&size=0.05"
        r = http_get(url, check=lambda r: r.content.startswith(b"SIMPLE"))
        dest.write_bytes(r.content)
        (WAVE_REF_DIR / f"D{det}.source.txt").write_text(url)


def scan_target(tid: str, cat: dict, refresh=False) -> list[dict]:
    path = RAW / tid / "frames.json"
    have = {} if refresh or not path.exists() else {(f["obs_id"], f["det"]): f for f in json.loads(path.read_text())}
    t_mid = Time("2025-11-01")
    ra0, dec0 = target_position(cat, t_mid)
    rows = sia_rows(tid, ra0, dec0, refresh)
    ensure_wave_refs(rows)

    def one(row):
        det = int(row["energy_bandpassname"][-1])
        key = (row["obs_id"], det)
        if key in have and "error" not in have[key]:
            return have[key]
        try:
            hdr = read_image_header(row["access_url"])
        except Exception as e:  # noqa: BLE001
            return dict(obs_id=row["obs_id"], det=det, url=row["access_url"], error=str(e))
        t = Time(hdr["DATE-AVG"], scale="utc")
        ra, dec = target_position(cat, t)
        w = WCS(hdr)
        x, y = (float(v) for v in w.world_to_pixel_values(ra, dec))
        nx, ny = hdr["NAXIS1"], hdr["NAXIS2"]
        inside = EDGE_MARGIN <= x <= nx - 1 - EDGE_MARGIN and EDGE_MARGIN <= y <= ny - 1 - EDGE_MARGIN
        wl, bw = wave_at_header(hdr, det, x, y) if inside else (None, None)
        return dict(obs_id=row["obs_id"], det=det, url=row["access_url"], date_avg=hdr["DATE-AVG"], mjd=float(hdr["MJD-AVG"]),
                    ra_pred=ra, dec_pred=dec, x=x, y=y, inside=bool(inside), wavelength_um=wl, bandwidth_um=bw,
                    l2dqa=str(hdr.get("L2DQAFLG", "")).strip())

    with ThreadPoolExecutor(3) as ex:
        res = list(ex.map(one, rows))
    path.write_text(json.dumps(res, indent=1))
    return res


def visits(frames: list[dict], gap_days=3.0) -> list[list[dict]]:
    """Group frames into visits (clusters in time separated by > gap_days)."""
    fs = sorted(frames, key=lambda f: f["mjd"])
    out = []
    for f in fs:
        if out and f["mjd"] - out[-1][-1]["mjd"] <= gap_days:
            out[-1].append(f)
        else:
            out.append([f])
    return out


def matched_sets(frames: list[dict], det: int, max_per_visit=3, max_frames=8) -> list[dict]:
    """All maximal same-detector sets whose wavelengths at the target agree pairwise within
    half a channel bandwidth (window [lam_i, lam_i + 0.5*min(bw)]). Ranked by number of
    distinct visits, then time span."""
    fs = sorted([f for f in frames if f.get("inside") and f["det"] == det and f.get("wavelength_um")], key=lambda f: f["wavelength_um"])
    sets = []
    for i, f0 in enumerate(fs):
        bwmin = f0["bandwidth_um"]
        members = []
        for f in fs[i:]:
            bwmin_new = min(bwmin, f["bandwidth_um"])
            if f["wavelength_um"] - f0["wavelength_um"] <= 0.5 * bwmin_new:
                members.append(f)
                bwmin = bwmin_new
        # members must all be within 0.5*min(bw) of f0, and therefore pairwise
        members = [f for f in members if f["wavelength_um"] - f0["wavelength_um"] <= 0.5 * bwmin]
        vs = visits(members)
        if len(vs) < 2:
            continue
        span = members[-1]["mjd"] - members[0]["mjd"] if members else 0
        span = max(f["mjd"] for f in members) - min(f["mjd"] for f in members)
        sets.append(dict(det=det, frames=members, n_visits=len(vs), span_days=span, lam_ref=f0["wavelength_um"], bw=bwmin))
    sets.sort(key=lambda s: (-s["n_visits"], -s["span_days"]))
    # de-duplicate sets that share their frame list
    uniq, seen = [], set()
    for s in sets:
        k = tuple(sorted((f["obs_id"]) for f in s["frames"]))
        if k in seen:
            continue
        seen.add(k)
        # thin: at most max_per_visit frames per visit, at most max_frames total, keep visits spread
        vs = visits(s["frames"])
        chosen = []
        for v in vs:
            v = sorted(v, key=lambda f: abs(f["wavelength_um"] - np.median([g["wavelength_um"] for g in s["frames"]])))
            chosen.append(v[:max_per_visit])
        flat = []
        k_ = 0
        while len(flat) < max_frames and any(chosen):
            v = chosen[k_ % len(chosen)]
            if v:
                flat.append(v.pop(0))
            k_ += 1
        s["frames"] = sorted(flat, key=lambda f: f["mjd"])
        lam = [f["wavelength_um"] for f in s["frames"]]
        s["lam_ref"] = float(np.mean(lam))
        s["lam_spread"] = float(max(lam) - min(lam))
        uniq.append(s)
    return uniq
