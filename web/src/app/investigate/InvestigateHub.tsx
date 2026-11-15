"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { TT_TARGETS } from "@/lib/ttTargets";

type V = { id: string; name: string; test_type: string; result?: { verdict: string; summary: string } };

const VERDICT_STYLE: Record<string, string> = {
  confirmed: "bg-good/15 text-good",
  consistent: "bg-good/15 text-good",
  not_detected: "bg-warn/15 text-warn",
  inconclusive: "bg-white/10 text-muted",
  unreliable: "bg-bad/15 text-bad",
};

export default function InvestigateHub() {
  const [vals, setVals] = useState<Record<string, V | null>>({});
  useEffect(() => {
    for (const t of TT_TARGETS.filter((x) => x.challenge)) {
      fetch(`/data/validation/${t.slug}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => setVals((s) => ({ ...s, [t.slug]: v })))
        .catch(() => setVals((s) => ({ ...s, [t.slug]: null })));
    }
  }, []);

  return (
    <main className="relative min-h-screen bg-bg pb-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(80,120,255,0.12),transparent_70%)]" />
      <NavBar />
      <div className="relative mx-auto max-w-[1180px] px-4 pt-24 sm:px-6">
        <div className="label text-accent">Investigate</div>
        <h1 className="font-display mt-1 text-[34px] font-semibold leading-tight sm:text-[42px]">Case files</h1>
        <p className="mt-2 max-w-2xl text-[14.5px] text-muted">
          Each investigation starts from real SPHEREx exposures and asks three questions. What changed? Can we measure it? Is it already known? Some answers
          are &quot;SPHEREx can&apos;t tell&quot;, and we say so.
        </p>

        <Link
          href="/investigate/swan"
          className="glass group mt-8 grid overflow-hidden rounded-2xl transition hover:border-accent/40 md:grid-cols-[320px_1fr]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/investigate.webp" alt="Comet C/2025 R2 (SWAN) in a SPHEREx exposure" className="pixelated h-full max-h-[260px] w-full object-cover md:max-h-none" />
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label text-accent">Featured case file · moving object</span>
              <span className="rounded-full bg-good/15 px-2 py-0.5 text-[11px] font-semibold text-good">confirmed known-object match</span>
            </div>
            <h2 className="font-display mt-1 text-[24px] font-semibold">Comet C/2025 R2 (SWAN)</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-text/80">
              From the orbit prediction to the pixels. We found the comet in all 20 SPHEREx frames from 27–28 Oct 2025, measured its motion against the prediction,
              checked field stars as a control, and confirmed the spot is empty again on 1 May 2026 at a matched wavelength.
            </p>
            <div className="mt-3 text-[13px] text-accent group-hover:underline">Open the case file →</div>
          </div>
        </Link>

        <h2 className="font-display mt-12 text-[22px] font-semibold">The challenge&apos;s five test targets</h2>
        <p className="mt-1 max-w-2xl text-[13px] text-muted">
          The challenge asks every tool to be tested on these. Each one exercises a different case: proper motion, a faint cold brown dwarf, and variability.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TT_TARGETS.filter((t) => t.challenge).map((t) => {
            const v = vals[t.slug];
            return (
              <div key={t.slug} id={t.slug} className="glass flex flex-col rounded-2xl p-4">
                <div className="label">{t.kind}</div>
                <div className="font-display mt-1 text-[19px] font-semibold">{t.name}</div>
                {v?.result ? (
                  <>
                    <span className={`mt-2 w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE[v.result.verdict] ?? "bg-white/10 text-muted"}`}>
                      {v.result.verdict.replace("_", " ")}
                    </span>
                    <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-text/80">{v.result.summary}</p>
                  </>
                ) : (
                  <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-muted">{t.why}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/timetravel?target=${t.slug}`} className="btn btn-primary !py-1 !text-[12px]">
                    Open in Time Travel
                  </Link>
                  {v && (
                    <Link href={`/validation#${t.slug}`} className="btn !py-1 !text-[12px]">
                      Validation record
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
          <Link href="/timetravel" className="flex flex-col justify-center rounded-2xl border border-dashed border-line p-4 transition hover:border-accent/50">
            <div className="label text-accent">Your own investigation</div>
            <div className="font-display mt-1 text-[19px] font-semibold">Any coordinates →</div>
            <p className="mt-1 text-[12.5px] text-muted">
              Fly to a star, pick a spot on the infrared map, or type RA/Dec. Then watch every date SPHEREx looked and find what changed.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
