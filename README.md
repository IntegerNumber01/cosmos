# COSMOS: The Infrared Universe Explorer

**The sky changes. See the evidence.**

Team Sol27 · NASA Space Apps Challenge 2026 · Planet X and SPHEREx

COSMOS helps students and astronomy clubs investigate the changing infrared sky using real NASA SPHEREx observations. Compare dates, measure motion or brightness on native image pixels, check known objects, and download the evidence with uncertainties and original data links.

## Start an investigation

Run the app locally, then try:

- **Learn** (`/learn`): blink Epsilon Indi B's images and measure its motion. Continue with a brightening star and a blended-star false alarm.
- **Time Travel** (`/timetravel`): choose a featured target or enter coordinates to compare wavelength-matched observations.
- **Explore** (`/explore`) and **Fly** (`/fly`): browse the infrared sky or Gaia's measured 3D star positions, then investigate a location.
- **Validate** (`/validation`): inspect the five challenge targets, rerun saved measurements, and review the motion benchmark.

Eight featured fields include prepared observations for archive outages. Arbitrary-coordinate searches and live catalogue checks depend on public services; the saved fallback inventory covers only part of the sky.

## Run locally

Requires **Node.js 22 LTS** and npm. Python and API keys are not required to run the web app.

```sh
cd web
npm ci
npm run dev
```

Open http://localhost:3000. For a production build, run `npm run build`, then `npm start`. Deploy with `web/` as the project root and a Node runtime that supports the API routes' 60-second limit.

## Evidence and limitations

| Investigation | Reported result | Evidence |
| --- | --- | --- |
| Epsilon Indi B | Reference-corrected displacement **4.79 ± 0.59″** in the prepared D2 sequence | [Motion method and controls](docs/MOTION.md) |
| RW Aurigae | Independent offline brightness change **−0.53 ± 0.06 mag** at 0.744 µm | [Five-target validation](docs/VALIDATION.md) |
| C/2025 R2 (SWAN) | Known comet detected in **20/20** matched frames; five of six detector sequences agree with predicted speed within 2σ | [Comet analysis and discrepancy](docs/MILESTONE1_REPORT.md) |
| Additional Gaia stars | Of 229 benchmark stars, 48 accepted and 181 refused; correction improves 28 accepted cases and worsens 20 | [Benchmark protocol](docs/motion-benchmark-protocol.json) |

Measurements and catalogue predictions are kept separate. Saturated, blended, or otherwise unusable measurements are refused. The time-averaged all-sky mosaic is for exploration; dated Level-2 images supply temporal comparisons. Gaia supplies stellar distances; SPHEREx images have no per-pixel depth.

These are scoped analyses with documented uncertainties, selection effects, and failures. No new-object discovery, independent learning gains, or broad adoption is claimed. See [impact evidence](docs/IMPACT_EVIDENCE.md).

## Review and reproduce

- [Technical overview](docs/TECHNICAL_OVERVIEW.md): architecture, methods, full results, and data-rebuilding commands.
- [Challenge coverage](docs/CHALLENGE_COVERAGE.md): implemented capabilities and acceptance checks.
- [Discovery search](docs/DISCOVERY_SEARCH.md): fresh-field search, candidate follow-up, and rejected false positives.
- [Archive resilience](docs/ARCHIVE_RESILIENCE.md): prepared observations, partial inventory, provenance, and service fallbacks.
- [Demo slides](docs/demo/COSMOS-demo.pdf) and [demo script](docs/DEMO_SCRIPT.md).
- [Contributing](CONTRIBUTING.md): checks, browser verification, and scientific change requirements.

From `web/`, run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`. GitHub Actions runs these checks on pushes and pull requests. Python 3.12 is used only for offline science pipelines and browser checks; dependencies are listed in [pipeline/requirements.txt](pipeline/requirements.txt) and [pipeline/requirements-browser.txt](pipeline/requirements-browser.txt).

## Data and acknowledgements

SPHEREx data: NASA/JPL/Caltech-IPAC via NASA/IPAC IRSA — [DR1 spectral images](https://doi.org/10.26131/IRSA678) and [all-sky HiPS cube](https://doi.org/10.26131/IRSA679). Additional resources: ESA Gaia DR3 / DPAC, SIMBAD / CDS, IRSA MOST, NASA/JPL Small-Body Identification, and Aladin Lite / CDS. Original observation URLs and retrieval provenance accompany the prepared data and reports.

COSMOS is an independent Space Apps project, not an official NASA or ESA product.
