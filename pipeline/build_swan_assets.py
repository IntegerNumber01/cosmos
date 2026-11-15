"""Build browser assets for the SWAN investigation (Time Travel + Evidence Inspector).

For each observation sequence (same OBSID block + detector):
  * reproject every frame onto ONE north-up TAN grid (6.15"/px) so background stars align,
  * subtract each frame's sigma-clipped sky level, apply one common asinh stretch per sequence,
  * write PNGs: frame images, difference (last - first), and a flag overlay (nearest-neighbour
    reprojected FLAGS; hardware/processing flags red, OUTLIER amber),
  * write JSON with real timestamps, OBSID, detector, WCS-WAVE wavelength, measured and
    predicted positions (kept separate), flags (names/descriptions from the FITS header),
    S/N, and links to the original FITS + the exact cutout URL.
Also writes the MOST predicted track (all 205 matches, PREDICTED ONLY) for the sky map.
Inputs: data/raw/swan/*.fits, data/work/swan_measurements.json, data/raw/most/swan_brief.txt
Output: web/public/data/swan/
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import matplotlib
import numpy as np
from astropy.io import ascii
from astropy.stats import sigma_clipped_stats
from astropy.wcs import WCS
from PIL import Image
from reproject import reproject_interp

from spherex_io import REJECT_FLAG_NAMES, load_l2

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/public/data/swan"
OUT.mkdir(parents=True, exist_ok=True)
M = json.loads((ROOT / "data/work/swan_measurements.json").read_text())
PIX = 6.15 / 3600.0
N = 112  # output grid size (px) ~ 11.5'

MAGMA = matplotlib.colormaps["magma"]
DIV = matplotlib.colormaps["RdBu_r"]


def grid_wcs(ra, dec, n=N):
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.cdelt = [-PIX, PIX]  # north up, east left
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]
    return w


def to_png(rgba: np.ndarray, path: Path):
    Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8)).transpose(Image.FLIP_TOP_BOTTOM).save(path, optimize=True)


def stretch(x, lo, hi, soft=0.08):
    t = np.clip((x - lo) / (hi - lo), 0, None)
    return np.clip(np.arcsinh(t / soft) / np.arcsinh(1 / soft), 0, 1)


frames_by_seq = defaultdict(list)
for f in M["frames"]:
    frames_by_seq[f["sequence"]].append(f)
seq_info = {s["sequence"]: s for s in M["sequences"]}

out_sequences = []
for seq, frs in sorted(frames_by_seq.items(), key=lambda kv: (min(f["mjd_avg"] for f in kv[1]), kv[0])):
    frs.sort(key=lambda f: f["mjd_avg"])
    ra_c = float(np.mean([f["meas"]["ra"] for f in frs]))
    de_c = float(np.mean([f["meas"]["dec"] for f in frs]))
    gw = grid_wcs(ra_c, de_c)
    sky, flagmaps, imgs = [], [], []
    for f in frs:
        im = load_l2(ROOT / "data/raw/swan" / f"{f['productid']}.fits")
        imgs.append(im)
        hard = 0
        outlier = 0
        for name, (m, _) in im.flag_defs.items():
            if name in REJECT_FLAG_NAMES and name != "OUTLIER":
                hard |= m
            if name == "OUTLIER":
                outlier |= m
        data = im.image.copy()
        bad = (im.flags & hard) != 0
        data[bad] = np.nan
        _, med, std = sigma_clipped_stats(data[np.isfinite(data)], sigma=3)
        arr, foot = reproject_interp((data - med, im.wcs), gw, shape_out=(N, N))
        fl, _ = reproject_interp((im.flags.astype(np.float64), im.wcs), gw, shape_out=(N, N), order="nearest-neighbor")
        fl = np.nan_to_num(fl).astype(np.int64)
        sky.append((arr, std))
        flagmaps.append((fl & hard != 0, fl & outlier != 0))
    stack = np.array([s[0] for s in sky])
    bg_std = float(np.median([s[1] for s in sky]))
    lo = -1.5 * bg_std
    hi = float(np.nanpercentile(stack, 99.85))
    seq_dir = OUT / seq
    seq_dir.mkdir(exist_ok=True)
    frame_out = []
    for k, (f, (arr, _), (hardm, outm), im) in enumerate(zip(frs, sky, flagmaps, imgs)):
        rgba = MAGMA(stretch(np.nan_to_num(arr, nan=lo), lo, hi))
        rgba[~np.isfinite(arr)] = [0.02, 0.02, 0.05, 1]
        to_png(rgba, seq_dir / f"f{k}.png")
        ov = np.zeros((N, N, 4))
        ov[hardm] = [1.0, 0.25, 0.3, 0.75]
        ov[outm & ~hardm] = [1.0, 0.78, 0.25, 0.55]
        to_png(ov, seq_dir / f"f{k}_flags.png")
        mx, my = (float(v) for v in gw.world_to_pixel_values(f["meas"]["ra"], f["meas"]["dec"]))
        px, py = (float(v) for v in gw.world_to_pixel_values(f["pred_mid"]["ra"], f["pred_mid"]["dec"]))
        sx, sy = (float(v) for v in gw.world_to_pixel_values(f["pred"]["ra"], f["pred"]["dec"]))
        flag_desc = {n: d for n, (_, d) in im.flag_defs.items()}
        frame_out.append(
            dict(
                index=k,
                productid=f["productid"],
                obsid=f["productid"][:-2],
                detector=f["detector"],
                date_avg=f["date_avg"],
                date_beg=im.header["DATE-BEG"],
                date_end=im.header["DATE-END"],
                mjd_avg=f["mjd_avg"],
                exposure_s=float(im.header["XPOSURE"]),
                wavelength_um=round(f["wavelength_um"], 4),
                bandwidth_um=round(f["bandwidth_um"], 4),
                png=f"/data/swan/{seq}/f{k}.png",
                flags_png=f"/data/swan/{seq}/f{k}_flags.png",
                # pixel coords in the shared grid (0-based, x right = west->east flipped: east is LEFT, y up = north)
                measured=dict(ra=f["meas"]["ra"], dec=f["meas"]["dec"], x=mx, y=my,
                              err_arcsec=float(np.hypot(f["meas"]["x_err"], f["meas"]["y_err"]) * 6.15),
                              snr=round(f["meas"]["snr"], 1)),
                predicted_mid=dict(ra=f["pred_mid"]["ra"], dec=f["pred_mid"]["dec"], x=px, y=py,
                                   note="MOST ephemeris evaluated at mid-exposure (DATE-AVG)"),
                predicted_most_row=dict(ra=f["pred"]["ra"], dec=f["pred"]["dec"], x=sx, y=sy, vmag=f["pred"]["vmag"],
                                        note="MOST table row (exposure START time)"),
                offset_mid_arcsec=round(f["offset_mid_arcsec"], 2),
                offset_along_cross_arcsec=[round(v, 2) for v in f["offset_mid_along_cross_arcsec"]],
                flags_in_aperture=[dict(name=n, description=flag_desc.get(n, ""),
                                        treatment=("informational" if n in ("SOURCE", "FULLSAMPLE") else
                                                   "kept for comet (moving objects trigger it)" if n == "OUTLIER" else
                                                   "rejected" if n in REJECT_FLAG_NAMES else "reported"))
                                   for n in f["flags_in_aperture"]],
                l2dqa=str(im.header.get("L2DQAFLG", "")),
                source_fits=f["source_url"],
                cutout_url=f["cutout_url"],
            )
        )
    diff = stack[-1] - stack[0]
    v = float(np.nanpercentile(np.abs(diff), 99.7))
    drgba = DIV(np.clip(0.5 + np.nan_to_num(diff) / (2 * v), 0, 1))
    to_png(drgba, seq_dir / "diff_last_first.png")
    s = seq_info[seq]
    det = frs[0]["detector"]
    out_sequences.append(
        dict(
            id=seq,
            obs_block=seq.rsplit("_", 1)[0],
            detector=det,
            n=len(frs),
            grid=dict(n=N, pixel_arcsec=6.15, center_ra=ra_c, center_dec=de_c, orientation="north up, east left"),
            wavelength_range_um=[frame_out[0]["wavelength_um"], frame_out[-1]["wavelength_um"]],
            date_first=frs[0]["date_avg"],
            date_last=frs[-1]["date_avg"],
            diff_png=f"/data/swan/{seq}/diff_last_first.png",
            diff_wavelength_gap_um=round(frame_out[-1]["wavelength_um"] - frame_out[0]["wavelength_um"], 4),
            diff_wavelength_gap_channels=round((frame_out[-1]["wavelength_um"] - frame_out[0]["wavelength_um"]) / np.mean([f["bandwidth_um"] for f in frame_out]), 1),
            measured_rate_arcsec_per_min=round(s["meas_rate_arcsec_per_min"], 2),
            measured_rate_err=round(s["meas_rate_err"], 2),
            measured_pa_err=round(s["meas_pa_err"], 1),
            predicted_rate_arcsec_per_min=round(s["pred_rate_arcsec_per_min"], 2),
            measured_pa_deg=round(s["meas_pa_deg"], 1),
            predicted_pa_deg=round(s["pred_pa_deg"], 1),
            measured_total_motion_arcsec=round(s["meas_total_motion_arcsec"], 1),
            span_minutes=round(s["span_minutes"], 2),
            median_offset_mid_arcsec=round(s["median_offset_mid_arcsec"], 2),
            star_control=dict(n_stars=s["star_control"]["n_stars"],
                              median_shift_arcsec=round(s["star_control"]["median_shift_arcsec"], 2),
                              max_shift_arcsec=round(s["star_control"]["max_shift_arcsec"], 2),
                              shifts_arcsec=s["star_control"]["shifts_arcsec"]),
            vacancy_ratio=round(s["vacancy_test"]["ratio_vacated_over_occupied"], 2),
            frames=frame_out,
        )
    )
    print("built", seq, len(frs), "frames")

# MOST predicted track (prediction only; one point per distinct exposure time)
t = ascii.read(ROOT / "data/raw/most/swan_brief.txt", format="ipac", guess=False)
seen = {}
for r in t:
    key = round(float(r["mjd_start"]), 4)
    if key not in seen:
        seen[key] = dict(mjd=float(r["mjd_start"]), date=str(r["start_date"]).strip(), ra=float(r["ra_obj"]),
                         dec=float(r["dec_obj"]), vmag=float(r["vmag"]), r_au=float(r["sun_dist"]), delta_au=float(r["geo_dist"]))
track = sorted(seen.values(), key=lambda d: d["mjd"])

case = dict(
    object=dict(name="C/2025 R2 (SWAN)", naif_id=1004092, type="Long-period comet"),
    data_release="SPHEREx DR1 (IRSA, doi:10.26131/IRSA678)",
    most=dict(service="IRSA MOST (Moving Object Search Tool)", catalog="spherex", query_window="2025-09-01 to 2026-03-01",
              n_matched_frames=len(t), n_distinct_times=len(track),
              note="MOST lists exposure START times; comparisons use the ephemeris evaluated at mid-exposure."),
    sequences=out_sequences,
    predicted_track=track,
    method=dict(
        detection="Peak search within 8 px of the prediction, then 2D Gaussian + planar background fit to the coma photocentre; position converted with each frame's own WCS.",
        alignment="Each sequence reprojected (bilinear) onto one north-up TAN grid at 6.15\"/px; field stars confirm alignment.",
        flags="Flag names/bits/descriptions read from each FITS FLAGS header (MSKN/MSKM/MSKD). Hardware/processing flags rejected; OUTLIER kept for the comet because the pipeline's multi-frame outlier detection fires on moving objects.",
        wavelength="Per-frame wavelength at the comet from the WCS-WAVE lookup table. SPHEREx's linear variable filter means every exposure is a different wavelength; frames are not combined into a spectrum.",
    ),
    verdict="Confirmed known-object match: the measured positions and times agree with the MOST prediction, the measured motion matches the predicted rate and direction, field stars are stationary, and the earlier position is vacated. This recovers a comet that was already known. It is not a discovery.",
)
(OUT / "case.json").write_text(json.dumps(case, indent=1))
print("wrote", OUT / "case.json")
