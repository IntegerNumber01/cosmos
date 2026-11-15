# Additional data worth using in COSMOS

Research date: November 15, 2026. These are proposals, not implemented integrations. Availability and clean matches for individual COSMOS targets have not been verified in this review.

## Recommendation

The strongest new cross-mission feature is one compact **Object history** view: real SPHEREx changes, historical NEOWISE light curves, and VarWISE context for the same source. Begin with one source with clean, unambiguous measurements. The strongest extension of the core mission is explicit SPHEREx QR3 support.

The official Best Use of Data category recognizes accessibility and distinctive application of space data. It does not publish a reward for the number of datasets: [Judging Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/).

## Existing versus new

COSMOS already uses SPHEREx DR1 spectral images and its all-sky cube, Gaia DR3, SIMBAD, JPL small-body identification, and MOST. Explore already has a historical AllWISE image overlay. The public spectrum is an exploratory aperture measurement with stated limitations. These existing sources should not be presented as newly integrated datasets.

The public release configuration remains DR1-only. A refresh checks that collection again, not QR3.

## Ranked candidates

| Source | New question it helps answer | Suggested presentation | Work/risk assessment |
| --- | --- | --- | --- |
| NEOWISE single-exposure photometry | Did this source vary during the previous decade? | Quality-filtered W1 and W2 light curves, with errors, actual dates, image links and mission labels | Strong public-facing benefit. Requires correct association, artifact filtering, saturation checks and handling blends. |
| VarWISE Pure/Extended Catalogs and Associations Table | Has an infrared variability survey already characterized this source? | Compact prior-variability card with predicted class, confidence, period where credible, artifact/blending indicators and citations | Likely smaller integration than a full image/time-series service. An association must be verified; absence is not novelty evidence. |
| SPHEREx QR3 | What happened in additional SPHEREx observations beyond our DR1 baseline? | One chronological SPHEREx sequence, with release provenance and fair wavelength selection | Direct challenge relevance. Extends the engine, release-aware caches and tests; do not silently relabel old caches. |
| 2MASS images | Where was a sufficiently detected nearby source around 1997–2001? | Registered historical postage stamp with actual observation date and a Gaia-predicted path | Strong visual motion story. Cross-survey brightness differences are not automatically temporal changes. |
| IRSA SPHEREx spectrophotometry output | Can a source spectrum be measured with PSF-aware fitting and neighbor treatment? | Prepared, quality-checked spectrum with errors, per-point dates, flags and provenance | Improves measurement depth. Jobs may take minutes to hours; obtain and cache a small example rather than putting jobs on the first-use path. |

These implementation assessments are judgments from the current repository architecture, not measured effort estimates.

## 1. WISE/NEOWISE history

The NEOWISE Reactivation archive contains time-tagged measurements at 3.4 and 4.6 microns from December 13, 2013 through August 1, 2024. Earlier WISE phases add observations around 2010–2011 through their respective products. Do not label the entire 2010–2024 interval as one continuously operating mission or one uninterrupted light curve.

Sources:

