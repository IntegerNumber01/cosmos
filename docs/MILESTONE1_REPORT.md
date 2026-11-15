# COSMOS — Milestone 1: Can the real observations support the investigation?

**Date:** 2026-11-14 · **Verdict: GO. Gate 0 PASS. The investigation target is comet C/2025 R2 (SWAN), fallback #1 (the preferred option).**

## 1. What was tested and what happened

| Gate 0 item | Result | Evidence |
|---|---|---|
| Oct/Nov WISE 0855 D3 cutout | PASS: real FITS, 58×59 px | `data/raw/wise0855_oct2025_d3_cutout.fits` (OBSID 2025W46_1A_0075_4, **DATE-AVG 2025-11-10**) |
| FITS plane decode | PASS | IMAGE (MJy/sr), FLAGS, VARIANCE, ZODI, EPSF, WCS-WAVE. Flag names, bits and descriptions are **read from the FLAGS header** (MSKN/MSKM/MSKD cards). None are hard-coded. |
| WCS-WAVE wavelength lookup | PASS | The astropy alternate WCS `W` picks up the celestial SIP terms by default. We strip them (`sip=None`), or the wavelengths come out wrong. |
| MOST re-run, SWAN | PASS | 205 matched frames, Sep 2025 to Mar 2026. The brightest are 20 frames on Oct 27–28, 2025 (vmag 11.3–11.4). Later frames are vmag 14.5–15.5. |
| SWAN visible in pixels | **PASS** | Detected in **20/20** cutouts, aperture S/N 195–647 |
| SWAN motion measurable | **PASS** | See §2 |
| HiPS in browser | PASS (tiles + CORS) | `Access-Control-Allow-Origin: *`. Tiles are `Npix<N>_<frame>.png` with 0-based frames. Frame 50 returns 404 (blank dichroic channel), as documented. Aladin Lite 3.8.2 shows cube frames through `setFrequency`, the same method as IRSA's own landing page. |
| Gaia DR3 sample | PASS | 59,218 stars with measured parallaxes: 48,809 within 50 pc (ϖ/σ > 10) plus 11,719 bright stars with G < 6.5 (ϖ/σ > 5). |

## 2. SWAN: measured, not assumed

We fit each frame's coma photocentre on its own: a peak search within 8 px of the prediction, then a 2D Gaussian with a planar background. We convert that position to RA/Dec with the frame's own WCS. The MOST prediction is used only as a comparison.

| Sequence (detector, λ range) | Rate meas / pred (″/min) | PA meas / pred | Median offset from prediction | Field-star shift (control) | Flux left at vacated position |
|---|---|---|---|---|---|
| 0045 D1 (0.74–0.80 µm) | 9.92 / 10.04 | 62.9° / 63.6° | 2.3″ | 0.49″ | 21% |
| 0045 D4 (2.43–2.61 µm) | 9.77 / 10.04 | 62.1° / 63.6° | 2.9″ | 0.72″ | 39% |
| 0101 D2 (1.28–1.31 µm) | 9.81 / 9.89 | 63.2° / 63.4° | 2.8″ | 0.78″ | 51% |
| 0101 D5 (4.04–4.08 µm) | 10.11 / 9.89 | 65.3° / 63.4° | 8.5″ | 0.25″ | 42% |
| 0313 D1 (0.98–1.05 µm) | 9.10 / 9.21 | 62.9° / 62.7° | 2.3″ | 0.42″ | 14% |
| 0313 D4 (3.30–3.58 µm) | 9.71 / 9.21 | 63.2° / 62.7° | 2.9″ | 0.28″ | 8% |

