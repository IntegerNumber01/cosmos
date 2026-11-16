// "Should you believe this change?" Turns the checks the tool actually ran into a five-question evidence
// worksheet. Rules: a check is only "passed" when it was run and passed; anything not run stays open;
// the strongest verdict is "supported so far", never "confirmed" or "discovered".

export type CheckStatus = "pass" | "warn" | "fail" | "open";
export type Check = { id: string; label: string; status: CheckStatus; detail: string };
export type Verdict = { level: "supported" | "unresolved" | "no-change" | "not-measurable"; title: string; text: string };
export type Worksheet = { verdict: Verdict; changed: string[]; support: string[]; checks: Check[]; unknown: string[]; next: string[] };

export type Evidence = {
  dates: [string, string] | null; // compared endpoint dates (display strings)
  nDates: number;
  nClean: number; // clean, wavelength-matched brightness dates
  nExcludedColour: number;
  nUnusable: number;
  saturated: boolean;
  cautionFlags: string[]; // non-rejecting quality flags near the source on clean dates
  calibrated: { pct: number; pctErr: number; dmag: number; dmagErr: number; sigma: number; nRefs: number; looMaxShift?: number } | null;
  calFailure: string | null;
  calPending: boolean;
  /** uncalibrated endpoint comparison: strength vs blank-sky noise, and whether one date is consistent with nothing */
  rough: { sigma: number; vanished: boolean } | null;
  position: { shift: number; err: number; predicted: number | null; n: number } | null;
  catalogue: { status: "pending" | "failed" | "known" | "none"; text: string };
  smallBodies: { status: "not_checked" | "pending" | "failed" | "none" | "possible" | "consistent"; text: string };
};

const pct = (v: number) => `${Math.abs(v).toFixed(0)}%`;

