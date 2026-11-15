"""Per-target validation: matched-set selection, cutout download, native-grid measurement, verdict."""
from __future__ import annotations

import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from astropy.table import Table
from astropy.time import Time

from spherex_io import load_l2

from .common import (OUT_JSON, PIX_ARCSEC, RAW, ROOT, TARGETS, fcol, gaia_field, http_get, offsets_arcsec, propagate,
                     target_position, target_position_err_arcsec)
from .measure import (SAT_FLAG_NAMES, aperture, bad_mask, control_apertures, disk, field_star_astrometry, flags_in,
                      gaia_pixels, in_bounds, isolated, psf_fit)
from .scan import matched_sets, visits

CUTOUT_DEG = 0.2
# aperture radius (px) per detector: PSF grows with wavelength (D1..D6 ~0.75..5 um)
AP_R = {1: 2.5, 2: 2.5, 3: 2.5, 4: 3.0, 5: 3.0, 6: 3.0}


def rel(p: Path) -> str:
    return str(Path(p).resolve().relative_to(ROOT)).replace("\\", "/")


def cutout_url(f, ra, dec):
    return f"{f['url']}?center={ra:.6f},{dec:.6f}d&size={CUTOUT_DEG}"


def fetch(f, ra, dec, tdir: Path) -> Path:
    dest = tdir / f"{f['obs_id']}D{f['det']}.fits"
    if dest.exists() and dest.stat().st_size > 10000:
        return dest
    r = http_get(cutout_url(f, ra, dec), check=lambda r: r.content.startswith(b"SIMPLE"))
    dest.write_bytes(r.content)
    return dest


def load_gaia(tid, ra, dec) -> Table:
    p = RAW / tid / "gaia_field.ecsv"
    if p.exists():
        return Table.read(p)
    t = gaia_field(ra, dec, 0.16, gmax=18.0)
    t.write(p, overwrite=True)
    return t


def cross_epoch_mask(ims, k, bads):
    """Common valid-pixel mask, native grid of frame k: a pixel of frame k is marked bad if the
    sky position of its centre falls on a flagged/invalid (or missing) pixel of ANY other frame."""
    im = ims[k]
    H, W = im.image.shape
    yy, xx = np.indices((H, W))
    ra, dec = im.wcs.pixel_to_world_values(xx.ravel(), yy.ravel())
    extra = np.zeros(H * W, bool)
    for j, other in enumerate(ims):
        if j == k:
            continue
        xo, yo = other.wcs.world_to_pixel_values(ra, dec)
        xi, yi = np.round(xo).astype(int), np.round(yo).astype(int)
        oob = (xi < 0) | (yi < 0) | (xi >= other.image.shape[1]) | (yi >= other.image.shape[0])
        b = np.ones(H * W, bool)
        b[~oob] = bads[j][yi[~oob], xi[~oob]]
        extra |= b
    return extra.reshape(H, W)


