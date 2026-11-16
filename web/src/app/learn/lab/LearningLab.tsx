"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TargetCloseup from "@/components/timetravel/TargetCloseup";
import { LAB_CASES, LAB_CHOICES, loadLabCase, type LabChoice, type LabResult } from "@/lib/learningLab";
import { makeGrid, reproject, skyLevel } from "@/lib/engine/sequence";

type Answer = { choice?: LabChoice; reason: string; next: string; revealed: boolean };
const empty = (): Answer => ({ reason: "", next: "", revealed: false });

export default function LearningLab() {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>(() => LAB_CASES.map(empty));
  const [data, setData] = useState<LabResult | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("");
  const c = LAB_CASES[index], answer = answers[index];
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setData(null); setError("");
    loadLabCase(c.id, controller.signal).then((r) => { if (active) setData(r); }).catch((e) => { if (active) setError(String(e.message ?? e)); });
    return () => { active = false; controller.abort(); };
  }, [c.id, attempt]);
  const update = (patch: Partial<Answer>) => setAnswers((old) => old.map((a, i) => i === index ? { ...a, ...patch } : a));
  const display = data ? (() => {
    const grid = makeGrid(...data.positions[0], 0.04);
    const grids = data.frames.map((f) => reproject(f, grid, skyLevel(f).level));
    const values = grids.flatMap((g) => Array.from(g).filter(Number.isFinite)).sort((a, b) => a - b);
    return { grid, grids, lo: Math.min(0, values[Math.floor(values.length * 0.02)] ?? 0), hi: Math.max(1, values[Math.floor(values.length * 0.99)] ?? 1) };
  })() : null;
  const download = () => {
    const report = { schema: "cosmos-learning-activity-v1", exportedAt: new Date().toISOString(), note: "Learner responses, not evidence of a validated learning gain. No identity is requested. Responses are kept in this tab until downloaded; reloading clears them.", cases: LAB_CASES.map((c, i) => ({ case: c.id, ...answers[i] })) };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "cosmos-investigation-responses.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Responses downloaded. These are your answers, not an assessment of learning gains.");
  };
  return <>
    <div className="label text-accent">Three real cases · go at your own pace</div>
    <h1 className="font-display mt-3 text-[34px] font-semibold leading-tight sm:text-[46px]">Would you believe this change?</h1>
    <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted">Compare real SPHEREx observations and decide what the brightness evidence supports. A careful “we can&apos;t tell” can be the best answer. These are selected examples, not a search for a new discovery.</p>
    <p className="mt-2 text-[13px] text-muted">No sign-up or telescope needed. Answers stay in this tab until you download them; reloading clears them. <Link href="/learn/kit" className="text-accent underline">Facilitator guide</Link></p>
    <nav aria-label="Activity cases" className="mt-6 flex flex-wrap gap-2">{LAB_CASES.map((c, i) => <button key={c.id} type="button" aria-current={i === index ? "step" : undefined} onClick={() => { setIndex(i); setStatus(""); }} className={`btn ${i === index ? "btn-primary" : ""}`}>{c.title}{answers[i].revealed ? " · reviewed" : ""}</button>)}</nav>
    <section aria-label={c.title} className="mt-5 rounded-2xl border border-line p-4 sm:p-6">
      <h2 className="font-display text-[25px] font-semibold">{c.title}</h2>
      <p className="mt-2 text-[13px] text-muted">Read the brightness evidence. Position changes are a separate question. The displayed colors represent measured infrared brightness.</p>
      {!data && !error && <p role="status" className="mt-4">Loading saved real observations…</p>}
      {error && <div role="alert" className="mt-4"><p>{error}</p><button type="button" className="btn mt-2" onClick={() => setAttempt((n) => n + 1)}>Retry loading this case</button></div>}
      {data && display && <>
        <TargetCloseup frames={data.frames} grids={display.grids} grid={display.grid} pair={[0, 1]} ra={data.positions[0][0]} dec={data.positions[0][1]} lo={display.lo} hi={display.hi} />
        <section className="mt-4 rounded-xl bg-white/[0.035] p-4" aria-label="Brightness evidence">
          <h3 className="font-semibold">The measurement</h3>
          {data.calibration.ok ? <p className="mt-2 leading-relaxed">{data.calibration.changePct >= 0 ? "+" : ""}{data.calibration.changePct.toFixed(1)}% ± {data.calibration.changePctErr.toFixed(1)}% brightness difference, later versus earlier; {data.calibration.nRefs} reference stars. Δm = {data.calibration.last.dmag.toFixed(3)} ± {data.calibration.last.dmagErr.toFixed(3)} mag.</p>
            : <><p className="mt-2 leading-relaxed">No calibrated brightness result: {data.calibration.reason}.</p>{c.id === "blend" && <p className="mt-2 text-[13px] text-muted">Historical debugging result: this control once read −54% at 18σ before the neighbor safeguard was added. That rejected result is not a current valid measurement.</p>}</>}
          <p className="mt-2 text-[12px] text-muted">The uncertainty includes blank-sky noise and reference-star disagreement. It cannot account for every systematic error.</p>
        </section>
        <fieldset disabled={answer.revealed} className="mt-5">
          <legend className="font-semibold">What does this pair support about brightness?</legend>
          {LAB_CHOICES.map((option) => <label key={option.value} className="mt-3 flex cursor-pointer items-start gap-3 text-[14px]"><input type="radio" name={`judgement-${c.id}`} value={option.value} checked={answer.choice === option.value} onChange={() => update({ choice: option.value })} className="mt-1 shrink-0" />{option.label}</label>)}
          <label className="mt-4 block text-[14px]">Why? Refer to a measurement or a failed check.<textarea value={answer.reason} maxLength={2000} rows={3} onChange={(e) => update({ reason: e.target.value })} className="mt-2 block w-full rounded-lg border border-line bg-bg p-3" /></label>
        </fieldset>
        {!answer.revealed ? <><button type="button" disabled={!answer.choice || !answer.reason.trim()} onClick={() => update({ revealed: true })} className="btn btn-primary mt-4 disabled:opacity-50">Reveal the explanation</button><p className="mt-2 text-[12px] text-muted">Choose an answer and give a reason first. Your initial answer is kept when the explanation is revealed.</p></>
          : <section aria-label="Case explanation" className="mt-5 rounded-xl border border-accent/40 p-4" aria-live="polite">
            <h3 className="font-semibold text-accent">{answer.choice === data.interpretation ? "Your choice agrees with the checks." : "Compare your answer with the checks."}</h3>
            <p className="mt-2 font-semibold">{LAB_CHOICES.find((o) => o.value === data.interpretation)!.label}</p>
            <p className="mt-2 text-[14px] leading-relaxed">{data.explanation}</p>
            <p className="mt-2 text-[13px] text-muted">Next: {data.next}</p>
            <label className="mt-4 block text-[14px]">What would you check next, and why?<textarea rows={2} maxLength={2000} value={answer.next} onChange={(e) => update({ next: e.target.value })} className="mt-2 block w-full rounded-lg border border-line bg-bg p-3" /></label>
            {index < LAB_CASES.length - 1 && <button type="button" className="btn mt-3" onClick={() => setIndex(index + 1)}>Try the next case</button>}
          </section>}
        <details className="mt-5 text-[12px] text-muted"><summary className="cursor-pointer text-accent">Inspect the original data and full tools</summary><p className="mt-2">SPHEREx DR1 native pixels; reference catalog: {data.catalogueSource}. Measurement follows catalog proper motion where supplied. This activity uses saved files on this site, without a live archive or catalog lookup.</p><ul className="mt-2 space-y-2">{data.frames.map((f, i) => <li key={f.meta.obsid}><a href={f.meta.sourceFits} className="text-accent underline">Original FITS · {f.meta.dateAvg.slice(0, 10)}</a> · {data.measurements[i].wl.toFixed(4)} µm · flags: {data.measurements[i].flagsHere.join(", ") || "none reported"}</li>)}</ul><Link href={data.comparisonUrl} className="btn mt-3">Open this measurement in Time Travel</Link></details>
      </>}
    </section>
    <section className="mt-6 rounded-xl border border-line p-5"><h2 className="font-display text-[23px] font-semibold">Keep your reasoning</h2><p className="mt-2 text-[14px] text-muted">Reviewed {answers.filter((a) => a.revealed).length} of 3 cases. Download your initial choices, reasons and follow-up ideas. For a full investigation, use Time Travel&apos;s readable evidence and JSON downloads.</p><button type="button" className="btn mt-3" disabled={!answers.some((a) => a.choice || a.reason)} onClick={download}>Download my responses</button>{status && <p role="status" className="mt-2 text-[13px]">{status}</p>}</section>
    <div className="mt-6 flex flex-wrap gap-3"><Link href="/timetravel?target=rwaur&guide=1&mode=swipe" className="btn">Run a full guided investigation</Link><Link href="/timetravel" className="btn">Open the advanced tools</Link><Link href="/learn" className="btn">Back to the basics</Link></div>
  </>;
}