export function buildWorksheet(e: Evidence): Worksheet {
  // a source present on one date and consistent with nothing on the other cannot be ratio-calibrated, but a
  // whole-image calibration drift cannot remove a source many times the noise either
  const vanished = !e.calibrated && !e.calPending && !!e.rough?.vanished && e.rough.sigma >= 5;
  const brightChange = (!!e.calibrated && e.calibrated.sigma >= 5) || vanished;
  const moved = !!e.position && e.position.n >= 2 && e.position.shift >= 1.5 && e.position.shift >= 3 * e.position.err;
  const [d1, d2] = e.dates ?? ["the first date", "the last date"];

  // 1 · What changed?
  const changed: string[] = [];
  if (e.calibrated)
    changed.push(
      brightChange
        ? `Brightness: about ${pct(e.calibrated.pct)} ± ${pct(e.calibrated.pctErr)} ${e.calibrated.pct >= 0 ? "brighter" : "fainter"} on ${d2} than on ${d1}.`
        : `Brightness: no clear change between ${d1} and ${d2} (${e.calibrated.pct >= 0 ? "+" : "−"}${pct(e.calibrated.pct)} ± ${pct(e.calibrated.pctErr)}).`,
    );
  else if (e.calPending) changed.push("Brightness: still being checked against reference stars.");
  else if (vanished) changed.push(`Brightness: possible disappearance. Detected on one date and not on the other (a ${e.rough!.sigma.toFixed(0)}× difference against blank-sky noise, not calibrated). Additional checks are needed.`);
  else if (e.nClean >= 2) changed.push(`Brightness: no calibrated comparison (${e.calFailure ?? "not available"}).`);
  else changed.push("Brightness: could not be measured cleanly on two matching dates.");
  if (e.position && e.position.n >= 2)
    changed.push(
      moved
        ? `Position: moved ${e.position.shift.toFixed(1)}″ ± ${e.position.err.toFixed(1)}″${e.position.predicted !== null ? ` (the catalog predicts ${e.position.predicted.toFixed(1)}″)` : ""}.`
        : `Position: no shift larger than the uncertainty (${e.position.shift.toFixed(1)}″ ± ${e.position.err.toFixed(1)}″).`,
    );

  // 2 · Which measurements support that interpretation?
  const support: string[] = [];
  if (e.calibrated) {
    support.push(
      `Calibrated brightness ratio Δm = ${e.calibrated.dmag >= 0 ? "+" : "−"}${Math.abs(e.calibrated.dmag).toFixed(2)} ± ${e.calibrated.dmagErr.toFixed(2)} mag (${e.calibrated.sigma.toFixed(1)}× its uncertainty), against ${e.calibrated.nRefs} reference stars in the same images.`,
    );
    if (e.calibrated.looMaxShift !== undefined)
      support.push(`Leaving out any one reference star changes Δm by at most ${e.calibrated.looMaxShift.toFixed(2)} mag, so ${e.calibrated.looMaxShift < 0.5 * e.calibrated.dmagErr ? "no single reference star drives the result" : "the result depends noticeably on individual reference stars"}.`);
  }
  support.push(`${e.nClean} of ${e.nDates} dates gave a clean measurement at a matching infrared color.`);
  if (e.position && e.position.n >= 2) support.push(`Positions measured on ${e.position.n} dates; the uncertainty includes a 0.5″ allowance for aligning dates.`);

  // 3 · Which alternative explanations have been checked?
  const checks: Check[] = [];
  checks.push({
    id: "colour", label: "A color difference between dates",
    status: e.nClean >= 2 ? (e.nExcludedColour ? "warn" : "pass") : "fail",
    detail: e.nClean >= 2
      ? e.nExcludedColour ? `Compared only dates with the same color here; ${e.nExcludedColour} date(s) were left out because their color differed.` : "Every compared date has the same infrared color (within half a channel) at this spot."
      : "Fewer than two dates share a clean measurement at the same color.",
  });
  checks.push({
    id: "calibration", label: "The whole image being brighter or fainter on one date",
    status: e.calibrated ? "pass" : e.calPending ? "open" : vanished ? "warn" : "fail",
    detail: e.calibrated
      ? `Corrected using ${e.calibrated.nRefs} reference stars measured the same way.`
      : e.calPending
        ? "Reference-star check still running."
        : vanished
          ? "Not corrected, because a brightness ratio needs the source on both dates. Calibration differences between the images are not ruled out."
          : `Not ruled out: ${e.calFailure ?? "no calibration"}.`,
  });
  const blend = e.calFailure?.includes("neighboring star");
  checks.push({
    id: "blend", label: "Light from an overlapping neighboring star",
    status: blend ? "fail" : e.calibrated ? "pass" : "open",
    detail: blend
      ? e.calFailure!
      : e.calibrated
        ? "Gaia neighbor screen passed: no comparably bright Gaia star partly overlaps the measurement. Unresolved or uncataloged infrared neighbors remain possible."
        : "Not checked, because the calibration did not run.",
  });
  checks.push({
    id: "saturation", label: "An overloaded (saturated) camera",
    status: e.saturated ? "fail" : "pass",
    detail: e.saturated ? "Saturation flags are set at this spot on some dates; those dates are not trustworthy." : "Saturation flag screen passed: no saturation flags at this spot.",
  });
  checks.push({
    id: "artefact", label: "Image artifacts (cosmic rays, halos, crosstalk)",
    status: e.nUnusable || e.cautionFlags.length ? "warn" : "pass",
    detail: [
      e.nUnusable ? `${e.nUnusable} date(s) had flagged pixels in the core and were not measured.` : "",
      e.cautionFlags.length ? `Quality flags near the source: ${e.cautionFlags.join(", ")}.` : "",
    ].filter(Boolean).join(" ") || "Quality-flag screen passed: no artifact flags near the source on the compared dates. Artifacts the pipeline did not flag remain possible.",
  });
  checks.push({
    id: "known", label: "An already cataloged star or object",
    status: e.catalogue.status === "known" ? "pass" : e.catalogue.status === "none" ? "warn" : "open",
    detail: e.catalogue.text,
  });
  checks.push({
    id: "solar-system", label: "A known asteroid or comet passing by",
    status: e.smallBodies.status === "none" || e.smallBodies.status === "consistent" ? "pass" : e.smallBodies.status === "possible" ? "warn" : "open",
    detail: e.smallBodies.text,
  });
  checks.push({
    id: "spectral", label: "A change that exists at only one color (a spectral feature)",
    status: "open",
    detail: "Not compared here. An apparent change can come from a narrow spectral feature rather than real variability, as in the ASR 7 case. Repeat observations at closely matched wavelengths test this best; other colors help describe the behavior.",
  });

  // 4 · What remains unknown?
  const open = checks.filter((c) => c.status === "open" || c.status === "fail");
  const unknown = [
    ...open.map((c) => `Not ruled out: ${c.label.charAt(0).toLowerCase()}${c.label.slice(1)}.`),
    "Artifacts that the quality flags did not mark, and neighboring sources missing from Gaia (for example, faint or very red infrared sources).",
    "What physically caused any change. These measurements describe it; they do not explain it.",
    ...(e.calibrated ? ["Color differences between the target and the reference stars, which the calibration does not model."] : []),
    ...(e.calibrated && e.calibrated.nRefs < 5 ? [`How reliable the uncertainty is: only ${e.calibrated.nRefs} reference stars were usable.`] : []),
  ];

  // 5 · What observation would resolve the uncertainty?
  const next: string[] = [];
  const st = (id: string) => checks.find((c) => c.id === id)!.status;
  if (vanished) next.push("Check independent exposures close to both dates: is the source consistently present on one and absent on the other?");
  next.push("Get more independent observations at a closely matched wavelength, such as other exposures in this set or later visits. Repeats at the same color test whether the change is real.");
  if (st("spectral") === "open")
    next.push("Compare other wavelengths to describe the change. A real change can be much weaker at another color (GP Mon brightened ×2.3 at 1.19 µm but only about ×1.1 at 3.94 µm, a change that is not significant), so a missing change there does not disprove it.");
  if (blend) next.push("Use sharper images from another telescope to separate the neighboring star.");
  else if (st("calibration") === "fail" && /reference star/.test(e.calFailure ?? "")) next.push("Use a larger field (12′ or more) so that more reference stars are available.");
  if (e.saturated) next.push("Choose a wavelength where the source is fainter and not saturated.");
  if (st("solar-system") === "open") next.push("Run the known asteroid and comet check.");
  if (st("known") === "open") next.push("Retry the catalog check when the service is available.");

  // Verdict
  const fails = checks.filter((c) => c.status === "fail");
  let verdict: Verdict;
  if (e.calPending && !moved)
    verdict = { level: "unresolved", title: "Still checking", text: "Waiting for the reference-star check before judging the brightness." };
  else if (!e.calibrated && !moved && !e.calPending && e.nClean < 2)
    verdict = { level: "not-measurable", title: "Can't tell yet", text: "These images do not give clean measurements on two matching dates, so there is no evidence either way." };
  else if (vanished && !moved)
    verdict = { level: "unresolved", title: "Possible disappearance: additional checks needed", text: "The source is detected on one date but not on the other. That deserves investigation, but the comparison is not calibrated. Independent exposures or other controls are needed before relying on it." };
  else if (brightChange || moved) {
    verdict = fails.length
      ? { level: "unresolved", title: "A change, with an unresolved problem", text: `A change is measured, but a check failed: ${fails.map((c) => c.label.toLowerCase()).join("; ")}. Don't rely on it yet.` }
      : { level: "supported", title: "Supported so far", text: "The measured change passed every screen run here. Screens can miss unflagged artifacts and neighbors not in Gaia, and the open questions below could still explain it, so it is not confirmed." };
  } else
    verdict = fails.some((c) => c.id === "calibration" || c.id === "blend") && !e.calibrated
      ? { level: "unresolved", title: "Can't tell yet", text: `The brightness could not be calibrated (${e.calFailure ?? "unknown reason"}), so a change can be neither shown nor ruled out.` }
      : { level: "no-change", title: "No clear change", text: "No change larger than the uncertainties. Smaller changes, or changes at other colors, are not ruled out." };
  return { verdict, changed, support, checks, unknown, next };
}