def measure_frame(tid, cat, f, path, gaia, det):
    im = load_l2(path)
    t = Time(im.header["DATE-AVG"], scale="utc")
    ra_p, dec_p = target_position(cat, t)
    xp, yp = (float(v) for v in im.wcs.world_to_pixel_values(ra_p, dec_p))
    rec = dict(obsid=f["obs_id"], detector=det, date_avg=im.header["DATE-AVG"], mjd=float(im.header["MJD-AVG"]),
               source_fits=f["url"], cutout_file=rel(path), l2dqa=f.get("l2dqa"),
               predicted=dict(ra=ra_p, dec=dec_p, x=xp, y=yp, catalogue_err_arcsec=target_position_err_arcsec(cat, t)))
    if not in_bounds(im, xp, yp, 6):
        rec["status"] = "target_outside_cutout"
        return rec, im
    wl, bw = im.wavelength_at(xp, yp)
    rec.update(wavelength_um=wl, bandwidth_um=bw, wavelength_header_scan_um=f["wavelength_um"],
               flags_at_target=flags_in(im, xp, yp, 2.0))
    bad = bad_mask(im)
    sat = sorted(set(rec["flags_at_target"]) & SAT_FLAG_NAMES)
    core = disk(bad.shape, xp, yp, 1.5)
    rec["saturation"] = dict(sat_or_nonlinear_flags=sat, n_rejected_px_within_1p5=int(bad[core].sum()),
                             peak_mjysr=float(np.nanmax(np.where(core, im.image, np.nan))))
    # Gaia stars in this frame (for alignment, control apertures, reference stars)
    gra, gdec, gx, gy = gaia_pixels(im, gaia, t)
    rec["_gaia_xy"] = (gx, gy)
    tid_ids = {TARGETS[tid].get(k) for k in ("gaia", "companion_gaia")} - {None}
    excl = [(xp, yp)] + [(gx[i], gy[i]) for i in range(len(gx)) if int(gaia["source_id"][i]) in tid_ids]
    rec["alignment"] = field_star_astrometry(im, gaia, t, bad, excl)
    # target PSF fit (free centroid, seeded at prediction)
    r_ap = AP_R[det]
    fit = psf_fit(im, xp, yp, bad, half=4, max_shift=2.5)
    rec["fit"] = fit
    rec["saturated_core"] = bool(sat) or rec["saturation"]["n_rejected_px_within_1p5"] > 0
    if rec["saturated_core"]:
        # SUPPLEMENTARY ONLY: Gaussian fit to the unflagged wings (rejected + BLOOM pixels masked).
        # Not used for verdicts; its precision is not calibrated by unsaturated field stars.
        from .measure import flag_bits
        m2 = bad | ((im.flags & flag_bits(im, {"BLOOM"})) != 0)
        fs = psf_fit(im, xp, yp, m2, half=6, max_shift=2.5, smax=6.0)
        rec["fit_saturated_core"] = fs
    if fit and rec["alignment"].get("ok"):
        al = rec["alignment"]
        sg = float(np.sqrt(fit["sigma_x"] * fit["sigma_y"]))
        fit["psf_sigma_ratio_to_field_stars"] = sg / al["psf_sigma_median"]
        # point-source-like: geometric-mean width within 35% of the field-star median (and not at bounds)
        fit["point_like"] = bool(0.65 <= fit["psf_sigma_ratio_to_field_stars"] <= 1.35)
        fit["offset_from_pred_px"] = float(np.hypot(fit["x"] - xp, fit["y"] - yp))
    # control apertures (blank sky) -> empirical aperture noise
    avoid = list(zip(gx, gy)) + [(xp, yp)]
    rec["control"] = control_apertures(im, r_ap, bad, avoid, avoid_r=r_ap + 3)
    forced = aperture(im, xp, yp, r_ap, bad)
    rec["forced_aperture"] = forced
    if forced and rec["control"] and forced["err"] > 0 and forced["n_missing"] < forced["n_ap"]:
        rec["forced_aperture"]["snr_nominal"] = forced["flux"] / forced["err"]
        emp = float(np.hypot(rec["control"]["robust_std"], 0))
        # empirical error: blank-sky scatter (background-limited term) combined with the source
        # Poisson part of the nominal error
        bg_nom = rec["control"]["median_nominal_err"]
        src_var = max(forced["err"] ** 2 - bg_nom ** 2, 0)
        rec["forced_aperture"]["err_empirical"] = float(np.sqrt(emp ** 2 + src_var))
        rec["forced_aperture"]["snr_empirical"] = forced["flux"] / rec["forced_aperture"]["err_empirical"]
    if TARGETS[tid]["test_type"] == "detection_and_motion":
        fe = deblended_forced(im, bad, path, xp, yp, gx, gy, gaia, tid_ids)
        if fe and fe.get("err_empirical"):
            fe["snr_empirical"] = fe["flux"] / fe["err_empirical"]
        rec["forced_epsf"] = fe
    rec["status"] = "measured"
    return rec, im


