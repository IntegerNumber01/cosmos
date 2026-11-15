"""Gate test: is comet C/2025 R2 (SWAN) detected near its MOST-predicted position, and is
its MEASURED motion consistent with the prediction?

For every MOST-matched cutout:
  * measure the coma photocentre independently of the prediction (peak search in a
    generous window, then flux-weighted centroid on the unsmoothed image),
  * convert to RA/Dec with the frame's own WCS,
  * aperture S/N from the VARIANCE plane, flags in the aperture from the FLAGS header,
  * wavelength at the comet from WCS-WAVE.
Per sequence (same OBSID block + detector, ~2 min cadence):
  * fit measured RA/Dec vs time -> measured rate and position angle; compare to MOST,
  * measure bright field stars in first & last exposure -> they must be stationary,
  * "vacancy" test: after the comet moves away, its earlier position must be empty.
Output: data/work/swan_measurements.json (+ printed summary).
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from astropy.stats import sigma_clipped_stats
from scipy import ndimage

from spherex_io import load_l2

ROOT = Path(__file__).resolve().parents[1]
rows = json.loads((ROOT / "data/raw/swan/most_matches.json").read_text())
PIX_ARCSEC = 6.15
SEARCH_R = 8.0  # px window around prediction for the peak search (~49")
CEN_R = 2.5
AP_R = 3.0


# A moving comet is, by construction, an "outlier" against the static sky, and the
# pipeline flags its core OUTLIER in nearly every frame. Rejecting OUTLIER would delete
# the signal under test, so for the comet we reject only the hardware/processing flags.
COMET_KEEP = {"OUTLIER"}


def comet_mask(im):
    bits = 0
    from spherex_io import REJECT_FLAG_NAMES
    for name, (m, _) in im.flag_defs.items():
        if name in REJECT_FLAG_NAMES and name not in COMET_KEEP:
            bits |= m
    return ((im.flags & bits) != 0) | ~np.isfinite(im.image) | ~np.isfinite(im.variance)


def bg_sub(im, mask=None):
    mask = im.reject_mask if mask is None else mask
    _, med, std = sigma_clipped_stats(im.image[~mask], sigma=3)
    d = im.image - med
    d[mask] = np.nan
    return d, std


def gauss_fit(d, x0, y0, half=5):
    """2D elliptical Gaussian + planar background on a (2*half+1)^2 stamp; NaNs ignored."""
    from scipy.optimize import least_squares
    xi, yi = int(round(x0)), int(round(y0))
    ys, xs = np.mgrid[yi - half: yi + half + 1, xi - half: xi + half + 1]
    ok = (ys >= 0) & (xs >= 0) & (ys < d.shape[0]) & (xs < d.shape[1])
    ys, xs = ys[ok], xs[ok]
    z = d[ys, xs]
    g = np.isfinite(z)
    ys, xs, z = ys[g], xs[g], z[g]
    amp0 = max(np.nanmax(z) - np.nanmedian(z), 1e-3)

    def model(p):
        a, xc, yc, sx, sy, b0, bx, by = p
        return a * np.exp(-0.5 * (((xs - xc) / sx) ** 2 + ((ys - yc) / sy) ** 2)) + b0 + bx * (xs - xi) + by * (ys - yi)

    p0 = [amp0, x0, y0, 1.5, 1.5, np.nanmedian(z), 0, 0]
    lb = [0, x0 - 4, y0 - 4, 0.5, 0.5, -np.inf, -np.inf, -np.inf]
    ub = [np.inf, x0 + 4, y0 + 4, 6, 6, np.inf, np.inf, np.inf]
    res = least_squares(lambda p: model(p) - z, p0, bounds=(lb, ub))
    # 1-sigma errors from the Jacobian, scaled by residual variance
    J = res.jac
    dof = max(len(z) - len(p0), 1)
    s2 = (res.fun ** 2).sum() / dof
    try:
        cov = np.linalg.inv(J.T @ J) * s2
        ex, ey = float(np.sqrt(cov[1, 1])), float(np.sqrt(cov[2, 2]))
    except np.linalg.LinAlgError:
        ex = ey = float("nan")
    return float(res.x[1]), float(res.x[2]), ex, ey, float(res.x[3]), float(res.x[4]), bool(res.success)


def centroid(d, x0, y0, r=CEN_R, iters=5):
    yy, xx = np.indices(d.shape)
    x, y = x0, y0
    for _ in range(iters):
        sel = ((xx - x) ** 2 + (yy - y) ** 2 <= r * r) & np.isfinite(d)
        w = np.clip(d[sel], 0, None)
        if w.sum() <= 0:
            break
        x, y = (xx[sel] * w).sum() / w.sum(), (yy[sel] * w).sum() / w.sum()
    return float(x), float(y)


def aperture(d, var, x, y, r=AP_R):
    yy, xx = np.indices(d.shape)
    sel = ((xx - x) ** 2 + (yy - y) ** 2 <= r * r) & np.isfinite(d) & np.isfinite(var)
    f = float(np.nansum(d[sel]))
    e = float(np.sqrt(np.nansum(var[sel])))
    return f, e, int(sel.sum())


def find_peak(d, x0, y0, r):
    sm = ndimage.gaussian_filter(np.nan_to_num(d), 1.5)
    yy, xx = np.indices(d.shape)
    sel = (xx - x0) ** 2 + (yy - y0) ** 2 <= r * r
    sm2 = np.where(sel, sm, -np.inf)
    j, i = np.unravel_index(np.argmax(sm2), sm2.shape)
    return float(i), float(j)


def field_stars(d, std, exclude_xy, n=12, min_sep=10):
    sm = ndimage.gaussian_filter(np.nan_to_num(d), 1.0)
    mx = ndimage.maximum_filter(sm, size=7)
    pk = (sm == mx) & (sm > 15 * std)
    ys, xs = np.nonzero(pk)
    order = np.argsort(-sm[ys, xs])
    out = []
    H, W = d.shape
    for k in order:
        x, y = xs[k], ys[k]
        if x < 8 or y < 8 or x > W - 9 or y > H - 9:
            continue
        if any(np.hypot(x - ex, y - ey) < 25 for ex, ey in exclude_xy):  # avoid coma/tail
            continue
        if any(np.hypot(x - ox, y - oy) < min_sep for ox, oy in out):
            continue
        out.append((float(x), float(y)))
        if len(out) >= n:
            break
    return out


def sky_sep_arcsec(ra1, de1, ra2, de2):
    return float(np.hypot((ra1 - ra2) * np.cos(np.radians(de2)), de1 - de2) * 3600)


results = []
images = {}
for r in rows:
    im = load_l2(ROOT / r["local_file"])
    images[r["productid"]] = im
    d, std = bg_sub(im, comet_mask(im))
    xp, yp = (float(v) for v in im.wcs.world_to_pixel_values(r["ra_pred"], r["dec_pred"]))
    xk, yk = find_peak(d, xp, yp, SEARCH_R)
    xm, ym, exm, eym, sxm, sym, okfit = gauss_fit(d, xk, yk)
    ra_m, de_m = (float(v) for v in im.wcs.pixel_to_world_values(xm, ym))
    f, e, npx = aperture(d, im.variance, xm, ym)
    wl, bw = im.wavelength_at(xm, ym)
    results.append(
        dict(
            productid=r["productid"], sequence=r["sequence"], detector=int(im.header["DETECTOR"]),
            date_avg=im.header["DATE-AVG"], mjd_avg=float(im.header["MJD-AVG"]),
            mjd_start_most=r["mjd_start"],
            pred=dict(ra=r["ra_pred"], dec=r["dec_pred"], x=xp, y=yp, vmag=r["vmag_pred"]),
            meas=dict(ra=ra_m, dec=de_m, x=xm, y=ym, x_err=exm, y_err=eym, sigma_x=sxm, sigma_y=sym, fit_ok=okfit,
                      peak_search_start=[xk, yk], flux_mjysr_sum=f, flux_err=e, snr=f / e if e > 0 else None,
                      npix=npx),
            offset_arcsec=sky_sep_arcsec(ra_m, de_m, r["ra_pred"], r["dec_pred"]),
            offset_pix=float(np.hypot(xm - xp, ym - yp)),
            wavelength_um=wl, bandwidth_um=bw,
            flags_in_aperture=im.flags_at(xm, ym, AP_R),
            bg_std=float(std),
            source_url=r["uri"], cutout_url=r["cutout_url"],
        )
    )

by_seq = defaultdict(list)
for res in results:
    by_seq[res["sequence"]].append(res)

seq_summary = []
for key, rs in sorted(by_seq.items()):
    rs.sort(key=lambda z: z["mjd_avg"])
    # Time stamps: MOST predicted at its own epoch (mjd_start_most); we measured at the
    # frame mid-exposure (DATE-AVG). Fit measured positions against DATE-AVG.
    t = np.array([z["mjd_avg"] for z in rs]) * 1440.0  # minutes
    t0 = t.mean()
    dec0 = np.mean([z["meas"]["dec"] for z in rs])
    cosd = np.cos(np.radians(dec0))
    ra_m = np.array([z["meas"]["ra"] for z in rs]) * cosd * 3600
    de_m = np.array([z["meas"]["dec"] for z in rs]) * 3600
    tp = np.array([z["mjd_start_most"] for z in rs]) * 1440.0
    ra_p = np.array([z["pred"]["ra"] for z in rs]) * cosd * 3600
    de_p = np.array([z["pred"]["dec"] for z in rs]) * 3600
    entry = dict(sequence=key, n=len(rs), detector=rs[0]["detector"],
                 date_first=rs[0]["date_avg"], date_last=rs[-1]["date_avg"],
                 median_offset_arcsec=float(np.median([z["offset_arcsec"] for z in rs])),
                 min_snr=float(min(z["meas"]["snr"] for z in rs)),
                 wavelengths_um=[round(z["wavelength_um"], 4) for z in rs])
    if len(rs) >= 2:
        vra_m, _ = np.polyfit(t - t0, ra_m, 1)
        vde_m, _ = np.polyfit(t - t0, de_m, 1)
        vra_p, _ = np.polyfit(tp - tp.mean(), ra_p, 1)
        vde_p, _ = np.polyfit(tp - tp.mean(), de_p, 1)
        # MOST positions are tabulated at exposure START; evaluate the predicted track at
        # each frame's mid-exposure time (DATE-AVG) for a like-for-like comparison.
        cra = np.polyfit(tp - tp.mean(), ra_p, 1)
        cde = np.polyfit(tp - tp.mean(), de_p, 1)
        uvec = np.array([vra_p, vde_p]) / np.hypot(vra_p, vde_p)  # unit vector along predicted track (E, N)
        along, cross = [], []
        for z, tm in zip(rs, t):
            pra = np.polyval(cra, tm - tp.mean()) / cosd / 3600
            pde = np.polyval(cde, tm - tp.mean()) / 3600
            z["pred_mid"] = dict(ra=float(pra), dec=float(pde))
            dE = (z["meas"]["ra"] - pra) * cosd * 3600
            dN = (z["meas"]["dec"] - pde) * 3600
            z["offset_mid_arcsec"] = float(np.hypot(dE, dN))
            z["offset_mid_along_cross_arcsec"] = [float(dE * uvec[0] + dN * uvec[1]), float(-dE * uvec[1] + dN * uvec[0])]
            along.append(z["offset_mid_along_cross_arcsec"][0]); cross.append(z["offset_mid_along_cross_arcsec"][1])
        entry["median_offset_mid_arcsec"] = float(np.median([z["offset_mid_arcsec"] for z in rs]))
        entry["median_offset_along_cross_arcsec"] = [float(np.median(along)), float(np.median(cross))]
        entry.update(
            meas_rate_arcsec_per_min=float(np.hypot(vra_m, vde_m)),
            meas_pa_deg=float(np.degrees(np.arctan2(vra_m, vde_m)) % 360),
            pred_rate_arcsec_per_min=float(np.hypot(vra_p, vde_p)),
            pred_pa_deg=float(np.degrees(np.arctan2(vra_p, vde_p)) % 360),
            meas_total_motion_arcsec=sky_sep_arcsec(rs[-1]["meas"]["ra"], rs[-1]["meas"]["dec"], rs[0]["meas"]["ra"], rs[0]["meas"]["dec"]),
            span_minutes=float(t[-1] - t[0]),
        )
        # stationary star control: same stars, first vs last exposure (sky coords via each WCS)
        a, b = images[rs[0]["productid"]], images[rs[-1]["productid"]]
        da, sa = bg_sub(a)
        db, _ = bg_sub(b)
        excl = [(z["meas"]["x"], z["meas"]["y"]) for z in rs]
        stars = field_stars(da, sa, excl)
        shifts = []
        for (sx, sy) in stars:
            xa, ya = centroid(da, sx, sy)
            ra_a, de_a = a.wcs.pixel_to_world_values(xa, ya)
            xb0, yb0 = b.wcs.world_to_pixel_values(ra_a, de_a)
            xb, yb = centroid(db, float(xb0), float(yb0))
            ra_b, de_b = b.wcs.pixel_to_world_values(xb, yb)
            shifts.append(sky_sep_arcsec(float(ra_b), float(de_b), float(ra_a), float(de_a)))
        entry["star_control"] = dict(n_stars=len(shifts), median_shift_arcsec=float(np.median(shifts)) if shifts else None,
                                     max_shift_arcsec=float(np.max(shifts)) if shifts else None)
        # vacancy test: comet's first measured sky position, measured in the LAST frame
        first = rs[0]["meas"]
        xv, yv = (float(v) for v in b.wcs.world_to_pixel_values(first["ra"], first["dec"]))
        dca, _ = bg_sub(a, comet_mask(a))
        dcb, _ = bg_sub(b, comet_mask(b))
        f_then, e_then, _ = aperture(dca, a.variance, first["x"], first["y"])
        f_now, e_now, _ = aperture(dcb, b.variance, xv, yv)
        last = rs[-1]["meas"]
        entry["vacancy_test"] = dict(flux_at_first_pos_first_frame=f_then, flux_at_first_pos_last_frame=f_now,
                                     flux_at_last_pos_last_frame=last["flux_mjysr_sum"],
                                     ratio_vacated_over_occupied=f_now / f_then if f_then else None)
    seq_summary.append(entry)

out = ROOT / "data/work/swan_measurements.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(dict(frames=results, sequences=seq_summary), indent=2))

print(f"{'frame':22s} {'det':>3s} {'snr':>7s} {'offS':>6s} {'offM':>6s} {'along':>6s} {'cross':>6s} {'err\"':>5s} {'lam_um':>7s} flags")
for z in sorted(results, key=lambda z: (z["sequence"], z["mjd_avg"])):
    ac = z.get("offset_mid_along_cross_arcsec", [np.nan, np.nan])
    err = np.hypot(z['meas']['x_err'], z['meas']['y_err']) * PIX_ARCSEC
    print(f"{z['productid']:22s} {z['detector']:3d} {z['meas']['snr']:7.1f} {z['offset_arcsec']:6.1f} {z.get('offset_mid_arcsec', np.nan):6.1f} {ac[0]:6.1f} {ac[1]:6.1f} {err:5.2f} {z['wavelength_um']:7.4f} {','.join(z['flags_in_aperture'])}")
print()
for s_ in seq_summary:
    print(s_["sequence"], "n=", s_["n"], "rate meas/pred = %.2f / %.2f \"/min" % (s_.get("meas_rate_arcsec_per_min", np.nan), s_.get("pred_rate_arcsec_per_min", np.nan)),
          "PA meas/pred = %.1f / %.1f" % (s_.get("meas_pa_deg", np.nan), s_.get("pred_pa_deg", np.nan)),
          "offset(mid) med=%.1f\"" % s_.get("median_offset_mid_arcsec", np.nan),
          "stars med shift=%.2f\"" % s_["star_control"]["median_shift_arcsec"],
          "vacancy ratio=%.2f" % s_["vacancy_test"]["ratio_vacated_over_occupied"])
