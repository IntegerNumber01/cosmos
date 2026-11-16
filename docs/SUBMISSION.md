# COSMOS: The Infrared Universe Explorer

**"The sky changes. See the evidence."** · Team Sol27 · Challenge: Planet X and SPHEREx

## High-level summary for the submission form

COSMOS helps beginner students and astronomy clubs decide whether an apparent change in NASA's infrared sky images deserves belief. Open a real brown-dwarf investigation, blink two dates, and measure its motion against surrounding stars. Then test a young star's brightening and a misleading measurement caused by overlapping light. A new-case activity asks learners to explain the evidence before revealing the checks. Readable reports preserve measurements, uncertainty, original observations and questions still unanswered. The public coordinate-to-images workflow answers Planet X and SPHEREx; the contribution is a connected investigation a learner can explain and another person can inspect. Prepared observations keep selected cases usable during archive outages. Independent learning gains and adoption have not been measured.

## Data and scientific contribution

**Data access and provenance:** COSMOS makes dated NASA SPHEREx Level-2 observations usable for a beginner's investigation. It reads native IMAGE, FLAGS and VARIANCE arrays, evaluates wavelength at the actual source position, and retains original FITS links, UTC dates and exclusions. Gaia supplies reference-star positions and comparison measurements; it does not give SPHEREx a depth axis. Saved cases and a clearly partial detector-footprint inventory reduce archive-outage barriers without presenting missing data as an empty sky. At `/validation#reproduce`, anyone can verify the consumed image/catalog hashes, repeat five calculations and download their results and data lineage in one browser session.

**Scientific method:** The question is falsifiable: does the source change beyond the image and measurement uncertainties? The same method must support Epsilon Indi B's measured motion and RW Aur's brightening, retain the brown dwarf's insignificant brightness change, and refuse a blended-star comparison. GP Mon provides a further real-image brightness check. Reference stars, native-pixel errors, source-position wavelength matching and explicit failure states test alternative explanations. The public retrospective benchmark retains all 229 selected stars, including 181 refusals and 20 accepted cases made worse by correction. Catalogue motion guides the positional search; agreement with it is not a blind discovery. The one-click audit repeats the production method and verifies local file consistency, not independent replication or NASA-signed authenticity.

The project demonstrates an investigation workflow and scoped scientific checks. It does not establish a new mission concept, measured global collaboration, broad adoption or community outcomes.

## Current motion workflow

The compact guide and Summary / Motion / Evidence views keep optional science controls out of the initial result. Motion analysis corrects native positions against isolated reference stars, groups nearby exposures into visits and fits rates only with enough independent dates. Catalogue parallax is an explicit fixed input; no new distance is inferred. The selected Epsilon Indi B D2 sequence gives 4.79 ± 0.59″ displacement, with fitted east/north rates agreeing with the catalogue. RW Aur's positional control is consistent with zero. A specified-trajectory stack can be compared with a single exposure and a sky-aligned mean; diagnostic noise ratios are not discovery significance. JSON/readable reports retain the motion result and failed checks. Full methods and limits: `MOTION.md`.

## Intended audience and benefit
The primary audience is beginner students and astronomy-club members, supported by a teacher or club facilitator. The intended outcome is specific: explain a measured change and uncertainty, distinguish a measurement from a prediction, recognize an unreliable result, and propose the next observation. The homepage and `/learn` start with Epsilon Indi B's motion; RW Aur's brightness and a false-alarm exercise follow. Experienced amateur astronomers can bypass the guide and use the full tools. No telescope, account or installed astronomy software is required.

The guide connects a question to real pictures, current native-pixel measurements, catalogue checks, uncertainties and downloadable evidence. JSON reports retain the comparison URL, original images and failed checks as well as successful results. Intended educational benefits and wider scientific participation are goals; adoption, time savings and learning outcomes have not yet been established by a human user study.

The printable `/learn/kit` provides a 15–20 minute investigation for individuals or groups, with optional extensions. In `/learn/lab`, learners explain three real-data brightness cases before revealing the checks: a supported brightening, no significant brightness change, and a blended-star measurement that must be refused. A fourth, different real-image case on GP Mon asks four closed questions and a written evidence handoff before revealing a transparent answer key. Initial choices are preserved; written reasoning requires human review. Its choice score is not evidence of a learning gain. Readable evidence downloads complement JSON/CSV, and shared links reopen the selected measurement. No independent participant results are claimed. See `IMPACT_EVIDENCE.md` and `SELF_REVIEW.md`.

