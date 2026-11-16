"use client";
import { useEffect, useMemo, useState } from "react";
import Advanced from "@/components/Advanced";
import { getCalibrationFrame, getCalibrationStars } from "@/lib/engine/client";
import { analyseMotion, type MotionResult, type MotionTarget } from "@/lib/engine/motion";
import { Frame, makeGrid, median, reproject, skyLevel } from "@/lib/engine/sequence";
import { propagate } from "@/lib/engine/astrometry";
import { stackVisit } from "@/lib/engine/combine";
import { stackAlongTrack, stackNoise } from "@/lib/engine/tracking";
import GridCanvas from "./GridCanvas";

export default function MotionPanel({ frames, target, slug, onResult }: { frames: Frame[]; target: MotionTarget; slug?: string; onResult: (r: MotionResult | null) => void }) {
  const [result, setResult] = useState<MotionResult | null>(null), [wide, setWide] = useState<Frame[] | null>(null), [error, setError] = useState("");
  const targetKey = JSON.stringify(target), stable = useMemo(() => JSON.parse(targetKey) as MotionTarget, [targetKey]);
  useEffect(() => {
    let alive = true;
    setResult(null); setWide(frames); setError(""); onResult(null);
    (async () => {
      try {
        const [imageResult, fieldResult] = await Promise.allSettled([Promise.all(frames.map((f) => getCalibrationFrame(f, slug))), getCalibrationStars(stable.ra, stable.dec, frames[0].meta.mjdAvg, slug)]);
        if (!alive) return;
        if (imageResult.status === "rejected") throw new Error(`Wider reference images unavailable: ${String(imageResult.reason)}`);
        const images = imageResult.value;
        setWide(images);
        if (fieldResult.status === "rejected") throw new Error(`Reference-star catalog unavailable: ${String(fieldResult.reason)}`);
        const field = fieldResult.value;
        const r = analyseMotion(images, stable, field.stars, field.mjd);
        setResult(r); setWide(images); onResult(r);
      } catch (e) { if (alive) { const message = e instanceof Error ? e.message : String(e); setError(message); onResult({ ok: false, reason: message, rejected: [] }); } }
    })();
    return () => { alive = false; };
  }, [frames, stable, slug, onResult]);
  const good = result?.ok ? result : null;
  return <section aria-label="Motion analysis" className="mt-4 space-y-4">
    <div><h3 className="font-display text-[21px] font-semibold">Does this source move?</h3><p className="mt-1 text-[13px] text-muted">Measure its track relative to surrounding stars. Catalog predictions stay separate.</p></div>
    {!result && !error && <p role="status" className="text-[13px] text-muted">Checking native positions and reference stars on each date…</p>}
    {error && <p role="alert" className="text-[13px] text-warn">Motion analysis unavailable: {error}. No calibrated motion is reported.</p>}
    {result && !result.ok && <p className="rounded-xl card p-3 text-[13px] text-warn">{result.reason} The original images and uncalibrated measurements remain available in Summary.</p>}
    {good && <>
      <div className="rounded-xl card p-4" aria-live="polite">
        <p className="text-[16px] font-semibold">{good.shift.toFixed(2)} ± {good.shiftError.toFixed(2)} arcseconds of displacement</p>
        <p className="mt-1 text-[13px] text-muted">Across {good.epochs.length} independent visits over {Math.round(good.baselineDays)} days, checked against at least {Math.min(...good.positions.map((p) => p.references.length))} reference stars per exposure.</p>
        <p className="mt-2 text-[12px] text-muted">{good.shift >= 5 * good.shiftError ? "The displacement exceeds five times the estimated per-axis uncertainty. Association and image quality still need review." : "This displacement does not meet the five-times-uncertainty screen. Small shifts may be noise or systematic effects."}</p>
      </div>
      <Track result={good} pm={stable.pm} />
      {good.east && good.north ? <div className="grid grid-cols-2 gap-3 text-[13px]">
        <div className="rounded-xl card p-3"><div className="text-muted">East {good.parallaxMas === null ? "apparent rate" : "proper motion"}</div><strong>{good.east.rate.toFixed(2)} ± {good.east.error.toFixed(2)} ″/yr</strong>{stable.pm && <p className="mt-1 text-[12px] text-muted">Catalog: {(stable.pm[0] / 1000).toFixed(2)} ″/yr</p>}</div>
        <div className="rounded-xl card p-3"><div className="text-muted">North {good.parallaxMas === null ? "apparent rate" : "proper motion"}</div><strong>{good.north.rate.toFixed(2)} ± {good.north.error.toFixed(2)} ″/yr</strong>{stable.pm && <p className="mt-1 text-[12px] text-muted">Catalog: {(stable.pm[1] / 1000).toFixed(2)} ″/yr</p>}</div>
      </div> : <p className="text-[12px] text-muted">A rate fit requires at least three independent visits and a baseline of 0.1 year. This selection reports displacement only.</p>}
      <p className="text-[12px] text-muted">{good.parallaxMas === null ? "No trusted parallax is available for this selected source; the apparent rate may include Earth's annual motion." : `Catalog parallax ${good.parallaxMas.toFixed(2)} mas is a fixed correction (${good.parallaxSource ?? "supplied catalog"}). This does not measure a new distance.`}</p>
      <Advanced label="Alignment, controls and fit details" openLabel="Hide alignment and fit details">
        <div className="overflow-x-auto"><table className="data w-full text-left text-[11px]"><thead><tr><th>Date</th><th>References</th><th>East offset</th><th>North offset</th><th>Scatter</th></tr></thead><tbody>{good.positions.map((p) => <tr key={p.obsid}><td>{p.date.slice(0, 10)}</td><td>{p.references.length}</td><td>{p.alignEast.toFixed(2)}″</td><td>{p.alignNorth.toFixed(2)}″</td><td>{p.alignError.toFixed(2)}″</td></tr>)}</tbody></table></div>
        <p className="mt-2">Offsets are measured reference-minus-catalog translations and are subtracted from target positions. Scatter is retained in full; adding frames within a visit does not shrink it.</p>
        <p className="mt-2">{good.controls.length ? `${good.controls.length} shared reference controls: median end-to-end residual ${median(good.controls.map((c) => c.residualShift)).toFixed(2)}″, largest ${Math.max(...good.controls.map((c) => c.residualShift)).toFixed(2)}″. Each control is excluded from its own alignment estimate.` : "No shared reference controls span the first and last exposure; independent checks remain incomplete."}</p>
        {good.east && good.north && <p className="mt-2">Fit residual RMS: east {good.east.residualRms.toFixed(2)}″, north {good.north.residualRms.toFixed(2)}″. χ² / dof: {good.east.chi2.toFixed(2)} / {good.east.dof} and {good.north.chi2.toFixed(2)} / {good.north.dof}. Errors increase when residuals exceed the input errors.</p>}
        {good.caveats.map((c) => <p className="mt-2" key={c}>{c}</p>)}
      </Advanced>
    </>}
    {result && result.rejected.length > 0 && <Advanced label={`${result.rejected.length} excluded exposures`} openLabel="Hide excluded exposures">{result.rejected.map((r) => <p key={r.obsid}>{r.obsid}: {r.reason}</p>)}</Advanced>}
    {wide && stable.pm && stable.epochYear !== undefined && <TrackingComparison frames={wide} target={stable} />}
  </section>;
}

