import { analyseMotion, type MotionResult } from "./engine/motion";
import { decodeFrame, type Frame } from "./engine/sequence";
import type { FieldStar } from "./engine/photometry";
import { TT_BY_SLUG } from "./ttTargets";

export type FeaturedMotion = { frames: Frame[]; result: Extract<MotionResult, { ok: true }> };

/** Recalculate the featured measurement from the same native files as the full viewer.
 * The saved preflight chooses exposures; its stored answer is never used as the result.
 */
export async function loadFeaturedMotion(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<FeaturedMotion> {
  const read = async (file: string) => {
    const r = await fetcher(`/cache/epsindib/${file}`, { signal });
    if (!r.ok) throw new Error("The saved observations could not be loaded. Try again when this site is reachable.");
    return r;
  };
  const [manifest, field] = await Promise.all([
    read("motion_analysis.json").then(r => r.json()) as Promise<{ selections: { default: boolean; cadence: string; sources: { file: string }[] }[] }>,
    read("calib_stars.json").then(r => r.json()) as Promise<{ stars: FieldStar[]; query: { epoch_mjd: number } }>,
  ]);
  const selection = manifest.selections.find(s => s.default && s.cadence === "exposures");
  if (!selection?.sources.length || selection.sources.length > 12) throw new Error("The prepared motion selection is unavailable.");
  const frames = await Promise.all(selection.sources.map(async ({ file }) => {
    if (!/^frames\/\d{4}W\d{2}_[A-Z0-9]+_\d+_\dD[1-6]_0\.2\.bin$/.test(file)) throw new Error("Invalid prepared image reference.");
    const f = decodeFrame(await (await read(file)).arrayBuffer());
    if (file !== `frames/${f.meta.obsid}D${f.meta.detector}_0.2.bin` || !f.meta.sourceFits.includes("/spherex/dr1/")) throw new Error("The image identity does not match the saved investigation.");
    return f;
  }));
  const t = TT_BY_SLUG.epsindib;
  const result = analyseMotion(frames, { ...t, epochYear: 2025.9, parallaxSource: "Gaia DR3 (fixed input)" }, field.stars, field.query.epoch_mjd);
  if (!result.ok) throw new Error(result.reason);
  return { frames, result };
}
