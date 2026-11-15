"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { TT_TARGETS } from "@/lib/ttTargets";
import { wavelengthColor } from "@/lib/spherex";

const IDS = ["barnard", "wise0855", "epsindib", "rwaur", "rdra"];
const VERDICT_STYLE: Record<string, string> = {
  confirmed: "bg-good/15 text-good",
  consistent: "bg-good/15 text-good",
  not_detected: "bg-warn/15 text-warn",
  inconclusive: "bg-white/10 text-muted",
  unreliable: "bg-bad/15 text-bad",
};

function Val({ v }: { v: any }) {
  if (v === null || v === undefined) return <span className="text-dim">—</span>;
  if (typeof v === "number") return <span className="data">{Math.abs(v) >= 1000 || Math.abs(v) < 0.01 ? v.toPrecision(4) : +v.toFixed(4)}</span>;
  if (typeof v === "boolean") return <span className="data">{v ? "yes" : "no"}</span>;
  if (typeof v === "string") return <span>{v}</span>;
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== "object")) return <span className="data">{v.map((x) => (typeof x === "number" ? +x.toFixed(4) : String(x))).join(", ")}</span>;
    return (
      <div className="space-y-1">
        {v.map((x, i) => (
          <div key={i} className="rounded-lg bg-white/[0.03] p-2">
            <Val v={x} />
          </div>
        ))}
      </div>
    );
  }
  return <KV obj={v} />;
}

function KV({ obj }: { obj: Record<string, any> }) {
  return (
    <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-3 gap-y-1 text-[12px]">
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k.replace(/_/g, " ")}</dt>
          <dd className="min-w-0 break-words">
            <Val v={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function ValidationClient() {
  const [recs, setRecs] = useState<Record<string, any>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  useEffect(() => {
    for (const id of IDS)
      fetch(`/data/validation/${id}.json`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j) => setRecs((s) => ({ ...s, [id]: j })))
        .catch((e) => setErrs((s) => ({ ...s, [id]: String(e.message ?? e) })));
  }, []);

  return (
    <main className="relative min-h-screen bg-bg pb-24">
      <NavBar />
      <div className="mx-auto max-w-[1080px] px-4 pt-24 sm:px-6">
        <div className="label text-accent">Validation</div>
        <h1 className="font-display mt-1 text-[34px] font-semibold leading-tight">How COSMOS does on the challenge&apos;s five test targets</h1>
        <p className="mt-2 max-w-3xl text-[14px] text-muted">
          For each target: which SPHEREx DR1 observations exist, which of them can fairly be compared (same detector, wavelength within half a channel), what
          we measured on the native pixels, and the limits. A clear &quot;not detected&quot; or &quot;inconclusive&quot; is a valid test result. We never force
          a detection.
        </p>

        <div className="mt-6 overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-white/5 text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Target</th>
                <th className="px-4 py-2 font-medium">Test</th>
                <th className="px-4 py-2 font-medium">Result</th>
                <th className="px-4 py-2 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody>
              {IDS.map((id) => {
                const r = recs[id];
                const t = TT_TARGETS.find((x) => x.slug === id);
                return (
                  <tr key={id} className="border-t border-line/60 align-top">
                    <td className="px-4 py-2">
                      <a href={`#${id}`} className="hover:text-accent">
                        {r?.name ?? t?.name}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-muted">{r?.test_type?.replace(/_/g, " ") ?? "—"}</td>
                    <td className="px-4 py-2">
                      {r?.result?.verdict ? (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE[r.result.verdict] ?? "bg-white/10"}`}>
                          {r.result.verdict.replace(/_/g, " ")}
                        </span>
                      ) : (
                        <span className="text-dim">{errs[id] ? "not available" : "loading…"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-[12.5px] text-text/80">{r?.result?.summary ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {IDS.map((id) => {
          const r = recs[id];
          if (!r) return null;
          const t = TT_TARGETS.find((x) => x.slug === id);
          return (
            <section key={id} id={id} className="glass mt-8 scroll-mt-24 rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="label">{r.test_type?.replace(/_/g, " ")}</div>
                  <h2 className="font-display mt-0.5 text-[24px] font-semibold">{r.name}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.result?.verdict && (
                    <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${VERDICT_STYLE[r.result.verdict] ?? "bg-white/10"}`}>
                      {r.result.verdict.replace(/_/g, " ")}
                    </span>
                  )}
                  {t && (
                    <Link href={`/timetravel?target=${id}`} className="btn btn-primary !py-1 !text-[12px]">
                      Open in Time Travel
                    </Link>
                  )}
                </div>
              </div>
              {r.result?.summary && <p className="mt-3 text-[14px] leading-relaxed text-text/90">{r.result.summary}</p>}

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {r.result?.numbers && (
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <div className="label mb-2">Key numbers</div>
                    <KV obj={r.result.numbers} />
                  </div>
                )}
                {r.observations_examined && (
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <div className="label mb-2">Observations examined</div>
                    <KV obj={r.observations_examined} />
                  </div>
                )}
                {r.catalog && (
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <div className="label mb-2">Catalogue astrometry used</div>
                    <KV obj={r.catalog} />
                  </div>
                )}
                {r.alignment_checks && (
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <div className="label mb-2">Alignment checks</div>
                    <KV obj={r.alignment_checks} />
                  </div>
                )}
              </div>

              {Array.isArray(r.matched_sets) && r.matched_sets.length > 0 && (
                <div className="mt-4">
                  <div className="label mb-2">Wavelength-matched sets compared</div>
                  <div className="space-y-2">
                    {r.matched_sets.map((m: any, i: number) => (
                      <div key={i} className="rounded-xl border border-line p-3 text-[12px]">
                        <div className="data" style={{ color: m.lambda_ref_um ? wavelengthColor(m.lambda_ref_um) : undefined }}>
                          {String(m.detector).startsWith("D") ? m.detector : `D${m.detector}`} · {m.lambda_ref_um?.toFixed?.(4)} µm (channel width {m.bandwidth_um?.toFixed?.(4)})
                        </div>
                        <ul className="mt-1 space-y-0.5">
                          {(m.frames ?? []).map((f: any, k: number) => (
                            <li key={k} className="data flex flex-wrap gap-x-3 text-muted">
                              <span className="text-text">{String(f.date_avg ?? "").slice(0, 16).replace("T", " ")}</span>
                              <span>{f.obsid}</span>
                              <span>{f.wavelength_um?.toFixed?.(4)} µm</span>
                              {f.flags_at_target?.length > 0 && <span className="text-warn">{f.flags_at_target.join(", ")}</span>}
                              {f.source_fits && (
                                <a className="text-accent hover:underline" href={f.source_fits} target="_blank" rel="noreferrer">
                                  FITS ↗
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(r.limitations) && r.limitations.length > 0 && (
                <div className="mt-4">
                  <div className="label mb-1">Limitations</div>
                  <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-text/80">
                    {r.limitations.map((l: string, i: number) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}

              {r.measurements && (
                <details className="mt-4 text-[12px]">
                  <summary className="cursor-pointer text-muted">Per-epoch measurements (raw record)</summary>
                  <div className="mt-2">
                    <Val v={r.measurements} />
                  </div>
                </details>
              )}
              {r.generated && <div className="mt-3 text-[11px] text-dim">Generated {r.generated} by pipeline/validate_targets.py</div>}
            </section>
          );
        })}
      </div>
    </main>
  );
}
