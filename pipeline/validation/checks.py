"""Robustness checks run on cached cutouts after the main measurement."""
from __future__ import annotations

import numpy as np
from astropy.time import Time

from spherex_io import load_l2

from .common import RAW, target_position
from .epsf import EPSF, free_fit, model_on
from .measure import bad_mask


def variability_method_check(tid, cat, set_id, obsids, det):
    """Re-measure the target flux in each epoch of a matched set with the pipeline EPSF (free-position fit)
    using (a) all valid pixels and (b) all valid pixels except the brightest core pixel. If the peak pixel
    were clipped/non-linear without a flag, (b) would predict a peak value ABOVE the observed one and the
    magnitude change would shift. Reports the magnitude change from each method vs the first epoch."""
    rows = []
    for ob in obsids:
        p = RAW / tid / f"{ob}D{det}.fits"
        im = load_l2(p)
        bad = bad_mask(im)
        psf = EPSF(p)
        ra, dec = target_position(cat, Time(im.header["DATE-AVG"], scale="utc"))
        x, y = (float(v) for v in im.wcs.world_to_pixel_values(ra, dec))
        a = free_fit(im, bad, psf, x, y, half=4, max_shift=1.5)
        yy, xx = np.indices(im.image.shape)
        near = np.hypot(xx - x, yy - y) < 2
        yi, xi = np.unravel_index(np.nanargmax(np.where(near & ~bad, im.image, -np.inf)), im.image.shape)
        b2 = bad.copy()
        b2[yi, xi] = True
        b = free_fit(im, b2, psf, x, y, half=4, max_shift=1.5)
        if not a or not b:
            return None
        pred_peak = float(b["flux"] * model_on(psf, b["x"], b["y"], np.array([xi]), np.array([yi]))[0])
        rows.append(dict(obsid=ob, date=im.header["DATE-AVG"][:10], peak_pixel_value=float(im.image[yi, xi]), peak_predicted_without_it=pred_peak,
                         epsf_flux_all=a["flux"], epsf_flux_excl_peak=b["flux"], chi2r_all=a["chi2r"], chi2r_excl_peak=b["chi2r"]))
    for r in rows:
        r["dmag_epsf_all"] = float(-2.5 * np.log10(r["epsf_flux_all"] / rows[0]["epsf_flux_all"]))
        r["dmag_epsf_excl_peak"] = float(-2.5 * np.log10(r["epsf_flux_excl_peak"] / rows[0]["epsf_flux_excl_peak"]))
    return dict(set_id=set_id, epochs=rows,
                note="Raw EPSF-fit flux ratios (no reference-star normalisation; reference ensemble changes are reported separately). "
                     "chi2r >> 1 reflects EPSF model mismatch for a very bright star; aperture photometry remains the primary measurement.")
