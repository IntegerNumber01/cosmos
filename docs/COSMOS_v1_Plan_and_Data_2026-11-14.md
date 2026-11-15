# COSMOS v1 — The Infrared Universe Explorer: plan + verified data (Nov 14, 2026)

Source: ChatGPT "NASA Space Apps Guide" chat, COSMOS v1 plan written in-chat Nov 14, 2026 (no canvas created).
Challenge: **Planet X and SPHEREx** — https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/ (Advanced; Astrophysics / Planets & Moons / Software)
Tagline: "Google Earth for the infrared universe"
Internal submission target: **Sunday, November 15, 2026, 10:30 p.m. Pacific**, to leave a buffer. This is not the event deadline. Official submission closes at **11:59 p.m. in the Local Event's timezone**, or the Team Owner's residential timezone for the Universal Event.

## The pivot (from Krishna's latest ChatGPT messages)
Re-ranked challenges: SPHEREx project chosen over FloodSight (FloodSight ranked 7th, dropped by supersession). COSMOS = explore the whole infrared sky in 102 wavelengths (Explore), fly a Gaia-measured 3D star field (Fly), compare dated SPHEREx observations (Time Travel), and investigate one object with evidence and flags (Investigate) — without claiming discoveries. Krishna's 2D→3D question resolved honestly: SPHEREx has no depth per pixel; real 3D comes only from Gaia star distances; AI depth is an optional, clearly labelled illustration.

## ChatGPT decision: GO, adjusted scope
Data access is proven; moving-object pixel proof is not. First task = prove comet SWAN is visible/moving in real SPHEREx cutouts (2-hour proof window), else fall back down the ranked list.

