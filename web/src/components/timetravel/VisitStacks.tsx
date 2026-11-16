"use client";
import { useMemo } from "react";
import type { StackSettings } from "@/lib/engine/viewState";
import { comparableStacks, stackVisit, visits } from "@/lib/engine/combine";
import { findChanges, Frame, Grid } from "@/lib/engine/sequence";
import GridCanvas from "./GridCanvas";

export default function VisitStacks({ frames, grid, lo, hi, settings, onSettings }: { frames: Frame[]; grid: Grid; lo: number; hi: number; settings: StackSettings; onSettings: (s: StackSettings) => void }) {
  const { minutes, first, second, difference } = settings;
  const groups = useMemo(() => visits(frames, minutes), [frames, minutes]);
  const a = Math.min(first, groups.length - 1), b = second < 0 ? groups.length - 1 : Math.min(second, groups.length - 1);
  const left = useMemo(() => stackVisit(groups[a].indices.map((i) => frames[i]), grid), [groups, a, frames, grid]);
  const right = useMemo(() => stackVisit(groups[b].indices.map((i) => frames[i]), grid), [groups, b, frames, grid]);
  const change = useMemo(() => difference ? findChanges(...comparableStacks(left, right), grid) : null, [difference, left, right, grid]);
  const fmt = (g: typeof groups[number]) => new Date((g.start - 40587) * 86400000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const panel = (s: typeof left, label: string) => <div>
    <GridCanvas data={s.data} n={grid.n} mode="image" lo={lo} hi={hi} label={label} className="aspect-square w-full" />
    <p className="mt-1 text-[11px] text-muted">{s.frames.length} exposure{s.frames.length === 1 ? "" : "s"} · {Math.round(100 * s.count.filter((v) => v > 0).length / s.count.length)}% usable coverage · up to {s.count.reduce((a, b) => Math.max(a, b), 0)} contributors/pixel</p>
  </div>;
  return <div className="glass rounded-2xl p-3">
    <div className="label">Combine exposures within a visit</div>
    <p className="mt-2 text-[12px] text-muted">Sky-aligned mean of the loaded exposures at a matched wavelength. This reduces noise where exposures overlap. Fast movers may smear; a single-exposure visit gains no depth.</p>
    <div className="my-3 flex flex-wrap items-center gap-2 text-[12px]">
      <label>Maximum visit span <select aria-label="Maximum visit span" value={minutes} onChange={(e) => onSettings({ ...settings, minutes: Number(e.target.value), first: 0, second: -1 })} className="field !rounded p-1">
        <option value={30}>30 minutes</option><option value={120}>2 hours</option><option value={1440}>24 hours</option>
      </select></label>
      <label>First visit <select aria-label="First stack visit" value={a} onChange={(e) => onSettings({ ...settings, first: Number(e.target.value) })} className="max-w-full field !rounded p-1">{groups.map((g, i) => <option key={i} value={i}>{fmt(g)} · {g.indices.length} frames</option>)}</select></label>
      <label>Second visit <select aria-label="Second stack visit" value={b} onChange={(e) => onSettings({ ...settings, second: Number(e.target.value) })} className="max-w-full field !rounded p-1">{groups.map((g, i) => <option key={i} value={i}>{fmt(g)} · {g.indices.length} frames</option>)}</select></label>
      <label><input type="checkbox" checked={difference && a !== b} disabled={a === b} onChange={(e) => onSettings({ ...settings, difference: e.target.checked })} /> Subtract second − first</label>
    </div>
    {difference && a !== b && change ? <>
      <GridCanvas data={change.z} n={grid.n} mode="diverging" lo={0} hi={8} label="Difference of visit means" className="aspect-square w-full" />
      <p className="mt-2 text-[12px] text-muted">Second − first · {Math.round(change.validFrac * 100)}% common coverage. Wavelength-mismatched pixels are excluded. Color scale uses measured difference scatter ({Number.isFinite(change.sigma) ? change.sigma.toPrecision(3) : "unavailable"} MJy/sr), an indicator rather than a calibrated probability.</p>
    </> : <div className="grid grid-cols-2 gap-3">{panel(left, `Mean of visit ${fmt(groups[a])}`)}{panel(right, `Mean of visit ${fmt(groups[b])}`)}</div>}
    <details className="mt-3 text-[11px] text-muted"><summary className="cursor-pointer">Contributing exposures and quality</summary>
      {Array.from(new Set([...left.frames, ...right.frames])).map((f) => <div key={f.meta.sourceFits} className="mt-1"><a href={f.meta.sourceFits} target="_blank" rel="noreferrer" className="link">{f.meta.obsid} · D{f.meta.detector}</a> · {f.meta.dateAvg} · {f.meta.target.wl.toFixed(4)} µm · QA {f.meta.l2dqa || "not supplied"}</div>)}
    </details>
    <p className="mt-2 text-[11px] text-dim">The native-pixel measurement panel continues to measure individual exposures. These display means are not calibrated stacked photometry or a reproduction of the offline WISE 0855 PSF fit.</p>
  </div>;
}
