/**
 * Plain-language wording for the challenge validation records (public/data/validation/*.json).
 * The technical verdict and summary stay in the data and are shown under "Show the science".
 * A plain sentence is used only while the record's verdict still matches the one it was written for;
 * otherwise the page falls back to the record's own summary, so the wording can never drift from the data.
 */

export const VERDICT_STYLE: Record<string, string> = {
  confirmed: "bg-good/15 text-good",
  consistent: "bg-good/15 text-good",
  not_detected: "bg-warn/15 text-warn",
  inconclusive: "bg-white/10 text-muted",
  unreliable: "bg-bad/15 text-bad",
};

/** Generic plain label for a verdict code. */
export const VERDICT_PLAIN: Record<string, string> = {
  confirmed: "Seen in the images",
  consistent: "Faintly seen, not certain",
  not_detected: "Not seen",
  inconclusive: "SPHEREx can't tell",
  unreliable: "Can't be measured reliably",
};

type Plain = { verdict: string; status: string; text: string };

const PLAIN: Record<string, Plain> = {
  barnard: {
    verdict: "unreliable",
    status: "Too bright to measure",
    text: "This star is so bright it overloads SPHEREx's camera in every set of pictures we checked. We can't measure its position precisely, so we say that instead of guessing.",
  },
  wise0855: {
    verdict: "consistent",
    status: "Faintly seen, motion not proven",
    text: "Only visible when several pictures are added together, and only at the longest infrared wavelengths, as expected for something this cold. It sits on its predicted path, but the pictures can't firmly prove it moved.",
  },
  epsindib: {
    verdict: "confirmed",
    status: "Seen moving, as predicted",
    text: "Over one year it shifted across the sky by close to the predicted amount. All three usable sets of pictures agree with the prediction.",
  },
  rwaur: {
    verdict: "confirmed",
    status: "Brightening measured",
    text: "It got clearly brighter between September 2025 and March 2026. Only one clean pair of pictures could be used; at other wavelengths it was too bright to measure.",
  },
  rdra: {
    verdict: "unreliable",
    status: "Too bright to measure",
    text: "This giant star overloads SPHEREx's camera in every set of pictures we checked, so its brightness can't be measured reliably. We say so instead of forcing a result.",
  },
};

export function plainFor(slug: string, verdict?: string): { status: string; text?: string } | null {
  if (!verdict) return null;
  const p = PLAIN[slug];
  if (p && p.verdict === verdict) return { status: p.status, text: p.text };
  return { status: VERDICT_PLAIN[verdict] ?? verdict.replace(/_/g, " ") };
}

/** Plain name for the kind of test a record runs. */
export const TEST_PLAIN: Record<string, string> = {
  proper_motion: "Does it move?",
  detection_and_motion: "Can we see it, and does it move?",
  variability: "Does its brightness change?",
};