def deblended_forced(im, bad, path, xp, yp, gx, gy, gaia, tid_ids, nb_r_px=3.5, n_ctrl=60):
    """Forced EPSF photometry at the predicted target position, fitting catalogued Gaia neighbours
    (within nb_r_px) simultaneously at their propagated positions. Empirical error: the same fit at
    blank-sky positions with the same neighbour geometry (robust scatter of the 'target' flux)."""
    from .epsf import EPSF, forced_fit
    psf = EPSF(path)
    nbs = [(float(gx[i]), float(gy[i]), int(gaia["source_id"][i]), float(gaia["phot_g_mean_mag"][i])) for i in range(len(gx))
           if int(gaia["source_id"][i]) not in tid_ids and np.hypot(gx[i] - xp, gy[i] - yp) <= nb_r_px]
    pos = [(xp, yp)] + [(x, y) for x, y, _, _ in nbs]
    r = forced_fit(im, bad, psf, pos, half=5)
    if r is None:
        return None
    rng = np.random.default_rng(1)
    H, W = im.image.shape
    allxy = np.c_[gx, gy]
    ctrl = []
    for _ in range(n_ctrl * 40):
        if len(ctrl) >= n_ctrl:
            break
        cx, cy = rng.uniform(8, W - 9), rng.uniform(8, H - 9)
        shifted = [(cx + (x - xp), cy + (y - yp)) for x, y in pos]
        if np.min(np.hypot(allxy[:, 0] - cx, allxy[:, 1] - cy)) < 4 or np.hypot(cx - xp, cy - yp) < 12:
            continue
        if any(not (6 <= sx <= W - 7 and 6 <= sy <= H - 7) for sx, sy in shifted):
            continue
        rc = forced_fit(im, bad, psf, shifted, half=5)
        if rc is None or rc["n_bad_in_stamp"] > 6:
            continue
        ctrl.append(rc["flux"][0])
    ctrl = np.array(ctrl)
    emp = float(1.4826 * np.median(np.abs(ctrl - np.median(ctrl)))) if len(ctrl) >= 15 else None
    f, e = r["flux"][0], r["err"][0]
    # neighbour-leak control: a fake target at the same offset from OTHER Gaia stars of similar brightness,
    # fitted with the same two-source model. Its flux should scatter around zero if the EPSF models the star well.
    leak = []
    gmag = fcol(gaia, "phot_g_mean_mag", 99.0)
    if nbs:
        vx, vy = xp - nbs[0][0], yp - nbs[0][1]
        g0 = nbs[0][3]
        for i in range(len(gx)):
            if abs(gmag[i] - g0) > 1.5 or int(gaia["source_id"][i]) in tid_ids or np.hypot(gx[i] - xp, gy[i] - yp) < 12:
                continue
            fx, fy = gx[i] + vx, gy[i] + vy
            if not (6 <= fx <= W - 7 and 6 <= fy <= H - 7 and 6 <= gx[i] <= W - 7 and 6 <= gy[i] <= H - 7):
                continue
            others = np.ones(len(gx), bool)
            others[i] = False
            d_others = np.hypot(allxy[others, 0] - fx, allxy[others, 1] - fy)
            d_star = np.hypot(allxy[others, 0] - gx[i], allxy[others, 1] - gy[i])
            if d_others.min() < 3.0 or d_star.min() < 3.5:
                continue
            rl = forced_fit(im, bad, psf, [(fx, fy), (gx[i], gy[i])], half=5)
            if rl is None or rl["n_bad_in_stamp"] > 6:
                continue
            leak.append(rl["flux"][0])
    leak = np.array(leak)
    # free-position target fit (neighbours fixed) for astrometry
    from .epsf import free_fit
    ff = free_fit(im, bad, psf, xp, yp, fixed=[(x, y) for x, y, _, _ in nbs], half=5, max_shift=2.0)
    if ff:
        ra_f, dec_f = (float(v) for v in im.wcs.pixel_to_world_values(ff["x"], ff["y"]))
        ff.update(ra=ra_f, dec=dec_f, pos_err_axis_arcsec=float(np.hypot(ff["x_err"], ff["y_err"]) / np.sqrt(2) * PIX_ARCSEC))
    return dict(free_fit=ff, leak_control=dict(n=int(len(leak)), median=float(np.median(leak)) if len(leak) else None,
                                               robust_std=float(1.4826 * np.median(np.abs(leak - np.median(leak)))) if len(leak) >= 3 else None,
                                               values=[round(float(v), 4) for v in leak]),
                flux=f, err_nominal=e, err_blank_sky=emp,
                # conservative empirical error: the larger of blank-sky and neighbour-leak scatter
                err_empirical=(float(max(emp, float(1.4826 * np.median(np.abs(leak - np.median(leak)))) if len(leak) >= 10 else 0.0))
                               if emp is not None else None),
                snr_nominal=f / e if e > 0 else None, n_control=int(len(ctrl)),
                control_median=float(np.median(ctrl)) if len(ctrl) else None, chi2r=r["chi2r"], n_bad_in_stamp=r["n_bad_in_stamp"],
                corr_target_neighbour=r["corr_target_neighbour"], psf_fwhm_arcsec=psf.fwhm_arcsec,
                neighbours=[dict(source_id=sid, g=gm, sep_arcsec=float(np.hypot(x - xp, y - yp) * PIX_ARCSEC), flux=r["flux"][k + 1],
                                 err=r["err"][k + 1]) for k, (x, y, sid, gm) in enumerate(nbs)])


def astrometry_from(rec, saturated=False):
    """Zero-point-corrected target position and its offset from prediction (E, N arcsec).
    saturated=True uses the supplementary masked-core fit (only for saturated targets)."""
    al, im_wcs = rec.get("alignment"), rec.get("_wcs")
    if saturated:
        fit = rec.get("fit_saturated_core")
        if not fit or not fit["ok"] or not al or not al.get("ok"):
            return None
    else:
        fit = rec.get("fit")
        if rec.get("saturated_core") or not fit or not fit["ok"] or not al or not al.get("ok") or not fit.get("point_like"):
            return None
    ra_raw, dec_raw = (float(v) for v in im_wcs.pixel_to_world_values(fit["x"], fit["y"]))
    zE, zN = al["zero_point_E"], al["zero_point_N"]
    dec_c = dec_raw - zN / 3600
    ra_c = ra_raw - zE / 3600 / np.cos(np.radians(dec_raw))
    formal = float(np.hypot(fit["x_err"], fit["y_err"]) / np.sqrt(2) * PIX_ARCSEC)
    sigma = float(np.sqrt(formal ** 2 + al["bright_star_floor_arcsec"] ** 2 + al["zero_point_err"] ** 2))
    dE, dN = offsets_arcsec(ra_c, dec_c, rec["predicted"]["ra"], rec["predicted"]["dec"])
    return dict(ra_raw=ra_raw, dec_raw=dec_raw, ra=ra_c, dec=dec_c, sigma_axis_arcsec=sigma, formal_axis_arcsec=formal,
                floor_arcsec=al["bright_star_floor_arcsec"], zp_err_arcsec=al["zero_point_err"],
                offset_from_pred_E=float(dE), offset_from_pred_N=float(dN),
                offset_from_pred_arcsec=float(np.hypot(dE, dN)), method="masked_core_gaussian_SUPPLEMENTARY" if saturated else "gaussian_psf_fit")


