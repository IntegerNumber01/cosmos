"""Compose result + limitations from measured numbers (no hand-entered results)."""
from __future__ import annotations

import json

import numpy as np

from .common import RAW
from .verdict import CHI2_3SIG_2DOF, detected_frame, detection_table, fmt, frame_ok, motion_sets, motion_verdict, variability_sets

GENERIC_LIMITS = [
    "SPHEREx pixels are 6.15\"; positions come from a Gaussian PSF fit, not the pipeline EPSF, so absolute centroids can carry "
    "sub-pixel PSF-model bias. It largely cancels between matched-wavelength frames of the same detector, and the Gaia field-star "
    "floor measures what is left.",
    "Per detector, at most two matched sets were measured: the one with the most visits and the one with the longest baseline. For "
    "variable stars the shortest-wavelength D1 set was added. Other matched sets exist (see observations_examined.matched_set_candidates).",
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
        fe = m.get("forced_epsf_deblended")
        if fe:
            print(f"      epsf flux={fe['flux']:.4f} errN={fe['err_nominal']:.4f} errE={fmt(fe['err_empirical'],4)} snrE={fmt(fe['snr_empirical'],1)} "
                  f"nb={[(n['g'] and round(n['g'],1), round(n['sep_arcsec'],1), round(n['flux'],4)) for n in fe['neighbours']]} corr={fmt(fe['corr_target_neighbour'])} "
                  f"leak(n={fe['leak_control']['n']}, med={fmt(fe['leak_control']['median'],4)}, sd={fmt(fe['leak_control']['robust_std'],4)}) "
                  f"free={'ok' if (fe.get('free_fit') or {}).get('ok') else 'x'} snrF={fmt((fe.get('free_fit') or {}).get('flux',0)/max((fe.get('free_fit') or {}).get('flux_err',1e9),1e-9),1)}")
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
        ms = s.get("motion_saturated_supplementary") or {}
        if ms.get("measured_displacement_arcsec") is not None:
            print("   SATSUPP meas", fmt(ms["measured_displacement_E"]), fmt(ms["measured_displacement_N"]), "pred", fmt(ms["predicted_displacement_E"]),
                  fmt(ms["predicted_displacement_N"]), "sig", fmt(ms["displacement_sigma_axis_arcsec"]), "resid", fmt(ms["residual_E"]), fmt(ms["residual_N"]))
            for v in ms.get("visits", []):
                print("     satvisit", v["date"][:10], "offE", fmt(v["offset_from_pred_E"]), "offN", fmt(v["offset_from_pred_N"]))
        for v in mo.get("visits", []):
            print("     visit", v["date"][:10], v["n_frames"], "offE", fmt(v["offset_from_pred_E"]), "offN", fmt(v["offset_from_pred_N"]),
                  "sig", fmt(v["sigma_axis_arcsec"]), "within", fmt(v["within_visit_rms_arcsec"]))
        me_ = s.get("motion_free_epsf") or {}
        if me_:
            print("   FREE-EPSF motion: used", me_["n_frames_used"], "meas", fmt(me_.get("measured_displacement_E")), fmt(me_.get("measured_displacement_N")),
                  "pred", fmt(me_.get("predicted_displacement_E")), fmt(me_.get("predicted_displacement_N")), "sig", fmt(me_.get("displacement_sigma_axis_arcsec")),
                  "chi2(pred)", fmt(me_.get("residual_chi2_2dof"), 1), "chi2(stationary)", fmt(me_.get("stationary_chi2_2dof"), 1),
                  "track chi2/dof", fmt(me_.get("track_chi2"), 1), me_.get("track_dof"))
            for v in me_.get("visits", []):
                print("      fv", v["date"], v["n"], "offE", fmt(v["offset_from_pred_E"]), "offN", fmt(v["offset_from_pred_N"]), "sig", fmt(v["sigma_axis_arcsec"]))
        fc = s.get("forced_epsf_combined")
        if fc:
            print("   FORCED-EPSF combined n=%d flux=%.4f +- %.4f  snrE=%.1f snrN=%.1f chi2const=%.1f" % (fc["n"], fc["flux_wmean"], fc["err_empirical"], fc["snr_empirical"], fc["snr_nominal"], fc["chi2_constant"]))
        if ph:
            print("   phot ok", ph.get("ok"), ph.get("reason", ""), "nref", ph.get("n_reference_stars"), "complete", ph.get("target_aperture_complete_all_epochs"),
                  "missing", ph.get("target_missing_px"), "cands", ph.get("reference_candidates_per_frame"), "maskfrac", [fmt(x) for x in ph.get("common_mask_fraction_masked", [])], ph.get("reference_rejections_per_frame", [None])[0], "refscatter", [fmt(x, 3) for x in ph.get("reference_dm_robust_scatter_mag", [])])
            for e in ph.get("epochs", []):
                if e.get("usable") and "dmag_vs_first" in e:
                    print("     ", e["date_avg"][:10], "dm", fmt(e["dmag_vs_first"], 3), "+-", fmt(e["dmag_err_empirical"], 3), "(nom", fmt(e["dmag_err_nominal"], 3), ")")
                elif not e.get("usable"):
                    print("     ", e["date_avg"][:10], "unusable:", e.get("reason"))


# ---------------------------------------------------------------- finalize

def r2(x, nd=2):
    return None if x is None else round(float(x), nd)


def per_detector_detection(R):
    out = {}
    seen = set()
    for m in R["measurements"]:
        if (m["obsid"], m["detector"]) in seen:
            continue
        seen.add((m["obsid"], m["detector"]))
        d = out.setdefault(m["detector"], dict(n_frames=0, n_detected=0, n_saturated_or_core_rejected=0, snr_empirical=[], wavelengths_um=[]))
        d["n_frames"] += 1
        d["n_detected"] += int(detected_frame(m))
        d["n_saturated_or_core_rejected"] += int(not frame_ok(m))
        d["snr_empirical"].append(r2((m["flux"] or {}).get("snr_empirical"), 1))
        d["wavelengths_um"].append(r2(m["wavelength_um"], 4))
    return dict(sorted(out.items()))


MOTION_KEYS = ("lam", "baseline_days", "n_visits", "measured_displacement_E", "measured_displacement_N", "measured_displacement_arcsec",
               "predicted_displacement_E", "predicted_displacement_N", "predicted_displacement_arcsec", "displacement_sigma_axis_arcsec",
               "residual_E", "residual_N", "residual_arcsec", "significance_of_motion_sigma", "residual_chi2_2dof", "measured_pa_deg", "predicted_pa_deg")


def motion_numbers(r):
    d = dict(set_id=r["detector"])
    d.update({k: r2(r.get(k), 3) for k in MOTION_KEYS})
    return d


def saturated_supplement(R):
    rows = []
    for s in R["set_results"]:
        ms = s.get("motion_saturated_supplementary") or {}
        if ms.get("measured_displacement_arcsec") is None:
            continue
        rows.append(dict(set_id=s["set_id"], lam=r2(s["lambda_ref_um"], 4), baseline_days=r2(ms["baseline_days"], 1),
                         measured_E=r2(ms["measured_displacement_E"]), measured_N=r2(ms["measured_displacement_N"]),
                         predicted_E=r2(ms["predicted_displacement_E"]), predicted_N=r2(ms["predicted_displacement_N"]),
                         residual_E=r2(ms["residual_E"]), residual_N=r2(ms["residual_N"]), formal_sigma_axis=r2(ms["displacement_sigma_axis_arcsec"])))
    if not rows:
        return None
    rE = np.array([r["residual_E"] for r in rows])
    rN = np.array([r["residual_N"] for r in rows])
    meas = np.array([np.hypot(r["measured_E"], r["measured_N"]) for r in rows])
    pred = np.array([np.hypot(r["predicted_E"], r["predicted_N"]) for r in rows])
    scat = float(np.sqrt((np.std(rE, ddof=1) ** 2 + np.std(rN, ddof=1) ** 2) / 2)) if len(rows) > 1 else None
    return dict(method="SUPPLEMENTARY, NOT USED FOR THE VERDICT: Gaussian fit to unflagged PSF wings with the saturated core and BLOOM pixels masked",
                sets=rows, n_sets=len(rows), mean_residual_E=r2(rE.mean()), mean_residual_N=r2(rN.mean()),
                cross_set_residual_scatter_axis_arcsec=r2(scat), measured_range_arcsec=[r2(meas.min()), r2(meas.max())],
                predicted_range_arcsec=[r2(pred.min()), r2(pred.max())],
                median_formal_sigma_axis=r2(np.median([r["formal_sigma_axis"] for r in rows])),
                note="D1/D4, D2/D5 and D3/D6 are exposed simultaneously (same OBSID), so sets from paired detectors are not fully independent.")


def finalize(tid, cat, R):
    from .common import TARGETS
    ttype = TARGETS[tid]["test_type"]
    lim = list(GENERIC_LIMITS)
    numbers = dict(n_sia2_frames=R["obs"]["n_sia2_frames"], n_matched_sets_measured=len(R["set_results"]),
                   n_cutouts_measured=len({(m["obsid"], m["detector"]) for m in R["measurements"]}))
    det_tab = per_detector_detection(R)
    numbers["per_detector"] = det_tab
    extra = {}
    if ttype in ("proper_motion", "detection_and_motion"):
        rows = motion_sets(R, need_detection=True)
        extra["motion_set_table"] = [dict(motion_numbers(r), usable=r["usable"], clean=r["clean"], detected_all=r["detected_all"]) for r in rows]
        mv, use = motion_verdict(rows)
        n_sat = sum(1 for r in rows if not r["clean"])
        any_det = any(d["n_detected"] for d in det_tab.values())
        supp = saturated_supplement(R)
        if supp:
            numbers["saturated_core_supplement"] = supp
        if mv:
            p = mv["primary"]
            numbers["primary_set"] = motion_numbers(p)
            numbers["n_usable_sets"] = mv["n_usable_sets"]
            numbers["n_usable_sets_consistent"] = mv["n_sets_consistent"]
            numbers["usable_sets"] = [motion_numbers(r) for r in use]
            verdict = mv["verdict"]
            summ = (f"In the {p['detector'].split('/')[0]} set at {p['lam']:.3f} µm ({p['baseline_days']:.0f}-day baseline) the target moved "
                    f"{p['measured_displacement_arcsec']:.2f}\" (±{p['displacement_sigma_axis_arcsec']:.2f}\" per axis) against "
                    f"{p['predicted_displacement_arcsec']:.2f}\" predicted; residual {p['residual_arcsec']:.2f}\" "
                    f"(motion {p['significance_of_motion_sigma']:.1f}σ; {mv['n_sets_consistent']}/{mv['n_usable_sets']} usable sets consistent).")
        elif rows and n_sat == len(rows):
            verdict = "unreliable"
            summ = "Saturated (OVERFLOW, core pixels rejected) in every matched set examined, so no calibrated position can be measured."
            if supp:
                summ += (f" A supplementary wings-only fit (not used for the verdict) gives {supp['measured_range_arcsec'][0]}–{supp['measured_range_arcsec'][1]}\" "
                         f"displacements vs {supp['predicted_range_arcsec'][0]}–{supp['predicted_range_arcsec'][1]}\" predicted in {supp['n_sets']} sets "
                         f"(cross-set residual scatter {supp['cross_set_residual_scatter_axis_arcsec']}\" per axis).")
        elif not any_det:
            verdict = "not_detected"
            summ = "Not detected (empirical S/N ≥ 5, point-like, within 1 px of prediction) in any measured frame."
        else:
            verdict = "inconclusive"
            summ = "Detected in some frames, but no matched multi-epoch set has a clean detection in every epoch."
    else:
        rows = variability_sets(R)
        extra["variability_set_table"] = rows
        use = [r for r in rows if r["usable"]]
        numbers["usable_sets"] = use
        if not use:
            if rows and all(not r["clean"] for r in rows):
                verdict = "unreliable"
                summ = "Saturated or core pixels rejected in every matched set examined, so the flux cannot be measured reliably."
            else:
                verdict = "inconclusive"
                summ = "No matched set gave a complete, unsaturated target aperture with ≥3 reference stars in every epoch."
        else:
            best = max(use, key=lambda r: r.get("max_sig", 0))
            numbers["most_significant_change"] = dict(set_id=best["detector"], lam=r2(best["lam"], 4), dmag=r2(best.get("max_dmag"), 3),
                                                      err_empirical=r2(best.get("max_err"), 3), significance=r2(best.get("max_sig"), 1),
                                                      date=best.get("max_date"))
            n5 = sum(1 for r in use if r.get("max_sig", 0) >= 5)
            numbers["n_usable_sets"] = len(use)
            numbers["n_sets_change_ge_5sigma"] = n5
            from .checks import variability_method_check
            mchk = []
            for r in use:
                mo = next(m for m in R["matched_out"] if m["set_id"] == r["detector"])
                c = variability_method_check(tid, cat, r["detector"], [f["obsid"] for f in mo["frames"]], int(r["detector"][1]))
                if c:
                    mchk.append(c)
            extra.setdefault("checks", {})["method_robustness"] = mchk
            if n5 >= 1:
                verdict = "confirmed"
                summ = (f"Brightness change detected: Δm = {best['max_dmag']:+.3f} ± {best['max_err']:.3f} mag ({best['max_sig']:.0f}σ empirical) at "
                        f"{best['lam']:.3f} µm by {best['max_date']} relative to the first epoch of the same matched set; {n5}/{len(use)} usable sets show ≥5σ changes.")
                mc = next((c for c in mchk if c["set_id"] == best["detector"]), None)
                if mc:
                    alt = [e for e in mc["epochs"] if e["date"] == best["max_date"]]
                    if alt:
                        lo = min(best["max_dmag"], alt[0]["dmag_epsf_all"], alt[0]["dmag_epsf_excl_peak"])
                        hi = max(best["max_dmag"], alt[0]["dmag_epsf_all"], alt[0]["dmag_epsf_excl_peak"])
                        numbers["dmag_range_across_methods"] = [r2(lo, 3), r2(hi, 3)]
                        summ += (f" EPSF re-fits (all pixels / peak pixel excluded) give {alt[0]['dmag_epsf_all']:+.2f} / {alt[0]['dmag_epsf_excl_peak']:+.2f} mag, "
                                 "so the change does not depend on the method.")
            elif all(r.get("max_sig", 0) < 3 for r in use):
                verdict = "not_detected"
                summ = (f"No brightness change detected: largest |Δm| = {best.get('max_abs_dmag', 0):.3f} ± {best.get('max_err', 0):.3f} mag "
                        f"in {len(use)} usable matched set(s).")
                extra["verdict_meaning"] = "variability not detected (the target itself is measured)"
            else:
                verdict = "inconclusive"
                summ = f"Largest change Δm = {best['max_dmag']:+.3f} ± {best['max_err']:.3f} mag ({best['max_sig']:.1f}σ), below the 5σ threshold."
    lim += TARGET_LIMITS.get(tid, [])
    if tid == "wise0855":
        chk = wise0855_checks(cat, R)
        extra["checks"] = chk
        numbers["deblended_forced_photometry_by_set"] = chk["deblended_forced_photometry_by_set"]
        best = max(chk["deblended_forced_photometry_by_set"], key=lambda r: r["snr_empirical"] if r["snr_empirical"] is not None else -99, default=None)
        if verdict == "not_detected" and best:
            # No single frame passes the per-frame detection test, so use the pre-set stack criteria:
            #   detection  = deblended forced-EPSF stack S/N_emp >= 5 within a matched set
            #   sanity     = no stack at < 3.5 um exceeds |S/N| = 3 (a Y dwarf must be invisible there)
            #   motion     = free-position EPSF displacement within the same set: consistent if chi2(pred) < 11.83,
            #                significant only if a stationary source is rejected at >= 5 sigma (chi2 >= 28.7 for 2 dof)
            ss = chk.get("stationary_source_near_prediction")
            sets = chk["deblended_forced_photometry_by_set"]
            short = [r for r in sets if r["lam"] < 3.5]
            det_sets = [r for r in sets if (r["snr_empirical"] or 0) >= 5]
            sane = all(abs(r["snr_empirical"] or 0) < 3 for r in short)
            mot = []
            for s in R["set_results"]:
                mf = s.get("motion_free_epsf") or {}
                if any(d["set_id"] == s["set_id"] for d in det_sets) and mf.get("residual_chi2_2dof") is not None:
                    mot.append(dict(set_id=s["set_id"], lam=r2(s["lambda_ref_um"], 4), n_frames_used=mf["n_frames_used"], baseline_days=r2(mf["baseline_days"], 1),
                                    measured_E=r2(mf["measured_displacement_E"]), measured_N=r2(mf["measured_displacement_N"]),
                                    predicted_E=r2(mf["predicted_displacement_E"]), predicted_N=r2(mf["predicted_displacement_N"]),
                                    sigma_axis=r2(mf["displacement_sigma_axis_arcsec"]), chi2_vs_predicted=r2(mf["residual_chi2_2dof"]),
                                    chi2_vs_stationary=r2(mf["stationary_chi2_2dof"]),
                                    max_visit_offset_from_track_arcsec=r2(max(np.hypot(v["offset_from_pred_E"], v["offset_from_pred_N"]) for v in mf["visits"])),
                                    visit_sigma_range_arcsec=[r2(min(v["sigma_axis_arcsec"] for v in mf["visits"])), r2(max(v["sigma_axis_arcsec"] for v in mf["visits"]))]))
            numbers["stack_detection_sets"] = det_sets
            numbers["short_wavelength_sanity_pass"] = sane
            numbers["free_epsf_motion"] = mot
            if not det_sets:
                summ = ("Not detected. At 0.9–2.4 µm the only source near the prediction is a stationary G = 16.3 Gaia star"
                        + (f" ({ss['separation_from_gaia_arcsec']}\" from Gaia DR3 {ss['nearest_gaia_dr3']})" if ss else "")
                        + f"; at WISE 0855's own wavelengths the best stack gives S/N = {best['snr_empirical']} at {best['lam']} µm, below 5.")
            elif not sane:
                verdict = "inconclusive"
                summ = "The stacked forced photometry shows signal, but also at short wavelengths where a Y dwarf must be invisible, so contamination cannot be ruled out."
            else:
                cons = [m for m in mot if m["chi2_vs_predicted"] < CHI2_3SIG_2DOF]
                sig5 = [m for m in cons if m["chi2_vs_stationary"] >= 28.74]
                verdict = "confirmed" if sig5 else ("consistent" if cons else "inconclusive")
                lamtxt = " and ".join(f"{r['lam']:.2f}" for r in det_sets)
                m0 = min(cons, key=lambda m: m["sigma_axis"]) if cons else None
                summ = (f"Detected only by stacking: deblended forced-PSF photometry gives S/N = {', '.join(str(r['snr_empirical']) for r in det_sets)} "
                        f"in independent matched sets at {lamtxt} µm, and nothing at 0.94–3.3 µm, as expected for a Y dwarf.")
                if m0:
                    summ += (f" Free-position fits sit on the predicted track (offsets ≤ {m0['max_visit_offset_from_track_arcsec']}\"); the measured shift "
                             f"({np.hypot(m0['measured_E'], m0['measured_N']):.1f}\" ± {m0['sigma_axis']}\" per axis over {m0['baseline_days']:.0f} d) matches the "
                             f"{np.hypot(m0['predicted_E'], m0['predicted_N']):.1f}\" predicted, but a stationary source is rejected only weakly "
                             f"(χ² = {m0['chi2_vs_stationary']}, 2 dof).")
    return dict(verdict=verdict, summary=summ, numbers=numbers), lim, extra


# ---------------------------------------------------------------- target-specific notes and checks

TARGET_LIMITS = {
    "barnard": [
        "Barnard's Star (K ≈ 4.5) is saturated in every measured matched set from 0.75 to 4.8 µm: OVERFLOW, SUR_ERROR and BLOOM flags "
        "on the core, with 4–9 pixels within 1.5 px rejected. The rules require declaring this unreliable instead of fitting a clipped PSF.",
        "The supplementary wings-only displacement is NOT calibrated: unsaturated Gaia stars cannot calibrate a clipped-core centroid, and "
        "the field holds too few comparably saturated stars. Its cross-set scatter is the only empirical precision estimate.",
    ],
    "wise0855": [
        "WISE 0855 is a ~250 K Y dwarf: undetectable by SPHEREx below ~3.5 µm and brightest at 4.5–5 µm (D6), where single 112-s "
        "exposures are shallow.",
        "A G = 16.3 Gaia DR3 field star (5756956644387831296) lies 2.6–11\" from WISE 0855's track during DR1 (0.4–1.8 SPHEREx pixels). "
        "At 0.9–2.4 µm it is the only source detected near the prediction, and it is stationary. Near 4.8 µm it is blended with WISE 0855, "
        "so WISE 0855's flux there depends on the simultaneous EPSF fit (target and star at fixed catalogue positions).",
        "WISE 0855 is not in Gaia. Its astrometry is the SIMBAD compilation (Kirkpatrick et al. 2021; position at epoch J2000.0, no "
        "position error listed). Propagated to the AllWISE epoch it agrees with the source's AllWISE designation to ~1\".",
        "Only per-set stacks of ≤5 frames at a single matched wavelength are combined. A deeper all-channel D6 stack was not attempted "
        "because it would mix wavelengths.",
    ],
    "epsindib": [
        "eps Ind Ba/Bb (T1+T6, separation < 1\") is unresolved at 6.15\"/px. Gaia DR3 measures the photocentre (RUWE 4.3), which orbital "
        "motion perturbs. This plausibly explains the constant ~0.5\" southward offset between our absolute positions and the Gaia-propagated "
        "prediction; the epoch-to-epoch displacement test is insensitive to a constant offset.",
        "eps Ind A (V = 4.7) lies 6.7' away. HALO-type flags appear at the target in a few frames, and frames with rejected core pixels "
        "are excluded.",
        "The D5/D6 sets have fewer than 5 usable Gaia astrometric reference stars per frame, so they are excluded from the motion test.",
    ],
    "rwaur": [
        "RW Aur A+B (1.4\" apart) are blended into one SPHEREx source, so any variability refers to the combined light.",
        "RW Aur is saturated (OVERFLOW on the core) in every measured set from 0.86 to 5 µm. Only the shortest-wavelength D1 set (0.744 µm) "
        "is clean, so the variability result rests on ONE matched pair of epochs (2025-09-02 vs 2026-03-08).",
        "Only 4 reference stars survive the isolation, S/N and common-mask cuts, so the empirical reference scatter (0.063 mag) is itself "
        "uncertain. The 0.53 mag change exceeds it by 8x, and the reference ensemble changed by only 0.2% between epochs.",
        "In the first epoch the peak pixel reads 40.00 MJy/sr, carrying only the informational SOURCE flag. A cap was ruled out: no other "
        "unflagged ~40.0 pixel exists among 163 cutouts, and an EPSF fit excluding that pixel predicts 36.6 there (not more). Excluding it "
        "changes Δm from −0.52 to −0.44 mag.",
        "The mildly saturated 0.86 and 1.27 µm sets also show higher S/N in March 2026 than in September 2025, consistent with brightening. "
        "They are NOT used quantitatively.",
        "RW Aur sits in Taurus-Auriga nebulosity, so local-annulus backgrounds may carry structured emission.",
    ],
    "rdra": [
        "R Dra is heavily saturated in every measured matched set: OVERFLOW, SUR_ERROR and BLOOM on the core, 6–9 core pixels rejected, and "
        "about a quarter of the cutout lost under the common mask. No calibrated flux is possible.",
        "Measuring this Mira's ~246-day near-IR variability with SPHEREx would need PSF-wing photometry calibrated on comparably saturated "
        "stars, or the mission's own bright-star treatment. That is outside the rules applied here.",
    ],
}


def wise0855_checks(cat, R):
    """Identify the stationary source seen near WISE 0855 and check the catalogue position vs the AllWISE designation."""
    from astropy.table import Table
    from astropy.time import Time

    from .common import fcol, offsets_arcsec, propagate
    out = {}
    pts = [m["measured"] for m in R["measurements"] if m.get("measured") and m["detector"] in ("D1", "D2", "D3")]
    if pts:
        w = np.array([1 / p["sigma_axis_arcsec"] ** 2 for p in pts])
        ra = float(np.sum(np.array([p["ra"] for p in pts]) * w) / w.sum())
        dec = float(np.sum(np.array([p["dec"] for p in pts]) * w) / w.sum())
        dE, dN = offsets_arcsec([p["ra"] for p in pts], [p["dec"] for p in pts], ra, dec)
        g = Table.read(RAW / "wise0855" / "gaia_field.ecsv")
        t = Time("2025-11-01")
        gra, gdec = propagate(np.array(g["ra"]), np.array(g["dec"]), fcol(g, "pmra"), fcol(g, "pmdec"),
                              fcol(g, "parallax"), 2016.0, t)
        sep = np.hypot(*offsets_arcsec(gra, gdec, ra, dec))
        k = int(np.argmin(sep))
        out["stationary_source_near_prediction"] = dict(
            n_frames=len(pts), detectors="D1-D3 (0.94-2.39 um)", mean_ra=ra, mean_dec=dec, rms_E_arcsec=r2(np.std(dE)), rms_N_arcsec=r2(np.std(dN)),
            nearest_gaia_dr3=int(g["source_id"][k]), gaia_g=r2(g["phot_g_mean_mag"][k]), gaia_pm_mas_yr=[r2(g["pmra"][k]), r2(g["pmdec"][k])],
            separation_from_gaia_arcsec=r2(sep[k]),
            interpretation="A stationary ordinary star (Gaia G=16.3). WISE 0855 cannot be detected at these wavelengths, and its predicted track moves ~8\"/yr past this star.")
    a = cat["astrometry"]
    ra10, de10 = propagate(a["ra"], a["dec"], a["pmra"], a["pmdec"], 0.0, a["epoch_jyear"], Time(2010.5, format="jyear"))
    des_ra = (8 + 55 / 60 + 10.74 / 3600) * 15  # AllWISE designation WISEA J085510.74-071442.5 (truncated, epoch ~2010.5)
    des_dec = -(7 + 14 / 60 + 42.5 / 3600)
    dE, dN = offsets_arcsec(float(ra10), float(de10), des_ra, des_dec)
    out["catalogue_vs_allwise_designation"] = dict(propagated_to_jyear=2010.5, offset_E_arcsec=r2(dE), offset_N_arcsec=r2(dN),
                                                   note="designation coordinates are truncated and the AllWISE mean epoch is approximate; ~1\" agreement is expected")
    sets = []
    for s in R["set_results"]:
        fc = s.get("forced_epsf_combined")
        if fc:
            sets.append(dict(set_id=s["set_id"], lam=r2(s["lambda_ref_um"], 4), n=fc["n"], flux_wmean_mjysr=r2(fc["flux_wmean"], 4),
                             err_empirical=r2(fc["err_empirical"], 4), snr_empirical=r2(fc["snr_empirical"], 1), snr_nominal=r2(fc["snr_nominal"], 1),
                             chi2_constant=r2(fc["chi2_constant"], 1)))
    out["deblended_forced_photometry_by_set"] = sets
    return out
