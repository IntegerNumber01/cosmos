import Link from "next/link";
import NavBar from "@/components/NavBar";
import Advanced from "@/components/Advanced";

export const metadata = { title: "Blind sky search: results and evidence · COSMOS" };

function Figure({ name, alt, caption, detail, className = "" }: { name: string; alt: string; caption: string; detail: string; className?: string }) {
  return <figure className={`mt-5 overflow-hidden rounded-xl border border-line bg-white ${className}`}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <a href={`/data/discovery/${name}.pdf`} target="_blank" rel="noreferrer"><img src={`/data/discovery/${name}.png`} alt={alt} className="h-auto w-full" /></a>
    <figcaption className="border-t border-line bg-bg p-3 text-[13px] leading-relaxed text-muted">
      {caption}
      <Advanced className="mt-1.5" label="About this figure" openLabel="Hide figure details">
        {detail} <a href={`/data/discovery/${name}.pdf`} className="text-accent">Download PDF ↗</a>
      </Advanced>
    </figcaption>
  </figure>;
}

export default function SearchCase() {
  return <main className="min-h-screen bg-bg pb-20">
    <NavBar />
    <article className="mx-auto max-w-[900px] px-4 pt-24 sm:px-6">
      <Link href="/investigate" className="text-[13px] text-accent">← All case files</Link>
      <div className="label mt-7 text-accent">Case file · A blind search of SPHEREx pictures</div>
      <h1 className="font-display mt-2 text-3xl font-semibold sm:text-4xl">What a blind search found</h1>
      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-text/85">We scanned six clouds where stars are being born, looking for anything that changed between SPHEREx pictures. Three things stood out.</p>
      <p className="mt-3 max-w-3xl rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-[14px] leading-relaxed"><b className="text-warn">The answer:</b> all three are objects astronomers already knew about. We found interesting behaviour, but nothing here is a new discovery.</p>
      <Advanced className="mt-3">
        <p>We searched six fresh fields, rather than starting with known variable-star positions. Follow-up found a promising dimming event, a striking colour-dependent brightening, and a spectral false positive. Every counterpart below is already known. We have not established a new astronomical object or proven that an event is previously unreported.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">{[["59", "initial native images"], ["774", "usable source-pair comparisons"], ["13", "candidate clusters, all inspected"]].map(([n,t]) => <div key={t} className="glass rounded-xl p-3"><div className="data text-2xl text-accent">{n}</div><div className="mt-1 text-[12px] text-muted">{t}</div></div>)}</div>
        <p className="mt-3">Selected exposures on D2 and D5 in NGC 1333, IC 348, L1688, Serpens, NGC 2264 and Orion L1641. These are detections and comparisons, not unique-source counts or a complete sky survey. Follow-up acquired additional exposures.</p>
      </Advanced>

      <section id="gy152" className="mt-14 scroll-mt-24">
        <div className="label text-warn">Possible dimming · not confirmed as new</div>
        <h2 className="font-display mt-1 text-2xl font-semibold">GY 152 looked dimmer on one day</h2>
        <Figure name="gy152-images" alt="Seven real sky images of GY 152 at two wavelength windows, with a red cross at the source" caption="The same spot on different dates. Darker means brighter here, and the red cross marks GY 152. The dimmer pictures are from 16 August 2025 (third on top, second below)." detail="Images are aligned for display; measurements use each original pixel grid. One linear stretch is shared within each row. White gaps are masked pixels. Aperture radii from 2 to 4 pixels reproduce the direction and approximate size of the dips." />
        <p className="mt-4 text-[14.5px] leading-relaxed text-text/85">On 16 August 2025 this known young star looked about 15–23% fainter in two separate pictures. By March 2026 it was back to normal.</p>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text/85">We don&apos;t know what caused it or how long it lasted. And we can&apos;t prove nobody has seen it before.</p>
        <div className="mt-4 flex flex-wrap gap-2"><Link href="/timetravel?target=gy152&mode=swipe" className="btn btn-primary">Compare the pictures yourself</Link></div>
        <Advanced className="mt-4">
          <p>On 16 August 2025, this known young source was about <b className="text-text">23% fainter near 3.85 µm</b> and <b className="text-text">15% fainter near 3.92 µm</b> than on earlier dates. The exposures were taken at 08:22 and 14:57 UTC. March 2026 measurements returned to the earlier level. A second image missed during the initial download recovered the second dip measurement.</p>
          <Figure name="gy152-lightcurve" alt="GY 152 field-calibrated light curves showing lower flux on 16 August 2025 at both wavelength windows" caption="Brightness over time at two infrared wavelengths. The low points are 16 August 2025." detail="Ratios use native-pixel EPSF fits and common field stars. The 3.85 µm dip is 0.773 ± 0.033 relative to 13 August, with 29 controls; the 3.92 µm dip is 0.854 ± 0.040 with 30 controls. Errors include comparison-star scatter and at least a 3% systematic floor. The plotted 3.85 µm reference is 10 August; that comparison gives 0.765 ± 0.039." />
          <p className="mt-4">The wavelength offsets are about 0.16 channel widths, so spectral and detector effects still require care. This is a sparse light curve, not an eclipse profile, a measured period, or evidence of a planet. The cause and event duration are unmeasured. GY 152 is also ISO-Oph 77 / 2MASS J16265429−2424381, at RA 246.726222°, Dec −24.410601°. It is distinct from ISO-Oph 50.</p>
          <p className="mt-3">The <a href="https://vizier.cfa.harvard.edu/viz-bin/VizieR?-source=J/ApJ/920/132" target="_blank" rel="noreferrer" className="text-accent">Park et al. (2021) NEOWISE catalogue</a> includes a match 1.73″ away, ID D2164: ΔW2 = 0.25 mag, with both variability-class fields blank. We interpret that as no class assigned in that table, not proof that nobody has reported variability. Gaia DR3, VSX and YSOVAR cone checks returned no matches; those absences cannot establish novelty. <a href="/data/discovery/prior-catalogues.json" className="text-accent">Inspect the saved catalogue responses ↗</a></p>
          <div className="mt-3 flex flex-wrap gap-2"><a href="/data/discovery/gy152.json" className="btn">Measurements + field controls (JSON)</a><a href="/data/discovery/gy152-pairs.csv" className="btn">Ratios (CSV)</a></div>
        </Advanced>
      </section>

      <section id="gpmon" className="mt-14 scroll-mt-24">
        <div className="label text-good">Known variable star · new measurement</div>
        <h2 className="font-display mt-1 text-2xl font-semibold">GP Mon brightened a lot in one colour, barely in another</h2>
        <Figure name="gpmon-images" className="max-w-[560px]" alt="GP Mon before and after images at 1.19 and 3.94 microns, showing a stronger change at the shorter wavelength" caption="Before and after, at two infrared colours. The change is much stronger in the top row (the shorter wavelength)." detail="GP Mon is already a catalogued variable. SPHEREx does not resolve its close A/B components, so this measures their combined light. These two dates do not identify the physical cause or establish a new kind of variability." />
        <p className="mt-4 text-[14.5px] leading-relaxed text-text/85">Between 29 September and 11 November 2025, GP Mon got about 2.3 times brighter at a shorter infrared wavelength. At a longer one it changed little, if at all.</p>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text/85">It was already known to vary, and it is really two stars SPHEREx sees as one dot. Seeing many colours at once is what reveals the difference.</p>
        <div className="mt-4 flex flex-wrap gap-2"><Link href="/timetravel?target=gpmon" className="btn btn-primary">Explore GP Mon</Link></div>
        <Advanced className="mt-4">
          <p>Between 29 September and 11 November 2025, the unresolved GP Mon system brightened by <b className="text-text">2.30 ± 0.16 times near 1.193 µm</b>, while its ratio near 3.936 µm was <b className="text-text">1.11 ± 0.07</b>. Each detector sampled nearly identical wavelengths on the two dates: offsets were below 0.004 channel widths. This is a useful demonstration of why 102 channels can reveal more than a single blink movie.</p>
          <Figure name="gpmon-chromatic" alt="GP Mon flux ratios showing a 2.30-fold change at 1.19 microns and a 1.11-fold ratio at 3.94 microns" caption="How much brighter GP Mon got at each wavelength." detail="Independent reference ensembles contain 24 and 35 stars. D2 and D5 measurements are simultaneous within each visit; they are two colours, not independent time confirmations. The smaller long-wavelength change is not strongly significant." />
          <div className="mt-3 flex flex-wrap gap-2"><a href="/data/discovery/gpmon.json" className="btn">Measurements (JSON)</a><a href="/data/discovery/gpmon-pairs.csv" className="btn">Ratios (CSV)</a></div>
        </Advanced>
      </section>

      <section id="asr7" className="mt-14 scroll-mt-24">
        <div className="label text-warn">False alarm · explained</div>
        <h2 className="font-display mt-1 text-2xl font-semibold">ASR 7: a trick of colour, not a change in time</h2>
        <Figure name="asr7-spectrum" alt="ASR 7 spectrum with an absorption-shaped dip near 4.27 microns, sampled at different wavelengths in August 2025 and February 2026" caption="Brightness of ASR 7 across many infrared colours. Note the deep dip near 4.27 µm." detail="Only points with a clean 3-pixel aperture and a usable native EPSF fit are included. Horizontal bars indicate half the local channel bandwidth. CO₂ is an interpretation of the feature's location, not a new molecular detection claim. The plotted dates and wavelengths do not form identical spectra." />
        <p className="mt-4 text-[14.5px] leading-relaxed text-text/85">At first ASR 7 seemed to double in brightness. More pictures showed it has a deep dip at one infrared colour, and the two dates had measured slightly different parts of that dip.</p>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text/85">So we rejected it as a change in time. COSMOS now warns you about this trap.</p>
        <Advanced className="mt-4">
          <p>An apparent twofold brightening passed a half-channel wavelength check. Additional images revealed a deep dip near 4.27 µm, consistent with the CO₂ absorption region. The two dates had sampled different parts of that dip. We therefore rejected the temporal interpretation; the data do not establish a change in the absorption itself. COSMOS now reports the actual wavelength span and explains this ambiguity in its measurement panel.</p>
          <a href="/data/discovery/asr7-spectrum.json" className="btn mt-3">Spectral measurements + source files (JSON)</a>
        </Advanced>
      </section>

      <section className="glass mt-14 rounded-2xl p-5">
        <h2 className="font-display text-xl font-semibold">How we checked</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-text/85">Every lead was measured again, compared with nearby stars, and looked up in star catalogues. Not finding an object in a catalogue doesn&apos;t make it new.</p>
        <Advanced className="mt-3">
          <p>Blind local maxima supplied the source positions. Initial ratios used clean native apertures, local wavelengths and an ensemble of field stars. Every one of the 13 fresh-field candidates received native-image remeasurement and SIMBAD, Gaia and VSX checks. The strongest leads received repeat-exposure searches, EPSF fits, multiple aperture radii, common reference ensembles and literature checks. EC 129, another strong Serpens lead, is already WVSC 298 in the published WFCAM variability catalogue; its lack of a VSX match did not make it new.</p>
          <p className="mt-3">Error bars here are empirical estimates, not global discovery probabilities. Crowding, the undersampled PSF, calibration, unflagged artifacts and wavelength dependence remain relevant. Blank catalogue results and failed services are recorded separately. No blind-screen threshold is presented as proof of a discovery.</p>
          <a href="/data/discovery/candidate-ledger.json" className="btn mt-3">All 13 candidates: measurements, catalogue checks and dispositions (JSON)</a>
          <p className="mt-3">Primary references: <a href="https://arxiv.org/abs/2107.10751" className="text-accent" target="_blank" rel="noreferrer">Park et al. (2021)</a> · <a href="https://www.aanda.org/articles/aa/full_html/2015/01/aa23793-14/aa23793-14.html" className="text-accent" target="_blank" rel="noreferrer">WFCAM Variable Star Catalog</a> · <a href="https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/" className="text-accent" target="_blank" rel="noreferrer">SPHEREx data access</a></p>
        </Advanced>
      </section>
    </article>
  </main>;
}
