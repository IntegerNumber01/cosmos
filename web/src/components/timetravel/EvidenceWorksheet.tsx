"use client";
import { CheckStatus, Worksheet } from "@/lib/worksheet";

const STATUS: Record<CheckStatus, { mark: string; word: string; cls: string }> = {
  pass: { mark: "✓", word: "Checked", cls: "text-good border-good/40" },
  warn: { mark: "!", word: "Caution", cls: "text-warn border-warn/40" },
  fail: { mark: "✗", word: "Problem", cls: "text-bad border-bad/40" },
  open: { mark: "?", word: "Not checked", cls: "text-muted border-line" },
};
const VERDICT = {
  supported: "border-good/40 bg-good/[0.05] text-good",
  unresolved: "border-warn/40 bg-warn/[0.05] text-warn",
  "no-change": "border-accent/30 bg-accent/[0.04] text-accent",
  "not-measurable": "border-line bg-white/[0.02] text-muted",
} as const;

export const WORKSHEET_QUESTIONS = [
  "What changed?",
  "Which measurements support that?",
  "Which other explanations have been checked?",
  "What is still unknown?",
  "What observation would settle it?",
] as const;

export default function EvidenceWorksheet({ sheet, notes, onNote }: { sheet: Worksheet; notes: string[]; onNote: (i: number, v: string) => void }) {
  const lists: (string[] | null)[] = [sheet.changed, sheet.support, null, sheet.unknown, sheet.next];
  return (
    <section aria-label="Evidence worksheet" className="mt-5 rounded-xl border border-line p-4">
      <h3 className="font-display text-[20px] font-semibold">Should you believe this change?</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
        Scientists ask the same five questions before trusting an apparent change. COSMOS fills in the answers from the checks it actually ran. Anything it couldn&apos;t check stays open.
      </p>
      <div aria-live="polite" data-verdict={sheet.verdict.level} className={`mt-3 rounded-lg border p-3 ${VERDICT[sheet.verdict.level]}`}>
        <div className="font-semibold">{sheet.verdict.title}</div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-text/90">{sheet.verdict.text}</p>
      </div>
      <ol className="mt-4 space-y-4">
        {WORKSHEET_QUESTIONS.map((q, i) => (
          <li key={q}>
            <h4 className="text-[14px] font-semibold"><span className="text-accent">{i + 1}.</span> {q}</h4>
            {i === 2 ? (
              <ul className="mt-2 space-y-1.5" aria-label="Alternative explanations">
                {sheet.checks.map((c) => {
                  const s = STATUS[c.status];
                  return (
                    <li key={c.id} className="flex gap-2.5 text-[12.5px] leading-relaxed">
                      <span className={`mt-0.5 inline-flex h-fit min-w-[92px] shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
                        <span aria-hidden>{s.mark}</span> {s.word}
                      </span>
                      <span><span className="text-text">{c.label}.</span> <span className="text-muted">{c.detail}</span></span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-text/85">
                {lists[i]!.map((t) => <li key={t}>{t}</li>)}
              </ul>
            )}
            <label className="mt-2 block text-[11.5px] text-dim">
              Your notes (optional, included in the evidence download)
              <textarea
                value={notes[i]}
                onChange={(e) => onNote(i, e.target.value)}
                rows={2}
                maxLength={2000}
                className="mt-1 block w-full rounded-lg border border-line bg-white/[0.03] p-2 text-[12.5px] text-text outline-none focus:border-accent/60"
              />
            </label>
          </li>
        ))}
      </ol>
    </section>
  );
}