def motion_analysis(cat, recs, key="astrometry"):
    """Visit-averaged positions; measured displacement first->last visit vs predicted displacement."""
    good = [dict(r, astrometry=r[key]) for r in recs if r.get(key)]
    vs = visits([dict(r, mjd=r["mjd"]) for r in good])
    vout = []
    for v in vs:
        w = np.array([1 / r["astrometry"]["sigma_axis_arcsec"] ** 2 for r in v])
        dec0 = v[0]["astrometry"]["dec"]
        ra = float(np.sum([r["astrometry"]["ra"] * wi for r, wi in zip(v, w)]) / w.sum())
        dec = float(np.sum([r["astrometry"]["dec"] * wi for r, wi in zip(v, w)]) / w.sum())
        mjd = float(np.mean([r["mjd"] for r in v]))
        sig = float(1 / np.sqrt(w.sum()))
        # the formal combination assumes independent frames; the floor term is partly common within a visit, so
        # also carry the larger of formal and (zero-point floor of a single frame)/1 as conservative
        sig_cons = float(max(sig, np.median([r["astrometry"]["floor_arcsec"] for r in v]) / np.sqrt(len(v)) * 1.0,
                             np.median([r["astrometry"]["zp_err_arcsec"] for r in v])))
        offE = [r["astrometry"]["offset_from_pred_E"] for r in v]
        offN = [r["astrometry"]["offset_from_pred_N"] for r in v]
        within = float(np.std(np.hypot(np.array(offE) - np.mean(offE), np.array(offN) - np.mean(offN)))) if len(v) > 1 else None
        pr, pd = target_position(cat, Time(mjd, format="mjd"))
        dE, dN = offsets_arcsec(ra, dec, pr, pd)
        vout.append(dict(mjd=mjd, date=Time(mjd, format="mjd").isot[:19], n_frames=len(v), ra=ra, dec=dec, sigma_axis_arcsec=sig_cons,
                         pred_ra=pr, pred_dec=pd, offset_from_pred_E=float(dE), offset_from_pred_N=float(dN),
                         within_visit_rms_arcsec=within, obsids=[r["obsid"] for r in v]))
    out = dict(visits=vout)
    if len(vout) >= 2:
        a, b = vout[0], vout[-1]
        mE, mN = offsets_arcsec(b["ra"], b["dec"], a["ra"], a["dec"])
        pE, pN = offsets_arcsec(b["pred_ra"], b["pred_dec"], a["pred_ra"], a["pred_dec"])
        sig = float(np.hypot(a["sigma_axis_arcsec"], b["sigma_axis_arcsec"]))
        cat_err = float(np.hypot(target_position_err_arcsec(cat, Time(a["mjd"], format="mjd")) * 0, 0))  # pm error over <1 yr is negligible
        dt_yr = (b["mjd"] - a["mjd"]) / 365.25
        out.update(baseline_days=float(b["mjd"] - a["mjd"]),
                   measured_displacement_E=float(mE), measured_displacement_N=float(mN), measured_displacement_arcsec=float(np.hypot(mE, mN)),
                   predicted_displacement_E=float(pE), predicted_displacement_N=float(pN), predicted_displacement_arcsec=float(np.hypot(pE, pN)),
                   displacement_sigma_axis_arcsec=sig,
                   residual_E=float(mE - pE), residual_N=float(mN - pN), residual_arcsec=float(np.hypot(mE - pE, mN - pN)),
                   significance_of_motion_sigma=float(np.hypot(mE, mN) / sig),
                   residual_chi2_2dof=float(((mE - pE) ** 2 + (mN - pN) ** 2) / sig ** 2),
                   measured_pa_deg=float(np.degrees(np.arctan2(mE, mN)) % 360), predicted_pa_deg=float(np.degrees(np.arctan2(pE, pN)) % 360),
                   implied_rate_arcsec_per_yr=float(np.hypot(mE, mN) / dt_yr) if dt_yr > 0 else None)
    return out


WCS_FLOOR_ARCSEC = 0.3  # conservative per-frame WCS systematic (field-star zero points/floors measured in D1-D4 here are <= 0.3")