function Track({ result: r, pm }: { result: Extract<MotionResult, { ok: true }>; pm?: [number, number] }) {
  const first = r.epochs[0], pts = r.epochs.map((p) => ({ e: p.east - first.east, n: p.north - first.north, err: p.error, date: p.date.slice(0, 10) }));
  const predicted = r.epochs.map((p) => ({ e: (pm?.[0] ?? 0) / 1000 * (p.mjd - first.mjd) / 365.25 + p.parallaxEast - first.parallaxEast, n: (pm?.[1] ?? 0) / 1000 * (p.mjd - first.mjd) / 365.25 + p.parallaxNorth - first.parallaxNorth }));
  const range = Math.max(1.5, ...pts.flatMap((p) => [Math.abs(p.e) + p.err, Math.abs(p.n) + p.err]), ...(pm ? predicted.flatMap((p) => [Math.abs(p.e), Math.abs(p.n)]) : [])) * 1.15;
  const x = (e: number) => 180 + e / range * 135, y = (n: number) => 150 - n / range * 115;
  return <figure><svg viewBox="0 0 360 300" role="img" aria-label="Measured sky track with reference-star errors and separate catalog prediction" className="w-full rounded-xl card">
    <line x1="45" x2="315" y1="150" y2="150" stroke="var(--color-line, #888)" /><line x1="180" x2="180" y1="35" y2="265" stroke="var(--color-line, #888)" />
    {pm && <polyline points={predicted.map((p) => `${x(p.e)},${y(p.n)}`).join(" ")} fill="none" stroke="var(--color-accent, #7fd8ff)" strokeWidth="2" strokeDasharray="5 4" />}
    {pts.map((p, i) => <g key={i}><line x1={x(p.e - p.err)} x2={x(p.e + p.err)} y1={y(p.n)} y2={y(p.n)} stroke="var(--color-text, #eee)" /><line x1={x(p.e)} x2={x(p.e)} y1={y(p.n - p.err)} y2={y(p.n + p.err)} stroke="var(--color-text, #eee)" /><circle cx={x(p.e)} cy={y(p.n)} r="4" fill="var(--color-good, #6ef0b0)"><title>{p.date}: east {p.e.toFixed(2)}″, north {p.n.toFixed(2)}″</title></circle><text x={x(p.e) + 7} y={y(p.n) - 7} fontSize="10" fill="var(--color-text, #eee)">{i + 1}</text></g>)}
    <text x="190" y="25" fontSize="11" fill="var(--color-muted, #aaa)">North ↑</text><text x="225" y="287" fontSize="11" fill="var(--color-muted, #aaa)">East → · ±{range.toFixed(1)}″</text>
  </svg><figcaption className="mt-2 text-[12px] text-muted">Dots: measured visits, in date order. Bars: per-visit positional errors; offsets share the first visit&apos;s uncertainty. {pm ? "Dashed: catalog-predicted displacement, not a detection." : "No catalog track supplied."}</figcaption></figure>;
}

