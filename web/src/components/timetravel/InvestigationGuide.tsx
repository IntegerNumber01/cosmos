"use client";

import Link from "next/link";
import Advanced from "@/components/Advanced";

export const GUIDED_LESSONS = {
  rwaur: {
    title: "Did this young star get brighter?",
    name: "RW Aurigae",
    look: "Look at the source inside the crosshair. Move the swipe slider to reveal each date. The images use the same brightness scale, so you can compare them.",
    learn: "Young stars can change as material around them shifts. A brighter picture is a clue; measurements and checks tell us how much we can trust it.",
    limit: "This view cannot tell us what caused the change. Nearby stars blend together, and slightly different infrared colors can affect brightness.",
    evidence: "/validation#rwaur",
    evidenceLabel: "Read the independently checked RW Aur result",
  },
  epsindib: {
    title: "Can you see a nearby brown dwarf move?",
    name: "Epsilon Indi B",
    look: "Look near the crosshair and move the swipe slider. The shift is smaller than one original camera pixel, so use the close-up and measurements rather than judging by eye alone.",
    learn: "A brown dwarf is an object too small to sustain the hydrogen fusion of a star. Nearby objects can visibly shift against the more distant sky over time.",
    limit: "The crosshair follows a catalog prediction; it is not a measured detection. The two brown dwarfs are unresolved in these images.",
    evidence: "/validation#epsindib",
    evidenceLabel: "Read the independently checked motion result",
  },
} as const;

export type GuidedTarget = keyof typeof GUIDED_LESSONS;

export default function InvestigationGuide({ slug, ready, measured, onCompare, onMeasure, onEvidence, onLeave, controlsOpen, onToggleControls }: {
  slug: GuidedTarget;
  ready: boolean;
  measured: boolean;
  onCompare: () => void;
  onMeasure: () => void;
  onEvidence: () => void;
  onLeave: () => void;
  controlsOpen: boolean;
  onToggleControls: () => void;
}) {
  const lesson = GUIDED_LESSONS[slug];
  return (
    <section aria-label="Guided investigation" className="glass mt-5 rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="label">Your first investigation · real NASA observations</div>
          <h2 className="font-display mt-2 text-[25px] font-semibold leading-tight sm:text-[30px]">{lesson.title}</h2>
        </div>
        <Link href="/learn" className="text-[13px] link">New to infrared? Start here ↗</Link>
      </div>
      <ol className="mt-4 flex flex-wrap gap-2">
        <li>
          <button type="button" disabled={!ready} onClick={onCompare} className="btn btn-primary disabled:opacity-50"><span aria-hidden>1 · </span>Compare the pictures ↓</button>
        </li>
        <li>
          <button type="button" disabled={!ready} onClick={onMeasure} className="btn disabled:opacity-50"><span aria-hidden>2 · </span>Measure this source ↓</button>
        </li>
        <li>
          <button type="button" disabled={!ready || !measured} onClick={onEvidence} className="btn disabled:opacity-50"><span aria-hidden>3 · </span>Review the evidence ↓</button>
        </li>
      </ol>
      <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-muted">{lesson.look}</p>
      <Advanced className="mt-4" label="What could fool us?" openLabel="Hide the explanation">
        <p>{lesson.learn}</p>
        <p className="mt-2">{lesson.limit} Camera artifacts can also leave apparent changes. Matching colors and rejecting bad pixels help, but do not remove every possible error.</p>
        <Link className="mt-2 inline-block link" href={lesson.evidence}>{lesson.evidenceLabel} →</Link>
      </Advanced>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-[12.5px]">
        <span className="text-muted">Try another question:</span>
        {Object.entries(GUIDED_LESSONS).filter(([id]) => id !== slug).map(([id, other]) => <a key={id} href={`/timetravel?target=${id}&guide=1&mode=swipe`} className="link">{other.name} →</a>)}
        <button type="button" onClick={onToggleControls} aria-expanded={controlsOpen} className="link">{controlsOpen ? "Hide observation controls" : "Show all observation controls"}</button>
        <button type="button" onClick={onLeave} className="text-muted hover:text-white">Leave the guide</button>
      </div>
    </section>
  );
}
