"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import NavBar from "@/components/NavBar";
import SkyViewer, { SkyLine, SkyMarker } from "@/components/SkyViewer";
import EvidencePanel from "@/components/investigate/EvidencePanel";
import FrameStage from "@/components/investigate/FrameStage";
import TimeTravelStage from "@/components/investigate/TimeTravelStage";
import Advanced from "@/components/Advanced";
import { CaseFile, Sequence, TTFile, fmtUTC } from "@/lib/caseTypes";
import { wavelengthColor } from "@/lib/spherex";
import { useReducedMotion } from "@/lib/useReducedMotion";

const STEPS = [
  { id: "prediction", n: 1, title: "The prediction", short: "Where should it be?" },
  { id: "observation", n: 2, title: "The observation", short: "The pictures" },
  { id: "timetravel", n: 3, title: "Time Travel", short: "Months later" },
  { id: "measurement", n: 4, title: "The measurement", short: "Does it match?" },
  { id: "verdict", n: 5, title: "The verdict", short: "The answer" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

function seqLabel(s: Sequence) {
  const t = new Date(s.date_first + "Z");
  const d = t.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const h = t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false });
  return { when: `${d} ${h}`, what: `D${s.detector} · ${s.wavelength_range_um[0].toFixed(2)}–${s.wavelength_range_um[1].toFixed(2)} µm` };
}

