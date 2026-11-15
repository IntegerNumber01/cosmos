# COSMOS: The Infrared Universe Explorer

**Google Earth for the infrared universe.** NASA Space Apps Challenge 2026: *Planet X and SPHEREx*.

COSMOS makes real NASA SPHEREx observations explorable by anyone. You don't need astronomy software.

| Mode | What you do | Data |
|---|---|---|
| **Explore** (`/explore`) | Pan and zoom the whole sky, and sweep through all 102 SPHEREx wavelengths (0.75–5 µm) | SPHEREx DR1 all-sky HiPS cube (IRSA, doi:10.26131/IRSA679) |
| **Fly** (`/fly`) | Fly through 59,218 stars placed in 3D by measured parallaxes, and inspect any star's distance ± uncertainty | ESA Gaia DR3 |
| **Time Travel** (`/investigate`, step 3) | Swipe between the same patch of sky on 27 Oct 2025 and 1 May 2026, matched in wavelength | SPHEREx DR1 Level-2 images (doi:10.26131/IRSA678) |
| **Investigate** (`/investigate`) | Follow comet C/2025 R2 (SWAN) from orbit prediction to pixels, measurements, controls and a verdict | SPHEREx DR1 Level-2 + IRSA MOST |

## Key results (verified, reproducible)

- SWAN is detected in **20/20** MOST-matched frames (27–28 Oct 2025), at S/N 195–647.
- Measured motion is 9.1–10.1″/min against 9.2–10.0″/min predicted, with direction within 2°, across 6 sequences and 4 detectors. Field stars stay fixed to < 0.8″.
- On 1 May 2026, at a wavelength matched within 0.004 µm, the comet's 27 Oct position is empty (flux falls by > 99%, a change of 245σ or more).
- This is a **confirmed known-object match, not a discovery.** Details: [docs/MILESTONE1_REPORT.md](docs/MILESTONE1_REPORT.md) and the in-app *Data & Method* page.

## Run locally

```bash
cd web
npm install
npm run dev          # http://localhost:3000
npm run build        # static export -> web/out (deployable to any static host / Vercel)
```

Explore streams SPHEREx HiPS tiles live from IRSA (public and CORS-enabled). Every other page uses prepared assets in `web/public/data/`.

## Rebuild the data (Python 3.12)

```bash
python -m venv pipeline/.venv
pipeline/.venv/Scripts/pip install astropy numpy scipy reproject requests matplotlib pillow astropy-healpix
python pipeline/fetch_swan.py          # MOST table -> 20 verified SPHEREx cutouts (data/raw, git-ignored)
python pipeline/swan_measure.py        # detection, motion, star control, vacancy test
python pipeline/build_swan_assets.py   # aligned frames, difference images, case.json
python pipeline/timetravel_select.py   # wavelength at the target for every SIA2 visit (HTTP range reads)
python pipeline/build_timetravel.py    # matched-wavelength pairs, D and Z maps
python pipeline/fetch_gaia.py && python pipeline/build_gaia_assets.py
python pipeline/build_sky_equirect.py 47   # infrared backdrop texture for Fly
```

The MOST query is recorded in `data/raw/most/` (catalog=spherex, obj "C/2025 R2", 2025-09-01 to 2026-03-01).

## Honesty rules the app follows

- SPHEREx has no per-pixel depth, so 3D comes only from Gaia distances. The infrared backdrop in Fly is drawn at infinity.
- The all-sky cube is time-averaged, so Time Travel uses dated Level-2 frames only.
- A prediction isn't a detection: MOST positions are always labelled as predictions and drawn separately from measurements.
- Flag meanings are read from each FITS header, never hard-coded.
- Frames at different wavelengths are never differenced or combined into a spectrum.

## Layout

```
pipeline/   Python processing (astropy, reproject)
web/        Next.js 15 + TypeScript + Tailwind + React Three Fiber + Aladin Lite 3.8.2 (vendored)
docs/       governing brief, Milestone 1 report, proof figures, submission text, demo script
data/raw/   MOST/SIA2 tables (FITS and Gaia tables are git-ignored)
```

Acknowledgements: SPHEREx (NASA/JPL/Caltech-IPAC) data from NASA/IPAC IRSA; ESA Gaia DR3 (DPAC); Aladin Lite (CDS). COSMOS is an independent Space Apps project, not an official NASA or ESA product.
