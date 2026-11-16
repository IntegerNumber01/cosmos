/** Transparent answer key for a formative activity, not a validated educational instrument. */
export const REASONING_QUESTIONS = [
  { id: "change", prompt: "What does GP Mon's measured brightness difference support?", options: ["A brightness change in this pair", "It stayed constant at this precision", "A new star was discovered"], correct: 0, explanation: "The calibrated difference is large compared with its uncertainty. That supports a change in this pair, not its cause or novelty." },
  { id: "motion", prompt: "Another object's brightness is unchanged. What can you conclude about its motion?", options: ["It cannot have moved", "Brightness alone does not answer whether it moved", "It moved by the catalogue prediction"], correct: 1, explanation: "Position and brightness are different measurements. An object can move while its brightness stays steady. A prediction is not a measured position." },
  { id: "catalogue", prompt: "The star-catalogue service fails for your selected source. What should your report say?", options: ["The source is new", "There are no known objects here", "Its catalogue identity remains unchecked"], correct: 2, explanation: "A failed request leaves the identity unknown. Even a successful empty query would not establish a discovery." },
  { id: "followup", prompt: "What is the most useful next test of GP Mon's brightness change?", options: ["Add any infrared colours until the picture looks smoother", "Collect independent, clean exposures at matching wavelengths", "Quote a smaller statistical error on the same images"], correct: 1, explanation: "Independent matched-wavelength observations test whether the change repeats. Mixing colours can imitate change; a smaller error does not fix a blend or other bias." },
] as const;
export type ReasoningResponse = { choices: (number | null)[]; reason: string; startedAt: string; submittedAt?: string };
export function scoreReasoning(response: ReasoningResponse) {
  if (response.choices.length !== REASONING_QUESTIONS.length || response.choices.some((v,i)=>!Number.isInteger(v) || v! < 0 || v! >= REASONING_QUESTIONS[i].options.length) || !response.reason.trim()) return null;
  const items = REASONING_QUESTIONS.map((q,i)=>({ id: q.id, selected: response.choices[i], correct: response.choices[i] === q.correct }));
  return { correct: items.filter(i=>i.correct).length, total: items.length, items, note: "Closed-choice agreement with this activity's answer key. Written reasoning requires human review; this is not a measured learning gain." };
}
