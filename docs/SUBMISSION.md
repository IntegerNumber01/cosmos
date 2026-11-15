# COSMOS: The Infrared Universe Explorer

**"Google Earth for the infrared universe"** · Challenge: Planet X and SPHEREx

## Problem
NASA's SPHEREx images the whole sky in 102 infrared colours, again and again. Finding out what one patch of sky looked like on different dates still means archive queries, FITS files and coordinate tools. It also takes a subtle check that most tools skip: because of SPHEREx's linear variable filter, two exposures of the same spot are only comparable if they were taken at the same wavelength.

## Solution
**Time Travel: enter coordinates and see a dated sequence.**
- Type RA/Dec, pick a star while flying through Gaia's 3D map, or press "Time Travel here" on the all-sky map.
- COSMOS finds every SPHEREx DR1 exposure of that position (IRSA SIA2) and computes the wavelength *at that exact spot* for each one.
- It keeps only dates on the same detector whose wavelengths agree within half a channel. Every exclusion is listed, along with the exact wavelengths and how far they drift toward the field corners.
- The dates are aligned for playback, blink or swipe. Gaia stars are drawn where Gaia predicts they were on each date.
- **Find changes:** the difference of two matched dates over pixels valid on both, scaled by its measured scatter. Changes are grouped as brightened, faded, moved, or residual around a saturated star.
- **Investigate:** brightness and position are measured on each date's native pixels, with empirical errors. Flagged apertures report no value rather than a wrong one.
- **Is it already known?** Gaia DR3 and SIMBAD, propagated to the date, plus NASA/JPL's list of known asteroids and comets at that moment.

Around it:
- **Explore:** the SPHEREx all-sky map in all 102 wavelengths.
- **Fly:** 59,218 stars placed by Gaia parallaxes.
- **Investigate:** case files, including comet C/2025 R2 (SWAN).

## Validation on the challenge's five test targets
Thresholds were fixed before looking at results; measurements use native pixels and matched wavelengths only.

| Target | Result |
|---|---|
| **Epsilon Indi B** | **Confirmed.** Proper motion 4.42–4.86″ over one year against 4.68–4.77″ predicted (13.9–15.6σ), in three independent wavelength sets. The live tool reproduces it: 4.7″ ± 0.7″ against 4.7″. |
| **RW Aurigae** | **Confirmed variability.** Brightened by Δm = −0.53 ± 0.06 mag (8σ, reference-star calibrated) at 0.744 µm, between 2 Sep 2025 and 8 Mar 2026. The live tool shows +62%. |
| **WISE 0855−0714** | **Consistent.** Detected only by stacking, at S/N 8.1 in two independent sets (4.22 and 4.37 µm), and invisible below 3.3 µm as expected for a Y dwarf. The motion matches the prediction but is only ~2σ. A neighbouring Gaia star would have fooled a naive "nearest source" method; ours rejects it. |
| **Barnard's Star** | **Unreliable.** Saturated in every channel. A supplementary fit to the halo shows the expected ~6″ northward motion, but we don't count it. |
| **R Draconis** | **Unreliable.** Saturated in every channel. |

Plus **comet C/2025 R2 (SWAN)**:
- Detected in 20/20 predicted frames.
- Measured motion matches the prediction within 2σ in five of six detector sequences (from 3 observation blocks). The sixth differs by 2.4σ, and we report it as unexplained.
- At a matched wavelength 186 days later the spot is empty, a change of 125–585× the empirical noise.
- In Time Travel, Find changes flags the coma and JPL names it. **A recovery, not a discovery.**

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
