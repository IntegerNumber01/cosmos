"""Compose result + limitations from measured numbers (no hand-entered results)."""
from __future__ import annotations

import json

import numpy as np

from .common import RAW
from .verdict import CHI2_3SIG_2DOF, detection_table, fmt, frame_ok, motion_sets, motion_verdict, variability_sets

GENERIC_LIMITS = [
    "SPHEREx pixels are 6.15\"; positions come from a Gaussian PSF fit, not the pipeline EPSF, so absolute centroids can carry "
    "sub-pixel PSF-model bias. It largely cancels between matched-wavelength frames of the same detector, and the Gaia field-star "
    "floor measures what is left.",
    "Only one matched set per detector was measured (the one with the most visits and the longest time span). Other matched sets exist "
    "(see observations_examined.matched_set_candidates).",
    "DR1 spans about one year, so motion baselines are at most ~12 months and parallax is not separated from proper motion: the "
    "prediction includes both.",
]


def save_raw(tid, R):
    p = RAW / tid / "results_raw.json"

    def clean(o):
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items() if not k.startswith("_")}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        if isinstance(o, np.generic):
            return o.item()
        return o
    p.write_text(json.dumps(clean({k: v for k, v in R.items() if k != "chosen"}), indent=1, default=str))


def print_diag(tid, R):
    print(f"\n===== {tid}")
    for m in R["measurements"]:
        fl = m["flux"] or {}
        fit = m["fit"] or {}
        me = m["measured"] or {}
        s = m["saturation"] or {}
        print(f"{m['set_id'][:14]:14s} {m['obsid']:20s} {m['date_avg'][:10]} lam={fmt(m['wavelength_um'],4)} "
              f"snrE={fmt(fl.get('snr_empirical'),1)} snrN={fmt(fl.get('snr_nominal'),1)} "
              f"sat={','.join(s.get('sat_or_nonlinear_flags') or [])} nrej={s.get('n_rejected_px_within_1p5')} "
              f"fitok={fit.get('ok')} pl={fit.get('point_like')} wr={fmt(fit.get('psf_sigma_ratio_to_field_stars'))} "
              f"off={fmt(me.get('offset_from_pred_arcsec'))}\" sig={fmt(me.get('sigma_axis_arcsec'))} flags={','.join(m.get('flags_at_target') or [])}")
    for det, al in R["align_out"].items():
        print(det, "align:", [(a["n_stars"], fmt(a["zero_point_E_arcsec"]), fmt(a["zero_point_N_arcsec"]), fmt(a["bright_star_floor_arcsec"])) for a in al])
    for s in R["set_results"]:
        mo = s.get("motion") or {}
        ph = s.get("photometry") or {}
        print(s["set_id"], "lam", fmt(s["lambda_ref_um"], 4), "spread", fmt(s["wavelength_spread_um"], 4), "bw", fmt(s["bandwidth_um"], 4),
              "matched", s["matched_within_half_bandwidth"], "visits", s["n_visits"], "span", fmt(s["span_days"], 1))
        if mo.get("measured_displacement_arcsec") is not None:
            print("   motion meas", fmt(mo["measured_displacement_E"]), fmt(mo["measured_displacement_N"]), "pred", fmt(mo["predicted_displacement_E"]),
                  fmt(mo["predicted_displacement_N"]), "sig", fmt(mo["displacement_sigma_axis_arcsec"]), "signif", fmt(mo["significance_of_motion_sigma"], 1),
                  "chi2", fmt(mo["residual_chi2_2dof"], 1))
        for v in mo.get("visits", []):
            print("     visit", v["date"][:10], v["n_frames"], "offE", fmt(v["offset_from_pred_E"]), "offN", fmt(v["offset_from_pred_N"]),
                  "sig", fmt(v["sigma_axis_arcsec"]), "within", fmt(v["within_visit_rms_arcsec"]))
        if ph:
            print("   phot ok", ph.get("ok"), ph.get("reason", ""), "nref", ph.get("n_reference_stars"), "complete", ph.get("target_aperture_complete_all_epochs"),
                  "missing", ph.get("target_missing_px"), "refscatter", [fmt(x, 3) for x in ph.get("reference_dm_robust_scatter_mag", [])])
            for e in ph.get("epochs", []):
                if e.get("usable") and "dmag_vs_first" in e:
                    print("     ", e["date_avg"][:10], "dm", fmt(e["dmag_vs_first"], 3), "+-", fmt(e["dmag_err_empirical"], 3), "(nom", fmt(e["dmag_err_nominal"], 3), ")")
                elif not e.get("usable"):
                    print("     ", e["date_avg"][:10], "unusable:", e.get("reason"))


def finalize(tid, cat, R):  # provisional; replaced below once verdict text is written
    return dict(verdict="inconclusive", summary="provisional run", numbers={}), list(GENERIC_LIMITS), {}