## Verified data (all tested live Nov 14, 2026 — IRSA is public, NO login anywhere)
- **SPHEREx DR1** (Nov 2026) via IRSA. DOIs 10.26131/IRSA678 (spectral images), 10.26131/IRSA679 (all-sky cube). Use DR1 only — QR2 is superseded and not SIA2-searchable.
- **SIA2 search WORKS**: https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_dr1&POS=circle+133.79513+-7.245147+0.1 → **195 rows** for the WISE 0855 field. Epochs verified: 2025W19 (May 2025, MJD 60800.70), 2025W44/45/46 (Oct 2025, MJD 60979–60989). Real multi-epoch series for the challenge's own test object.
- **IBE cutouts WORK** (the app's data path — small cutouts, not 66 MB full frames): full FITS URL + `?center=<ra>,<dec>d&size=0.1`. Downloaded and verified as a real FITS: WISE 0855, May 2025, detector D3 (1.63–2.43 µm), OBSID 2025W19_1B_0116_1, 3.9 MB.
  - May file: https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W19_1B/l2b-v27-2026-197/3/level2_2025W19_1B_0116_1D3_spx_l2b-v27-2026-197.fits
  - Oct file (verified to exist, fetch with curl — browser download failed): https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W46_1A/l2b-v27-2026-206/3/level2_2025W46_1A_0075_4D3_spx_l2b-v27-2026-206.fits
- **MOST WORKS**: comet **C/2025 R2 (SWAN)**, NAIF 1004092 — 20 matched SPHEREx frames, Oct 27–28, 2025 (e.g. 2025W44_1A_0045_1 D1/D4, 2025-10-27 04:52 UTC, MJD 60975.20, vmag 11.30). MOST table itself not downloaded (browser control failed) — re-run MOST or fetch its CGI output.
- **HiPS all-sky cube** (the Explore/wavelength layer): https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube — 102 frames, 0.753–4.988 µm, frameIndex = 17*(band−1)+(channel−1). **Frames 50 and 51 are BLANK** (dichroic) — skip them. Striping warnings at 1.88 / 3.3 / 4.05 µm. **HiPS is time-averaged: NO time axis. Time Travel must use Level-2 images, never HiPS.**
- **Gaia DR3** via MAST/ESA archive for measured 3D star positions (parallax_over_error > 5, propagate to epoch). Gaia gives 3D for stars only.
- Barnard's Star SIA2 CSV downloaded (5 rows, spherex_dr1, Aug 2025 obs). Its query coordinates (269.452075, +4.69339) are J2000 reference coords, NOT a verified 2025 position — propagate before use. Same caution for WISE 0855.

## What does NOT work — do not build on it
- SPHEREx Data Explorer UI: name resolver is down ("Some object lookup services are unavailable") and a coordinate TAP job QUEUED 30+ min then ABORTED ("service is temporarily busy"). Build on SIA2 + IBE + direct FITS URLs.
- 3I/ATLAS in MOST: name lookup failed, and 3I/ATLAS is C/2025 N1 — do NOT confuse it with SWAN (C/2025 R2).
- The Jan/July example in ChatGPT's explainer was illustrative. Real WISE 0855 epochs are May + Oct 2025.
- NEOSSat/CADC resources (3 of the 8 challenge links) are secondary reference only — not in the core pipeline.

## Resources audited (all 8 challenge links load)
IRSA SPHEREx page; SPHEREx Tutorial Notebooks (Data Overview, Cutouts, HiPS read in depth — MEF planes IMAGE/FLAGS/VARIANCE/ZODI/EPSF, WCS-WAVE; cutout pattern above); WiseView (working blink reference); Gaia DR3 (MAST); NEOSSat page; CADC; NEOSSat tutorial (GitHub); NEOSSat dataset. Not deep-audited: PSF/Source Discovery/Mosaic tutorials, SPLICES, 3I/ATLAS page, Spectrophotometry/Mosaic tools.

## Gate 0: PARTIAL PASS
PASS: DR1 accessible · SIA2 search (195 rows) · multi-epoch WISE 0855 · first cutout downloaded+verified · MOST 20 SWAN matches · HiPS 102 frames · no-login public access.
PENDING: Oct cutout fetch · FITS plane decode · common-band epoch pair · SWAN detectable in pixels · SWAN motion measurable · HiPS rendering in browser · Gaia sample · end-to-end demo.
FAIL (avoid, not blocking): name resolver · Data Explorer TAP.
Completion = 2 readable cutouts + 1 aligned epoch pair + HiPS channels in the viewer + Gaia 3D sample + 1 verified motion/change signal (or an explicit downgrade of the investigation).

## Build (locked)
Next.js 15 + TypeScript + Tailwind · Three.js/React Three Fiber (3D) · Aladin Lite or equivalent HiPS viewer · Python 3.12 (Astropy/NumPy/SciPy/Reproject) preprocessing → PNG/WebP + JSON for the browser · Vercel · prepared assets only at demo time (no live-archive dependency). Pages: COSMOS landing / Explore / Investigate. Raw FITS stays out of the deploy bundle; every asset traceable via manifest.json to its source URL/OBSID.
Pipeline: SIA2 discover → IBE cutouts → inspect planes/flags (use documented flag definitions, never invent bit meanings) → match detector + wavelength via WCS-WAVE (two D3 images are NOT automatically the same wavelength) → reproject to common grid → difference D = I_after − I_before with Z = D / sqrt(σ_b² + σ_a²) → reject flagged/saturated/misaligned pixels → browser assets. A "confirmed known-object match" requires measured position + time to agree with the predicted location. Predicted ≠ detected.

## Agent tasks (from the plan)
1. **Data Acquisition (P0, 90 min)**: place package files in data/raw/; fetch Oct WISE 0855 cutout (verify FITS, not an error page); reproduce SIA2 searches; get SWAN MOST table + cutouts; HiPS sample tiles; Gaia sample. Fallback trigger: archive path failing after 2 attempts / 30 min.
2. **Scientific Processing (P0, 2–3 h)**: WCS/flags validation; WISE 0855 detectability; SWAN signal at predicted positions; pick clearest valid pair; register; before/after/difference; limitations report. Fallback: comet not measurable in 2 h → stellar-motion target.
3. **Full-Sky Explorer (P0, 3 h)**: HiPS viewer, pan/zoom/coordinate nav, 102-position wavelength control with 50/51 disabled + explained, striping warnings, bookmarks (SWAN, WISE 0855, Barnard's Star), URL coordinates.
4. **3D Universe (P1, 2–3 h)**: real Gaia stars (several hundred+), measured distances + uncertainty + source ID on selection, fly/orbit, labelled as Gaia measurements; decorative volumes labelled illustrative.
5. **Time Travel + Evidence Inspector (P0/P1, 3 h)**: real timestamps, blink/slider/difference, predicted vs measured kept separate, flags + uncertainty, OBSID/detector/wavelength/date + link to original FITS.
6. **QA + Submission (P0, 2 h + final)**: truth gate (below), build checks, 30-s demo record, deploy, submit by Sun 10:30 p.m.

**Hard stops — never publish**: detection claimed from a MOST match alone; hand-shifted marker animation presented as measured motion; spectra from mismatched wavelength planes; estimated depth presented as a NASA measurement; a new-discovery claim; the HiPS mosaic presented as a dated movie; synthetic scenes labelled as real SPHEREx geometry.

## Fallbacks, ranked
1. SWAN motion verified in pixels (preferred) · 2. Another MOST object with stronger signal · 3. Stellar proper motion (SPHEREx epochs + Gaia) · 4. Verified variability (RW Aurigae / R Draconis — coverage unverified) · 5. Dated image comparisons with no detection claim.

## Timeline (PT)
Sat evening: Gate 0 finish + SWAN go/no-go · Sat night: processing, one defensible investigation · Sun morning: HiPS explorer + Gaia flight · Sun afternoon: Time Travel + evidence · Sun late afternoon: polish + QA · Sun early evening: deploy + record demo · Submit by Sun 10:30 p.m. Priority if time runs short: verified evidence > wavelength explorer > Time Travel > Gaia 3D > cinematic effects > extra targets.

## 30-second demo
0–5s Gaia fly-through ("Most of the universe is invisible to our eyes") → 5–11s wavelength slider over SPHEREx sky (102 channels) → 11–19s Time Travel between dated observations → 19–26s evidence inspection (predicted position, flags) → 26–30s close ("COSMOS turns the infrared sky into a universe anyone can explore and investigate"). Real app, real images, real dates only.

## Submission writeup (in the ChatGPT plan, §12 — verify every feature exists before submitting, remove anything unbuilt)
COSMOS: The Infrared Universe Explorer · "Google Earth for the infrared universe" · Problem: SPHEREx's 102 channels are locked in FITS/coordinate tooling the public can't use · Solution: explore + wavelength + measured 3D flight + Time Travel investigation + Evidence Inspector, no astronomy software needed · Data: SPHEREx DR1 (HiPS cube, Level-2, SIA2/IBE, MOST) + Gaia DR3 · Honesty section: no per-pixel SPHEREx depth, 3D = Gaia, Time Travel = dated Level-2 not the mosaic, predicted ≠ detected, no discovery claim · Mission line: "Make the infrared universe a place that anyone can explore, question, and understand."