def epsf_motion(cat, recs, min_snr=3.0):
    """Motion test from free-position EPSF fits (catalogued neighbours fitted simultaneously at fixed positions).
    Raw frame WCS (no zero-point correction: D5/D6 frames lack enough bright Gaia stars), with a WCS floor
    added in quadrature. Frames with fitted target S/N < min_snr are not used."""
    pts = []
    for r in recs:
        ff = ((r.get("forced_epsf") or {}).get("free_fit")) or None
        if not ff or not ff["ok"] or ff["flux"] / ff["flux_err"] < min_snr:
            continue
        sig = float(np.hypot(ff["pos_err_axis_arcsec"], WCS_FLOOR_ARCSEC))
        pts.append(dict(mjd=r["mjd"], obsid=r["obsid"], ra=ff["ra"], dec=ff["dec"], sig=sig, snr=ff["flux"] / ff["flux_err"]))
    out = dict(n_frames_used=len(pts), min_snr=min_snr, wcs_floor_arcsec=WCS_FLOOR_ARCSEC, frames=pts)
    vs = visits(pts)
    vout = []
    for v in vs:
        w = np.array([1 / p["sig"] ** 2 for p in v])
        ra = float(np.sum(np.array([p["ra"] for p in v]) * w) / w.sum())
        dec = float(np.sum(np.array([p["dec"] for p in v]) * w) / w.sum())
        mjd = float(np.mean([p["mjd"] for p in v]))
        pr, pd = target_position(cat, Time(mjd, format="mjd"))
        dE, dN = offsets_arcsec(ra, dec, pr, pd)
        vout.append(dict(mjd=mjd, date=Time(mjd, format="mjd").isot[:10], n=len(v), ra=ra, dec=dec, sigma_axis_arcsec=float(1 / np.sqrt(w.sum())),
                         pred_ra=pr, pred_dec=pd, offset_from_pred_E=float(dE), offset_from_pred_N=float(dN)))
    out["visits"] = vout
    if len(vout) >= 2:
        a, b = vout[0], vout[-1]
        mE, mN = offsets_arcsec(b["ra"], b["dec"], a["ra"], a["dec"])
        pE, pN = offsets_arcsec(b["pred_ra"], b["pred_dec"], a["pred_ra"], a["pred_dec"])
        sig = float(np.hypot(a["sigma_axis_arcsec"], b["sigma_axis_arcsec"]))
        out.update(baseline_days=float(b["mjd"] - a["mjd"]), measured_displacement_E=float(mE), measured_displacement_N=float(mN),
                   measured_displacement_arcsec=float(np.hypot(mE, mN)), predicted_displacement_E=float(pE), predicted_displacement_N=float(pN),
                   predicted_displacement_arcsec=float(np.hypot(pE, pN)), displacement_sigma_axis_arcsec=sig,
                   residual_E=float(mE - pE), residual_N=float(mN - pN), residual_arcsec=float(np.hypot(mE - pE, mN - pN)),
                   significance_of_motion_sigma=float(np.hypot(mE, mN) / sig),
                   residual_chi2_2dof=float(((mE - pE) ** 2 + (mN - pN) ** 2) / sig ** 2),
                   stationary_chi2_2dof=float((mE ** 2 + mN ** 2) / sig ** 2))
        # all-visit offsets from the predicted track (chi2 against "moves as predicted")
        out["track_chi2"] = float(sum((v["offset_from_pred_E"] ** 2 + v["offset_from_pred_N"] ** 2) / v["sigma_axis_arcsec"] ** 2 for v in vout))
        out["track_dof"] = 2 * len(vout)
    return out


