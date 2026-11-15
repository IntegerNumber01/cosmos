# COSMOS: The Infrared Universe Explorer

**Google Earth for the infrared universe.** NASA Space Apps Challenge 2026, *Planet X and SPHEREx*.

Enter any sky coordinates (or fly to a star) and COSMOS shows that patch of sky on every date NASA's SPHEREx imaged it, at a matched wavelength. Then it helps you find what changed and check whether it's already known.

| Mode | What you do | Data |
|---|---|---|
| **Time Travel** (`/timetravel`) | RA/Dec, or pick a star → every SPHEREx DR1 exposure of that spot → wavelength-matched dates → aligned playback, swipe, **Find changes** → measure → **is it known?** | SPHEREx DR1 Level-2 (IRSA SIA2 + IBE cutouts), Gaia DR3, SIMBAD, NASA/JPL Small-Body Identification |
| **Explore** (`/explore`) | Pan and zoom the whole sky in all 102 SPHEREx wavelengths (0.75–5 µm); "Time Travel here" | SPHEREx DR1 all-sky HiPS cube (doi:10.26131/IRSA679) |
| **Fly** (`/fly`) | Fly through 59,218 Gaia-measured stars; "Time Travel this star" | ESA Gaia DR3 |
| **Investigate** (`/investigate`) | Case files: comet C/2025 R2 (SWAN), plus the challenge's five test targets with validation records (`/validation`) | as above |

## How Time Travel works

1. `/api/observations` queries IRSA SIA2 (`spherex_dr1`) for every frame covering the position. It estimates the wavelength *at that position* on each frame from the footprint polygon and the detector's WCS-WAVE table. Validated against full WCS on 93 frames: median 3.3 px, max 7 px, which is about 0.001 µm.
2. Frames are grouped into **matched sets**: same detector, and every pair of dates within half a channel in wavelength (members within ±¼ channel of the centre). One frame per day.
3. `/api/cutout` fetches each IBE cutout server-side (IRSA sends no CORS headers), parses the FITS in TypeScript, and returns IMAGE/FLAGS/VARIANCE plus WCS (~60 kB instead of 4 MB). Exact wavelengths are recomputed from each header, and frames outside the tolerance are excluded and listed.
4. The browser reprojects frames onto one north-up grid **for display**. Find changes uses a common valid-pixel mask, and its noise scale is the *measured* robust scatter of the difference image (labelled indicative, not a calibrated probability).
5. Measurements (aperture photometry, centroids) run on each frame's **native pixels**. Errors are empirical, from blank-sky control apertures, plus a stated 0.5″ alignment allowance on positions. Apertures dominated by flagged pixels (e.g. saturation) report *no measurement*.
6. `/api/known` checks Gaia DR3 (propagated to the epoch), SIMBAD (propagated from J2000), and NASA/JPL small bodies at the time the object was visible.

The TypeScript FITS/WCS/wavelength code matches astropy to 4e-10″ in position and 4e-7 µm in wavelength (`web/scripts/check-wcs.ts`). Featured targets ship a prepared cache, byte-identical to the live API output (`web/scripts/build-cache.ts`), so demos work if the archive is unreachable.

## Comet SWAN case file (verified, reproducible)

- Detected in **20/20** MOST-matched frames (27–28 Oct 2025), at S/N 195–647.
- Motion was measured in 6 detector sequences from 3 observation blocks; detector pairs share exposures, so these aren't 6 independent measurements. Five of six speeds agree with the prediction within 2σ (±0.15–0.53″/min). One differs by 2.4σ, which we report as unexplained. All directions agree within 2°.
- Median field-star shift per sequence is 0.25–0.78″; individual stars move up to 12.6″ (likely blends or saturated stars).
- On 1 May 2026 the comet's 27 Oct position is empty. That comparison uses the same detector, with wavelengths 0.004–0.014 µm apart (≤ 21% of a channel). The aperture change is 125–585× the empirical noise, measured on native pixels.
- Difference images *within* a sequence span several channel widths. They're labelled as mixed-wavelength and used for position only.
- **A confirmed known-object match, not a discovery.** Details: [docs/MILESTONE1_REPORT.md](docs/MILESTONE1_REPORT.md), and the in-app case file.

## Validation on the challenge targets

| Target | Verdict | Key result |
|---|---|---|
| Epsilon Indi B | **confirmed** | 4.42–4.86″ of proper motion in a year against 4.68–4.77″ predicted (13.9–15.6σ), in 3 wavelength sets |
| RW Aurigae | **confirmed** | Brightened by Δm = −0.53 ± 0.06 mag at 0.744 µm (2025-09-02 → 2026-03-08) |
| WISE 0855−0714 | **consistent** | Detected only by stacking (S/N 8.1 at 4.22 and 4.37 µm); motion matches but only ~2σ |
| Barnard's Star | **unreliable** | Saturated in every channel (a halo-only fit shows the expected motion; not counted) |
| R Draconis | **unreliable** | Saturated in every channel |

Thresholds were fixed before looking at results. Details: [docs/VALIDATION.md](docs/VALIDATION.md), `/validation`, `pipeline/validate_targets.py`. The live Time Travel tool independently reproduces the Epsilon Indi B motion (4.7″ ± 0.7″ against 4.7″) and the RW Aur brightening (+62%). Regression script: `pipeline/tools/e2e.py`.

## Run locally

```bash
cd web
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
```

Deploy on Vercel with `web/` as the project root. The API routes need the Node.js runtime (60 s limit is enough).

## Rebuild the data (Python 3.12)

```bash
python -m venv pipeline/.venv
pipeline/.venv/Scripts/pip install astropy numpy scipy reproject requests matplotlib pillow astropy-healpix
python pipeline/fetch_swan.py && python pipeline/swan_measure.py && python pipeline/build_swan_assets.py
python pipeline/timetravel_select.py 1,4 && python pipeline/build_timetravel.py
python pipeline/fetch_gaia.py && python pipeline/build_gaia_assets.py
python pipeline/export_wave_tables.py     # WCS-WAVE tables for the TypeScript engine (verified vs astropy)
python pipeline/validate_targets.py       # five challenge targets
cd web && npx tsx scripts/check-wcs.ts && npx tsx scripts/build-cache.ts
```

## Honesty rules the app follows

- SPHEREx records no depth per pixel, so 3D comes only from Gaia distances. The infrared backdrop in Fly is drawn at infinity.
- The all-sky cube is time-averaged, so Time Travel uses dated Level-2 frames only.
- Frames are compared only at matched wavelengths. Cross-wavelength differences are labelled position-only.
- Predictions (MOST, Gaia proper motion) are always drawn separately from measurements.
- Flag meanings are read from each FITS header. Flagged apertures report no value rather than a wrong one.
- Significance maps are scaled by their measured scatter and called indicators, not probabilities.
- No discovery claims. "No catalogue match" is never presented as a discovery.

Acknowledgements: SPHEREx (NASA/JPL/Caltech-IPAC) data from NASA/IPAC IRSA; ESA Gaia DR3 (DPAC); SIMBAD (CDS); NASA/JPL SSD Small-Body Identification API; Aladin Lite (CDS). COSMOS is an independent Space Apps project, not an official NASA or ESA product.
