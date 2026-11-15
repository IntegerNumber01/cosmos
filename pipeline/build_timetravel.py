"""Time Travel assets: the same patch of sky on two dates at a MATCHED wavelength.

Pairs each 2025-10-27 SWAN frame (sequence 2025W44_1A_0045) with the 2026-05-01 frame of the
same detector whose wavelength at the target position is closest (from timetravel_select.py).
Both are reprojected onto the SAME north-up grid used for the SWAN sequence. We export the two
images (common stretch), the difference D = after - before, and the significance
Z = D / sqrt(var_before + var_after), using VARIANCE planes, with rejected-flag pixels masked.
Output: web/public/data/timetravel/
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib
import numpy as np
import requests
from astropy.stats import sigma_clipped_stats
from astropy.wcs import WCS
from PIL import Image
from reproject import reproject_interp

from spherex_io import REJECT_FLAG_NAMES, load_l2

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/timetravel"
OUT = ROOT / "web/public/data/timetravel"
OUT.mkdir(parents=True, exist_ok=True)
case = json.loads((ROOT / "web/public/data/swan/case.json").read_text())
cands = json.loads((ROOT / "data/work/timetravel_candidates.json").read_text())
MAGMA = matplotlib.colormaps["magma"]
DIV = matplotlib.colormaps["RdBu_r"]
PIX = 6.15 / 3600
SIZE = 0.25


def to_png(rgba, path):
    Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8)).transpose(Image.FLIP_TOP_BOTTOM).save(path, optimize=True)


def stretch(x, lo, hi, soft=0.08):
    t = np.clip((x - lo) / (hi - lo), 0, None)
    return np.clip(np.arcsinh(t / soft) / np.arcsinh(1 / soft), 0, 1)


def fetch(url, ra, dec, dest):
    if dest.exists() and dest.stat().st_size > 10000:
        return
    import time
    for attempt in range(6):
        r = requests.get(f"{url}?center={ra:.6f},{dec:.6f}d&size={SIZE}", timeout=180)
        if r.status_code == 200 and r.content.startswith(b"SIMPLE"):
            dest.write_bytes(r.content)
            return
        print("retry", attempt, r.status_code)
        time.sleep(8 * (attempt + 1))
    raise RuntimeError(f"failed to fetch {url}")


def prep(im, gw, n):
    hard = 0
    for name, (m, _) in im.flag_defs.items():
        if name in REJECT_FLAG_NAMES and name != "OUTLIER":
            hard |= m
    data = im.image.copy()
    var = im.variance.copy()
    bad = (im.flags & hard) != 0
    data[bad] = np.nan
    var[bad] = np.nan
    _, med, std = sigma_clipped_stats(data[np.isfinite(data)], sigma=3)
    a, _ = reproject_interp((data - med, im.wcs), gw, shape_out=(n, n))
    v, _ = reproject_interp((var, im.wcs), gw, shape_out=(n, n))
    return a, v, std


seqs = {s["id"]: s for s in case["sequences"]}
pairs_out = []
for det_seq in ("2025W44_1A_0045_D1", "2025W44_1A_0045_D4"):
    s = seqs[det_seq]
    det = s["detector"]
    g = s["grid"]
    n = g["n"]
    gw = WCS(naxis=2)
    gw.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    gw.wcs.cdelt = [-PIX, PIX]
    gw.wcs.crval = [g["center_ra"], g["center_dec"]]
    gw.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]
    later = [c for c in cands if c.get("inside") and c["det"] == det and c["obs_id"].startswith("2026W18")]
    for fr in s["frames"]:
        lam = fr["wavelength_um"]
        best = min(later, key=lambda c: abs(c["wavelength_um"] - lam))
        dl = best["wavelength_um"] - lam
        if abs(dl) > 0.25 * fr["bandwidth_um"]:  # pairwise within half a channel, as in the live engine
            print("skip", fr["productid"], "no match within a quarter bandwidth", round(dl, 4))
            continue
        dest = RAW / f"{best['obs_id']}D{det}.fits"
        fetch(best["url"], g["center_ra"], g["center_dec"], dest)
        before = load_l2(ROOT / "data/raw/swan" / f"{fr['productid']}.fits")
        after = load_l2(dest)
        # recompute wavelength at the target from the downloaded cutout (authoritative)
        tx, ty = (float(v) for v in after.wcs.world_to_pixel_values(g["center_ra"], g["center_dec"]))
        lam_after, bw_after = after.wavelength_at(tx, ty)
        bx, by = (float(v) for v in before.wcs.world_to_pixel_values(g["center_ra"], g["center_dec"]))
        lam_before, bw_before = before.wavelength_at(bx, by)
        a0, v0, s0 = prep(before, gw, n)
        a1, v1, s1 = prep(after, gw, n)
        lo = -1.5 * float(np.median([s0, s1]))
        hi = float(np.nanpercentile(np.array([a0, a1]), 99.85))
        pid = f"{fr['productid']}__{best['obs_id']}D{det}"
        d = OUT / pid
        d.mkdir(exist_ok=True)
        for name, arr in (("before", a0), ("after", a1)):
            rgba = MAGMA(stretch(np.nan_to_num(arr, nan=lo), lo, hi))
            rgba[~np.isfinite(arr)] = [0.02, 0.02, 0.05, 1]
            to_png(rgba, d / f"{name}.png")
        # ---- change map on a COMMON valid-pixel mask, empirically calibrated ----
        common = np.isfinite(a0) & np.isfinite(a1) & np.isfinite(v0) & np.isfinite(v1)
        D = np.where(common, a1 - a0, np.nan)
        Znom = D / np.sqrt(v0 + v1)  # nominal: ignores resampling covariance
        mx, my = fr["measured"]["x"], fr["measured"]["y"]
        yy, xx = np.indices((n, n))
        far = ((xx - mx) ** 2 + (yy - my) ** 2 > 30 ** 2) & common
        zf = Znom[far]
        med = np.nanmedian(zf)
        scale = float(1.4826 * np.nanmedian(np.abs(zf - med)))  # robust scatter of the nominal Z in the field
        Z = (Znom - med) / scale  # calibrated so the comet-free field has unit robust scatter
        zc = 8.0
        zr = DIV(np.clip(0.5 + np.nan_to_num(Z) / (2 * zc), 0, 1))
        zr[~common] = [0.5, 0.5, 0.5, 1]
        to_png(zr, d / "z.png")
        frac5 = float(np.mean(np.abs(Z[far]) > 5))
        # ---- comet photometry on NATIVE pixels with empirical (control-aperture) errors ----
        def native_ap(im, ra, dec, r=3.0):
            x, y = (float(v) for v in im.wcs.world_to_pixel_values(ra, dec))
            hard = 0
            for nm, (m, _) in im.flag_defs.items():
                if nm in REJECT_FLAG_NAMES and nm != "OUTLIER":
                    hard |= m
            ok = ((im.flags & hard) == 0) & np.isfinite(im.image)
            jj, ii = np.indices(im.image.shape)
            def ap(cx, cy):
                inn = (ii - cx) ** 2 + (jj - cy) ** 2 <= r * r
                ann = ((ii - cx) ** 2 + (jj - cy) ** 2 >= 8 ** 2) & ((ii - cx) ** 2 + (jj - cy) ** 2 <= 12 ** 2) & ok
                bg = np.median(im.image[ann]) if ann.any() else np.nan
                nbad = int((inn & ~ok).sum())
                return float(np.sum(np.where(inn & ok, im.image - bg, 0))), nbad, int(inn.sum())
            f, nbad, ntot = ap(x, y)
            ctrl = []
            rng = np.random.default_rng(0)
            H, Wd = im.image.shape
            while len(ctrl) < 48:
                cx, cy = rng.uniform(15, Wd - 15), rng.uniform(15, H - 15)
                if np.hypot(cx - x, cy - y) < 40:  # stay clear of the comet's coma
                    continue
                cf, cb, _ = ap(cx, cy)
                if cb == 0:
                    ctrl.append(cf)
            ctrl = np.array(ctrl)
            emp = float(1.4826 * np.median(np.abs(ctrl - np.median(ctrl))))  # robust: control apertures may hit stars
            return f, emp, nbad, ntot
        cra, cdec = fr["measured"]["ra"], fr["measured"]["dec"]
        f0, e0, b0, nt = native_ap(before, cra, cdec)
        f1, e1, b1, _ = native_ap(after, cra, cdec)
        zap = (f1 - f0) / float(np.hypot(e0, e1))
        pairs_out.append(
            dict(
                id=pid,
                detector=det,
                before=dict(productid=fr["productid"], obsid=fr["obsid"], date_avg=fr["date_avg"], wavelength_um=round(lam_before, 4),
                            bandwidth_um=round(bw_before, 4), png=f"/data/timetravel/{pid}/before.png", source_fits=fr["source_fits"]),
                after=dict(productid=f"{best['obs_id']}D{det}", obsid=best["obs_id"], date_avg=after.header["DATE-AVG"],
                           wavelength_um=round(lam_after, 4), bandwidth_um=round(bw_after, 4), png=f"/data/timetravel/{pid}/after.png",
                           source_fits=best["url"], cutout_url=f"{best['url']}?center={g['center_ra']:.6f},{g['center_dec']:.6f}d&size={SIZE}",
                           l2dqa=str(after.header.get("L2DQAFLG", ""))),
                delta_wavelength_um=round(lam_after - lam_before, 4),
                delta_over_bandwidth=round(abs(lam_after - lam_before) / bw_before, 2),
                days_apart=round(float(after.header["MJD-AVG"]) - fr["mjd_avg"], 2),
                z_png=f"/data/timetravel/{pid}/z.png",
                z_scale=zc,
                z_calibration=dict(nominal_field_scatter=round(scale, 2), note="Nominal Z (VARIANCE planes, resampled) divided by its robust scatter in the comet-free field; common valid-pixel mask."),
                comet_aperture=dict(x=mx, y=my, r_px=3, method="native pixels, background annulus 8-12 px, empirical error from 48 blank control apertures per frame",
                                    flux_before=round(f0, 1), flux_after=round(f1, 1), err_before=round(e0, 2), err_after=round(e1, 2),
                                    rejected_px_before=b0, rejected_px_after=b1, aperture_px=nt, z=round(zap, 1)),
                field_frac_absz_gt5=round(frac5, 4),
                grid=g,
                seq=det_seq,
            )
        )
        print(pid, "dλ=%.4f" % (lam_after - lam_before), "bw=%.4f" % bw_before, "native flux %.1f±%.2f -> %.1f±%.2f  S/N_change=%.0f  rejected px %d/%d of %d  nominal-Z field scatter %.2f  field|Zcal|>5: %.4f" % (f0, e0, f1, e1, zap, b0, b1, nt, scale, frac5))

(OUT / "pairs.json").write_text(json.dumps(dict(
    position=dict(ra=seqs["2025W44_1A_0045_D1"]["grid"]["center_ra"], dec=seqs["2025W44_1A_0045_D1"]["grid"]["center_dec"]),
    method="Same detector; later frame chosen so its WCS-WAVE wavelength at the target is closest to the earlier frame's (accepted only within half a channel bandwidth). Both reprojected onto one north-up 6.15\"/px grid. D = after - before; Z = D / sqrt(VAR_before + VAR_after). Pixels with hardware/processing flags are masked.",
    pairs=pairs_out), indent=1))
print("wrote", len(pairs_out), "pairs")
