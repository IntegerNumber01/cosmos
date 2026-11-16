import Link from "next/link";
import NavBar from "@/components/NavBar";
import Advanced from "@/components/Advanced";

export const metadata = { title: "About the data · COSMOS" };

const SOURCES = [
  {
    title: "SPHEREx map of the whole sky",
    plain: "The zoomable infrared sky you see in Explore.",
    name: "SPHEREx DR1 all-sky cube (HiPS)",
    use: "Explore: the zoomable sky in 102 wavelengths",
    detail: "102 frames, 0.753–4.988 µm, frame = 17·(band−1) + (channel−1). Frames 51–52 (2.40/2.45 µm) are blank (dichroic). Striping is reported near 1.88, 3.3 and 4.05 µm. It's a time-averaged mosaic with no time axis.",
    link: "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube",
    doi: "10.26131/IRSA679",
  },
  {
    title: "Individual SPHEREx pictures, each with a date",
    plain: "Used in Time Travel and Investigate to compare dates.",
    name: "SPHEREx DR1 Level-2 spectral images",
    use: "Investigate + Time Travel: dated exposures",
    detail: "Found with the IRSA SIA2 service (collection spherex_dr1). Small cutouts come from IBE (?center=…&size=0.25). We use the IMAGE, FLAGS, VARIANCE and WCS-WAVE planes.",
    link: "https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_dr1&POS=circle+314.2422+-5.6897+0.01",
    doi: "10.26131/IRSA678",
  },
  {
    title: "NASA's tool for finding moving objects",
    plain: "Predicts where comet SWAN should appear in SPHEREx pictures.",
    name: "IRSA Moving Object Search Tool (MOST)",
    use: "Where comet C/2025 R2 (SWAN) was predicted to be",
    detail: "catalog=spherex, object C/2025 R2 (NAIF 1004092), 2025-09-01 to 2026-03-01: 205 matched frames. Positions are listed at exposure START.",
    link: "https://irsa.ipac.caltech.edu/applications/MOST/",
  },
  {
    title: "Catalogs of known stars, galaxies, asteroids and comets",
    plain: "Answers \"is this already known?\" in Time Travel.",
    name: "SIMBAD and NASA/JPL Small-Body Identification",
    use: "Time Travel: \"is it already known?\"",
    detail: "SIMBAD TAP (Harvard mirror, CDS fallback): named objects near a position, propagated from J2000 with proper motion. JPL sb_ident: known asteroids (V ≤ 21) and comets at the exact time of an exposure, queried separately to keep each lookup under a minute.",
    link: "https://ssd-api.jpl.nasa.gov/doc/sb_ident.html",
  },
  {
    title: "ESA's Gaia star survey",
    plain: "Measured distances that place 59,218 stars in 3D for Fly.",
    name: "ESA Gaia DR3",
    use: "Fly: 3D positions of 59,218 stars · Time Travel: star overlay and known-object check",
    detail: "gaiadr3.gaia_source via the ESA Gaia Archive TAP. Two samples: parallax > 20 mas with parallax/error > 10 (within 50 pc), and G < 6.5 with parallax/error > 5. Distance = 1/parallax. Epoch J2016.0.",
    link: "https://gea.esac.esa.int/archive/",
  },
];

const TRUTH = [
  ["Sky brightness at each wavelength", "Measured (SPHEREx DR1 cube)", "Colors are false-color maps of intensity"],
  ["Dates and times of every frame", "Measured (FITS DATE-AVG)", "Shown in UTC"],
  ["Wavelength of each exposure at the comet", "Measured (WCS-WAVE lookup)", "Each SPHEREx exposure is a different wavelength"],
  ["Comet positions and motion", "Measured by us from the pixels", "Gaussian photocenter fit, compared with the MOST prediction"],
  ["Comet's predicted path", "Calculated (MOST ephemeris)", "Always labeled as a prediction"],
  ["Which dates are compared", "Measured (WCS-WAVE at the target)", "Same detector; every pair within half a channel"],
  ["Change maps (Find changes)", "Derived, empirically scaled", "Indicator only; scaled by the measured scatter of the difference"],
  ["Brightness and position on each date", "Measured on native pixels", "Empirical errors; flagged apertures report no value"],
  ["Gaia stars drawn on dated frames", "Calculated (Gaia DR3 proper motion)", "A prediction for each date"],
  ["Star positions in 3D", "Measured (Gaia DR3 parallax)", "Uncertainty shown for every star"],
  ["Star colors in 3D", "Approximated from Gaia BP−RP", "Display only"],
  ["Depth in SPHEREx images", "Not available", "SPHEREx records no distance per pixel; COSMOS adds none"],
];

