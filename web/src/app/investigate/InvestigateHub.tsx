"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { TT_TARGETS } from "@/lib/ttTargets";
import { VERDICT_STYLE, plainFor } from "@/components/investigate/plainVerdicts";

type V = { id: string; name: string; test_type: string; result?: { verdict: string; summary: string } };

/** Everyday description of each challenge target (the catalogue wording lives in ttTargets). */
const KIND_PLAIN: Record<string, string> = {
  barnard: "Fastest-moving star across our sky",
  wise0855: "Coldest known brown dwarf (a “failed star”)",
  epsindib: "A pair of brown dwarfs",
  rwaur: "Young star that dims and brightens",
  rdra: "Giant star that slowly pulses",
};

function CaseRow({
  href,
  img,
  imgAlt,
  title,
  hook,
  status,
  statusCls,
  imgClass = "pixelated",
}: {
  href: string;
  img: string;
  imgAlt: string;
  title: string;
  hook: string;
  status: string;
  statusCls: string;
  imgClass?: string;
}) {
  return (
    <Link href={href} className="glass group grid grid-cols-[96px_1fr] overflow-hidden rounded-2xl transition glass-hover sm:grid-cols-[200px_1fr]">
      <div className="h-full min-h-[120px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt={imgAlt} className={`h-full w-full object-cover ${imgClass}`} />
      </div>
      <div className="p-4 sm:p-5">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusCls}`}>{status}</span>
        <h2 className="font-display mt-1.5 text-[20px] font-semibold leading-tight sm:text-[23px]">{title}</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-text/80">{hook}</p>
        <div className="mt-2 text-[13px] text-muted transition hover:text-text group-hover:underline">Open the case →</div>
      </div>
    </Link>
  );
}

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
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.05),transparent_70%)]" />
      <NavBar />
      <div className="relative mx-auto max-w-[1000px] px-4 pt-24 sm:px-6">
        <div className="label">Investigate</div>
        <h1 className="font-display mt-1 text-[34px] font-semibold leading-tight sm:text-[42px]">Case files</h1>
        <p className="mt-2 max-w-2xl text-[15px] text-muted">
          Detective work with real pictures from NASA&apos;s SPHEREx space telescope. Each case asks one question and shows you the evidence. Sometimes the
          honest answer is &quot;we can&apos;t tell&quot;.
        </p>

        <div className="mt-8 space-y-4">
          <CaseRow
            href="/investigate/swan"
            img="/img/investigate.webp"
            imgAlt="Comet C/2025 R2 (SWAN) in a SPHEREx picture"
            title="Comet SWAN on the move"
            hook="Its orbit says where it should be. Did SPHEREx really photograph it there?"
            status="Confirmed in the images · a known comet"
            statusCls="bg-good/15 text-good"
          />
          <CaseRow
            href="/investigate/search"
            img="/data/discovery/gy152-images.png"
            imgAlt="SPHEREx pictures of the young star GY 152 on several dates"
            title="What a blind search found"
            hook="We scanned six star-forming clouds for anything that changed. Three things stood out."
            status="Known objects · no new discovery claimed"
            statusCls="bg-warn/15 text-warn"
            imgClass="object-[41%_34%] origin-[41%_34%] translate-x-[9%] translate-y-[16%] scale-[5.5] invert"
          />
        </div>

        <h2 className="font-display mt-14 text-[22px] font-semibold">The challenge&apos;s five test targets</h2>
        <p className="mt-1 max-w-2xl text-[13.5px] text-muted">Every team is asked to test their tool on these five. Here is how ours did.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TT_TARGETS.filter((t) => t.challenge).map((t) => {
            const v = vals[t.slug];
            const plain = plainFor(t.slug, v?.result?.verdict);
            return (
              <div key={t.slug} id={t.slug} className="glass flex flex-col rounded-2xl p-4">
                <div className="text-[12px] text-muted">{KIND_PLAIN[t.slug] ?? t.kind}</div>
                <div className="font-display mt-0.5 text-[19px] font-semibold">{t.name}</div>
                {v?.result && plain ? (
                  <>
                    <span className={`mt-2 w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE[v.result.verdict] ?? "bg-white/10 text-muted"}`}>
                      {plain.status}
                    </span>
                    <p className="mt-2 flex-1 text-[13px] leading-relaxed text-text/80">{plain.text ?? v.result.summary}</p>
                  </>
                ) : (
                  <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">{t.why}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/timetravel?target=${t.slug}`} className="btn btn-primary !py-1 !text-[12px]">
                    See the pictures
                  </Link>
                  {v && (
                    <Link href={`/validation#${t.slug}`} className="btn !py-1 !text-[12px]">
                      How we tested it
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
          <Link href="/timetravel" className="flex flex-col justify-center rounded-2xl card p-4 transition hover:bg-surface-2">
            <div className="text-[12px] font-medium text-text">Your own case</div>
            <div className="font-display mt-0.5 text-[19px] font-semibold">Any spot in the sky →</div>
            <p className="mt-1 text-[13px] text-muted">Pick a place, then compare pictures from different dates to see what changed.</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
