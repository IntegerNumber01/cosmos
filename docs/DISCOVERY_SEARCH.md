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

All intermediate inventories, measurements, and ranked leads are under `data/work/discovery/`; original cutouts and per-field source manifests are under `data/raw/discovery/`. Raw FITS files are excluded from Git. Portable final evidence is under `web/public/data/discovery/`.

## Completed search and follow-up

The frozen six-field screen contains **59 native images, 3,020 detections across images, 774 usable source-pair comparisons and 13 candidate clusters**. Every candidate received native-image remeasurement and catalogue checks. Detections are not unique objects; repeated comparisons are not independent confirmations. Combined with the initial challenge-field control screen, the native screen covers 216 images, 4,865 detections and 1,329 source-pair comparisons. The public-engine scan overlaps those exposures; its image counts must not be added as independent data.

| Fresh field | Initial images | Detections | Source-pair comparisons | Candidate clusters |
|---|---:|---:|---:|---:|
| NGC 1333 | 10 | 457 | 120 | 2 |
| IC 348 | 8 | 495 | 59 | 0 |
| L1688 | 11 | 228 | 36 | 1 |
| Serpens | 14 | 805 | 262 | 6 |
| NGC 2264 | 9 | 722 | 250 | 3 |
| Orion L1641 | 7 | 313 | 47 | 1 |

Candidate-driven follow-up evaluated all available centre-covering D2/D5 headers at the **refined candidate coordinates**, then selected explicit wavelength windows without inspecting source brightness. It expanded the fresh-field raw collection to 76 cutouts, including a recovered failed L1688 download and a spectrum around ASR 7. The original screen remains frozen. Follow-up selections, exact coordinates, source URLs, errors and coverage limits are in each `followup_*.json` manifest.

### GY 152 / ISO-Oph 77: promising candidate dimming event

Known counterpart: `[GY92] 152`, also 2MASS J16265429−2424381 and CFHTWIR-Oph 50, at RA 246.726222°, Dec −24.410601°. **It is not ISO-Oph 50.**

Two independent D5 exposures on 2025-08-16, at 08:22 and 14:57 UTC, are fainter in adjacent wavelength windows. Relative native EPSF photometry, calibrated against the median ratio of common isolated field stars, gives:

| Comparison | Local wavelengths (µm) | Later/earlier ratio | Reference stars | Empirical log scatter |
|---|---|---|---:|---:|
| Aug 13 → Aug 16, near 3.85 | 3.85042 → 3.85608 | 0.773 ± 0.033 | 29 | 0.027 |
| Aug 13 → Aug 16, near 3.92 | 3.91719 → 3.92299 | 0.854 ± 0.040 | 30 | 0.037 |
| Aug 13 → Mar 1, near 3.85 | 3.85042 → 3.85266 | 1.001 ± 0.057 | 13 | 0.050 |
| Aug 13 → Mar 1, near 3.92 | 3.91719 → 3.91936 | 0.990 ± 0.041 | 12 | 0.032 |

The earlier Aug 10 → Aug 13 ratio near 3.85 µm is 1.002 ± 0.053. EPSF fits have clean cores and reasonable residuals; 2-, 2.5-, 3- and 4-pixel aperture checks reproduce the direction and approximate amplitudes. The second low point comes from the initially failed `2025W33_2C_0526_1D5` download, recovered during follow-up. Reference ensembles are selected independently of catalogue identities and use common source identities per pair. Errors include target fit uncertainties, ensemble scatter and at least a 3% log-flux floor. Shared reference frames correlate ratios; these are not multiple independent discovery probabilities.

Important limits: the dim exposures sample wavelengths about 0.16 channel widths from the reference dates. The two measurements are at **different times and different wavelengths**, so their different amplitudes do not establish a colour law or an evolving dip shape. Sparse sampling does not measure duration or period. The evidence supports a candidate event; it does not establish its cause, an eclipse, or a planet.

Novelty checks: SIMBAD identifies a known young source. Successful Gaia DR3, VSX and IRSA YSOVAR cones returned no matches. AllWISE matches at 0.26″ with raw variability flag `53nn`, an extended-source flag and long-band contamination flags; those flags do not prove or disprove this event. A coordinate query of **Park et al. (2021), table 7**, returns D2164 at 1.73″: ΔW2 = 0.25 mag, `SD_sig = 1.66`, and blank secular/stochastic variability-class fields. This establishes inclusion in a prior variability study, without an assigned variability class in that row. It does **not** establish absence of previous reports. SIMBAD aliases, bibliography, primary-paper searches and the published table were checked; novelty remains unproven.

Portable evidence: `gy152.json`, `gy152-pairs.csv`, `gy152-lightcurve.{png,pdf}`, `gy152-images.{png,pdf}`, and `prior-catalogues.json`. The live viewer has a clearly labelled prepared follow-up sample at `/timetravel?target=gy152`, linked from `/investigate/search#gy152`.

### GP Mon: strong chromatic variability in a known system

At RA 100.1743974°, Dec 9.8623153°, GP Mon is a known young variable in SIMBAD and VSX, with close components unresolved by SPHEREx. Between 2025-09-29 and 2025-11-11:

