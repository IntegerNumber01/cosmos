# COSMOS: The Infrared Universe Explorer

**"The sky changes. See the evidence."** · Challenge: Planet X and SPHEREx

## Intended audience and benefit
COSMOS helps curious students, amateur astronomers and citizen scientists investigate the changing infrared sky without installing astronomy software. Educators can use its guided examples and shareable investigations for authentic-data activities. Beginners can start with RW Aurigae's brightness change or Epsilon Indi B's motion at `/learn`; experienced users can open the full observation controls directly.

The guide connects a question to real pictures, current native-pixel measurements, catalogue checks, uncertainties and downloadable evidence. JSON reports retain the comparison URL, original images and failed checks as well as successful results. Intended educational benefits and wider scientific participation are goals; adoption, time savings and learning outcomes have not yet been established by a human user study.

## Problem
NASA's SPHEREx images the whole sky in 102 infrared colours, again and again. People interested in that changing sky need an understandable path from archive observations to a comparison they can interpret and check. Existing archive viewers and science tools provide access; COSMOS brings temporal comparison, measurement, known-object context and explanatory case files into one workflow. Because SPHEREx's linear variable filter changes wavelength across each image, two dates also need wavelength checks at the source position. Matching within half a channel helps, but does not eliminate spectral false positives.

## Solution
**Time Travel: enter coordinates and see a dated sequence.**
- Type RA/Dec, pick a star while flying through Gaia's 3D map, or press "Time Travel here" on the all-sky map.
- COSMOS finds every SPHEREx DR1 exposure of that position (IRSA SIA2) and computes the wavelength *at that exact spot* for each one.
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
| **Epsilon Indi B** | **Confirmed.** Proper motion 4.42–4.86″ over one year against 4.68–4.77″ predicted (13.9–15.6σ), in three independent wavelength sets. The live tool reproduces it: 4.7″ ± 0.7″ against 4.7″. |
| **RW Aurigae** | **Confirmed variability.** Brightened by Δm = −0.53 ± 0.06 mag (8σ, reference-star calibrated) at 0.744 µm, between 2 Sep 2025 and 8 Mar 2026. The live tool, calibrated against reference stars in the same images, independently gives Δm = −0.52 ± 0.04 mag (+61% ± 6%). |
| **WISE 0855−0714** | **Consistent.** Detected only by stacking, at S/N 8.1 in two independent sets (4.22 and 4.37 µm), and invisible below 3.3 µm as expected for a Y dwarf. The motion matches the prediction but is only ~2σ. A neighbouring Gaia star would have fooled a naive "nearest source" method; ours rejects it. |
| **Barnard's Star** | **Unreliable.** Saturated in every channel. A supplementary fit to the halo shows the expected ~6″ northward motion, but we don't count it. |
| **R Draconis** | **Unreliable.** Saturated in every channel. |

Plus **comet C/2025 R2 (SWAN)**:
- Detected in 20/20 predicted frames.
- Measured motion matches the prediction within 2σ in five of six detector sequences (from 3 observation blocks). The sixth differs by 2.4σ, and we report it as unexplained.
- At a matched wavelength 186 days later the spot is empty, a change of 125–585× the empirical noise.
- In the general Time Travel tool, Find changes flags the coma, and JPL lists SWAN 7″ away. That's reported only as a *possible association*: the tool upgrades a match only when our measured position agrees with JPL's within its tolerance, and a coma's centroid sits 7.7″ from the predicted nucleus. The case file makes the full 20-frame identification. **A recovery, not a discovery.**

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
