# Archive resilience and a dependable walkthrough

Start at `/timetravel?target=epsindib` (also linked as **See a real change** on Home), compare the saved dates, then measure the target. The eight featured fields ship 130 real DR1 cutouts, about 5.8 MB total. Their default menus contain only the saved exposures, so choosing another listed colour or date does not unexpectedly require IRSA. The UI labels this as a selected subset rather than a complete observation history. Native measurements, quality masks, wavelength checks, and uncertainty rules are unchanged.

**Check for newer observations** explicitly requests the live discovery service. It retains the previous investigation if the request fails. A failed new-coordinate search keeps the coordinates and offers a retry, the infrared sky map, or a separately labelled prepared example. A service failure is never interpreted as zero observations or a scientific non-detection. HiPS is a time-averaged map, not a replacement for dated Level-2 images.

## AWS image fallback

The official [IRSA cloud documentation](https://irsa.ipac.caltech.edu/cloud_access/) lists DR1 in the anonymous `nasa-irsa-spherex` bucket. The [older registry entry](https://registry.opendata.aws/spherex-qr/) describes QR2; COSMOS retains its DR1 processing baseline and DOI rather than mixing releases.

For a known DR1 exposure, the server tries IRSA IBE twice with short bounded requests, then reads the matching original FITS from the fixed public S3 host. The whole operation has a 54 s budget within the route's declared 60 s maximum. Only the needed native image/variance row slabs and compressed mask rows are fetched. The implementation checks exact HTTP 206 byte ranges, bounded sizes, exposure identity, supported dimensions and compression, and adjusts CRPIX1/2 and CRPIX1W/2W after cropping. The original IBE URL remains the exposure identity; the S3 URL and crop origin are recorded separately. Unsupported or incomplete files fail explicitly.

AWS is a second delivery path for known images, not a spatial search API. A new sky position with no saved inventory still depends on SIA2. The reported position `266.71577, -30.44494` has no prepared inventory in this repository; we do not substitute another field or manufacture a dated photo for it. Catalogue lookups have their own independent services and can also fail explicitly.

## Reproduce checks

From `web/`:

```sh
npm run prepare:offline
npm test
npm run lint
npx tsc --noEmit
npm run build
node scripts/check-cloud.cjs  # optional: actual anonymous public AWS reads
```

The offline suite checks every exposure in every prepared menu against its shipped cutout. Three original compressed DR1 flag rows are checked against independent Astropy/CFITSIO SHA-256 results. The live cloud check compares native IMAGE, FLAGS and VARIANCE pixels, WCS positions and target wavelengths with saved IRSA cutouts in Epsilon Indi B, Comet SWAN and WISE 0855 fields. Browser regressions in `pipeline/tools/challenge_ui.py` and `pipeline/tools/discovery_ui.py` exercise real prepared cutouts, sharing, refresh failure, science controls and mobile layouts.

Keep the judge-facing walkthrough centred on reproducible evidence: Epsilon Indi B's measured motion, RW Aur's brightening, the known comet identification, and the search follow-ups with their caveats. An archive outage does not establish an award exemption; the prepared walkthrough makes the core evidence directly usable regardless of the live service.