def photometry_analysis(ims, recs, gaia, det, tid):
    """Differential aperture photometry in one matched set on native grids with a common valid-pixel
    mask. Target vs an ensemble of isolated, non-variable Gaia reference stars measured identically."""
    r_ap = AP_R[det]
    bads = [bad_mask(im) for im in ims]
    extras = [cross_epoch_mask(ims, k, bads) for k in range(len(ims))]
    tid_ids = {TARGETS[tid].get(k) for k in ("gaia", "companion_gaia")} - {None}
    g = np.array(gaia["phot_g_mean_mag"], float)
    var_flag = np.array([str(v) for v in gaia["phot_variable_flag"]])
    # candidate refs: positions per frame
    per_frame = []
    for im, rec, bad, extra in zip(ims, recs, bads, extras):
        t = Time(rec["date_avg"], scale="utc")
        _, _, gx, gy = gaia_pixels(im, gaia, t)
        tx, ty = rec["predicted"]["x"], rec["predicted"]["y"]
        tgt = aperture(im, tx, ty, r_ap, bad, extra_bad=extra)
        refs = {}
        why = defaultdict(int)
        for i in range(len(g)):
            sid = int(gaia["source_id"][i])
            if sid in tid_ids or var_flag[i] == "VARIABLE" or g[i] > 16.5:
                why["catalogue"] += 1
                continue
            if not in_bounds(im, gx[i], gy[i], 12) or np.hypot(gx[i] - tx, gy[i] - ty) < 10:
                why["position"] += 1
                continue
            # a constant neighbour cancels in a same-wavelength ratio; only reject comparably bright close pairs
            if not isolated(gaia, gx, gy, i, rad_px=r_ap + 1.5, dmag=2.0):
                why["blended"] += 1
                continue
            a = aperture(im, gx[i], gy[i], r_ap, bad, extra_bad=extra)
            if a is None or a["n_missing"] > 0:
                why["masked"] += 1
                continue
            if a["flux"] <= 0 or a["flux"] / a["err"] < 30:
                why["low_snr"] += 1
                continue
            if set(flags_in(im, gx[i], gy[i], r_ap)) & SAT_FLAG_NAMES:
                why["saturated"] += 1
                continue
            refs[sid] = a
        per_frame.append(dict(target=tgt, refs=refs, why=dict(why)))
    common = set.intersection(*[set(p["refs"]) for p in per_frame]) if per_frame else set()
    out = dict(aperture_radius_px=r_ap, n_reference_stars=len(common), common_mask="pixel used in any epoch must be valid in every epoch (mapped through each frame's WCS)")
    tflux = [p["target"] for p in per_frame]
    complete = all(t is not None and t["n_missing"] == 0 for t in tflux)
    out["target_aperture_complete_all_epochs"] = bool(complete)
    out["target_missing_px"] = [None if t is None else t["n_missing"] for t in tflux]
    out["reference_rejections_per_frame"] = [p["why"] for p in per_frame]
    out["reference_candidates_per_frame"] = [len(p["refs"]) for p in per_frame]
    out["common_mask_fraction_masked"] = [float(e.mean()) for e in extras]
    if len(common) < 3:
        out["ok"] = False
        out["reason"] = f"only {len(common)} usable reference stars"
        out["raw"] = [None if t is None else dict(flux=t["flux"], err=t["err"]) for t in tflux]
        return out
    common = sorted(common)
    F = np.array([[p["refs"][s]["flux"] for s in common] for p in per_frame])  # (n_frames, n_refs)
    E = np.array([[p["refs"][s]["err"] for s in common] for p in per_frame])
    ens = F.sum(axis=1)
    ens_err = np.sqrt((E ** 2).sum(axis=1))
    # each reference vs the ensemble of the others: empirical frame-to-frame scatter of differential mags
    dm_refs = []
    for k in range(len(common)):
        others = ens - F[:, k]
        r = F[:, k] / others
        dm_refs.append(-2.5 * np.log10(r / r[0]))
    dm_refs = np.array(dm_refs)  # (n_refs, n_frames)
    ref_snr = np.median(F / E, axis=0)
    out["reference_stars"] = [dict(source_id=int(s), g=float(g[list(map(int, gaia["source_id"])).index(s)]), median_snr=float(sn))
                              for s, sn in zip(common, ref_snr)]
    out["ensemble_scale_change"] = [float(e / ens[0]) for e in ens]
    if len(per_frame) > 1:
        # robust per-frame scatter of reference differential mags (frames 1..n vs frame 0)
        sc = [float(1.4826 * np.median(np.abs(dm_refs[:, j] - np.median(dm_refs[:, j])))) for j in range(1, len(per_frame))]
        out["reference_dm_robust_scatter_mag"] = sc
    rows = []
    for j, (t, rec) in enumerate(zip(tflux, recs)):
        row = dict(obsid=rec["obsid"], date_avg=rec["date_avg"])
        if t is None or t["n_missing"] > 0 or t["flux"] <= 0:
            row.update(usable=False, reason="target aperture incomplete under common mask" if t else "no aperture")
            rows.append(row)
            continue
        ratio = t["flux"] / ens[j]
        ratio_err = ratio * np.hypot(t["err"] / t["flux"], ens_err[j] / ens[j])
        row.update(usable=True, flux_sum_mjysr_px=t["flux"], flux_err_nominal=t["err"], ratio_to_ensemble=float(ratio),
                   ratio_err_nominal=float(ratio_err))
        rows.append(row)
    out["epochs"] = rows
    use = [r for r in rows if r["usable"]]
    if len(use) >= 2:
        r0 = use[0]
        for r in use:
            j = rows.index(r)
            dm = -2.5 * np.log10(r["ratio_to_ensemble"] / r0["ratio_to_ensemble"])
            nom = 1.0857 * np.hypot(r["ratio_err_nominal"] / r["ratio_to_ensemble"], r0["ratio_err_nominal"] / r0["ratio_to_ensemble"])
            j0 = rows.index(r0)
            emp_ref = 0.0 if j == j0 else float(1.4826 * np.median(np.abs(dm_refs[:, j] - dm_refs[:, j0] - np.median(dm_refs[:, j] - dm_refs[:, j0]))))
            r["dmag_vs_first"] = float(dm)
            r["dmag_err_nominal"] = float(nom)
            r["dmag_err_empirical"] = float(np.hypot(nom, emp_ref))
    out["ok"] = True
    return out


