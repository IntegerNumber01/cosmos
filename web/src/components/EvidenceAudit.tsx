"use client";
import { useEffect, useRef, useState } from "react";
import type { EvidenceAudit as Audit } from "@/lib/evidenceAudit";

export default function EvidenceAudit() {
  const [report, setReport] = useState<Audit | null>(null), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { setReady(true); return () => controller.current?.abort(); }, []);
  const run = async () => {
    controller.current?.abort(); const c = new AbortController(); controller.current = c;
    setPending(true); setReport(null); setError("");
    try { const { auditEvidence } = await import("@/lib/evidenceAudit"); const result = await auditEvidence(c.signal); if (!c.signal.aborted) setReport(result); }
    catch (e) { if (!c.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (!c.signal.aborted) setPending(false); }
  };
  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "cosmos-reproduced-evidence.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section id="reproduce" aria-label="Reproduce the headline evidence" className="mt-6 scroll-mt-24 rounded-2xl border border-line bg-surface p-5 sm:p-6">
    <div className="label">From original observations to a checkable result</div>
    <h2 className="font-display mt-2 text-[26px] font-semibold">Reproduce the headline evidence</h2>
    <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-muted">Verify the saved image and reference-star checksums, then calculate the motion, brightness changes and controls again in your browser. No account, Python installation or live archive is needed after the saved files load.</p>
    <button type="button" className="btn btn-primary mt-4" disabled={!ready || pending} onClick={run}>{pending ? "Checking files and recalculating…" : report ? "Verify and calculate again" : "Verify files and reproduce results"}</button>
    {pending && <p role="status" className="mt-3 text-[13px] text-muted">Reading original saved pixels and comparing their SHA-256 checksums…</p>}
    {error && <p role="alert" className="mt-3 text-[13px] text-warn">{error}</p>}
    {report && <div role="region" aria-label="Reproduced evidence results" className="mt-5">
      <p className="text-[13px] text-muted">{report.inputs.filter(i => i.manifestMatch).length} image/catalog files match their manifests. Five calculations completed; a refused measurement remains refused.</p>
      <ul className="mt-4 space-y-3">{report.cases.map(c => <li key={c.id} className="rounded-xl bg-surface-2 p-4 text-[13px]"><a href={c.comparisonUrl} className="link font-semibold">{c.title} ↗</a><p className="mt-1">{c.value === null ? c.outcome : `${c.value > 0 && c.unit === "%" ? "+" : ""}${c.value.toFixed(2)} ± ${c.error!.toFixed(2)} ${c.unit} · ${c.outcome}`}</p></li>)}</ul>
      <button type="button" className="btn mt-4" onClick={download}>Download reproduced evidence and checksums</button>
      <details className="mt-4 text-[12px]"><summary className="cursor-pointer font-semibold">Original observations and verification limits</summary><p className="mt-3 leading-relaxed text-muted">This checks consistency with this site&apos;s manifests and repeats its method. It does not independently validate the scientific interpretation or authenticate NASA&apos;s archive.</p><ul className="mt-3 space-y-2">{report.inputs.filter(i => i.originalFits).map(i => <li key={i.file}><a className="link break-all" href={i.originalFits} target="_blank" rel="noreferrer">{i.date?.slice(0, 10)} · {i.wavelengthMicrons?.toFixed(3)} µm · {i.file.split("/").at(-1)} ↗</a></li>)}</ul></details>
    </div>}
  </section>;
}