function Check({ ok, title, detail }: { ok: boolean; title: string; detail: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
          ok ? "bg-good/20 text-good" : "bg-warn/20 text-warn"
        }`}
      >
        {ok ? "✓" : "!"}
      </span>
      <div>
        <div className="text-[13.5px] font-medium">{title}</div>
        <div className="text-[12.5px] leading-relaxed text-muted">{detail}</div>
      </div>
    </li>
  );
}

export default function InvestigateClient() {
  const [cf, setCf] = useState<CaseFile | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const reduced = useReducedMotion();
  const [tt, setTt] = useState<TTFile | null>(null);
  const [step, setStep] = useState<StepId>("prediction");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("step");
    const found = STEPS.find((x) => x.id === q);
    if (found) setStep(found.id);
  }, []);
  const [seqId, setSeqId] = useState("2025W44_1A_0045_D1");
  const [fi, setFi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"frames" | "difference">("frames");
  const [ov, setOv] = useState({ pred: false, meas: false, flags: false, trail: false });
  const [pairId, setPairId] = useState<string | null>(null);
  const [ttView, setTtView] = useState<"wipe" | "blink" | "change">("wipe");

  useEffect(() => {
    fetch("/data/swan/case.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setCf)
      .catch((e) => setLoadErr(String(e.message ?? e)));
    fetch("/data/timetravel/pairs.json")
      .then((r) => r.json())
      .then((d: TTFile) => {
        setTt(d);
        setPairId(d.pairs[0]?.id ?? null);
      });
  }, []);

  // overlay defaults per step
  useEffect(() => {
    if (step === "observation") {
      setOv({ pred: false, meas: false, flags: false, trail: false });
      setMode("frames");
      setPlaying(!reduced);
    } else if (step === "measurement") {
      setOv({ pred: true, meas: true, flags: false, trail: true });
      setMode("frames");
      setPlaying(false);
    } else setPlaying(false);
  }, [step, reduced]);

  const seq = cf?.sequences.find((s) => s.id === seqId);
  useEffect(() => setFi(0), [seqId]);
  useEffect(() => {
    if (!playing || !seq || mode !== "frames") return;
    const id = setInterval(() => setFi((i) => (i + 1) % seq.n), 750);
    return () => clearInterval(id);
  }, [playing, seq, mode]);

  const pair = tt?.pairs.find((p) => p.id === pairId) ?? null;

  const trackLines: SkyLine[] = useMemo(() => {
    if (!cf) return [];
    const pts = cf.predicted_track.map((p) => [p.ra, p.dec] as [number, number]);
    return [{ id: "pred", points: pts, color: "rgba(127,216,255,0.85)", width: 2, dashed: true }];
  }, [cf]);
  const trackMarkers: SkyMarker[] = useMemo(() => {
    if (!cf) return [];
    const seen = new Set<string>();
    const ms: SkyMarker[] = [];
    for (const s of cf.sequences) {
      if (seen.has(s.obs_block)) continue;
      seen.add(s.obs_block);
      const f = s.frames[0];
      ms.push({
        id: s.id,
        name: ms.length === 0 ? "Measured in SPHEREx, 27–28 Oct 2025" : seqLabel(s).when,
        ra: f.measured.ra,
        dec: f.measured.dec,
        color: "#6ef0b0",
        size: 12,
        label: ms.length === 0,
      });
    }
    return ms;
  }, [cf]);

  if (!cf || !seq) {
    return (
      <main className="grid min-h-screen place-items-center">
        <NavBar />
        {loadErr ? (
          <div className="text-warn">
            The case file couldn&apos;t be loaded ({loadErr}).{" "}
            <button className="btn ml-2" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        ) : (
          <div className="text-muted">Opening case file…</div>
        )}
      </main>
    );
  }

  const frame = seq.frames[fi];
  const lead = cf.sequences.filter((s) => s.n >= 4);
  const stepIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <main className="relative min-h-screen bg-bg pb-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(80,120,255,0.12),transparent_70%)]" />
      <NavBar />
      <div className="relative mx-auto max-w-[1320px] px-4 pt-20 sm:px-6">
        <Link href="/investigate" className="text-[13px] text-accent">
          ← All case files
        </Link>
        {/* plain-language story: object, question, picture, answer */}
        <div className="mt-3 grid items-center gap-5 md:grid-cols-[260px_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/img/investigate.webp"
            alt="Comet SWAN as a fuzzy blob in a real SPHEREx picture"
            className="pixelated aspect-square w-full max-w-[180px] rounded-2xl border border-line object-cover md:max-w-[260px]"
          />
          <div>
            <div className="label text-accent">Case file 001 · A comet on the move</div>
            <h1 className="font-display mt-1 text-[30px] font-semibold leading-tight sm:text-[38px]">
              Can we catch comet SWAN moving in NASA&apos;s pictures?
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-text/85">
              Comet SWAN was discovered in September 2025. Its orbit tells us where it should be, but a prediction isn&apos;t a sighting. So we looked for it in
              real pictures from NASA&apos;s SPHEREx space telescope.
            </p>
            <p className="mt-3 max-w-2xl rounded-lg border border-good/25 bg-good/5 px-3 py-2 text-[14px] leading-relaxed">
              <b className="text-good">The answer:</b> yes. It&apos;s in all 20 pictures from 27–28 Oct 2025, where its orbit said it would be, and it has left
              that spot by May 2026. SWAN was already known, so this confirms it. It isn&apos;t a discovery.
            </p>
            <Advanced className="mt-2">
              Long-period comet {cf.object.name}, NAIF ID {cf.object.naif_id}. Every frame below is a real, dated SPHEREx DR1 exposure. A prediction counts as
              evidence only when the measurement agrees with it.
            </Advanced>
          </div>
        </div>

        {/* steps */}
        <p className="mt-8 text-[13px] text-muted">Follow the evidence in five steps:</p>
        <nav className="mt-2 flex flex-wrap gap-2" aria-label="Investigation steps">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                step === s.id ? "border-accent/60 bg-accent/10 text-white" : i < stepIdx ? "border-line text-text/80" : "border-line text-muted hover:text-white"
              }`}
            >
              <span
                className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold ${
                  step === s.id ? "bg-accent text-black" : i < stepIdx ? "bg-good/25 text-good" : "bg-white/10"
                }`}
              >
                {i < stepIdx ? "✓" : s.n}
              </span>
              {s.short}
            </button>
          ))}
        </nav>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* ================= STAGE ================= */}
          <section className="min-w-0">
            {step === "prediction" && (
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-line">
                <SkyViewer
                  ra={345}
                  dec={4}
                  fov={80}
                  frame={3}
                  colormap="magma"
                  markers={trackMarkers}
                  lines={trackLines}
                />
                <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-2 text-[11.5px] leading-relaxed">
                  <div>
                    <span className="text-accent">━━</span> predicted path, worked out from the orbit (not a sighting)
                  </div>
                  <div>
                    <span className="text-good">○</span> where we actually found the comet in SPHEREx pictures
                  </div>
                  <div className="text-dim">Background: SPHEREx infrared map of the whole sky</div>
                </div>
              </div>
            )}

            {(step === "observation" || step === "measurement") && (
              <>
                <FrameStage seq={seq} frameIndex={fi} mode={mode} showPred={ov.pred} showMeas={ov.meas} showFlags={ov.flags} showTrail={ov.trail} />
                {/* timeline */}
                <div className="glass mt-3 rounded-2xl p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button className={`btn ${playing ? "btn-primary" : ""}`} onClick={() => setPlaying((p) => !p)} disabled={mode !== "frames"}>
                      {playing ? "❚❚ Pause" : "▶ Blink"}
                    </button>
                    <div className="flex flex-1 gap-1.5">
                      {seq.frames.map((f, i) => (
                        <button
                          key={f.productid}
                          onClick={() => {
                            setFi(i);
                            setPlaying(false);
                            setMode("frames");
                          }}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-left transition ${
                            i === fi && mode === "frames" ? "border-white/40 bg-white/10" : "border-line hover:bg-white/5"
                          }`}
                        >
                          <div className="data text-[12px]">
                            {new Date(f.date_avg + "Z").toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false })}
                          </div>
                          <div className="data text-[10.5px]" style={{ color: wavelengthColor(f.wavelength_um) }}>
                            {f.wavelength_um.toFixed(3)} µm
                          </div>
                        </button>
                      ))}
                    </div>
                    <button
                      className={`btn ${mode === "difference" ? "btn-primary" : ""}`}
                      onClick={() => {
                        setMode((m) => (m === "frames" ? "difference" : "frames"));
                        setPlaying(false);
                      }}
                    >
                      {mode === "difference" ? "Show pictures" : "Show what moved"}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                    {(
                      [
                        ["pred", "Predicted spot", "text-accent"],
                        ["meas", "Where we found it", "text-good"],
                        ["trail", "Its path", "text-good"],
                        ["flags", "Pixels flagged by NASA's software", "text-warn"],
                      ] as const
                    ).map(([k, label, cls]) => (
                      <label key={k} className="flex cursor-pointer items-center gap-1.5">
                        <input type="checkbox" checked={ov[k]} onChange={(e) => setOv((o) => ({ ...o, [k]: e.target.checked }))} className="accent-cyan-300" />
                        <span className={cls}>{label}</span>
                      </label>
                    ))}
                    <span className="ml-auto text-dim">{fmtUTC(frame.date_avg, true)}</span>
                  </div>
                </div>
                {/* sequence chooser */}
                <Advanced className="mt-3" label={`Try another set of pictures (${cf.sequences.length} sets)`} openLabel="Hide the other picture sets">
                  <p className="mb-2">Each set comes from one of SPHEREx&apos;s detectors (D1–D6) and covers a small range of infrared wavelengths.</p>
                  <div className="flex flex-wrap gap-2">
                    {cf.sequences.map((s) => {
                      const l = seqLabel(s);
                      return (
                        <button
                          key={s.id}
                          onClick={() => setSeqId(s.id)}
                          className={`rounded-xl border px-3 py-1.5 text-left transition ${s.id === seqId ? "border-accent/60 bg-accent/10" : "border-line hover:bg-white/5"}`}
                        >
                          <div className="data text-[12px] text-text">{l.when} UTC</div>
                          <div className="text-[11px] text-muted">
                            {l.what} · {s.n} exp.
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Advanced>
              </>
            )}

            {step === "timetravel" && pair && (
              <>
                <TimeTravelStage pair={pair} view={ttView} />
                <div className="glass mt-3 flex flex-wrap items-center gap-2 rounded-2xl p-3">
                  {(
                    [
                      ["wipe", "Swipe"],
                      ["blink", "Blink"],
                      ["change", "What changed"],
                    ] as const
                  ).map(([v, l]) => (
                    <button key={v} className={`btn ${ttView === v ? "btn-primary" : ""}`} onClick={() => setTtView(v)}>
                      {l}
                    </button>
                  ))}
                  <span className="mx-1 h-5 w-px bg-line" />
                  {tt!.pairs.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPairId(p.id)}
                      className={`rounded-lg border px-2.5 py-1 text-[11.5px] transition ${p.id === pairId ? "border-white/40 bg-white/10" : "border-line hover:bg-white/5"}`}
                    >
                      <span className="data" style={{ color: wavelengthColor(p.before.wavelength_um) }}>
                        D{p.detector} {p.before.wavelength_um.toFixed(3)}
                      </span>
                      <span className="text-dim"> ↔ </span>
                      <span className="data" style={{ color: wavelengthColor(p.after.wavelength_um) }}>
                        {p.after.wavelength_um.toFixed(3)} µm
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === "verdict" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {lead.slice(0, 4).map((s) => (
                  <div key={s.id} className="overflow-hidden rounded-2xl border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.diff_png} alt={`Difference image ${s.id}`} className="pixelated aspect-square w-full" />
                    <div className="px-3 py-2 text-[11.5px]">
                      <div className="data">{seqLabel(s).when} UTC</div>
                      <div className="text-muted">Blue: where the comet was. Red: where it went.</div>
                      <div className="text-dim">
                        {seqLabel(s).what} · last − first (mixed wavelengths: {s.diff_wavelength_gap_channels} channel widths)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ================= NARRATIVE + EVIDENCE ================= */}
          <section className="min-w-0 space-y-4">
            {step === "prediction" && (
              <div className="glass fade-up rounded-2xl p-5">
                <div className="label">Step 1</div>
                <h2 className="font-display mt-1 text-[22px] font-semibold">Where should the comet be?</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-text/85">
                  The comet&apos;s orbit is known, so we can work out where it was at any moment. A NASA search tool listed the SPHEREx pictures that should
                  contain it.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="data text-[24px] font-semibold text-accent">{cf.most.n_matched_frames}</div>
                    <div className="text-[12px] text-muted">pictures that should show the comet</div>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="data text-[24px] font-semibold text-accent">20</div>
                    <div className="text-[12px] text-muted">where it looks brightest, 27–28 Oct 2025</div>
                  </div>
                </div>
                <p className="mt-4 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-[13px] leading-relaxed text-text/80">
                  <b className="text-accent">A prediction isn&apos;t a sighting.</b> The dashed line is just maths. We still have to find the comet in the
                  pictures, at the right place and time.
                </p>
                <Advanced className="mt-3">
                  The prediction is an ephemeris from NASA/IPAC&apos;s <b className="text-text">Moving Object Search Tool (MOST)</b> at IRSA. It matched{" "}
                  {cf.most.n_matched_frames} SPHEREx DR1 frames. We use the 20 brightest, from 27–28 Oct 2025, when the comet was at V ≈ 11.3. The predicted
                  motion is ≈10″ per minute (≈1.6 SPHEREx pixels; one pixel is 6.15″).
                </Advanced>
                <button className="btn btn-primary mt-4" onClick={() => setStep("observation")}>
                  Look at the real pictures →
                </button>
              </div>
            )}

            {step === "observation" && (
              <div className="glass fade-up rounded-2xl p-5">
                <div className="label">Step 2</div>
                <h2 className="font-display mt-1 text-[22px] font-semibold">Something is moving against the stars</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-text/85">
                  These are {seq.n} real SPHEREx pictures taken a couple of minutes apart on {fmtUTC(seq.date_first).split(" · ")[0]}. The stars stay put.
                  Watch the fuzzy blob: that&apos;s the comet, sliding across the sky.
                </p>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">
                  Press <b className="text-text">Show what moved</b>. The comet becomes a blue/red pair: where it was, and where it went.
                </p>
                <p className="mt-3 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-[13px] leading-relaxed text-warn/90">
                  Each picture is taken in a slightly different infrared color. So we use these pictures only to see <i>where</i> the comet is, not how
                  bright it is.
                </p>
                <Advanced className="mt-3">
                  <p>
                    The comet moves about <b className="text-text">{Math.round(seq.measured_total_motion_arcsec)}″</b> in {seq.span_minutes.toFixed(1)}{" "}
                    minutes. The frames are aligned on the sky (north up, east left).
                  </p>
                  <p className="mt-2">
                    &quot;Show what moved&quot; subtracts the first exposure from the last. Stars mostly cancel, but not perfectly, because these two exposures
                    are <b className="text-text">{seq.diff_wavelength_gap_channels} channel widths apart in wavelength</b>. Read the difference for{" "}
                    <i>where</i> things moved, not for brightness changes.
                  </p>
                  <p className="mt-2">
                    Wavelength range of this sequence: {seq.wavelength_range_um[0].toFixed(3)} → {seq.wavelength_range_um[1].toFixed(3)} µm. SPHEREx&apos;s
                    linear variable filter changes wavelength across the detector, so brightness differences between frames can come from the comet&apos;s
                    spectrum, not from time. We use these frames for position only.
                  </p>
                </Advanced>
                <div className="mt-4 flex gap-2">
                  <button className="btn btn-primary" onClick={() => setStep("timetravel")}>
                    Travel to another date →
                  </button>
                </div>
              </div>
            )}

            {step === "timetravel" && pair && (
              <div className="glass fade-up rounded-2xl p-5">
                <div className="label">Step 3 · Time Travel</div>
                <h2 className="font-display mt-1 text-[22px] font-semibold">Same patch of sky, {Math.round(pair.days_apart)} days later</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-text/85">
                  SPHEREx came back to exactly this spot on <b>{fmtUTC(pair.after.date_avg).split(" · ")[0]}</b>. The stars
                  are all still there. The comet is gone.
                </p>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">
                  This is a fair test: same camera, nearly the same infrared color. The change at the comet&apos;s old spot is far bigger than the normal noise in the
                  pictures.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="label">Before</div>
                    <div className="data mt-1 text-[13px]">{fmtUTC(pair.before.date_avg)}</div>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="label">After</div>
                    <div className="data mt-1 text-[13px]">{fmtUTC(pair.after.date_avg)}</div>
                  </div>
                </div>
                <Advanced className="mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="data rounded-xl bg-white/5 p-3">
                    {pair.before.obsid} · D{pair.detector} · {pair.before.wavelength_um.toFixed(4)} µm
                    <div className="mt-1 font-sans">
                      Comet aperture: <span className="data">{pair.comet_aperture.flux_before.toFixed(0)}</span>
                    </div>
                  </div>
                  <div className="data rounded-xl bg-white/5 p-3">
                    {pair.after.obsid} · D{pair.detector} · {pair.after.wavelength_um.toFixed(4)} µm
                    <div className="mt-1 font-sans">
                      Comet aperture: <span className="data">{pair.comet_aperture.flux_after.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
                <p className="mt-3 leading-relaxed">
                  <b className="text-text">Why this comparison is fair:</b> same detector, and wavelengths that differ by only{" "}
                  {Math.abs(pair.delta_wavelength_um).toFixed(4)} µm ({Math.round(pair.delta_over_bandwidth * 100)}% of one channel&apos;s
                  bandwidth). We picked the later frame from every SPHEREx visit to this spot because its wavelength here matches.
                  Measured on each date&apos;s own pixels (no resampling), the comet&apos;s aperture drops from{" "}
                  <span className="data">{pair.comet_aperture.flux_before.toFixed(1)} ± {pair.comet_aperture.err_before.toFixed(1)}</span> to{" "}
                  <span className="data">{pair.comet_aperture.flux_after.toFixed(1)} ± {pair.comet_aperture.err_after.toFixed(1)}</span>. That change is{" "}
                  <b className="text-text">{Math.abs(pair.comet_aperture.z).toFixed(0)}× the empirical noise</b>, with errors measured from 48 blank-sky
                  apertures in each frame.
                </p>
                <p className="mt-2 leading-relaxed">
                  About the &quot;What changed&quot; map: the archive&apos;s nominal noise, carried through resampling, understates the real scatter by{" "}
                  {pair.z_calibration.nominal_field_scatter}×. We rescale the map by the measured scatter of the comet-free field and use a common
                  valid-pixel mask. After that, {(pair.field_frac_absz_gt5 * 100).toFixed(1)}% of field pixels still exceed 5, mostly star residuals.
                  Treat the map as a guide. The comet&apos;s coma is the only large, coherent change.
                </p>
                <div className="mt-3 space-y-1.5">
                  <div className="label">Provenance</div>
                  <div>
                    Before:{" "}
                    <a className="text-accent hover:underline" href={pair.before.source_fits} target="_blank" rel="noreferrer">
                      {pair.before.productid} ↗
                    </a>
                  </div>
                  <div>
                    After:{" "}
                    <a className="text-accent hover:underline" href={pair.after.source_fits} target="_blank" rel="noreferrer">
                      {pair.after.productid} ↗
                    </a>{" "}
                    <span className="text-dim">(QA: {pair.after.l2dqa})</span>
                  </div>
                  <p className="text-dim">{tt!.method}</p>
                </div>
                </Advanced>
                <p className="mt-3 text-[12.5px] leading-relaxed text-dim">
                  The &quot;What changed&quot; view is a rough guide. Small speckles around stars are normal; the comet is the only big change.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn btn-primary" onClick={() => setStep("measurement")}>
                    Check the measurements →
                  </button>
                  <Link href="/timetravel?target=swan" className="btn">
                    Explore every date of this field live
                  </Link>
                </div>
              </div>
            )}

            {step === "measurement" && (
              <div className="glass fade-up rounded-2xl p-5">
                <div className="label">Step 4</div>
                <h2 className="font-display mt-1 text-[22px] font-semibold">Does it match the prediction?</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-text/85">
                  We found the comet&apos;s center in each picture, then compared it with the prediction. Here&apos;s this set of pictures:
                </p>
                <div className="mt-3 overflow-hidden rounded-xl border border-line">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-white/5 text-muted">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">
                          <span className="sr-only">Test</span>
                        </th>
                        <th className="px-3 py-1.5 text-right font-medium text-good">Measured</th>
                        <th className="px-3 py-1.5 text-right font-medium text-accent">Predicted</th>
                      </tr>
                    </thead>
                    <tbody className="data">
                      <tr className="border-t border-line/60">
                        <td className="px-3 py-1.5 font-sans">Speed (″ per minute)</td>
                        <td className="px-3 py-1.5 text-right">
                          {seq.measured_rate_arcsec_per_min.toFixed(2)} ± {seq.measured_rate_err.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-right">{seq.predicted_rate_arcsec_per_min.toFixed(2)}</td>
                      </tr>
                      <tr className="border-t border-line/60">
                        <td className="px-3 py-1.5 font-sans">Direction (degrees)</td>
                        <td className="px-3 py-1.5 text-right">
                          {seq.measured_pa_deg.toFixed(1)} ± {seq.measured_pa_err.toFixed(1)}°
                        </td>
                        <td className="px-3 py-1.5 text-right">{seq.predicted_pa_deg.toFixed(1)}°</td>
                      </tr>
                      <tr className="border-t border-line/60">
                        <td className="px-3 py-1.5 font-sans">Distance from predicted spot</td>
                        <td className="px-3 py-1.5 text-right" colSpan={2}>
                          {(seq.median_offset_mid_arcsec / 6.15).toFixed(2)} pixel
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[12px] text-dim">″ is an arcsecond, a tiny angle on the sky. One SPHEREx pixel is 6.15″ wide.</p>
                <Advanced className="mt-3">
                  <ul className="list-disc space-y-1 pl-4">
                    <li>
                      Direction is the position angle (PA), measured from north through east. Median position offset:{" "}
                      <span className="data">{seq.median_offset_mid_arcsec.toFixed(1)}″</span>.
                    </li>
                    <li>
                      Field stars moved (control): <span className="data">{seq.star_control.median_shift_arcsec.toFixed(2)}″</span> median (
                      {seq.star_control.n_stars} stars).
                    </li>
                    <li>
                      Signal left at the first position: <span className="data">{Math.round(seq.vacancy_ratio * 100)}%</span> by the last exposure.
                    </li>
                  </ul>
                  <p className="mt-2">
                    MOST lists each exposure&apos;s <i>start</i> time. At ≈10″/min, that alone shifts the prediction by ≈10″, so we evaluate the prediction at
                    mid-exposure. The SPHEREx pipeline flags the comet&apos;s core as <span className="data">OUTLIER</span> in most frames, because a moving
                    object <i>is</i> an outlier against the static sky. We keep those pixels for the comet and still reject hardware flags.
                  </p>
                </Advanced>
                <button className="btn btn-primary mt-4" onClick={() => setStep("verdict")}>
                  See the verdict →
                </button>
              </div>
            )}

            {step === "verdict" && (
              <div className="glass fade-up rounded-2xl p-5">
                <div className="label">Step 5</div>
                <h2 className="font-display mt-1 text-[22px] font-semibold">The answer: yes, it&apos;s comet SWAN</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-text/85">
                  SPHEREx photographed the comet where and when its orbit said. It was already known, so this confirms it. It isn&apos;t a new discovery.
                </p>
                <ul className="mt-4 space-y-3">
                  <Check ok title="Found where and when predicted" detail="In all 20 pictures from 27–28 Oct 2025, usually less than half a pixel from the predicted spot (about 1.4 pixels in one detector)." />
                  <Check ok title="Moves at the predicted speed and direction" detail="Five of six picture sets match the predicted speed. One is slightly faster, and we can't explain why. Every direction matches." />
                  <Check ok title="Background stars stay still" detail="So the movement isn't caused by the pictures being misaligned." />
                  <Check ok title="The comet leaves its old spot" detail="Within minutes its first spot fades. On 1 May 2026 that spot is empty." />
                  <Check ok={false} title="What this is not" detail="Not a discovery: we found a known comet again. We also don't use these pictures to measure the comet's colors." />
                </ul>
                <Advanced className="mt-4">
                  <ul className="list-disc space-y-1.5 pl-4">
                    <li>
                      <b className="text-text">Detected where predicted, when predicted.</b> Found in all 20 frames from 27–28 Oct 2025 at S/N 195–647. The median
                      offset from the prediction is 2.3–2.9″ (under half a pixel) in detectors 1, 2 and 4, and 8.5″ (1.4 px) in detector 5. No single frame is
                      more than 0.85 px off in detectors 1–4.
                    </li>
                    <li>
                      <b className="text-text">Rate and direction.</b> Six detector sequences from 3 observation blocks (detector pairs share the same
                      exposures). Five of six speeds agree with the prediction within 2σ (uncertainties ±0.15–0.53″/min). The 28 Oct detector-4 sequence
                      (3.30–3.58 µm) measures 9.69 ± 0.20 against 9.21″/min, a 2.4σ difference we report but cannot explain. All directions agree within 2°.
                    </li>
                    <li>
                      <b className="text-text">Field-star control.</b> Median field-star shift per sequence is 0.25–0.78″, against 65–86″ of comet motion, so
                      the motion isn&apos;t an alignment error. Individual stars can shift more (up to 12.6″), most likely blended or saturated stars.
                    </li>
                    <li>
                      <b className="text-text">Vacated position.</b> Within minutes the flux at its first position drops by 49–92% (at nearby but not identical
                      wavelengths). On 1 May 2026, at a matched wavelength, the spot is empty: a change of 125–585× the empirical noise.
                    </li>
                    <li>
                      <b className="text-text">What this is NOT.</b> It isn&apos;t a discovery. SWAN was already known, and we recovered it. It isn&apos;t a
                      spectrum: frames at different wavelengths aren&apos;t combined. Difference images within a sequence mix time and wavelength, so we use
                      them only for position. The small along-track offset (≈2″, about 8″ at 4 µm) is reported, not explained.
                    </li>
                  </ul>
                  <p className="mt-2 rounded-lg border border-good/25 bg-good/5 px-3 py-2 text-text/85">{cf.verdict}</p>
                </Advanced>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/explore?target=swan" className="btn">
                    See SWAN&apos;s spot on the all-sky map
                  </Link>
                  <Link href="/about" className="btn">
                    Full method & data sources
                  </Link>
                </div>
              </div>
            )}

            {(step === "observation" || step === "measurement") && (
              <Advanced label="Inspect this picture's raw data" openLabel="Hide the raw data">
                <EvidencePanel seq={seq} frame={frame} />
              </Advanced>
            )}

          </section>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button className="btn" disabled={stepIdx === 0} onClick={() => setStep(STEPS[Math.max(0, stepIdx - 1)].id)}>
            ← Back
          </button>
          <div className="text-center text-[11px] text-dim">Data: NASA {cf.data_release} · MOST (IRSA)</div>
          <button className="btn" disabled={stepIdx === STEPS.length - 1} onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIdx + 1)].id)}>
            Next →
          </button>
        </div>
      </div>
    </main>
  );
}