- [Final NEOWISE data release](https://irsa.ipac.caltech.edu/data/WISE/docs/release/NEOWISE/)
- [WISE mission phases and archive tools](https://irsa.ipac.caltech.edu/Missions/wise.html)
- [NEOWISE source database](https://irsa.ipac.caltech.edu/data/WISE/docs/release/NEOWISE/expsup/sec2_1.html)
- [Quality selection and cautions](https://irsa.ipac.caltech.edu/data/WISE/docs/release/NEOWISE/expsup/sec2_3.html)

The archive explicitly includes spurious extractions and poor-quality frames. Use documented frame and source-quality criteria, inspect images, account for saturation and blending, and report the selection. A fixed small positional cone can miss a high-proper-motion source or collect a neighbor over a decade; propagate positions or use an appropriate association method.

Keep W1, W2 and SPHEREx measurements distinguishable by mission and passband. Different filter responses, angular resolutions and extraction methods prevent treating their raw values as one interchangeable brightness curve. Cross-mission quantitative comparisons require an explicit calibration/bandpass treatment. Historical light curves provide context; they do not independently confirm a specific later SPHEREx event.

## 2. VarWISE: particularly relevant to our candidate investigations

The official IRSA release lists a Pure Catalog with 457,080 high-confidence variable objects and an Extended Catalog with 1,918,082 objects. Its Associations Table connects catalog objects to the contributing NEOWISE detections.

Available fields include predicted variable class, classification confidence, candidate periods and alias warnings, W1/W2 variability amplitudes, and indicators for source confusion and latent artifacts. Show machine classifications as predictions, retain uncertainty, and distinguish Pure from Extended provenance.

- [VarWISE overview and access](https://irsa.ipac.caltech.edu/data/WISE/VarWISE/overview.html)
- [Column meanings](https://irsa.ipac.caltech.edu/data/WISE/VarWISE/gator_docs/varwise_colDescriptions.html)
- [Pure Catalog DOI](https://doi.org/10.26131/IRSA656)
- [Extended Catalog DOI](https://doi.org/10.26131/IRSA657)
- [Associations Table DOI](https://doi.org/10.26131/IRSA658)

This is a useful additional check before any claim about previously unknown variability. An existing classification need not establish that a specific event was reported; no catalog match establishes neither source novelty nor event novelty.

## 3. QR3: more of the most relevant data

IRSA's November 12, 2026 announcement says reprocessed DR1 images form a uniformly processed dataset with QR3. Its data-access guide directs users to search both `spherex_dr1` and `spherex_qr3` for current wide-survey spectral images, with corresponding `_deep` collections for deep fields. QR2 is superseded.

- [IRSA release announcements](https://irsa.ipac.caltech.edu/news.html)
- [Current collections and data access](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/)
- [Image and calibration products](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/)

The uniform-processing announcement is encouraging for integration. Still validate header parsing, wavelengths, flags, cached provenance and photometry across selected samples. Do not infer a specific DR1-versus-QR3 calibration offset from older QR2 cautions. Measure release overlap, unique observations and useful additional epochs before advertising a coverage increase.

## 4. 2MASS and a longer positional baseline

2MASS observed during 1997–2001 in J, H and Ks near-infrared bands and provides images and catalogs. For a suitable high-proper-motion source, its historical image can make the passage of decades understandable.

- [2MASS overview](https://irsa.ipac.caltech.edu/applications/2MASS/)
- [Image cutout service](https://irsa.ipac.caltech.edu/applications/2MASS/IM/interactive.html)

Use the actual image date, align on background sources, distinguish predicted and measured positions, and check detections, saturation and blends independently in each image. A source absent from an earlier survey may simply be below that survey's sensitivity or observed in a different band. A movement example is a safer starting point than a cross-survey brightness subtraction.

## 5. Better extracted SPHEREx spectra

IRSA's spectrophotometry service performs forced source modeling, can fit close neighbors together when their positions are supplied, and returns fluxes, errors, wavelengths, flags, fit-quality values and exposure provenance. The help warns that processing one source can take minutes to hours.

[IRSA spectrophotometry documentation](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html)

For one curated target, a prepared output would allow comparison with our simpler aperture spectrum and clearer explanation of blending. Keep the processing method and release visible, inspect quality, and retain per-point dates: a spectrum assembled across changing epochs can mix temporal variability with wavelength structure. Spectral features need validation before any molecular identification or temperature/composition claim.

## 6. Target-specific optional source: Spitzer YSOVAR

YSOVAR supplies 3.6 and 4.5 micron time-series data for young sources in selected star-forming regions. It is scientifically relevant to our fresh-field work, but coverage is not all-sky, and the presence of a field in the program does not establish that every candidate has a released light curve. The local discovery log already records a missing YSOVAR match for GY 152; do not imply a light curve exists for it without checking.

[YSOVAR data and released field documentation](https://irsa.ipac.caltech.edu/data/SPITZER/YSOVAR/)

## Presentation that avoids adding clutter

Use one source-focused panel:

1. **What changed?** The SPHEREx comparison and a short measured-result summary.
2. **Has it happened before?** NEOWISE history, with W1/W2 distinct and the later SPHEREx interval clearly marked.
3. **What is already known?** Verified identity and VarWISE/SIMBAD context, with uncertainty.
4. **Why trust it?** Expandable quality selection, errors, observation dates and original data links.

Missing coverage stays missing. Predictions stay distinguishable from measurements. Select one clean, useful example before generalizing to arbitrary coordinates. Keep the first-use experience focused while enabling deeper inspection.
