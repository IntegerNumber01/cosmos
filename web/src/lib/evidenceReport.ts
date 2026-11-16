import type { Worksheet } from "./worksheet";
import type { MotionResult } from "./engine/motion";

export const EVIDENCE_QUESTIONS = ["What changed?", "Which measurements support that?", "Which other explanations have been checked?", "What is still unknown?", "What observation would settle it?"] as const;

/** Plain text is readable without software and keeps failures and notes alongside the conclusion. */
export function evidenceText(input: {
  exportedAt: string; investigationUrl: string; release: string; engine: string;
  target: { ra: number; dec: number; label: string }; brightness: string; position: string;
  sheet: Worksheet; notes: string[]; limitations: string[];
  measurements: { date: string; wl: number; bw: number; sourceFits: string; flagsHere: string[]; usableForBrightness: boolean }[];
  motionAnalysis?: MotionResult | { status: string };
}): string {
  const { sheet } = input;
  const lines = ["COSMOS · Investigation handoff", `Saved: ${input.exportedAt}`, `Data: ${input.release} · engine ${input.engine}`, `Target: ${input.target.label}`, `RA ${input.target.ra}°, Dec ${input.target.dec}°`, "", "REOPEN THIS INVESTIGATION", input.investigationUrl,
    "The link restores the selected measurement and comparison. Live services may answer differently later. Notes are in this file and the JSON download, not in the link.", "", `VERDICT: ${sheet.verdict.title}`, sheet.verdict.text, "", input.brightness, input.position];
  const motion = input.motionAnalysis;
  if (motion && "ok" in motion) {
    lines.push("", "REFERENCE-STAR MOTION ANALYSIS");
    if (!motion.ok) lines.push("Unavailable: " + motion.reason);
    else {
      lines.push(`Displacement: ${motion.shift.toFixed(3)} +/- ${motion.shiftError.toFixed(3)} arcsec; ${motion.epochs.length} visits; ${motion.baselineDays.toFixed(1)} days.`);
      if (motion.east && motion.north) lines.push(`East rate: ${motion.east.rate.toFixed(3)} +/- ${motion.east.error.toFixed(3)} arcsec/year. North rate: ${motion.north.rate.toFixed(3)} +/- ${motion.north.error.toFixed(3)} arcsec/year.`);
      lines.push(motion.parallaxMas === null ? "No trusted parallax supplied; rates are apparent motion." : `Fixed catalog parallax input: ${motion.parallaxMas} mas (${motion.parallaxSource ?? "catalog"}); no new distance measured.`, ...motion.caveats);
    }
    lines.push(...motion.rejected.map((r) => `Excluded ${r.obsid}: ${r.reason}`));
  }
  const answers = [sheet.changed, sheet.support, sheet.checks.map((c) => `[${({ pass: "Checked", warn: "Caution", fail: "Problem", open: "Not checked" })[c.status]}] ${c.label}: ${c.detail}`), sheet.unknown, sheet.next];
  EVIDENCE_QUESTIONS.forEach((question, i) => {
    lines.push("", `${i + 1}. ${question}`, ...answers[i].map((answer) => `- ${answer}`));
    if (input.notes[i]?.trim()) lines.push("Your note:", input.notes[i]);
  });
  lines.push("", "OBSERVATIONS AND ORIGINAL IMAGES");
  input.measurements.forEach((m) => lines.push(`${m.date} · ${m.wl.toFixed(5)} µm (channel width ${m.bw.toFixed(5)} µm)`, `Included in brightness screen: ${m.usableForBrightness ? "yes" : "no"}. Flags: ${m.flagsHere.join(", ") || "none reported"}`, m.sourceFits));
  lines.push("", "METHOD LIMITS", ...input.limitations.map((s) => `- ${s}`), "", "REVIEWER CHECKLIST", "Open the link. Confirm the selected position, dates and wavelengths. Read the verdict and outstanding checks. Compare with the original images. Explain one remaining uncertainty before accepting the conclusion.", "The JSON export contains native measurements, catalog responses and calibration details. No discovery is established by this report.");
  return lines.join("\n") + "\n";
}
