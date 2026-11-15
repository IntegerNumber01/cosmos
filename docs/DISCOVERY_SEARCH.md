# COSMOS discovery search — working evidence log

Objective: use COSMOS and the real SPHEREx data to make a serious search for a new object, an unreported change, or another scientifically interesting result. A candidate is not called a discovery without independent evidence of novelty and astrophysical reality.

## Protocol established before fresh-field results

- Preserve the project's DR1-only calibration baseline and all previous scientific verdicts.
- Run the actual public `findChanges`, local-wavelength mask, and native measurement functions over the prepared fields. Difference-map peaks are leads, not probabilities or confirmed sources.
- Independently detect local maxima in native Level-2 images, with no catalogue positions seeding source detection. Compare clean aperture measurements on the same detector and within half the local channel bandwidth. Retain image flags, source files, times and wavelength separation.
- Calibrate epoch-to-epoch flux ratios against other sources in each field, with a nonzero systematic floor. Require at least six usable comparison sources in the initial blind screen; sources with insufficient calibration remain unassessed rather than constant.
- Screen at |Δm| ≥ 0.15 mag and ≥4 times the combined measurement/ensemble scatter, then vet the most promising cases more strictly. This is a screening threshold, not a discovery threshold. Comparisons sharing frames are not independent confirmations.
- Re-measure leads on native pixels, check PSF shape, neighbors, saturation, persistence, ghosts, coverage, wavelength dependence, calibration and centroid shifts. Seek additional independent exposures/epochs and channels.
- Cross-match catalogue identities and variable-star information, and search primary literature. A missing match does not prove novelty.

## Initial control scan

`web/scripts/search-sky.cjs` runs the public COSMOS engine on real prepared cutouts. It inspected 119 images and 153 usable image pairs in the five challenge-target fields plus SWAN, generating 634 difference-map leads, including known target motion, saturation halos, and weak residuals. These numbers describe leads before independent quality vetting.

`pipeline/search_fields.py` independently screened 157 larger native Level-2 images in the five validation fields. The initial completed run produced 1,845 blind source detections across images and 555 usable source-pair photometric comparisons. Only RW Aurigae passed the initial variability screen: brightening by 0.547 mag, ratio 1.655 after ensemble calibration, over 2025-09-02 to 2026-03-08, at approximately 0.744 µm. The ensemble contains nine sources and has 0.050 log-flux scatter. This recovers the existing known-object result; it is a positive control, not a new discovery.

Fields without sufficient clean comparison sources (particularly R Draconis, dominated by saturation) are not counted as assessed for variability.

## Fresh-field search

Centres selected for their star-forming environments, before examining candidate results:

| Field label | RA (degrees) | Dec (degrees) | Cutout width |
|---|---:|---:|---:|
| NGC 1333 region | 52.30 | 31.30 | 0.3° |
| IC 348 region | 56.13 | 32.15 | 0.3° |
| L1688 region | 246.75 | −24.45 | 0.3° |
| Serpens region | 277.49 | 1.233 | 0.3° |
| NGC 2264 region | 100.25 | 9.88 | 0.3° |
| Orion L1641 region | 84.0 | −6.0 | 0.3° |

Acquisition begins with two separated wavelength sets each on detectors D2 and D5. These detectors observe the same pointing simultaneously at different wavelengths, useful for cross-band checks. Each set selects up to two frames per visit and six total. The spatial and temporal coverage is a selected sample, not a complete survey.

An initial 0.212°-radius SIA query failed after three bounded attempts. A diagnostic 0.005° centre-position query worked, so acquisition now uses centre-covering exposures and downloads 0.3° cutouts. This avoids claiming full coverage from edge-only footprints.

All intermediate inventories, measurements, and ranked leads are under `data/work/discovery/`; original cutouts and per-field source manifests are under `data/raw/discovery/`. Raw FITS files are excluded from Git. Final claims require the additional checks below; this log is a work in progress.