- D2, 1.19322 → 1.19333 µm: differential EPSF ratio **2.299 ± 0.161**, 24 reference stars, 0.063 log scatter.
- D5, 3.93596 → 3.93608 µm: differential EPSF ratio **1.111 ± 0.069**, 35 reference stars, 0.037 log scatter.
- Wavelength mismatches are below 0.004 channel widths. Multiple aperture radii agree with the large short-wavelength change.

The much smaller long-wavelength change is not strongly significant. D2 and D5 observe simultaneously within a visit: two colours, not independent temporal repeats. No physical mechanism is inferred from two dates, and the unresolved components cannot be individually assigned the change. This is an independently recovered, interesting measurement of a known variable, not a new variable or object.

Evidence: `gpmon.json`, `gpmon-pairs.csv`, `gpmon-chromatic.{png,pdf}`, `gpmon-images.{png,pdf}`. Viewer: `/timetravel?target=gpmon`; case file: `/investigate/search#gpmon`.

### EC 129 / WVSC 298: a catalogue absence was misleading

The source at RA 277.5114458°, Dec 1.2077944° brightens near 4.255 µm from 2026-03-25 to 2026-05-08. Native EPSF fits with three fixed-position infrared neighbours give a differential ratio **1.295 ± 0.050**, using 31 common references, with 0.033 log scatter. The wavelength mismatch is 0.011 channel widths. Aperture radii 2–4 pixels give ratios approximately 1.28–1.31. Nearby 2MASS positions were verified through IRSA; adding neighbours changes the target EPSF ratio little.

Although Gaia DR3 and VSX cones return no matches, SIMBAD aliases identify **EC 129 / WVSC 298**. The original WFCAM catalogue matches at 0.013″ and lists it in the variable sample (C2, type YSO?, no assigned period). AllWISE also has raw `var_flg = 9921`, with crowding/contamination flags. This is an already known variable. D2 shows suggestive same-direction changes, but high fit residuals and insufficient clean EPSF reference stars prevent presenting those as independently confirmed differential amplitudes.

Evidence: `serpensa-deblend.json`, its ratio CSV, saved original WFCAM entry and SIMBAD aliases in `prior-catalogues.json`.

### ASR 7 / SVS 14: spectral false positive and tool improvement

The initial D5 screen suggested approximately twofold brightening at local wavelengths 4.2578 versus 4.2422 µm. Both passed the half-channel rule. Additional exposures show a deep trough near 4.27 µm, with higher flux on both sides, at both seasonal samplings. The location is consistent with CO₂ absorption. The different dates sample different parts of that structure; they do **not** establish temporal change. This is not a new molecular identification claim.

Only clean 3-pixel-aperture points with usable EPSF fits enter the portable spectral figure. Samples flagged in the aperture are excluded even if a masked-core PSF fit was technically possible. The spectrum is sparse and contains different dates/positions; no fitted identical-band spectral evolution is claimed. Primary literature already identifies ASR 7 / SVS 14 (Arnold et al. 2012, source 88).

The viewer now reports the actual local wavelength span beside native brightness measurements and explains that a spectral feature can mimic variability even below half a channel. Difference-map scores are labelled multiples of map scatter, rather than discovery significance; PSF/calibration residuals and masked-source limits are explicit. The half-channel mask remains a necessary geometric passband check, not a guarantee of temporal purity.

### Remaining candidate dispositions

All original measurements, per-service catalogue responses, candidate coordinates and explicit dispositions are preserved in **`candidate-ledger.json`**. A nearby catalogue object is not automatically assigned to the target.

| Lead | Counterpart or region | Disposition |
|---|---|---|
| NGC1333 b | 2MASS J03285461+3116512, near ASR 42 | Crowding and spectral ambiguity; possible continuum fading remains unresolved. The VSX variable is neighbouring ASR 42, not the primary target. Strict EPSF follow-up could not supply reliable pairs. |
| Serpens b | 2MASS J18300341+0116191 | Known Gaia/VSX YSO variable; infrared brightening recovered. |
| Serpens c | 2MASS J18295360+0117017 | Known Gaia/VSX variable; fading recovered. |
| Serpens d | V371 Ser / EC 53 | Known variable; fading recovered. |
| Serpens e | SVS 4 infrared cluster | Crowded and spectrally ambiguous near CO₂; closely matched Mar–May EPSF flux is nearly unchanged. |
| Serpens f | ATO J277.4228+01.1271 / ASASSN-V J182941.47+010737.9 | Known variable; initial half-channel D5 comparison remains spectrally ambiguous. |
| NGC2264 b | GR Mon | Known variable; short-wavelength brightening recovered. |
| NGC2264 c | MM Mon | Known variable; do not confuse with neighbouring V820 Mon. |
| Orion a | HOPS 193 / 2MASS J05363028−0601173 | Already irregular in Park2021. EPSF errors ~13% and reduced χ² >100 prevent the initial aperture-screen significance being accepted as a final measurement. |