def run_target(tid, cat, frames):
    T = TARGETS[tid]
    tdir = RAW / tid
    ttype = T["test_type"]
    by_det = defaultdict(int)
    inside = defaultdict(int)
    for f in frames:
        by_det[f"D{f['det']}"] += 1
        if f.get("inside"):
            inside[f"D{f['det']}"] += 1
    mj = [f["mjd"] for f in frames if "mjd" in f]
    obs = dict(n_sia2_frames=len(frames), n_target_on_detector=sum(inside.values()), by_detector={k: dict(sia2=by_det[k], target_on_detector=inside[k]) for k in sorted(by_det)},
               date_range=[Time(min(mj), format="mjd").isot[:10], Time(max(mj), format="mjd").isot[:10]],
               n_header_errors=sum("error" in f for f in frames))
    # candidate matched sets
    chosen = []
    all_sets_summary = {}
    for det in range(1, 7):
        ss = matched_sets(frames, det)
        all_sets_summary[f"D{det}"] = dict(n_sets_with_2plus_visits=len(ss),
                                           best=[dict(lam=round(s["lam_ref"], 4), n_visits=s["n_visits"], span_days=round(s["span_days"], 1)) for s in ss[:5]])
        if ss:
            # the set with the most visits AND the set with the longest time baseline (often different)
            by_span = max(ss, key=lambda s: (s["span_days"], s["n_visits"]))
            chosen.append(dict(ss[0], selection="most_visits"))
            if by_span is not ss[0]:
                chosen.append(dict(by_span, selection="longest_baseline"))
            else:
                chosen[-1]["selection"] = "most_visits_and_longest_baseline"
            if ttype == "variability" and det == 1:
                # bright targets saturate; their faintest light is usually at the shortest wavelengths
                short = min(ss, key=lambda s: s["lam_ref"])
                if all(short is not c_ for c_ in (ss[0], by_span)):
                    chosen.append(dict(short, selection="shortest_wavelength"))
    obs["matched_set_candidates"] = all_sets_summary
    ra_c, dec_c = target_position(cat, Time("2025-11-01"))
    gaia = load_gaia(tid, ra_c, dec_c)
    todo = [(f, s) for s in chosen for f in s["frames"]]
    with ThreadPoolExecutor(3) as ex:
        paths = list(ex.map(lambda fs: fetch(fs[0], *target_position(cat, Time(fs[0]["mjd"], format="mjd")), tdir), todo))
    pmap = {(f["obs_id"], f["det"]): p for (f, _), p in zip(todo, paths)}

    matched_out, measurements, align_out = [], [], {}
    set_results = []
    for s in chosen:
        det = s["det"]
        sid = f"D{det}/{s['selection']}"
        recs, ims = [], []
        for f in s["frames"]:
            rec, im = measure_frame(tid, cat, f, pmap[(f["obs_id"], f["det"])], gaia, det)
            rec["_wcs"] = im.wcs
            recs.append(rec)
            ims.append(im)
        # authoritative wavelength check with each cutout's own WCS-WAVE
        keep = [i for i, r in enumerate(recs) if r["status"] == "measured"]
        lam = np.array([recs[i]["wavelength_um"] for i in keep])
        bwm = min(recs[i]["bandwidth_um"] for i in keep) if keep else np.nan
        ok_match = bool(len(lam) >= 2 and (lam.max() - lam.min()) <= 0.5 * bwm)
        for i in keep:
            recs[i]["astrometry"] = astrometry_from(recs[i])
            recs[i]["astrometry_saturated_supplementary"] = astrometry_from(recs[i], saturated=True) if recs[i].get("saturated_core") else None
        rr = [recs[i] for i in keep]
        ii = [ims[i] for i in keep]
        res = dict(set_id=sid, selection=s["selection"], detector=f"D{det}", lambda_ref_um=float(np.mean(lam)) if len(lam) else None, bandwidth_um=float(bwm),
                   wavelength_spread_um=float(lam.max() - lam.min()) if len(lam) else None, matched_within_half_bandwidth=ok_match,
                   n_visits=len(visits(rr)), span_days=float(max(r["mjd"] for r in rr) - min(r["mjd"] for r in rr)) if rr else 0)
        res["motion"] = motion_analysis(cat, rr) if ok_match else None
        if ok_match and any(r.get("astrometry_saturated_supplementary") for r in rr):
            res["motion_saturated_supplementary"] = motion_analysis(cat, rr, key="astrometry_saturated_supplementary")
        res["photometry"] = photometry_analysis(ii, rr, gaia, det, tid) if ok_match and len(rr) >= 2 else None
        fe = [r.get("forced_epsf") for r in rr]
        if fe and all(x and x.get("err_empirical") for x in fe):
            w = np.array([1 / x["err_empirical"] ** 2 for x in fe])
            fl = np.array([x["flux"] for x in fe])
            wn = np.array([1 / x["err_nominal"] ** 2 for x in fe])
            res["forced_epsf_combined"] = dict(
                n=len(fe), flux_wmean=float((fl * w).sum() / w.sum()), err_empirical=float(1 / np.sqrt(w.sum())),
                snr_empirical=float((fl * w).sum() / w.sum() * np.sqrt(w.sum())),
                snr_nominal=float((fl * wn).sum() / wn.sum() * np.sqrt(wn.sum())),
                chi2_constant=float((((fl - (fl * w).sum() / w.sum()) ** 2) * w).sum()),
                note="weighted mean of per-frame native-grid forced EPSF fluxes within one matched set (same detector, wavelengths within half a bandwidth)")
            res["motion_free_epsf"] = epsf_motion(cat, rr) if ok_match else None
        set_results.append((res, rr))
        matched_out.append(dict(set_id=sid, selection=s["selection"], detector=f"D{det}", lambda_ref_um=res["lambda_ref_um"], bandwidth_um=res["bandwidth_um"],
                                wavelength_spread_um=res["wavelength_spread_um"], matched_within_half_bandwidth=ok_match,
                                frames=[dict(obsid=r["obsid"], date_avg=r["date_avg"], mjd=r["mjd"], wavelength_um=r.get("wavelength_um"),
                                             bandwidth_um=r.get("bandwidth_um"), wavelength_header_scan_um=r.get("wavelength_header_scan_um"),
                                             source_fits=r["source_fits"],
                                             cutout_url=cutout_url(dict(url=r["source_fits"]), *target_position(cat, Time(r["mjd"], format="mjd"))),
                                             flags_at_target=r.get("flags_at_target", []), l2dqa=r.get("l2dqa")) for r in recs]))
        for r in rr:
            al = r["alignment"]
            align_out.setdefault(sid, []).append(dict(obsid=r["obsid"], n_stars=al["n"], ok=al.get("ok"),
                                                            zero_point_E_arcsec=al.get("zero_point_E"), zero_point_N_arcsec=al.get("zero_point_N"),
                                                            residual_scatter_E_arcsec=al.get("scatter_E"), residual_scatter_N_arcsec=al.get("scatter_N"),
                                                            bright_star_floor_arcsec=al.get("bright_star_floor_arcsec"), n_bright=al.get("n_bright")))
            fa = r.get("forced_aperture") or {}
            fit = r.get("fit") or {}
            measurements.append(dict(
                set_id=sid, detector=f"D{det}", obsid=r["obsid"], date_avg=r["date_avg"], mjd=r["mjd"], wavelength_um=r.get("wavelength_um"),
                predicted=r["predicted"], fit=dict((k, fit.get(k)) for k in ("x", "y", "x_err", "y_err", "sigma_x", "sigma_y", "chi2r", "ok", "n_bad_core", "psf_sigma_ratio_to_field_stars", "point_like", "offset_from_pred_px")) if fit else None,
                measured=r.get("astrometry"),
                saturated_core=r.get("saturated_core"),
                measured_saturated_supplementary=r.get("astrometry_saturated_supplementary"),
                flux=dict(aperture_radius_px=AP_R[det], flux_sum_mjysr_px=fa.get("flux"), err_nominal=fa.get("err"), err_empirical=fa.get("err_empirical"),
                          snr_nominal=fa.get("snr_nominal"), snr_empirical=fa.get("snr_empirical"), n_missing_px=fa.get("n_missing"),
                          flux_mJy_approx=(fa.get("flux") * (PIX_ARCSEC / 206265) ** 2 * 1e9) if fa.get("flux") is not None else None),
                control_apertures=r.get("control"),
                forced_epsf_deblended=r.get("forced_epsf"),
                flags_at_target=r.get("flags_at_target"), saturation=r.get("saturation")))
    return dict(tid=tid, obs=obs, matched_out=matched_out, measurements=measurements, align_out=align_out,
                set_results=[s for s, _ in set_results], chosen=chosen)