## Comparative evaluation of the motion method

The published retrospective benchmark selects up to forty additional Gaia stars per saved field by a deterministic source-ID hash, before measuring. The production engine and thresholds remain unchanged. Of **229** selected stars across eight fields, **48** pass its quality rules and **181** are refused. On the identical accepted centroids and observing dates, reference-star translation correction reduces median vector residual against Gaia-predicted displacement from **0.561″ to 0.441″**; **28 improve and 20 worsen**. All fields, refusals, results, the selection protocol and source checksums are published at `/validation#motion-benchmark` and `/data/motion-benchmark.json`.

This isolates translation correction, not whole-product superiority. Stars share images and reference ensembles; they are correlated, not independent trials. Catalogue predictions have uncertainties and unmodeled effects. The result does not establish discovery completeness or a sky-wide false-positive rate. Reproduce with `cd web` then `npm run benchmark:motion`; the protocol is `docs/motion-benchmark-protocol.json`.

## Problem
NASA's SPHEREx images the whole sky in 102 infrared colours, again and again. People interested in that changing sky need an understandable path from archive observations to a comparison they can interpret and check. Existing archive viewers and science tools provide access; COSMOS brings temporal comparison, measurement, known-object context and explanatory case files into one workflow. Because SPHEREx's linear variable filter changes wavelength across each image, two dates also need wavelength checks at the source position. Matching within half a channel helps, but does not eliminate spectral false positives.

## Solution
**Time Travel: enter coordinates and see a dated sequence.**
- Type RA/Dec, pick a star while flying through Gaia's 3D map, or press "Time Travel here" on the all-sky map.
- COSMOS queries SPHEREx DR1 exposures at that position (IRSA SIA2) and computes the wavelength *at that exact spot* for each one. Prepared menus are labelled subsets. If live discovery fails, 3,352 saved original detector footprints support some additional coordinates; this fallback is explicitly partial, and uncovered positions still fail rather than pretending the sky was empty.
- It keeps exposures on the same detector whose wavelengths agree within half a channel. Play every compatible exposure or one per day, filter UTC dates, and page through all results in groups of 12. Every change and measurement is re-checked at its own position, because the filter wavelength drifts across the field. Exclusions and wavelength drift are displayed.
- The dates are aligned for playback, blink or swipe. Gaia stars are drawn where Gaia predicts they were on each date.
- **Find changes:** the difference of two matched dates over pixels valid on both, scaled by its measured scatter. Changes are grouped as brightened, faded, moved, or residual around a saturated star.
- **Investigate:** brightness and position are measured on each date's native pixels, with empirical errors. Flagged apertures report no value rather than a wrong one.
- **Calibrated brightness:** the headline change divides the target by Gaia reference stars measured identically in 12′ images of the same exposures. Its ± combines blank-sky noise with how much the reference stars disagree. COSMOS refuses to give a calibrated number when fewer than 3 clean, wavelength-matched references exist, when a neighbouring star partly overlaps the target, or when the wavelength at the target differs between dates. Three controls: RW Aur brightens (+61% ± 6%, matching the independent validation), Epsilon Indi B stays steady (−1% ± 5%), and a steady but blended field star, which read −54% before the blend check, is refused. On GP Mon, which was never used while developing the method, the live calibration gives Δm = −0.91 ± 0.13 mag against an independent offline differential-PSF result of −0.90 ± 0.08. Dropping any single reference star moves these results by at most 0.023 mag.
- **Should you believe this change?** An evidence worksheet asks five questions: what changed, which measurements support it, which other explanations were checked, what is still unknown, and which observation would settle it. COSMOS fills in the answers from the checks it actually ran. Eight alternative explanations (colour, image calibration, an overlapping neighbour, saturation, artefacts, a catalogued object, a passing asteroid or comet, a spectral feature) are each marked checked, caution, problem or not checked. A check that didn't run is never shown as passed, and the strongest verdict is "supported so far". The user's notes and every check result are saved in the evidence download.
- **Is it already known?** Gaia DR3 and SIMBAD, propagated to the date, plus NASA/JPL's list of known asteroids and comets at that moment. A failed lookup is shown as a failure, never as "nothing known". A JPL object counts as consistent only if our measured position matches its prediction.

