"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { getFrame, parseCoords } from "@/lib/engine/client";
import { Frame, makeGrid, Observation } from "@/lib/engine/sequence";
import { broadBand, spectralSample, spectrumCsv, spectrumPoint, SpectralPosition } from "@/lib/engine/spectral";
import { BANDS, wavelengthColor } from "@/lib/spherex";
import Advanced from "@/components/Advanced";
import GridCanvas from "./GridCanvas";

type Target = SpectralPosition & { slug?: string; name?: string };
export default function SpectralLab({ observations, target, size, selected }: { observations: Observation[]; target: Target; size: number; selected?: SpectralPosition }) {
  const [detector, setDetector] = useState(0);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [input, setInput] = useState(`${target.ra} ${target.dec}`);
  const [at, setAt] = useState<Target>(target);
  const [inputError, setInputError] = useState("");
  const token = useRef(0);
  useEffect(() => () => { token.current++; }, []);
  const sample = useMemo(() => spectralSample(observations, detector || undefined), [observations, detector]);
  const grid = useMemo(() => makeGrid(target.ra, target.dec, size), [target.ra, target.dec, size]);
  const bands = useMemo(() => frames.length ? BANDS.map((b) => broadBand(frames, grid, b.band)) : [], [frames, grid]);
  const points = useMemo(() => frames.map((f) => spectrumPoint(f, at)).sort((a, b) => a.wavelength - b.wavelength), [frames, at]);
  const valid = points.filter((p) => p.fluxMjy !== null && p.errorMjy !== null && Number.isFinite(p.fluxMjy) && Number.isFinite(p.wavelength));
  const yMin = Math.min(0, ...valid.map((p) => p.fluxMjy! - p.errorMjy!));
  const yMax = Math.max(1e-6, ...valid.map((p) => p.fluxMjy! + p.errorMjy!));
  const x = (w: number) => 65 + (w - 0.7) / 4.4 * 650;
  const y = (f: number) => 230 - (f - yMin) / (yMax - yMin) * 190;

  const generate = async () => {
    const id = ++token.current;
    setFrames([]); setFailures([]); setProgress({ done: 0, total: sample.length });
    const result: Frame[] = [], errors: string[] = [];
    let next = 0, done = 0;
    const worker = async () => {
      while (next < sample.length && token.current === id) {
        const o = sample[next++];
        try { const r = await getFrame(o, target.ra, target.dec, size, target.slug); result.push(r.frame); }
        catch { errors.push(`${o.obsid} D${o.detector}`); }
        done++;
        if (token.current === id) setProgress({ done, total: sample.length });
      }
    };
    await Promise.all([worker(), worker()]);
    if (token.current !== id) return;
    setFrames(result); setFailures(errors); setProgress(null);
  };

  const selectSource = () => {
    const c = parseCoords(input);
    if (!c) { setInputError("Enter a valid RA and Dec within this field."); return; }
    const sameTarget = Math.hypot(c.ra - target.ra, c.dec - target.dec) < 1e-6;
    const sep = Math.hypot((c.ra - target.ra) * Math.cos(target.dec * Math.PI / 180), c.dec - target.dec);
    if (sep > size / Math.SQRT2) { setInputError("Select a source within the loaded field."); return; }
    setInputError(""); setAt(sameTarget ? target : c);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([spectrumCsv(points)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "cosmos-dr1-aperture-spectrum.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const dateRange = frames.length ? [Math.min(...frames.map((f) => f.meta.mjdAvg)), Math.max(...frames.map((f) => f.meta.mjdAvg))].map((m) => new Date((m - 40587) * 86400000).toISOString().slice(0, 10)).join(" → ") : "";
  return <div className="text-[13px] text-text">
    <p className="max-w-3xl text-[12.5px] text-muted">This mixes photos from different dates, so it shows what the spot looks like, not how it changed.</p>
    <Advanced className="mt-1" label="How the lab works" openLabel="Hide how the lab works">
      Combine channels into six detector-band views and inspect an aperture spectrum at a source position. Uses the date range above; different channels may come
      from different dates. This is a static-sky preview, with no temporal or molecular identification claims. It samples {sample.length} cutouts, at most one
      representative exposure per channel.
    </Advanced>
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
      <label>Colour range <select aria-label="Wavelength lab detector" value={detector} disabled={!!progress} onChange={(e) => setDetector(Number(e.target.value))} className="rounded-lg border border-line bg-bg p-2"><option value={0}>All six ranges</option>{BANDS.map((b) => <option key={b.band} value={b.band}>D{b.band} · {b.range}</option>)}</select></label>
      <button className="btn btn-primary" disabled={!!progress || !sample.length} onClick={generate}>Build colour pictures and spectrum</button>
      <span className="text-muted">Downloads {sample.length} photos; may take several minutes.</span>
      {progress && <><span role="status">Loading {progress.done}/{progress.total}</span><button className="btn" onClick={() => { token.current++; setProgress(null); setFailures(["Generation cancelled; no partial spectrum is shown."]); }}>Cancel</button></>}
    </div>
    {failures.length > 0 && <p role="alert" className="mt-2 text-[12px] text-warn">{failures.length} unavailable or cancelled requests: {failures.join(", ")}. Missing data are not filled in.</p>}
    {frames.length > 0 && <>
      <p className="mt-3 text-[12px] text-warn">These photos were taken between {dateRange}. A star that moves or changes during that time can look odd here.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{bands.map((b) => {
        const finite = Array.from(b.data).filter(Number.isFinite).sort((a, b) => a - b);
        const lo = finite[Math.floor(finite.length * 0.01)] ?? 0, hi = finite[Math.floor(finite.length * 0.995)] ?? 1;
        const incomplete = b.channels.filter((n) => n < b.expected).length;
        return <div key={b.detector} className="rounded-xl border border-line p-3">
          <div className="data text-[12px]">D{b.detector} · {BANDS[b.detector - 1].range}</div>
          {b.frames.length ? <GridCanvas data={b.data} n={grid.n} mode="image" lo={lo} hi={Math.max(hi, lo + 1e-6)} label={`D${b.detector} equal-channel mean`} className="mt-2 aspect-square w-full rounded-lg" /> : <div className="mt-2 grid aspect-square place-items-center text-[12px] text-muted">No sampled channels</div>}
          <p className="mt-2 text-[11px] text-muted">{b.available}/{b.expected} nominal channels sampled at centre · {Math.round(100 * incomplete / b.channels.length)}% of pixels have incomplete spectral coverage.</p>
        </div>;
      })}</div>
      <Advanced className="mt-2">Each image is the equal-channel mean of available, locally background-subtracted surface brightness, with its own display stretch. Repeated samples share one channel weight. Missing/flagged samples are excluded, so effective wavelength coverage varies across the field. These previews are not integrated filter fluxes or calibrated differences. Shown dates are DR1 exposure dates; use a shorter date range above for an epoch-specific view.</Advanced>
      <h3 className="font-display mt-5 text-[16px] font-semibold">Brightness in each colour (spectrum)</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        {selected && <button className="btn" onClick={() => { setAt(selected); setInput(`${selected.ra} ${selected.dec}`); setInputError(""); }}>Use the spot you picked</button>}
        <button className="btn" onClick={download}>Download spectrum CSV</button>
      </div>
      <Advanced className="mt-2" label="Measure a different position" openLabel="Hide position entry">
        <div className="flex flex-wrap items-center gap-2">
          <label>Source RA Dec <input aria-label="Spectrum source coordinates" value={input} onChange={(e) => setInput(e.target.value)} className="ml-2 w-60 max-w-full rounded-lg border border-line bg-bg p-2 text-text" /></label>
          <button className="btn" onClick={selectSource}>Measure source</button>
        </div>
      </Advanced>
      {inputError && <p role="alert" className="mt-2 text-[12px] text-warn">{inputError}</p>}
      <svg viewBox="0 0 750 275" className="mt-3 w-full" role="img" aria-label={`Exploratory aperture spectrum: ${valid.length} usable measurements with empirical error bars`}>
        <path d="M65 35V230H720" fill="none" stroke="#8d96bd" />
        {[1, 2, 3, 4, 5].map((w) => <g key={w}><line x1={x(w)} x2={x(w)} y1={35} y2={230} stroke="#ffffff15" /><text x={x(w)} y={248} fill="#8d96bd" fontSize={11} textAnchor="middle">{w}</text></g>)}
        {[yMin, (yMin + yMax) / 2, yMax].map((v) => <text key={v} x={60} y={y(v) + 4} fill="#8d96bd" fontSize={10} textAnchor="end">{v.toPrecision(2)}</text>)}
        <text x={380} y={269} fill="#b4bddb" fontSize={11} textAnchor="middle">Wavelength (µm)</text>
        <text x={8} y={18} fill="#b4bddb" fontSize={11}>Aperture flux (mJy)</text>
        {valid.map((p) => <g key={p.source} stroke={wavelengthColor(p.wavelength)} fill={wavelengthColor(p.wavelength)}>
          <title>{p.obsid} · {p.date} UTC · {p.wavelength.toFixed(4)} µm · {p.fluxMjy!.toPrecision(4)} ± {p.errorMjy!.toPrecision(3)} mJy</title>
          <line x1={x(p.wavelength)} x2={x(p.wavelength)} y1={y(p.fluxMjy! - p.errorMjy!)} y2={y(p.fluxMjy! + p.errorMjy!)} /><circle cx={x(p.wavelength)} cy={y(p.fluxMjy!)} r={3} />
        </g>)}
      </svg>
      {!valid.length && <p className="text-[12px] text-warn">No trustworthy aperture fluxes at this position. Check saturation, coverage, and blank-sky controls below.</p>}
      <p className="mt-2 text-[12px] text-muted">These are rough numbers: nearby stars can blend in.</p>
      <Advanced className="mt-1">2 native-pixel radius, local background subtraction, empirical blank-sky errors, local WCS solid angle. No aperture/PSF correction or deblending: fluxes are exploratory and blended neighbours can dominate. Points are not joined across missing channels or dates. {at.pm ? "The target position follows catalogue proper motion (without annual parallax)." : "A fixed sky position is used."}</Advanced>
      <details className="mt-3 text-[12px] text-muted"><summary className="cursor-pointer">Measurements, dates, flags, and source files ({points.length})</summary>
        <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-[11px]"><thead><tr>{["Date (UTC)", "Detector / λ", "mJy ± empirical error", "Quality", "Source"].map((t) => <th key={t} className="p-2">{t}</th>)}</tr></thead><tbody>{points.map((p) => <tr key={p.source} className="border-t border-line"><td className="p-2">{p.date}</td><td className="p-2">D{p.detector} / {p.wavelength.toFixed(4)} µm</td><td className="p-2">{p.fluxMjy === null ? "No measurement" : `${p.fluxMjy.toPrecision(4)} ± ${p.errorMjy?.toPrecision(3)}`}</td><td className="p-2">{[p.reason, p.flags.join(", ")].filter(Boolean).join(" · ") || "No aperture flags"}</td><td className="p-2"><a href={p.source} target="_blank" rel="noreferrer" className="text-accent">{p.obsid} ↗</a></td></tr>)}</tbody></table></div>
      </details>
      <a href="https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html" target="_blank" rel="noreferrer" className="mt-3 inline-block text-[12px] text-accent">IRSA’s calibrated spectrophotometry workflow ↗</a>
    </>}
  </div>;
}
