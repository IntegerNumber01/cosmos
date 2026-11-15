"""Forced PSF photometry with the pipeline's effective PSF (EPSF extension) on the native grid.

The EPSF extension holds a grid of zones (BINX, BINY, XCENTER, YCENTER in detector pixels) each with a
33x33 PSF oversampled OVSMPX x OVSMPY. The cutout's alternate WCS 'A' maps cutout pixels to detector
pixels. Orientation (possible x-flip for MWIR) is chosen empirically on field stars (see choose_flip).
"""
from __future__ import annotations

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from scipy.ndimage import map_coordinates


class EPSF:
    def __init__(self, path):
        with fits.open(path) as h:
            t = h["EPSF"].data
            eh = h["EPSF"].header
            ih = h["IMAGE"].header
            self.ov = int(eh.get("OVSMPX", 5))
            self.xc = np.array(t["XCENTER"], float)
            self.yc = np.array(t["YCENTER"], float)
            self.psf = np.array(t["EPSF"], float)  # (n, 33, 33)
            self.wa = WCS(ih, key="A")
            self.wa.sip = None
            self.fwhm_arcsec = float(ih.get("PSF_FWHM", np.nan))

    def zone(self, x, y):
        dx, dy = (float(v) for v in self.wa.pixel_to_world_values(x, y))
        k = int(np.argmin((self.xc - dx) ** 2 + (self.yc - dy) ** 2))
        return self.psf[k]

    def stamp(self, x, y, half, flip=False):
        """Native-grid PSF model (sum normalised to 1 over the stamp) for a source at cutout (x, y),
        on the (2*half+1)^2 pixel grid centred on round(x), round(y)."""
        p = self.zone(x, y)
        if flip:
            p = p[:, ::-1]
        c = (p.shape[0] - 1) / 2
        xi, yi = int(round(x)), int(round(y))
        ys, xs = np.mgrid[yi - half: yi + half + 1, xi - half: xi + half + 1]
        u = c + (xs - x) * self.ov
        v = c + (ys - y) * self.ov
        m = map_coordinates(p, [v.ravel(), u.ravel()], order=1, mode="constant", cval=0.0).reshape(xs.shape)
        s = m.sum()
        return (m / s if s > 0 else m), xs, ys


def model_on(psf: EPSF, x, y, xs, ys, norm_half=6):
    """EPSF of a unit-flux source at (x, y) evaluated on pixel grid (xs, ys)."""
    p = psf.zone(x, y)
    c = (p.shape[0] - 1) / 2
    m = map_coordinates(p, [(c + (ys - y) * psf.ov).ravel(), (c + (xs - x) * psf.ov).ravel()], order=1, mode="constant", cval=0.0)
    norm, _, _ = psf.stamp(x, y, norm_half)  # normalised stamp; its raw sum defines the unit
    yy, xx = np.mgrid[-norm_half:norm_half + 1, -norm_half:norm_half + 1]
    raw = map_coordinates(p, [(c + (yy + int(round(y)) - y) * psf.ov).ravel(), (c + (xx + int(round(x)) - x) * psf.ov).ravel()],
                          order=1, mode="constant", cval=0.0).sum()
    return (m / raw).reshape(np.shape(xs)) if raw > 0 else m.reshape(np.shape(xs))


def free_fit(im, bad, psf: EPSF, x0, y0, fixed=(), half=5, max_shift=2.0):
    """Non-linear fit of a free-position target (flux, x, y) plus fixed-position neighbours (fluxes) and a
    constant, weighted by 1/VARIANCE on the native grid. Errors from the Jacobian scaled by sqrt(chi2r)."""
    from scipy.optimize import least_squares
    xi, yi = int(round(x0)), int(round(y0))
    H, W = im.image.shape
    if xi - half < 0 or yi - half < 0 or xi + half >= W or yi + half >= H:
        return None
    ys, xs = np.mgrid[yi - half: yi + half + 1, xi - half: xi + half + 1]
    z, v, ok = im.image[ys, xs], im.variance[ys, xs], ~bad[ys, xs]
    ok &= np.isfinite(z) & np.isfinite(v) & (v > 0)
    xs, ys, z, sig = xs[ok], ys[ok], z[ok], np.sqrt(v[ok])
    nb_cols = [model_on(psf, fx, fy, xs, ys) for fx, fy in fixed]

    def resid(p):
        f, x, y = p[:3]
        m = f * model_on(psf, x, y, xs, ys) + p[-1]
        for k, col in enumerate(nb_cols):
            m = m + p[3 + k] * col
        return (m - z) / sig

    f0 = max(float(np.nanmax(z) - np.nanmedian(z)), 1e-3)
    p0 = [f0 * 3, x0, y0] + [f0] * len(fixed) + [float(np.median(z))]
    lb = [-np.inf, x0 - max_shift, y0 - max_shift] + [-np.inf] * len(fixed) + [-np.inf]
    ub = [np.inf, x0 + max_shift, y0 + max_shift] + [np.inf] * len(fixed) + [np.inf]
    try:
        r = least_squares(resid, p0, bounds=(lb, ub), x_scale="jac")
        dof = max(len(z) - len(p0), 1)
        chi2r = float((r.fun ** 2).sum() / dof)
        cov = np.linalg.inv(r.jac.T @ r.jac) * max(1.0, chi2r)
    except Exception:  # noqa: BLE001
        return None
    e = np.sqrt(np.diag(cov))
    at_bound = abs(r.x[1] - x0) > max_shift - 0.02 or abs(r.x[2] - y0) > max_shift - 0.02
    return dict(flux=float(r.x[0]), flux_err=float(e[0]), x=float(r.x[1]), y=float(r.x[2]), x_err=float(e[1]), y_err=float(e[2]),
                neighbour_flux=[float(t) for t in r.x[3:3 + len(fixed)]], chi2r=chi2r, ok=bool(r.success and not at_bound and r.x[0] > 0))


