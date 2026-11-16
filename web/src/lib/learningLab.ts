import { calibrate, type Calibration, type FieldStar } from "./engine/photometry";
import { decodeFrame, measure, type Frame, type Measurement } from "./engine/sequence";
import { TT_BY_SLUG } from "./ttTargets";

export const LAB_CASES = [
  { id: "rwaur", title: "Case 1 · A young star", slug: "rwaur", keys: ["2025W36_1A_0233_2D1", "2026W10_2B_0591_3D1"] },
  { id: "epsindib", title: "Case 2 · A nearby brown dwarf", slug: "epsindib", keys: ["2025W17_4B_0027_3D2", "2026W17_2A_0308_3D2"] },
  { id: "blend", title: "Case 3 · A star with company", slug: "rwaur", keys: ["2025W36_1A_0233_2D1", "2026W10_2B_0591_3D1"] },
] as const;
export type LabId = (typeof LAB_CASES)[number]["id"];
export const TRANSFER_CASE = { id: "gpmon", title: "A new investigation · GP Mon", slug: "gpmon", keys: ["2025W40_1A_0132_1D2", "2025W46_1A_0377_1D2"] } as const;
export type InvestigationId = LabId | typeof TRANSFER_CASE.id;
export type LabChoice = "supported" | "no-change" | "unreliable";
export const LAB_CHOICES: { value: LabChoice; label: string }[] = [
  { value: "supported", label: "A brightness change is supported so far" },
  { value: "no-change", label: "No clear brightness change at this precision" },
  { value: "unreliable", label: "The brightness measurement is unreliable" },
];
type StarField = { query: { epoch_mjd: number }; stars: FieldStar[]; source: string };
export type LabResult = {
  frames: Frame[]; measurements: Measurement[]; positions: [number, number][];
  calibration: Calibration; interpretation: LabChoice; explanation: string; next: string;
  catalogueSource: string; comparisonUrl: string;
};

/** The same native-pixel rules as Time Travel, with fixed real benchmark/control pairs. */
export function evaluateLabCase(id: InvestigationId, frames: Frame[], field: StarField): LabResult {
  const c = [...LAB_CASES, TRANSFER_CASE].find((c) => c.id === id);
  if (!c) throw new Error("Unknown investigation.");
  if (frames.length !== 2 || frames.some((f, i) => `${f.meta.obsid}D${f.meta.detector}` !== c.keys[i] || !f.meta.sourceFits.includes("/spherex/dr1/")))
    throw new Error("These images do not match the prepared investigation.");
  const star = id === "blend" ? field.stars.find((s) => s.source_id === "156430890833907584") : null;
  if (id === "blend" && !star) throw new Error("The control star is missing from the prepared field.");
  const target = TT_BY_SLUG[c.slug];
  const ra = star?.ra_epoch ?? target.ra, dec = star?.dec_epoch ?? target.dec;
  const pm = star ? [star.pmra, star.pmdec] : target.pm;
  const epochMjd = star ? field.query.epoch_mjd : 51544.5 + 25.9 * 365.25;
  const positions = frames.map((f): [number, number] => {
    const dt = (f.meta.mjdAvg - epochMjd) / 365.25;
    return [ra + ((pm?.[0] ?? 0) * dt) / 3.6e6 / Math.cos(dec * Math.PI / 180), dec + ((pm?.[1] ?? 0) * dt) / 3.6e6];
  });
  const measurements = frames.map((f, i) => measure(f, ...positions[i]));
  const calibration = calibrate(frames, measurements, field.stars, field.query.epoch_mjd);
  const interpretation: LabChoice = !calibration.ok ? "unreliable" : calibration.significance >= 5 ? "supported" : "no-change";
  const explanation = !calibration.ok
    ? `The calibrated comparison is refused: ${calibration.reason}. A small statistical error would not fix this problem.`
    : interpretation === "supported"
      ? `The target changed relative to ${calibration.nRefs} reference stars measured in the same exposures. This supports a brightness change in this pair, but does not confirm its cause or rule out every artifact.`
      : "The measured brightness difference is small compared with its uncertainty. This does not prove constant brightness: smaller changes, or changes at other wavelengths, remain possible. This object can also move without changing brightness.";
  const next = !calibration.ok
    ? "Use sharper independent images to separate the neighboring sources before relying on a brightness change."
    : "Check independent exposures at closely matched wavelengths. Inspect quality flags and neighboring sources; other wavelengths help describe the behavior.";
  const q = new URLSearchParams({ target: c.slug, mode: "swipe", size: "0.1", before: c.keys[0], after: c.keys[1], anchor: c.keys[0], start: frames[0].meta.dateAvg.slice(0, 10), end: frames[1].meta.dateAvg.slice(0, 10) });
  q.set("measure", JSON.stringify({ ra, dec, label: star ? "Blended control · Gaia 156430890833907584" : target.name, ...(pm ? { pm, epochYear: 2000 + (epochMjd - 51544.5) / 365.25 } : {}) }));
  return { frames, measurements, positions, calibration, interpretation, explanation, next, catalogueSource: field.source, comparisonUrl: `/timetravel?${q}` };
}

export async function loadLabCase(id: InvestigationId, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<LabResult> {
  const c = [...LAB_CASES, TRANSFER_CASE].find((c) => c.id === id);
  if (!c) throw new Error("Unknown investigation.");
  const base = `/cache/${c.slug}`;
  const read = async (url: string) => {
    const response = await fetcher(url, { signal });
    if (!response.ok) throw new Error("A prepared image or star field could not be loaded. Retry when the site is reachable.");
    return response;
  };
  const [frames, field] = await Promise.all([
    Promise.all(c.keys.map(async (key) => decodeFrame(await (await read(`${base}/frames/${key}_0.2.bin`)).arrayBuffer()))),
    read(`${base}/calib_stars.json`).then((r) => r.json() as Promise<StarField>),
  ]);
  return evaluateLabCase(id, frames, field);
}