No unique new object has survived as an established discovery. The deliverable is a substantive real-data search with one promising candidate event, useful known-source measurements, a demonstrated spectral pitfall, and evidence that can be independently reviewed.

## Reproduction and validation

Use `pipeline/.venv/Scripts/python.exe` on Windows (or a compatible Python environment with the project's astronomy dependencies). Archive acquisition requires network access. Bulk FITS and intermediate outputs stay ignored; manifests and portable measurements remain in the repository.

```text
pipeline/.venv/Scripts/python.exe -u pipeline/acquire_search_fields.py
pipeline/.venv/Scripts/python.exe -u pipeline/search_fields.py ngc1333 ic348 l1688 serpens ngc2264 orion_l1641 --directory data/raw/discovery
pipeline/.venv/Scripts/python.exe -u pipeline/followup_source.py gy152 l1688 246.726222 -24.410601 --band 5:3.854:0.35 --band 5:3.918:0.35
pipeline/.venv/Scripts/python.exe -u pipeline/assess_source.py gy152 data/raw/discovery/l1688 246.726222 -24.410601 --band 5:3.854:0.35 --band 5:3.918:0.35
pipeline/.venv/Scripts/python.exe -u pipeline/assess_source.py gpmon data/raw/discovery/ngc2264 100.1743974 9.8623153 --band 2:1.19315:0.15 --band 5:3.93585:0.15
pipeline/.venv/Scripts/python.exe -u pipeline/assess_source.py serpensa-deblend data/raw/discovery/serpens 277.5114458 1.2077944 --band 2:1.5114:0.1 --band 2:1.5858:0.1 --band 5:4.2547:0.1 --neighbour 277.5163333:1.2089167 --neighbour 277.515625:1.2111389 --neighbour 277.5103333:1.2120667
pipeline/.venv/Scripts/python.exe -u pipeline/render_search_results.py
pipeline/.venv/Scripts/python.exe -u pipeline/publish_search_ledger.py
```

The first screen must be run before adding follow-up files to reproduce the frozen 59-image counts. Rerunning the same field directory after follow-up intentionally includes the new exposures. The original screen inputs and values are retained in `candidate-ledger.json`, so this difference is auditable.

Within `web/`: `node scripts/cache-search-cases.cjs` builds the selected live-viewer cache through the actual IBE parser; `node scripts/search-sky.cjs gy152 gpmon` runs the public change engine over it. That additional public-engine run inspected 11 images, 7 usable long-baseline pairs and generated 115 unvetted leads. It illustrates why map scatter is not photometric discovery confidence; it is not 115 new objects.

`npm test` passed all 17 engine tests; `npm run build` passed. Browser verification (`pipeline/tools/discovery_ui.py`) checks real prepared sequences, native measurements, the wavelength warning, swipe/flags, all five figures, JSON downloads, mobile overflow and runtime errors. No catalogue identity is fabricated for the browser test; external catalogue services are explicitly offline in that deterministic check.

Final verification also passed the existing `pipeline/tools/challenge_ui.py` regression: shared selections, visit settings, archive-refresh failure/recovery, real-cutout spectra/CSV, mobile and embedded layouts. The new browser check confirmed that GY152 defaults to the Aug13/Aug16 dip comparison and that an explicitly shared later date overrides that default. Neither browser run reported runtime errors.

`pipeline/audit_search_evidence.py` independently audited the portable records against the original native FITS: **17 frame headers/flag/wavelength records, 64 remeasured apertures, 56 pair statistics and 11 binary-cache SHA-256/provenance records passed**. The saved `evidence-audit.json` states its scope explicitly: reproducibility and provenance, not novelty or removal of all instrumental systematics.

## Primary sources consulted

- [IRSA SPHEREx data access](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/) and the original DR1 IBE URLs in manifests.
- [Park et al. (2021), NEOWISE YSO variability](https://arxiv.org/abs/2107.10751), with coordinate-matched published table rows saved from [VizieR J/ApJ/920/132](https://vizier.cfa.harvard.edu/viz-bin/VizieR?-source=J/ApJ/920/132).
- [Ferreira Lopes et al. (2015), WFCAM Variable Star Catalog](https://www.aanda.org/articles/aa/full_html/2015/01/aa23793-14/aa23793-14.html), including the original WVSC298 row in the saved table.
- [Arnold et al. (2012), NGC1333 infrared survey](https://iopscience.iop.org/article/10.1088/0067-0049/201/2/12/pdf), ASR7/SVS14 identity.
- [Günther et al. (2014), YSOVAR L1688](https://doi.org/10.1088/0004-6256/148/6/122) and [IRSA YSOVAR](https://irsa.ipac.caltech.edu/data/SPITZER/YSOVAR/); the specific GY152 object-table cone was empty.
- [IRSA Gator API](https://irsa.ipac.caltech.edu/applications/Gator/GatorAid/irsa/catsearch.html), SIMBAD Harvard TAP, MAST Gaia DR3 and Harvard VizieR responses saved with query provenance.
- [JDISC survey (2026)](https://arxiv.org/html/2607.22839), independent context identifying GY152 as a low-mass flat-spectrum young source. No mass measurement is derived from our light curve.