def forced_fit(im, bad, psf: EPSF, positions, half=5, flip=False, fit_centre=None):
    """Linear least squares: data = sum_k f_k * PSF(pos_k) + b, weights 1/VARIANCE, flagged pixels
    excluded. positions[0] defines the stamp centre. Returns fluxes, covariance-based errors, chi2r."""
    x0, y0 = positions[0]
    xi, yi = int(round(x0)), int(round(y0))
    H, W = im.image.shape
    if xi - half < 0 or yi - half < 0 or xi + half >= W or yi + half >= H:
        return None
    sl = (slice(yi - half, yi + half + 1), slice(xi - half, xi + half + 1))
    cols = []
    for (x, y) in positions:
        m, xs, ys = psf.stamp(x, y, half, flip)
        # re-grid onto the common stamp (positions may round differently)
        full = np.zeros((2 * half + 1, 2 * half + 1))
        ox, oy = int(round(x)) - xi, int(round(y)) - yi
        for j in range(2 * half + 1):
            for i in range(2 * half + 1):
                jj, ii = j - oy, i - ox
                if 0 <= jj <= 2 * half and 0 <= ii <= 2 * half:
                    full[j, i] = m[jj, ii]
        cols.append(full.ravel())
    cols.append(np.ones((2 * half + 1) ** 2))
    A = np.array(cols).T
    z = im.image[sl].ravel()
    var = im.variance[sl].ravel()
    ok = ~bad[sl].ravel() & np.isfinite(z) & np.isfinite(var) & (var > 0)
    if ok.sum() < A.shape[1] + 10:
        return None
    w = 1 / np.sqrt(var[ok])
    Aw = A[ok] * w[:, None]
    zw = z[ok] * w
    coef, *_ = np.linalg.lstsq(Aw, zw, rcond=None)
    res = zw - Aw @ coef
    dof = max(ok.sum() - A.shape[1], 1)
    chi2r = float((res ** 2).sum() / dof)
    cov = np.linalg.inv(Aw.T @ Aw)
    err = np.sqrt(np.diag(cov) * max(1.0, chi2r))
    corr01 = float(cov[0, 1] / np.sqrt(cov[0, 0] * cov[1, 1])) if len(positions) > 1 else None
    return dict(flux=[float(c) for c in coef[:-1]], err=[float(e) for e in err[:-1]], bkg=float(coef[-1]), chi2r=chi2r,
                n_bad_in_stamp=int((~ok).sum()), corr_target_neighbour=corr01)


def choose_flip(im, bad, psf, star_xy, half=4):
    """Compare chi^2 of single-source EPSF fits to bright isolated stars with and without x-flip."""
    tot = {False: 0.0, True: 0.0}
    n = 0
    for (x, y) in star_xy:
        # refine centre by brute-force sub-pixel grid search for each orientation
        for flip in (False, True):
            best = np.inf
            for dx in np.linspace(-0.6, 0.6, 13):
                for dy in np.linspace(-0.6, 0.6, 13):
                    r = forced_fit(im, bad, psf, [(x + dx, y + dy)], half, flip)
                    if r and r["chi2r"] < best:
                        best = r["chi2r"]
            tot[flip] += best if np.isfinite(best) else 0
        n += 1
    return dict(n_stars=n, chi2r_sum_noflip=tot[False], chi2r_sum_flip=tot[True], flip=bool(tot[True] < tot[False]))
