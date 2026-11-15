# SPHEREx AWS fallback: verified findings and proposed integration

Researched November 15, 2026. Read-only investigation; no AWS account, resources, deployment, or application integration was created.

## Findings

1. The public bucket is `nasa-irsa-spherex` in `us-east-1`. Anonymous HTTPS listing succeeded and showed `dr1/`, `qr2/`, and `qr3/`.
2. The registry page supplied by the user describes QR2. The newer [IRSA Cloud Data Access page](https://irsa.ipac.caltech.edu/cloud_access/) explicitly documents DR1 and QR3 in the same bucket and says their newer registry entries are pending publication. Keep COSMOS on DR1 for this fallback.
3. A real DR1 file was accessed successfully with an HTTP byte-range request. No credentials were used. The response was HTTP 206 and included `Content-Range: bytes 0-119999/65543040`.
4. The FITS header identified observation `2025W17_4B_0017_1`, detector 2, observed April 24, 2025, matching an existing COSMOS observation record. This verifies accessibility and identity, not pixel-for-pixel equivalence of a complete derived cutout.
5. Current prepared-cache inventory: **130 cutouts across eight fields**, totaling **5,809,868 bytes**. All default first-page sequences selected by the current engine have every required cutout present. Other wavelengths/pages are not all prepared.

The verified object was:

```text
s3://nasa-irsa-spherex/dr1/level2/2025W17_4B/l2b-v27-2026-196/2/level2_2025W17_4B_0017_1D2_spx_l2b-v27-2026-196.fits
```

## What AWS replaces

| Stage | Current COSMOS path | What changes with AWS |
| --- | --- | --- |
| Find observations by coordinates | IRSA SIA2 returns image names, dates, footprints, and URLs | Public bucket listing is organized by release, planning period, processing version, detector, and filename. It does not directly replace this coordinate query. |
| Retrieve a small image | IRSA IBE applies `center` and `size` and serves a FITS cutout | S3 serves file bytes. We must extract the region ourselves, optionally using byte ranges. Query-string cutout parameters do not provide an S3 cutout service. |
| Parse, display, align, and measure | Existing FITS/WCS engine and public viewer | Much of this is reusable, with validation of the new extraction and metadata. |

The official [cloud tutorial](https://caltech-ipac.github.io/irsa-tutorials/cloud-access-intro/) itself uses SIA2 to discover images and then reads their cloud locations. That workflow still depends on IRSA discovery unless the image inventory has already been saved or an independent index is built.

The inspected DR1 bucket prefixes contain image and calibration products; this review did not locate an independent, ready-to-query sky-coordinate exposure index. A whole-sky fallback should not be promised based on successful access to one known file.

## Meaning of a subset

A subset is genuine observations of a limited set of fields on multiple dates, processed by the actual app. It is not a fabricated animation or a requirement to download the survey.

In [discussion #2165](https://github.com/nasa/spaceapps/discussions/2165), Prateek-SME recommends small cutouts from several dates. dancaselden likewise recommends small sky regions and reiterates the challenge's five benchmark targets. This supports a limited real-data proof of concept; it does not guarantee a particular judging score.

Our prepared data already provide such a subset:

| Field | Saved cutouts | Required default first-page images missing |
| --- | ---: | ---: |
| Barnard's Star | 10 | 0 |
| WISE 0855 | 17 | 0 |
| Epsilon Indi B | 25 | 0 |
| RW Aurigae | 15 | 0 |
| R Draconis | 40 | 0 |
| GY 152 | 7 | 0 |
| GP Mon | 4 | 0 |
| SWAN field | 12 | 0 |

These counts establish stored data availability, not that every scientific measurement is reliable. Saturation and other existing per-target verdicts remain unchanged. Source/catalogue lookups may still depend on external services and must report their own availability.

## Proposed work, in order

### A. Make the existing subset fully dependable

Small scope, largely cache auditing and presentation work because the data already exist:

- Publish an explicit list of prepared comparisons, including available fields, dates, wavelengths, and field sizes.
- Check each promised comparison against actual saved files and their provenance.
- Distinguish prepared options from selections requiring live retrieval.
- Run every advertised prepared comparison while blocking archive network requests.
- Keep original dates, flags, source IDs, uncertainty treatment, and scientific verdicts visible.

Acceptance: a judge can open the advertised real-data examples, compare dates, and use local measurements while the image archive is unavailable. Unavailable catalogue checks are labelled rather than treated as no matches.

### B. Add an AWS fallback for known DR1 files

Moderate scope; a prototype and validation likely require several focused hours. This is an engineering estimate, not a completed implementation or guaranteed schedule.

- Use saved observation records to identify exact file keys. Prefer documented `cloud_access` where available; validate any deterministic mapping from the known DR1 IBE URL.
- Keep the public bucket and allowed DR1 key prefix fixed. Do not expose an arbitrary URL-fetch proxy.
- Read FITS headers and the required IMAGE, FLAGS, and VARIANCE region. Range reads avoid fetching the whole ~65.5 MB example file, but the range reader must handle offsets, pixel types, scaling, and bounded requests correctly.
- Adjust celestial and spectral WCS reference pixels for the extracted rectangle.
- Preserve original observation IDs, release, processing version, time, flags, variance, and source provenance.
- Pack the result into the existing browser format.
- Compare native pixels, flags, variance, sky coordinates, and wavelengths against existing trusted cutouts. Recheck measurements on multiple detectors and edge cases before advertising the fallback.
- Keep an explicit provenance label distinguishing the delivery location from the scientific release.

Acceptance: with IRSA cutout access blocked, an uncached exposure from a saved inventory can be read from S3 and agrees with a trusted reference. Failures never produce fabricated images or empty-result claims.

This is a different delivery route for the same DR1 data, not a new-mission integration. COSMOS can remain on Vercel. Public data access requires no AWS account or credentials, per the official documentation; application hosting still uses its normal resources.

### C. Restore arbitrary-coordinate discovery without IRSA

Larger scope: obtain/build and serve a searchable footprint/time inventory for the desired survey coverage, then connect it to the file fallback. There is no substantiated drop-in S3 URL replacement for the current coordinate-search endpoint. For coordinates outside our saved inventories, such as the user's reported field at RA 266.71577, Dec -30.44494, this remains the missing piece.

## Judging and accommodations

The [outage discussion #2183](https://github.com/nasa/spaceapps/discussions/2183), [#2245](https://github.com/nasa/spaceapps/discussions/2245), and [#2257](https://github.com/nasa/spaceapps/discussions/2257) contain independent reports and workaround advice. The GO Team acknowledges access problems in #2183. Navigators/participants recommend documenting the outage and using saved data; some ask the GO Team whether judges will be informed.

No reviewed reply promises a score adjustment, unchanged award odds, extra time, or guaranteed judging accommodation. A participant tagging organizers is not confirmation of a policy decision. Do not infer a new rule from those replies.

Suggested factual submission wording:

> COSMOS includes prepared real SPHEREx DR1 observations for eight example fields so its image comparisons remain available during archive outages. Live searches at other coordinates depend on NASA/IPAC IRSA, whose search interfaces returned timeouts and HTTP 502 errors during our testing on November 15. Observation dates, source identifiers, and measurement limitations are retained.

Do not claim the AWS fallback is implemented until it is integrated and validated. The read-only AWS proof establishes feasibility for known files.

## Sources

- [User-linked AWS registry entry](https://registry.opendata.aws/spherex-qr/)
- [Current IRSA Cloud Data Access information](https://irsa.ipac.caltech.edu/cloud_access/)
- [IRSA SPHEREx data-access guide](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/)
- [IRSA cloud-access tutorial](https://caltech-ipac.github.io/irsa-tutorials/cloud-access-intro/)
- [SME guidance on small multi-epoch datasets](https://github.com/nasa/spaceapps/discussions/2165)
