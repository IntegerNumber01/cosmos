"use client";
import { CheckStatus, Worksheet } from "@/lib/worksheet";
import { EVIDENCE_QUESTIONS } from "@/lib/evidenceReport";

const STATUS: Record<CheckStatus, { mark: string; word: string; cls: string }> = {
  pass: { mark: "✓", word: "Checked", cls: "text-good bg-good/15" },
  warn: { mark: "!", word: "Caution", cls: "text-warn bg-warn/15" },
  fail: { mark: "✗", word: "Problem", cls: "text-bad bg-bad/15" },
  open: { mark: "?", word: "Not checked", cls: "text-muted bg-white/[0.07]" },
};
const VERDICT = {
  supported: "bg-good/10 text-good",
  unresolved: "bg-warn/10 text-warn",
  "no-change": "bg-surface-2 text-text",
  "not-measurable": "bg-surface-2 text-muted",
} as const;

export const WORKSHEET_QUESTIONS = EVIDENCE_QUESTIONS;

export default function EvidenceWorksheet({ sheet, notes, onNote }: { sheet: Worksheet; notes: string[]; onNote: (i: number, v: string) => void }) {
  const lists: (string[] | null)[] = [sheet.changed, sheet.support, null, sheet.unknown, sheet.next];
  return (
    <section aria-label="Evidence worksheet" className="mt-5 rounded-xl card p-4">
      <h3 className="font-display text-[20px] font-semibold">Should you believe this change?</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
        Scientists ask the same five questions before trusting an apparent change. COSMOS fills in the answers from the checks it actually ran. Anything it couldn&apos;t check stays open.
      </p>
      <div aria-live="polite" data-verdict={sheet.verdict.level} className={`mt-3 rounded-lg p-3 ${VERDICT[sheet.verdict.level]}`}>
        <div className="font-semibold">{sheet.verdict.title}</div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-text/90">{sheet.verdict.text}</p>
      </div>
      <ol className="mt-4 space-y-4">
        {WORKSHEET_QUESTIONS.map((q, i) => (
          <li key={q}>
            <h4 className="text-[14px] font-semibold"><span className="text-muted">{i + 1}.</span> {q}</h4>
            {i === 2 ? (
              <ul className="mt-2 space-y-1.5" aria-label="Alternative explanations">
                {sheet.checks.map((c) => {
                  const s = STATUS[c.status];
                  return (
                    <li key={c.id} className="flex gap-2.5 text-[12.5px] leading-relaxed">
                      <span className={`mt-0.5 inline-flex h-fit min-w-[92px] shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
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
                className="mt-1 block w-full field p-2 text-[12.5px] text-text"
              />
            </label>
          </li>
        ))}
      </ol>
    </section>
  );
}
