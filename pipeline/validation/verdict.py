"""Turn per-set measurements into a verdict. Thresholds are fixed in advance and applied uniformly:

  detection          forced-aperture S/N (empirical, from blank-sky control apertures) >= 5
  motion detected    |measured displacement| >= 5 sigma (sigma = per-axis, from formal fit + empirical
                     Gaia-star floor + zero-point error, combined over the two visits)
  motion consistent  residual (measured - predicted displacement) chi^2 with 2 dof < 11.83 (p > 0.0027, "3 sigma")
  variability        |dmag| >= 5 sigma_empirical between epochs of one matched set (target unsaturated,
                     complete aperture under the common mask, >= 3 reference stars)
A set is unusable for a target whose core (r <= 1.5 px) contains saturated/nonlinear or rejected pixels.
"""
from __future__ import annotations

import numpy as np

CHI2_3SIG_2DOF = 11.83


def frame_ok(m):
    s = m.get("saturation") or {}
    return not s.get("sat_or_nonlinear_flags") and (s.get("n_rejected_px_within_1p5", 0) == 0)


def set_frames(R, sid):
    return [m for m in R["measurements"] if m["set_id"] == sid]


def detection_table(R):
    out = {}
    for m in R["measurements"]:
        d = out.setdefault(m["detector"], [])
        d.append(dict(obsid=m["obsid"], lam=m["wavelength_um"], snr_emp=(m["flux"] or {}).get("snr_empirical"),
                      snr_nom=(m["flux"] or {}).get("snr_nominal"), clean=frame_ok(m), flags=m.get("flags_at_target")))
    return out


def motion_sets(R, need_detection=True):
    rows = []
    for s in R["set_results"]:
        det = s["set_id"]
        mo = s.get("motion") or {}
        fr = set_frames(R, det)
        clean = all(frame_ok(m) for m in fr)
        det_ok = all(((m["flux"] or {}).get("snr_empirical") or 0) >= 5 for m in fr)
        n_ast = sum(1 for m in fr if m.get("measured"))
        row = dict(detector=det, lam=s["lambda_ref_um"], matched=s["matched_within_half_bandwidth"], clean=clean, detected_all=det_ok,
                   n_frames=len(fr), n_astrometric=n_ast, n_visits=len(mo.get("visits", [])), baseline_days=mo.get("baseline_days"))
        for k in ("measured_displacement_arcsec", "predicted_displacement_arcsec", "displacement_sigma_axis_arcsec", "residual_arcsec",
                  "significance_of_motion_sigma", "residual_chi2_2dof", "measured_pa_deg", "predicted_pa_deg", "measured_displacement_E",
                  "measured_displacement_N", "predicted_displacement_E", "predicted_displacement_N", "residual_E", "residual_N"):
            row[k] = mo.get(k)
        row["usable"] = bool(s["matched_within_half_bandwidth"] and clean and (det_ok or not need_detection) and row["n_visits"] >= 2
                             and row["significance_of_motion_sigma"] is not None)
        rows.append(row)
    return rows


def motion_verdict(rows):
    use = [r for r in rows if r["usable"]]
    if not use:
        return None, use
    best = min(use, key=lambda r: r["displacement_sigma_axis_arcsec"])
    sig_ok = best["significance_of_motion_sigma"] >= 5
    res_ok = best["residual_chi2_2dof"] < CHI2_3SIG_2DOF
    agree = [r for r in use if r["residual_chi2_2dof"] < CHI2_3SIG_2DOF]
    if sig_ok and res_ok:
        v = "confirmed"
    elif res_ok:
        v = "consistent"
    else:
        v = "inconclusive"
    return dict(verdict=v, primary=best, n_usable_sets=len(use), n_sets_consistent=len(agree)), use


def variability_sets(R):
    rows = []
    for s in R["set_results"]:
        det = s["set_id"]
        ph = s.get("photometry") or {}
        fr = set_frames(R, det)
        clean = all(frame_ok(m) for m in fr)
        eps = [e for e in ph.get("epochs", []) if e.get("usable") and "dmag_vs_first" in e]
        best = max(eps, key=lambda e: abs(e["dmag_vs_first"]) / e["dmag_err_empirical"] if e["dmag_err_empirical"] else 0, default=None)
        row = dict(detector=det, lam=s["lambda_ref_um"], matched=s["matched_within_half_bandwidth"], clean=clean,
                   n_frames=len(fr), n_refs=ph.get("n_reference_stars"), ok=ph.get("ok"), reason=ph.get("reason"),
                   aperture_complete=ph.get("target_aperture_complete_all_epochs"),
                   epochs=[dict(date=e["date_avg"][:10], dmag=e.get("dmag_vs_first"), err_emp=e.get("dmag_err_empirical"), err_nom=e.get("dmag_err_nominal"))
                           for e in ph.get("epochs", []) if e.get("usable")],
                   ref_scatter=ph.get("reference_dm_robust_scatter_mag"))
        if best and best["dmag_err_empirical"]:
            row.update(max_abs_dmag=abs(best["dmag_vs_first"]), max_sig=abs(best["dmag_vs_first"]) / best["dmag_err_empirical"],
                       max_date=best["date_avg"][:10], max_dmag=best["dmag_vs_first"], max_err=best["dmag_err_empirical"])
        row["usable"] = bool(row["matched"] and clean and ph.get("ok") and len(eps) >= 2 and row.get("aperture_complete"))
        rows.append(row)
    return rows


def fmt(x, nd=2):
    return "—" if x is None or (isinstance(x, float) and not np.isfinite(x)) else f"{x:.{nd}f}"
