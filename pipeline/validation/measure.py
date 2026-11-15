"""Native-pixel-grid measurements on SPHEREx Level-2 cutouts.

Everything here works on a frame's OWN pixel grid with its OWN WCS: no resampling.
  * psf_fit     weighted elliptical-Gaussian + constant fit (weights from VARIANCE; flagged pixels
                excluded); formal errors scaled by sqrt(reduced chi^2) when > 1
  * aperture    circular aperture sum minus local-annulus median background, nominal error from
                VARIANCE, optional extra pixel mask (used for the cross-epoch common mask)
  * control     blank-sky control apertures -> empirical aperture noise
  * field stars Gaia DR3 stars propagated to DATE-AVG -> WCS zero-point and empirical centroid
                precision (scatter of residuals)
"""
from __future__ import annotations

import numpy as np
from astropy.stats import sigma_clipped_stats
from astropy.time import Time
from scipy.optimize import least_squares

from spherex_io import REJECT_FLAG_NAMES

from .common import PIX_ARCSEC, fcol, offsets_arcsec, propagate

SAT_FLAG_NAMES = {"OVERFLOW", "NONLINEAR"}


def flag_bits(im, names) -> int:
    b = 0
    for n, (m, _) in im.flag_defs.items():
        if n in names:
            b |= m
    return b


def bad_mask(im, keep=()):
    """Reject-flag mask. `keep` lists REJECT names NOT to reject (e.g. OUTLIER for a moving source)."""
    bits = flag_bits(im, REJECT_FLAG_NAMES - set(keep))
    return ((im.flags & bits) != 0) | ~np.isfinite(im.image) | ~np.isfinite(im.variance) | (im.variance <= 0)


def disk(shape, x, y, r):
    yy, xx = np.indices(shape)
    return (xx - x) ** 2 + (yy - y) ** 2 <= r * r


def flags_in(im, x, y, r):
    sel = disk(im.flags.shape, x, y, r)
    present = np.bitwise_or.reduce(im.flags[sel]) if sel.any() else 0
    return sorted(n for n, (m, _) in im.flag_defs.items() if present & m)


def in_bounds(im, x, y, margin):
    H, W = im.image.shape
    return margin <= x <= W - 1 - margin and margin <= y <= H - 1 - margin


# ------------------------------------------------------------------ PSF / centroid

