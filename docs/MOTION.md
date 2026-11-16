# Public motion analysis and tracking stacks

Time Travel separates **Summary**, **Motion** and **Evidence**, with the selected view's content shown on its own. Summary retains the original raw measurements and catalogue states; Motion runs a separate reference-star analysis; Evidence preserves the worksheet and notes. The Epsilon Indi B guide opens Motion directly after the user measures the source, so its reference-corrected result is not mixed with the rougher raw-position summary. Moving between views does not clear notes.

## Compare correction against no correction

`docs/motion-benchmark-protocol.json` fixes the retrospective selection and comparison before the run: up to forty additional non-variable Gaia stars per field, selected by a source-ID hash, with no production threshold changes. `node scripts/benchmark-motion.cjs --write` evaluates all eight default saved fields using native images. On the identical accepted sample, the baseline uses the same centroids and visits without translation correction; both compare east/north displacement vectors with propagated Gaia predictions.

Of **229** selected sources, **48** pass and **181** are refused. Median vector residual is **0.561″ without correction** and **0.441″ corrected**. Correction improves **28** accepted cases and worsens **20**. All fields and refusals are retained in `web/public/data/motion-benchmark.json` and `/validation#motion-benchmark`. These stars share images and reference ensembles, so they are correlated. This is not a blind prospective test, a discovery-completeness measurement or a sky-wide false-positive rate. Catalogue covariance, binary motion and radial velocity remain unmodeled. The comparison isolates translation correction, not entire products.

The report hashes original binary inputs and LF-normalized UTF-8 source/JSON inputs (explicit `hashMode` per file), so Windows line endings do not falsely invalidate source provenance. The regression suite verifies those checksums and that all accepted/refused/improved/worsened cases remain represented.

## Native-pixel motion analysis

`web/src/lib/engine/motion.ts` measures the source and isolated Gaia references on each original image. Comparisons use one detector and a half-channel wavelength limit at the selected source. Saturated/flagged/incomplete apertures, empirical S/N below 10, centroids displaced by more than one pixel from the requested track, and partially overlapping comparable catalogue neighbours are refused. These screens cannot identify every uncatalogued infrared neighbour or unresolved component.

References have G ≤ 16.5, finite proper motions, no variable flag, no comparable neighbour within four native pixels, and remain at least ten pixels from the target and twelve pixels from an image edge. At least three survive a robust alignment outlier check. Their propagated catalogue positions include high-precision positive parallaxes where available. Saved Epsilon Indi B and RW Aur reference catalogues retain these values from the exact-ID rows in the locally cached original Gaia ECSV.

The median reference-minus-catalogue east/north offset is subtracted from the target. The full robust scatter of reference offsets is retained as an alignment uncertainty, floored at 0.15 arcsec and at the reference-centroid statistical uncertainty of the median. The full scatter is not divided by sqrt(reference count). Target centroid errors retain their S/N term, with a 0.12 arcsec floor. This is translation calibration and aperture centroiding, not a PSF fit or an astrometric distortion solution. Reference wavelengths can still affect photocentres and their disagreement contributes to the alignment scatter.

Exposures within a bounded 24-hour interval form one visit. Per-visit position is a median and its error retains the largest individual error or measured within-visit scatter. Repeated exposures are deduplicated. With two visits, report displacement only. With at least three visits spanning 0.1 year, weighted east/north line fits return rates, uncertainties, chi-square and residual RMS. Errors inflate when chi-square exceeds its degrees of freedom. An uncertain or poor fit is not a confirmed object or discovery.

Shared reference controls are evaluated between the first and last exposure with each control excluded from its own alignment estimate. The UI reports their median and largest residual; these are diagnostic checks, not a survey-wide false-positive rate.

## Parallax is an input

`astrometry.ts` interpolates Earth barycentric ICRS positions produced by Astropy's bundled ERFA ephemeris. `pipeline/build_motion_ephemeris.py` generates four-day samples from January 2024 through early January 2028, plus independent off-grid check positions. The browser refuses extrapolation. Node checks require interpolation error below 0.0007 AU; for a 0.55-arcsec parallax that corresponds to less than 0.0004 arcsec of geometrical error, well below the positional floors. Earth centre approximates the low-Earth-orbit observer; no spacecraft ephemeris is fitted.