- The comet moves 65–86″ (11–14 SPHEREx pixels) within each 6.5-minute, 4-exposure sequence. Over Oct 27 04:53 → Oct 28 10:21 UTC it moves about 4°.
- The median field-star shift per sequence is 0.25–0.78″, against 65–86″ of comet motion, so the motion is not a registration artifact. Individual stars can shift more (up to 12.6″), most likely blends or saturated stars.
- The difference images (`docs/figures/proof_*.png`) show the dipole: a negative imprint where the comet was and a positive one where it went. **Caveat (corrected 2026-11-14):** first and last exposures in a sequence are 3–4 channel widths apart in wavelength, so these differences mix time and colour. Stars cancel only approximately, and the images are used for position only.
- Measured position and time agree with the predicted location in every frame. Median offsets are 2.3–2.9″ (< 0.5 px) in detectors 1, 2 and 4; every frame there is within 0.85 px. Detector 5 sits at 8.5″ (1.4 px). **This meets the brief's "confirmed known-object match" bar. It is a recovery of a known comet, not a discovery.**

## 3. Scientific caveats we found (and how the app handles them)

1. **MOST timestamps are exposure START.** At ~10″/min, that is ~10″ (1.6 px) before mid-exposure. We compare against the prediction evaluated at `DATE-AVG`. Against the raw MOST row, the median offset is ~12″.
2. **The OUTLIER flag sits on the comet core in nearly every frame.** The pipeline's multi-frame outlier detector naturally fires on a moving object. For the comet aperture we keep OUTLIER pixels and still reject hardware flags (NONFUNC, SUR_ERROR, TRANSIENT, HOT, COLD, PERSIST, …). The Evidence Inspector shows this and explains it.
3. **A small residual along-track offset (~+2″) remains in detectors 1–4, and ~8″ in detector 5 (4.0 µm).** This is consistent with photocentre versus nucleus, or coma morphology at different wavelengths. We report it as measured and do not interpret it further.
4. **Each exposure is a different wavelength.** SPHEREx uses a linear variable filter, so within one sequence the comet moves across the filter: 0.744 → 0.798 µm in 6.5 min on D1. The app labels every frame with its own WCS-WAVE wavelength. **We do not present these frames as a spectrum.**
5. **The brief's WISE 0855 epoch pair is NOT a common-wavelength pair.** The target falls at **2.365 µm in May** and **1.629 µm in Nov**. Differencing those two frames would break a hard stop ("spectra from mismatched wavelength planes"), so they are not used for change detection.

## 4. Recommendation

- **Investigate target: C/2025 R2 (SWAN), Oct 27–28 2025.** Lead with sequence `2025W44_1A_0045` (D1 + D4: optical-edge and 2.5 µm views of the same 6.5 minutes). Add `0313` (Oct 28) and the multi-day track.
- **Time Travel:** the dated SWAN frames (minutes and days apart) are the defensible "change over time" story. A WISE 0855 May/Nov pair can appear only as a labelled, side-by-side "same sky, different date **and** wavelength" comparison, with no difference image.
- Fallbacks 2–5 are not needed.

## 5. Reproduce

```
python -m venv pipeline/.venv && pipeline/.venv/Scripts/pip install astropy numpy scipy reproject requests matplotlib pillow
# MOST (catalog=spherex, obj_name="C/2025 R2", obs 2025-09-01..2026-03-01, output_mode=Brief) -> data/raw/most/swan_brief.txt
python pipeline/fetch_swan.py      # 20 cutouts (Oct 27-28), verified FITS
python pipeline/swan_measure.py    # -> data/work/swan_measurements.json
python pipeline/proof_figure.py 2025W44_1A_0045_D1
python pipeline/fetch_gaia.py
```


## 6. Corrections after review (2026-11-14, evening)

- Motion fits now carry uncertainties (weighted fits; 0.5″ alignment allowance per point). Five of six detector sequences agree with the predicted speed within 2σ. The 28 Oct D4 sequence (3.30–3.58 µm) differs by 2.4σ (9.69 ± 0.20 vs 9.21″/min). This is reported, not explained. The six sequences come from 3 observation blocks, so they aren't independent.
- The Oct 2025 vs May 2026 comparison is now measured on native pixels, with empirical errors from 48 blank-sky apertures per frame: a change of 125–585× the empirical noise. The earlier "245σ" used resampled variance and is withdrawn. Nominal variance understated the difference-map scatter by 1.28–3.33×, so maps are rescaled by measured scatter and treated as indicators.
- Matched pairs differ by 0.004–0.014 µm (≤ 21% of a channel), not "within 0.004 µm".