Around it:
- **Stack visits:** combine compatible exposures within bounded observing windows, inspect contributors and coverage, and subtract visit means with local wavelength masking. These are exploratory display images, separate from native-pixel measurements.
- **Wavelength lab:** generate six detector-band previews from sampled available channels, plus a source-position aperture spectrum with empirical errors, per-point dates/flags, and CSV export. Missing channels remain missing; previews can span different dates and are labelled accordingly. No calibrated spectrophotometry or deblending is claimed.
- **Refresh and share:** explicitly refresh the DR1 archive, preserve an investigation's field, wavelength window, exposures, overlays and visit settings in its URL, or embed it in an iframe.
- **Explore:** the SPHEREx all-sky map in all 102 wavelengths, with a WISE context overlay and adjustable opacity. WISE is a separately labelled historical mosaic, never part of a SPHEREx temporal measurement.
- **Fly:** 59,218 stars placed by Gaia parallaxes.
- **Investigate:** case files, including comet C/2025 R2 (SWAN).

## Validation on the challenge's five test targets
Thresholds were fixed before looking at results; measurements use native pixels and matched wavelengths only.

| Target | Result |
|---|---|
| **Epsilon Indi B** | **Confirmed.** Separate Python analysis: displacement 4.42–4.86″ over one year against 4.68–4.77″ predicted (13.9–15.6σ) in three usable wavelength sets. Current public D2 motion: **4.79 ± 0.59″** across five independent visits. Rates: east **4.20 ± 0.57**, north **−2.37 ± 0.57″/yr**. These are distinct analyses with different uncertainty estimates. |
| **RW Aurigae** | **Confirmed variability.** Brightened by Δm = −0.53 ± 0.06 mag (8σ, reference-star calibrated) at 0.744 µm, between 2 Sep 2025 and 8 Mar 2026. The live tool, calibrated against reference stars in the same images, independently gives Δm = −0.52 ± 0.04 mag (+61% ± 6%). |
| **WISE 0855−0714** | **Consistent.** Detected only by stacking, at S/N 8.1 in two independent sets (4.22 and 4.37 µm), and invisible below 3.3 µm as expected for a Y dwarf. The motion matches the prediction but is only ~2σ. A neighbouring Gaia star would have fooled a naive "nearest source" method; ours rejects it. |
| **Barnard's Star** | **Unreliable.** Saturated in every channel. A supplementary fit to the halo shows the expected ~6″ northward motion, but we don't count it. |
| **R Draconis** | **Unreliable.** Saturated in every channel. |

Plus **comet C/2025 R2 (SWAN)**:
- Detected in 20/20 predicted frames.
- Measured motion matches the prediction within 2σ in five of six detector sequences (from 3 observation blocks). The sixth differs by 2.4σ, and we report it as unexplained.
- At a matched wavelength 186 days later the spot is empty, a change of 125–585× the empirical noise.
- The general viewer retains the exact epoch, observer assumption and centroid-agreement check for a JPL possible association. Geocentric predictions differ from the spacecraft viewpoint, and the coma's centroid need not be the nucleus. Proximity alone is not an identification; the dedicated case file provides the full 20-frame analysis. **A recovery, not a discovery.**

## Data
SPHEREx DR1 Level-2 spectral images (IRSA SIA2 + IBE, doi:10.26131/IRSA678) · SPHEREx DR1 all-sky HiPS cube (doi:10.26131/IRSA679) · IRSA MOST · ESA Gaia DR3 · SIMBAD · NASA/JPL Small-Body Identification API.

## Science honesty
- Comparisons are made at matched wavelengths only. Cross-wavelength differences are labelled as usable for position only.
- Significance maps are scaled by their measured scatter and presented as indicators. Nominal archive variance understates the scatter after resampling by 1.3–3.3×.
- Uncertainties are empirical: blank-sky apertures, reference stars, and field-star alignment.
- Saturated targets are reported as unreliable, not forced.
- Predictions are always shown separately from measurements.
- SPHEREx has no per-pixel depth; 3D comes from Gaia only.
- No discovery claims. "No catalogue match" is never presented as a discovery.

## Built with
Next.js 15 (prerendered pages plus Node API routes that proxy IRSA, because IRSA sends no CORS headers), a TypeScript FITS/TAN-SIP/WCS-WAVE engine verified against astropy (4×10⁻¹⁰″, 4×10⁻⁷ µm), React Three Fiber, and Aladin Lite. Python with Astropy, NumPy, SciPy and reproject for the case files and validation.

## Mission
Make the infrared universe a place that anyone can explore, question, and understand.