For an identified prepared target or a close, sufficiently precise Gaia association, catalogue parallax is held fixed and removed before fitting proper motion. The figure plots observed positions and a separately labelled catalogue track including parallax. If no trusted parallax is supplied, fitted rates are explicitly **apparent motion**. No independent parallax or distance is measured. Radial velocity, orbital photocentre motion, colour terms, PSF changes and deblending are not modelled.

## Specified-trajectory stacks

`tracking.ts` forms an exploratory equal-exposure mean on a source-centred grid, using a specified catalogue proper motion and available catalogue parallax. It does not scan unknown velocities. Flags, native coverage and wavelengths are evaluated at the actual tracked sampling locations. At each output pixel, a total wavelength span exceeding half the smallest local bandwidth masks that pixel.

The UI compares a single exposure, a sky-aligned mean and a track-aligned mean on one brightness scale. Coverage at the target is explicit. Aperture/noise ratios come from blank apertures on the resampled display images; stack ratios require at least two contributors. These are empirical display diagnostics, not calibrated photometric significance, probabilities or a guarantee of improved detection. A neighbour can dominate. The WISE 0855 offline deblended-PSF result remains a separate method.

The tracking download retains the specified trajectory, source-image URLs, dates, contributor count and diagnostic values. The general JSON and readable evidence exports retain the requested motion analysis, fit, alignment references, exclusions, limits and catalogue failures. Pending/unrequested analyses are not exported as completed.

## Checks on 15 November 2026

- Epsilon Indi B, selected prepared D2 sequence: five usable visits, measured displacement **4.79 ± 0.59 arcsec**, east **4.20 ± 0.57 arcsec/year**, north **−2.37 ± 0.57 arcsec/year**. Catalogue input is approximately +3.982 / −2.467 arcsec/year and 270.658 mas. This agrees with the established independent validation within the stated errors; it does not replace the validation's stricter PSF results.
- RW Aur, selected clean pair: displacement **0.10 ± 0.49 arcsec**, a positional null control. Two visits are not presented as a rate fit.
- Additional GP Mon field, held out while developing this motion engine: **0.81 ± 1.02 arcsec**, consistent with no significant positional change. This small set of real controls does not establish survey-wide performance.
- Labelled synthetic moving sources in real image geometry test the tracking operation. They concentrate along the specified track; incompatible spectral WCS is masked; inputs remain unchanged and duplicated images do not add weight. These are engineering injections, not astronomical recoveries.
- `npm test` includes `scripts/test-motion.cjs`: ephemeris interpolation, the real motion/control, refusal paths, residual-based error inflation, and the labelled tracking injection.
- `pipeline/tools/motion_ui.py`: real browser measurements, controls, known-track comparison, failed catalogues, readable/JSON exports, preserved notes, separated views, narrow layouts and runtime errors. Existing guided and learning suites exercise the revised navigation too.

Every saved exposure in all eight featured fields now ships a wider native image and local Gaia reference data. `node scripts/preflight-motion.cjs --write` records 40 saved selections; `npm test` checks the preflight results, manifest checksums, native-pixel overlap and loading with live services unavailable. `pipeline/tools/prepared_motion_ui.py URL` exercises all eight default analyses and three specified-track comparisons with archive/catalog routes returning 502. The default RW Aur selection combines additional exposures within its two visits (0.18 ± 0.50 arcsec); the clean two-exposure control above is unchanged. See [archive resilience](ARCHIVE_RESILIENCE.md) for the complete target-by-target results and preparation commands.

## Reproducibility and related public work

The Validation page's `/validation#reproduce` audit now checks the SHA-256 hashes of every consumed native cutout and Gaia reference field against the existing calibration manifests before recalculating the headline motion and brightness cases. It downloads original observation identities, dates, source-position wavelengths, hashes and actual results. Stored preflight numbers are ignored; manifests and the selection file have recorded hashes but no independent authentication. This is a local consistency and reproducibility check, not independent replication or a new discovery-performance benchmark.

The capability review drew on [OSU's motion/search workflow](https://github.com/osu-spherex/planet-x-spherex), [Narvalis's reference-star calibration and dossiers](https://github.com/narvalis-labs/narvalis-spherex), [Muninn's explicit benchmark limitations](https://github.com/root3315/muninn), and [WiseView](https://github.com/backyardworlds/wiseview). This implementation was written independently in COSMOS; no competitor source files or assets were copied. Astronomical observations remain the named NASA/partner data, and Codex assistance remains acknowledged in About.

Blind velocity searches, additional releases, independently fitted distances, a global frame index and a community review service are outside this change. None is implied by the new controls.