function TrackingComparison({ frames, target }: { frames: Frame[]; target: MotionTarget }) {
  const [open, setOpen] = useState(false);
  const stack = useMemo(() => {
    if (!open) return null;
    try {
      const epoch = 51544.5 + (target.epochYear! - 2000) * 365.25;
      const p = propagate(target.ra, target.dec, ...target.pm!, epoch, frames[0].meta.mjdAvg, target.parallaxMas ?? 0);
      if (!p) throw new Error("The specified trajectory is unavailable at these dates.");
      const grid = makeGrid(...p, 0.1), single = reproject(frames[0], grid, skyLevel(frames[0]).level), sky = stackVisit(frames, grid), moving = stackAlongTrack(frames, grid, target);
      const images = [single, sky.data, moving.data], values = images.flatMap((im) => Array.from(im).filter(Number.isFinite)).sort((a, b) => a - b);
      const minContributors = Math.min(...Array.from(moving.count).filter((_, k) => Math.hypot(k % grid.n - (grid.n - 1) / 2, Math.floor(k / grid.n) - (grid.n - 1) / 2) <= 2));
      const scores = images.map((im, i) => stackNoise(i === 0 ? im : im.map((v, k) => (i === 1 ? sky.count[k] : moving.count[k]) >= 2 ? v : NaN), grid.n));
      return { ok: true as const, grid, images, moving, minContributors, lo: values[Math.floor(values.length * 0.1)] ?? 0, hi: values[Math.floor(values.length * 0.995)] ?? 1, scores };
    } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : String(e) }; }
  }, [open, frames, target]);
  const save = () => {
    if (!stack?.ok) return;
    const report = { method: "Exploratory equal-exposure mean along a specified catalog motion; not a blind search or native photometric result", target, scores: stack.scores, minTargetContributors: stack.minContributors, sourceFits: frames.map((f) => f.meta.sourceFits), dates: frames.map((f) => f.meta.dateAvg), limitations: ["Matched wavelengths and quality masks are evaluated at each sampled native position.", "Noise ratios use blank apertures on resampled images with at least two stack contributors, not calibrated probabilities.", "Nearby sources can contaminate a tracking stack; no deblending or discovery claim."] };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })), a = document.createElement("a"); a.href = url; a.download = "cosmos-tracking-comparison.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section aria-label="Tracking stack comparison" className="border-t border-line pt-4">
    <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? "Hide tracking comparison" : "Compare a stack that follows this source"}</button>
    {open && <><p className="mt-3 text-[12px] text-muted">Specified catalog motion: east {(target.pm![0] / 1000).toFixed(2)}, north {(target.pm![1] / 1000).toFixed(2)} ″/yr. {target.parallaxMas !== undefined ? "Catalog parallax included." : "Parallax omitted."} This tests a known track; it does not search for unknown objects.</p>
      {stack && !stack.ok ? <p role="alert" className="mt-2 text-[13px] text-warn">{stack.error}</p> : stack?.ok && <>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">{stack.images.map((im, i) => <figure key={i}><GridCanvas data={im} n={stack.grid.n} mode="image" lo={stack.lo} hi={stack.hi} label={["Single exposure", "Sky-aligned stack", "Catalog-track stack"][i]} className="aspect-square w-full rounded-lg" /><figcaption className="mt-1 text-[12px]">{["Single exposure", "Sky-aligned mean", "Track-aligned mean"][i]}<p className="text-[11px] text-muted">{stack.scores[i] ? `Aperture / blank-sky scatter: ${stack.scores[i]!.ratio.toFixed(1)}×` : "Insufficient valid pixels for a noise estimate"}</p></figcaption></figure>)}</div>
        <p className="mt-2 text-[12px] text-muted">Shared brightness scale; {stack.moving.frames} distinct exposures, at least {stack.minContributors} contributing at each target-aperture pixel. Stack noise estimates require two or more contributors. Invalid and wavelength-mismatched pixels stay empty. A higher noise ratio is not proof of recovery: a neighbor can dominate. No deblending or new detection is claimed.</p>
        <button type="button" className="btn mt-3" onClick={save}>Download tracking comparison</button>
      </>}
    </>}
  </section>;
}
