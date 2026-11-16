# Archive resilience and a dependable walkthrough

Start at `/timetravel?target=epsindib` (also linked as **See a real change** on Home), compare the saved dates, then measure the target. The eight featured fields ship 130 real DR1 cutouts, about 5.8 MB total. Their default menus contain only the saved exposures, so choosing another listed colour or date does not unexpectedly require IRSA. The UI labels this as a selected subset rather than a complete observation history. Native measurements, quality masks, wavelength checks, and uncertainty rules are unchanged.

**Check for newer observations** explicitly requests the live discovery service. It retains the previous investigation if the request fails. A failed new-coordinate search keeps the coordinates and offers a retry, the infrared sky map, or a separately labelled prepared example. A service failure is never interpreted as zero observations or a scientific non-detection. HiPS is a time-averaged map, not a replacement for dated Level-2 images.

If HiPS metadata itself is unavailable, Explore reports the map failure and links to saved dated photos. Metadata queries are awaited before adding Aladin layers, so its internal rejected layer promise does not escape as an unhandled browser error.

## AWS image fallback

The official [IRSA cloud documentation](https://irsa.ipac.caltech.edu/cloud_access/) lists DR1 in the anonymous `nasa-irsa-spherex` bucket. The [older registry entry](https://registry.opendata.aws/spherex-qr/) describes QR2; COSMOS retains its DR1 processing baseline and DOI rather than mixing releases.

For a known DR1 exposure, the server tries IRSA IBE twice with short bounded requests, then reads the matching original FITS from the fixed public S3 host. The whole operation has a 54 s budget within the route's declared 60 s maximum. Only the needed native image/variance row slabs and compressed mask rows are fetched. The implementation checks exact HTTP 206 byte ranges, bounded sizes, exposure identity, supported dimensions and compression, and adjusts CRPIX1/2 and CRPIX1W/2W after cropping. The original IBE URL remains the exposure identity; the S3 URL and crop origin are recorded separately. Unsupported or incomplete files fail explicitly.

AWS is a second delivery path for known images, not a spatial search API. A new sky position with no saved inventory still depends on SIA2. The reported position `266.71577, -30.44494` has no prepared inventory in this repository; we do not substitute another field or manufacture a dated photo for it. Catalogue lookups have their own independent services and can also fail explicitly.

## Prepared motion during an archive outage

All eight Time Travel quick picks now include the wider 0.2-degree native cutouts used by Motion and reference-star photometry: **130 images**, covering every exposure in their saved menus, plus a Gaia DR3 reference field for each target. The 87 previously missing wider images were read directly from the public **DR1** AWS objects; existing IBE cutouts were retained. IMAGE, FLAGS and VARIANCE agree exactly at every overlapping native pixel with the original smaller saved cutouts. Detector-edge clipping stays explicit in each image's dimensions; no missing pixels are filled.

The five challenge reference fields are built from the original validation ECSV, preserving exact Gaia source IDs, J2016 coordinates, variability flags and measured parallax uncertainties. GY 152 and SWAN use newly saved Gaia queries with provider and query provenance. GP Mon retains its existing saved reference field. Each target's `calibration_manifest.json` records image and catalog SHA-256 checksums. Motion recomputes against the actual selected source and exposures locally; it does not reuse another source's precomputed answer.

The saved `motion_analysis.json` in each target directory records an offline preflight of the default and offered matched selections, including both cadences and all 12-exposure pages: **40 selections** in total. The default results are:

| Quick pick | Default reference-star motion result |
| --- | --- |
| Epsilon Indi B | 4.79 ± 0.59 arcsec over five independent visits; fitted rates agree with the catalog. |
| RW Aurigae | 0.18 ± 0.50 arcsec across two visits; no significant displacement or rate fit. |
| GP Mon | 0.81 ± 1.02 arcsec across two visits; no significant displacement or rate fit. |
| Barnard's Star | Refused: insufficient clean target measurements. |
| WISE 0855 | Refused: insufficient clean target measurements. The specified-track stack remains available. |
| R Draconis | Refused: insufficient clean target measurements. |
| GY 152 | Refused: fewer than three clean isolated reference stars per exposure. |
| SWAN field | Refused at the fixed field coordinates: incomplete/weak target or displaced centroid. The dedicated comet investigation is separate; this is not an ephemeris fit. |

A refused analysis is a completed quality check, not a network failure or a scientific non-detection. Arbitrary sky positions and newly requested observations still require discovery/catalog services; these files cover the featured saved fields only.

To rebuild from the repository root, first run `pipeline/.venv/Scripts/python pipeline/prepare_motion_catalogues.py`. From `web/`, run `node scripts/prepare-motion-cache.cjs` (anonymous public AWS/Gaia reads; existing files are validated and reused), then `node scripts/preflight-motion.cjs --write` (offline). `pipeline/tools/prepared_motion_ui.py URL` checks every quick pick with archive and catalog APIs returning 502, including the three specified-track stacks.

## Reproduce checks

### Catalog identity and solar-system checks

Image availability and identity checks use separate services. The eight featured fields now include Gaia DR3 and SIMBAD answers for every saved image time (90 queries rounded to MJD precision of 0.00001 day, covering 101 distinct exposure-average times across 130 images). Times come from each FITS MJD-AVG, not the inventory's exposure-start time. These identity fields use Gaia sources with valid G photometry without the calibration catalog's G < 18 cutoff, plus independent SIMBAD field queries. Original records, queries, provider and retrieval time are retained under `data/raw/identification/`; positions are propagated from J2016 for Gaia and J2000 for SIMBAD, consistently with the live route.

The client checks saved answers first, verifies both the index and stored query, and uses a wider saved field only when it contains the whole requested cone. It recomputes separations and filters each returned row. Requested services are handled separately: an HTTP 200 containing one failed check cannot erase another service's saved success. Saved answers are labeled in the interface and carry provenance in JSON evidence. An unknown position, uncovered cone or different observation time still requires the relevant live service. A lookup failure remains a failure, never an empty catalog.

The [JPL SB Identification API](https://ssd-api.jpl.nasa.gov/doc/sb_ident.html) explicitly disallows MPC observer code `500`. Requests now use the zero Earth-relative observer state `xobs=0,0,0,0,0,0`, validate API version, table counts, coordinates and rate units, and filter the returned rectangle to the stated circular cone. RA search width accounts for declination. Comet and asteroid requests run sequentially. These are geocentric predictions; nearby objects can differ from SPHEREx's orbital viewpoint, so a nearby result alone does not confirm an association.

Saved JPL answers cover the default walkthrough selections (both cadences), the highlighted GY 152 comparison dates, and SWAN's 27 October 2025 observation. The normal preparation command prioritizes this scope; `--all-epochs` additionally requests every saved time. Other times use the corrected live lookup. Each JPL answer must match the observation time within about one second, distinguish comets from asteroids, and contain the entire requested field. Asteroids retain the V ≤ 21 restriction; comet searches allow objects without magnitude estimates. `identification_manifest.json` records checksums. Preparation never saves failed checks as empty successes.

From `web/`, run `node scripts/prepare-identifications.cjs` to prepare/reuse the identity fields and default JPL answers. `--stars-only`, `--bodies-only`, individual target slugs and `--all-epochs` support bounded updates. The full JPL sweep is optional and slow because requests must be serialized; successful files are reused on rerun.

`pipeline/tools/identification_ui.py URL` checks all eight defaults plus SWAN's actual comet observation with every live API returning 502, verifies the known-comet answer and confirms source/query provenance survives JSON export. The offline suite validates every native exposure time, the highlighted JPL checks, containment and epoch refusals, per-service failures, and identification-manifest checksums.

From `web/`:

```sh
npm run prepare:offline
npm test
npm run lint
npx tsc --noEmit
npm run build
node scripts/check-cloud.cjs  # optional: actual anonymous public AWS reads
```

The offline suite checks every exposure in every prepared menu against its shipped cutout. Three original compressed DR1 flag rows are checked against independent Astropy/CFITSIO SHA-256 results. The live cloud check compares native IMAGE, FLAGS and VARIANCE pixels, WCS positions and target wavelengths with saved IRSA cutouts in Epsilon Indi B, Comet SWAN and WISE 0855 fields, and injects an IRSA outage to check automatic fallback. Browser regressions in `pipeline/tools/challenge_ui.py`, `pipeline/tools/discovery_ui.py` and `pipeline/tools/outage_ui.py` exercise real prepared cutouts, sharing, refresh failure, science controls, mobile layouts, all eight fields with archive routes unavailable, the reported failing coordinates, repeated Fly navigation and keyboard access. Fly's projected labels stay in the page's React tree to avoid a reproduced double-removal error during WebGL teardown.

Keep the judge-facing walkthrough centred on reproducible evidence: Epsilon Indi B's measured motion, RW Aur's brightening, the known comet identification, and the search follow-ups with their caveats. An archive outage does not establish an award exemption; the prepared walkthrough makes the core evidence directly usable regardless of the live service.