def write_json(tid, cat, R, result, limitations, extra=None):
    T = TARGETS[tid]
    a = cat["astrometry"]
    catalog = dict(astrometry_used=a, simbad=cat.get("simbad"), gaia_dr3=cat.get("gaia_dr3"))
    for k in ("neighbour", "companion"):
        if cat.get(k):
            catalog[k] = cat[k]
    doc = dict(id=tid, name=T["name"], test_type=T["test_type"], catalog=catalog, observations_examined=R["obs"],
               matched_sets=R["matched_out"], set_analyses=R["set_results"], measurements=R["measurements"], result=result,
               alignment_checks=R["align_out"], limitations=limitations,
               method=("Positions/fluxes measured on each frame's native pixel grid with its own WCS (no resampling). Wavelength at the "
                       "target from each cutout's own WCS-WAVE. Frames compared only within a same-detector set whose wavelengths at "
                       "the target agree within half a channel bandwidth. Astrometry: weighted Gaussian PSF fit; WCS zero point and "
                       "empirical precision from isolated Gaia DR3 stars propagated (proper motion + parallax) to each DATE-AVG. "
                       "Photometry: aperture minus annulus, common valid-pixel mask across epochs, differential against non-variable "
                       "Gaia reference stars; empirical errors from blank-sky control apertures and reference-star scatter."),
               generated=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    if extra:
        doc.update(extra)
    OUT_JSON.mkdir(parents=True, exist_ok=True)

    def clean(o):
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items() if not k.startswith("_")}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        if isinstance(o, (np.floating,)):
            o = float(o)
        if isinstance(o, float):
            return None if not np.isfinite(o) else round(o, 6)
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, np.bool_):
            return bool(o)
        return o

    (OUT_JSON / f"{tid}.json").write_text(json.dumps(clean(doc), indent=1))
    return doc