def psf_fit(im, x0, y0, bad, half=4, max_shift=3.0, smax=4.0):
    """Weighted elliptical Gaussian (axis-aligned) + constant on a (2*half+1)^2 stamp.
    Returns dict or None."""
    xi, yi = int(round(x0)), int(round(y0))
    H, W = im.image.shape
    if xi - half < 0 or yi - half < 0 or xi + half >= W or yi + half >= H:
        return None
    sl = (slice(yi - half, yi + half + 1), slice(xi - half, xi + half + 1))
    z = im.image[sl]
    v = im.variance[sl]
    ok = ~bad[sl]
    ys, xs = np.mgrid[sl]
    n_bad_core = int((~ok & ((xs - x0) ** 2 + (ys - y0) ** 2 <= 2.0 ** 2)).sum())
    xs, ys, z, v = xs[ok], ys[ok], z[ok], v[ok]
    if len(z) < 20:
        return None
    sig = np.sqrt(v)
    b0 = float(np.median(np.sort(z)[: max(5, len(z) // 4)]))
    amp0 = max(float(z.max() - b0), 1e-6)

    def model(p):
        a, xc, yc, sx, sy, b = p
        return a * np.exp(-0.5 * (((xs - xc) / sx) ** 2 + ((ys - yc) / sy) ** 2)) + b

    p0 = [amp0, x0, y0, 1.0, 1.0, b0]
    lb = [0, x0 - max_shift, y0 - max_shift, 0.3, 0.3, -np.inf]
    ub = [np.inf, x0 + max_shift, y0 + max_shift, smax, smax, np.inf]
    try:
        res = least_squares(lambda p: (model(p) - z) / sig, p0, bounds=(lb, ub), x_scale="jac")
    except Exception:  # noqa: BLE001
        return None
    dof = max(len(z) - 6, 1)
    chi2r = float((res.fun ** 2).sum() / dof)
    try:
        cov = np.linalg.inv(res.jac.T @ res.jac) * max(1.0, chi2r)
        ex, ey = float(np.sqrt(cov[1, 1])), float(np.sqrt(cov[2, 2]))
    except np.linalg.LinAlgError:
        return None
    a, xc, yc, sx, sy, b = (float(t) for t in res.x)
    at_bound = abs(xc - x0) > max_shift - 0.05 or abs(yc - y0) > max_shift - 0.05 or sx > smax - 0.05 or sy > smax - 0.05 or sx < 0.31 or sy < 0.31
    return dict(x=xc, y=yc, x_err=ex, y_err=ey, amp=a, sigma_x=sx, sigma_y=sy, bkg=b, chi2r=chi2r, npix=int(len(z)),
                n_bad_core=n_bad_core, ok=bool(res.success and np.isfinite(ex) and np.isfinite(ey) and not at_bound))


# ------------------------------------------------------------------ photometry

def aperture(im, x, y, r, bad, r_in=6.0, r_out=10.0, extra_bad=None):
    """Aperture sum (MJy/sr x pix) minus annulus sigma-clipped median; nominal 1-sigma error
    from VARIANCE plus the background-estimate error. Pixels in `bad` or `extra_bad` are not used;
    the number missing inside the aperture is returned so callers can refuse incomplete apertures."""
    m = bad if extra_bad is None else (bad | extra_bad)
    shape = im.image.shape
    ap = disk(shape, x, y, r)
    ann = disk(shape, x, y, r_out) & ~disk(shape, x, y, r_in) & ~m
    if ann.sum() < 15:
        return None
    _, bkg, bstd = sigma_clipped_stats(im.image[ann], sigma=3)
    use = ap & ~m
    n_ap = int(ap.sum())
    n_use = int(use.sum())
    f = float(np.sum(im.image[use] - bkg))
    var = float(np.sum(im.variance[use])) + (n_use * bstd) ** 2 / ann.sum() * np.pi / 2
    return dict(flux=f, err=float(np.sqrt(var)), n_ap=n_ap, n_missing=n_ap - n_use, bkg=float(bkg), bkg_std=float(bstd))


def control_apertures(im, r, bad, avoid_xy, n=80, rng_seed=0, avoid_r=4.0, margin=12):
    """Blank-sky control apertures: positions at least avoid_r px from every catalogued source in
    avoid_xy, with no flagged pixels in the aperture. Returns robust scatter vs median nominal error."""
    rng = np.random.default_rng(rng_seed)
    H, W = im.image.shape
    av = np.asarray(avoid_xy, float).reshape(-1, 2) if len(avoid_xy) else np.zeros((0, 2))
    fl, er = [], []
    for _ in range(n * 30):
        if len(fl) >= n:
            break
        x, y = rng.uniform(margin, W - 1 - margin), rng.uniform(margin, H - 1 - margin)
        if len(av) and np.min(np.hypot(av[:, 0] - x, av[:, 1] - y)) < avoid_r:
            continue
        a = aperture(im, x, y, r, bad)
        if a is None or a["n_missing"] > 0:
            continue
        fl.append(a["flux"])
        er.append(a["err"])
    if len(fl) < 15:
        return None
    fl = np.array(fl)
    mad = 1.4826 * np.median(np.abs(fl - np.median(fl)))
    return dict(n=len(fl), robust_std=float(mad), median=float(np.median(fl)), median_nominal_err=float(np.median(er)),
                empirical_over_nominal=float(mad / np.median(er)))


# ------------------------------------------------------------------ Gaia field stars

def gaia_pixels(im, gaia, t: Time):
    ra, dec = propagate(np.array(gaia["ra"], float), np.array(gaia["dec"], float), fcol(gaia, "pmra"),
                        fcol(gaia, "pmdec"), fcol(gaia, "parallax"), 2016.0, t)
    x, y = im.wcs.world_to_pixel_values(ra, dec)
    return np.asarray(ra), np.asarray(dec), np.asarray(x), np.asarray(y)


def isolated(gaia, x, y, idx, rad_px=2.5, dmag=2.5):
    g = np.array(gaia["phot_g_mean_mag"], float)
    d = np.hypot(x - x[idx], y - y[idx])
    close = (d < rad_px) & (np.arange(len(x)) != idx) & (g < g[idx] + dmag)
    return not close.any()


def field_star_astrometry(im, gaia, t: Time, bad, exclude_xy, gmax=16.5, min_snr=30.0, exclude_r=6.0, max_stars=60):
    """Fit Gaia stars on the native grid; residual = (frame-WCS position of the fit) - (Gaia at DATE-AVG).
    Returns zero point (median E,N residual), robust scatter, and per-star residuals."""
    ra, dec, x, y = gaia_pixels(im, gaia, t)
    g = np.array(gaia["phot_g_mean_mag"], float)
    has_pm = np.isfinite(fcol(gaia, "pmra", np.nan))
    order = np.argsort(g)
    rows = []
    for i in order:
        if g[i] > gmax or not has_pm[i]:
            continue
        if not in_bounds(im, x[i], y[i], 6):
            continue
        if any(np.hypot(x[i] - ex, y[i] - ey) < exclude_r for ex, ey in exclude_xy):
            continue
        if not isolated(gaia, x, y, i):
            continue
        if flags_in(im, x[i], y[i], 2.0) and (bad[disk(bad.shape, x[i], y[i], 2.0)]).any():
            continue
        f = psf_fit(im, x[i], y[i], bad, max_shift=1.5)
        if not f or not f["ok"] or f["n_bad_core"] > 0:
            continue
        snr = f["amp"] / np.sqrt(np.median(im.variance[int(round(f["y"])), int(round(f["x"]))]) + 1e-30)
        if snr < min_snr:
            continue
        mra, mdec = (float(v) for v in im.wcs.pixel_to_world_values(f["x"], f["y"]))
        dE, dN = offsets_arcsec(mra, mdec, ra[i], dec[i])
        rows.append(dict(source_id=int(gaia["source_id"][i]), g=float(g[i]), x=f["x"], y=f["y"], snr_peak=float(snr), sigma_x=f["sigma_x"], sigma_y=f["sigma_y"],
                         dE=float(dE), dN=float(dN), err=float(np.hypot(f["x_err"], f["y_err"]) / np.sqrt(2) * PIX_ARCSEC)))
        if len(rows) >= max_stars:
            break
    if len(rows) < 5:
        return dict(n=len(rows), stars=rows, ok=False)
    dE = np.array([r["dE"] for r in rows])
    dN = np.array([r["dN"] for r in rows])
    zE, zN = float(np.median(dE)), float(np.median(dN))
    sE = float(1.4826 * np.median(np.abs(dE - zE)))
    sN = float(1.4826 * np.median(np.abs(dN - zN)))
    hi = [r for r in rows if r["snr_peak"] > 100]
    if len(hi) >= 5:
        hE = np.array([r["dE"] for r in hi]); hN = np.array([r["dN"] for r in hi])
        floor = float(1.4826 * np.median(np.abs(np.r_[hE - np.median(hE), hN - np.median(hN)])))
    else:
        floor = float(np.hypot(sE, sN) / np.sqrt(2))
    return dict(n=len(rows), ok=True, zero_point_E=zE, zero_point_N=zN, scatter_E=sE, scatter_N=sN,
                zero_point_err=float(np.hypot(sE, sN) / np.sqrt(2) / np.sqrt(len(rows)) * 1.25),
                bright_star_floor_arcsec=floor, n_bright=len(hi),
                psf_sigma_median=float(np.median([np.sqrt(r["sigma_x"] * r["sigma_y"]) for r in rows])),
                psf_sigma_mad=float(1.4826 * np.median(np.abs(np.array([np.sqrt(r["sigma_x"] * r["sigma_y"]) for r in rows])
                                                             - np.median([np.sqrt(r["sigma_x"] * r["sigma_y"]) for r in rows])))), median_formal_err=float(np.median([r["err"] for r in rows])),
                stars=rows)