const SUMMARY: [string, string][] = [
  [
    "What the data is",
    "Real pictures of the whole sky from NASA's SPHEREx space telescope, which maps the sky in 102 shades of infrared light. Plus star distances measured by ESA's Gaia spacecraft.",
  ],
  ["Where it comes from", "Public science archives run by NASA and the European Space Agency. Every image, date and distance links back to its source."],
  [
    "What COSMOS can tell you",
    "What the sky looks like in light our eyes can't see, when SPHEREx looked at a spot, and whether something there changed between two dates.",
  ],
  [
    "What it can't tell you",
    "SPHEREx pictures don't show how far away things are, so the 3D view uses Gaia's star distances only. A change between dates is a clue, not a discovery, and a prediction is never shown as a sighting.",
  ],
];

const H2 = "font-display mt-12 text-[22px] font-semibold";
const PLAIN = "mt-2 max-w-2xl text-[14.5px] leading-relaxed text-text/80";
const ADV = "mt-3";

export default function About() {
  return (
    <main className="min-h-screen bg-bg pb-24">
      <NavBar />
      <div className="mx-auto max-w-[980px] px-5 pt-24">
        <div className="label text-accent">About</div>
        <h1 className="font-display mt-2 text-[34px] font-semibold leading-tight sm:text-[38px]">Where this data comes from</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-text/80">
          COSMOS turns real NASA space-telescope data into something anyone can explore. Nothing here is invented.
        </p>

        <div className="glass mt-6 grid gap-4 rounded-2xl p-5 sm:grid-cols-2">
          {SUMMARY.map(([h, t]) => (
            <div key={h}>
              <div className="text-[14px] font-semibold text-white">{h}</div>
              <p className="mt-1 text-[13.5px] leading-relaxed text-text/80">{t}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] text-muted">
          Infrared is light just beyond red, invisible to our eyes. It shines through dust that hides stars in ordinary light. COSMOS is a NASA Space Apps
          2026 project, not an official NASA or ESA product.
        </p>

        <h2 className={H2}>Data sources</h2>
        <p className={PLAIN}>Five public sources, each one linked so you can check it yourself.</p>
        <div className="mt-4 space-y-3">
          {SOURCES.map((s) => (
            <div key={s.name} className="glass rounded-2xl p-4">
              <div className="text-[15px] font-semibold">{s.title}</div>
              <p className="mt-0.5 text-[13.5px] text-text/80">{s.plain}</p>
              <Advanced label="Technical details and links" openLabel="Hide technical details" className="mt-2">
                <div className="text-[12.5px] font-semibold text-text/90">{s.name}</div>
                <div className="text-accent">{s.use}</div>
                <p className="mt-1">{s.detail}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <a className="text-accent hover:underline" href={s.link} target="_blank" rel="noreferrer">
                    Source ↗
                  </a>
                  {s.doi && (
                    <a className="text-accent hover:underline" href={`https://doi.org/${s.doi}`} target="_blank" rel="noreferrer">
                      doi:{s.doi} ↗
                    </a>
                  )}
                </div>
              </Advanced>
            </div>
          ))}
        </div>

        <h2 className={H2}>What is measured, and what is not</h2>
        <p className={PLAIN}>
          Most of what you see was measured by a telescope. A few things are predictions or display aids, and we always label them. The pictures have no
          depth, so we never add any.
        </p>
        <Advanced label="Show the full list" openLabel="Hide the full list" className={ADV}>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-[13px]">
              <thead className="bg-white/5 text-left text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">On screen</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {TRUTH.map(([a, b, c]) => (
                  <tr key={a} className="border-t border-line/60">
                    <td className="px-4 py-2 text-text/90">{a}</td>
                    <td className={`px-4 py-2 ${b.startsWith("Measured") ? "text-good" : b.startsWith("Not") ? "text-warn" : "text-accent"}`}>{b}</td>
                    <td className="px-4 py-2 text-muted">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Advanced>

        <h2 className={H2}>How Time Travel works</h2>
        <p className={PLAIN}>
          COSMOS finds every picture SPHEREx took of a spot. It keeps only pictures taken in the same shade of infrared, so the comparison is fair. Then it
          lines them up and points out what changed.
        </p>
        <p className="mt-2 text-[13px]">
          <Link href="/validation" className="text-accent hover:underline">
            See how we tested it on the five challenge targets →
          </Link>
        </p>
        <Advanced label="Show the method" openLabel="Hide the method" className={ADV}>
          <div className="text-[13px] font-semibold text-text/90">Any coordinates to a dated sequence</div>
          <ol className="mt-2 list-decimal space-y-2 pl-5 leading-relaxed">
            <li>
              <b>Find.</b> The server asks IRSA SIA2 for every SPHEREx DR1 frame covering the position. For each frame it estimates the wavelength at that exact
              spot from the footprint polygon and the detector&apos;s WCS-WAVE table. Checked against the full WCS on 93 frames: within 7 px, or about 0.001 µm.
            </li>
            <li>
              <b>Match.</b> Dates are grouped by detector so that every pair agrees within half a channel in wavelength. Each cutout&apos;s header is then used to
              recompute the exact wavelength, and frames outside the tolerance are excluded and listed. The page also shows how far the wavelengths drift at the
              field corners, because the filter gradient differs between visits.
            </li>
            <li>
              <b>Align.</b> Cutouts are fetched and parsed on the server (IRSA sends no CORS headers) and reprojected in the browser onto one north-up grid. That
              reprojection is for display only.
            </li>
            <li>
              <b>Find changes.</b> We subtract two matched dates over pixels valid on both. The result is scaled by its own robust scatter and split into
              brightened, faded, moved (two spots of similar size and strength) and likely-residual regions.
            </li>
            <li>
              <b>Measure.</b> Brightness and centroid come from each frame&apos;s native pixels, with errors from blank-sky control apertures. Positions also carry a
              stated 0.5″ alignment allowance. The headline brightness change is calibrated against Gaia reference stars measured the same way in the same
              images; with too few clean references or an overlapping neighbor, no calibrated number is given.
            </li>
            <li>
              <b>Is it known?</b> Gaia DR3 and SIMBAD positions are propagated to the date. NASA/JPL lists the known asteroids and comets in the field at the time
              the object was visible. &quot;No match&quot; is never presented as a discovery.
            </li>
          </ol>
          <p className="mt-3">
            The TypeScript FITS, WCS and wavelength code matches astropy to 4×10⁻¹⁰″ and 4×10⁻⁷ µm. Featured targets ship a prepared copy of the same
            responses, so they still work if the archive is down.
          </p>
          <div className="mt-4 text-[13px] font-semibold text-text/90">Combine, inspect wavelengths, and share</div>
          <p className="mt-2">
            Time Travel can play every compatible exposure, including observations on the same day, or one exposure per day. Date filters use UTC; paging
            gives access to all selected exposures. Visit stacks are means on a common sky grid, with unusable and wavelength-mismatched pixels excluded. A
            visit spans at most 30 minutes, 2 hours, or 24 hours; moving sources can still smear. Subtracting visits checks the combined wavelength coverage
            at each pixel. Native-pixel measurements remain separate from these display means.
          </p>
          <p className="mt-2">
            The Wavelength lab samples up to one exposure per nominal channel and creates six detector-band previews from the available channels. Channels
            receive equal weight; missing or flagged samples are excluded and coverage is reported. These previews may mix observing dates and are not
            integrated filter fluxes. The aperture spectrum uses a 2-pixel radius, local background subtraction, empirical blank-sky errors, and a local WCS
            solid angle to convert to mJy. It has no aperture correction, PSF fit, or deblending, so blended neighbors and changing source brightness can
            distort its shape. Per-point dates, flags, errors and source FITS links are available in the table and CSV.
          </p>
          <p className="mt-2">
            Explicit refresh checks DR1 again and reports failure without substituting old data as a new archive answer. Prepared caches retain their query
            timestamp; rebuilt caches carry an engine/release version and checksums. Shared investigation URLs preserve the field, date range, exact
            wavelength window, exposure selections, display mode and visit settings. Explore can overlay WISE imagery at adjustable opacity: it is a 2010-era
            mosaic at different wavelengths, useful for context rather than a matched SPHEREx epoch.
          </p>
        </Advanced>

        <h2 className={H2}>The comet SWAN case</h2>
        <p className={PLAIN}>
          NASA&apos;s tools predicted where comet SWAN should appear in SPHEREx pictures. We found it in the pictures, measured how it moved, and compared that
          with the prediction.
        </p>
        <Advanced label="Show the method" openLabel="Hide the method" className={ADV}>
          <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
            <li>
              <b>Predict.</b> MOST lists the SPHEREx frames that should contain comet C/2025 R2 (SWAN): 205 frames. The 20 brightest are from 27–28 Oct 2025.
            </li>
            <li>
              <b>Fetch.</b> 0.25° cutouts come from IBE, and each file is checked to be real FITS. Flag names, bits and descriptions are read from each
              file&apos;s FLAGS header (MSKN/MSKM/MSKD cards), never typed in by hand.
            </li>
            <li>
              <b>Measure.</b> In every frame, the coma photocenter is found by a peak search and a 2D Gaussian fit with a planar background. It&apos;s converted
              to RA/Dec with that frame&apos;s own WCS. S/N comes from the VARIANCE plane.
            </li>
            <li>
              <b>Compare.</b> The MOST ephemeris is evaluated at mid-exposure (MOST lists start times). Per sequence we fit the measured speed and direction and
              compare them with the prediction. Field stars act as a control (they must not move), and a vacancy test checks that the comet&apos;s first
              position empties out.
            </li>
            <li>
              <b>Time Travel.</b> We paired each 27 Oct frame with the 1 May 2026 frame of the same detector whose wavelength at the position matches within a
              quarter channel (0.004–0.014 µm apart). The change in the comet&apos;s aperture is measured on native pixels, with errors from 48 blank-sky
              apertures per frame. The &quot;what changed&quot; map uses a common valid-pixel mask and is rescaled by its measured field scatter, because the
              nominal variance understates it by 1.3–3.3× after resampling.
            </li>
            <li>
              <b>Publish.</b> PNG/JSON assets carry their OBSID, detector, wavelength, timestamp and links to the original FITS and the exact cutout.
            </li>
          </ol>
        </Advanced>

        <h2 className={H2}>Known problems we kept visible</h2>
        <p className={PLAIN}>
          Real data has flaws, and we show them instead of hiding them. For example, very bright stars overwhelm the camera, so COSMOS gives no measurement
          rather than a wrong one.
        </p>
        <Advanced label="Show all caveats" openLabel="Hide caveats" className={ADV}>
          <ul className="list-disc space-y-2 pl-5 leading-relaxed">
            <li>
              The SPHEREx pipeline flags the comet&apos;s core as <span className="data">OUTLIER</span>, because a moving object is an outlier against the static
              sky. We keep those pixels for the comet and still reject hardware and processing flags.
            </li>
            <li>
              In astropy, the alternate wavelength WCS picks up the image&apos;s SIP distortion terms by default. Unless those are removed, wavelengths come out
              wrong. We remove them.
            </li>
            <li>
              The suggested WISE 0855 epoch pair (May vs Nov 2025) is <b>not</b> at the same wavelength (2.365 vs 1.629 µm). We don&apos;t difference it.
            </li>
            <li>
              A small residual along-track offset remains: about 2″ in detectors 1, 2 and 4, and 8″ in detector 5. We report it and don&apos;t explain it away.
            </li>
            <li>
              The archive&apos;s nominal noise, carried through resampling, understates the real scatter of difference maps by 1.3–3.3×. We rescale by the
              measured scatter. Even then, 0.2–3% of field pixels exceed 5 from star residuals. We call these maps indicators, not probabilities.
            </li>
            <li>
              Within one SWAN sequence, the first and last exposures are 3–4 channel widths apart in wavelength. Those difference images mix time and color,
              so we use them only to show <i>where</i> the comet moved.
            </li>
            <li>
              Motion was measured in 6 detector sequences from 3 observation blocks; detector pairs share exposures. One of the six speeds differs from the
              prediction by 2.4σ, which we report as unexplained.
            </li>
            <li>
              Bright stars (e.g. Barnard&apos;s Star, R Draconis) are saturated in many SPHEREx channels. Their apertures are flagged, so COSMOS reports no
              measurement rather than a wrong one.
            </li>
            <li>
              Very bright stars (Sirius A, Vega, Betelgeuse…) aren&apos;t in our Gaia sample. A star gets a name only when a Gaia source matches its position,
              distance and brightness.
            </li>
          </ul>
        </Advanced>

        <h2 className={H2}>Check our work</h2>
        <p className={PLAIN}>All the code that downloads and processes the data is in the project, so anyone can rerun it.</p>
        <Advanced label="Show the scripts" openLabel="Hide the scripts" className={ADV}>
          <pre className="data overflow-x-auto rounded-2xl border border-line bg-black/40 p-4 text-[12px] leading-relaxed text-text/80">
{`pipeline/fetch_swan.py          # MOST table -> 20 verified SPHEREx cutouts
pipeline/swan_measure.py        # detection, motion, star control, vacancy test
pipeline/build_swan_assets.py   # aligned frames, difference images, case.json
pipeline/timetravel_select.py   # wavelength at the target for every SIA2 visit
pipeline/build_timetravel.py    # matched-wavelength pairs, D and Z maps
pipeline/fetch_gaia.py          # Gaia DR3 TAP queries
pipeline/build_gaia_assets.py   # 3D star binary + verified labels
pipeline/export_wave_tables.py  # WCS-WAVE tables for the TypeScript engine
pipeline/validate_targets.py    # validation records for the five challenge targets
web/scripts/check-wcs.ts        # TypeScript FITS/WCS/wavelength vs astropy
web/scripts/build-cache.ts      # prepared cache = same bytes as the live API`}
          </pre>
        </Advanced>

        <h2 className={H2}>Acknowledgements</h2>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">Parts of the code, explanatory text and documentation were created or revised with OpenAI Codex assistance. Observations come from the named public archives; measured quantities, predictions and display aids are identified separately.</p>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          This work uses data from SPHEREx, a NASA mission managed by JPL, with data processing and archiving at IPAC/Caltech. Data were obtained from the
          NASA/IPAC Infrared Science Archive (IRSA). It also uses data from the European Space Agency mission Gaia, processed by the Gaia Data Processing and
          Analysis Consortium (DPAC). Sky rendering uses Aladin Lite (CDS, Strasbourg). COSMOS is an independent NASA Space Apps Challenge 2026 project. It
          isn&apos;t an official NASA or ESA product.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/explore" className="btn btn-primary">
            Explore the sky →
          </Link>
          <Link href="/investigate" className="btn">
            Open the case file
          </Link>
        </div>
      </div>
    </main>
  );
}
