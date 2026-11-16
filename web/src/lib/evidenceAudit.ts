import { loadFeaturedMotion } from "./featuredMotion";
import { loadLabCase, type LabId } from "./learningLab";
import { decodeFrame } from "./engine/sequence";
import { ENGINE_VERSION, RELEASE } from "./engine/releases";

type ManifestEntry = { file: string; sha256: string; source?: string; nx?: number; ny?: number };
type Manifest = { engine: string; release: string; complete: boolean; catalog: ManifestEntry; frames: ManifestEntry[] };
type Input = { file: string; sha256: string; bytes: number; manifestMatch: boolean; originalFits?: string; date?: string; wavelengthMicrons?: number };
export type EvidenceCase = { id: string; title: string; outcome: string; value: number | null; error: number | null; unit: string; files: string[]; comparisonUrl: string };
export type EvidenceAudit = { schema: string; checkedAt: string; engine: string; release: string; inputs: Input[]; cases: EvidenceCase[]; limits: string[] };

/** Verify exactly the files consumed by the production calculations. No stored numeric answer
 * is accepted as a newly measured result. Checksums compare with this site's unsigned manifests. */
export async function auditEvidence(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<EvidenceAudit> {
  if (!globalThis.crypto?.subtle) throw new Error("Checksum verification needs an HTTPS connection or localhost. Open the secure site and try again.");
  const inputs = new Map<string, Input>(), bytes = new Map<string, Promise<ArrayBuffer>>();
  const read = (file: string) => {
    let promise = bytes.get(file);
    if (!promise) {
      promise = (async () => {
        const r = await fetcher(file, { signal });
        if (!r.ok) throw new Error(`Evidence unavailable: ${file} (HTTP ${r.status}).`);
        const buffer = await r.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        inputs.set(file, { file, sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join(""), bytes: buffer.byteLength, manifestMatch: false });
        return buffer;
      })();
      bytes.set(file, promise);
    }
    return promise;
  };
  const expected = new Map<string, ManifestEntry>();
  for (const slug of ["epsindib", "rwaur", "gpmon"]) {
    const manifest: Manifest = JSON.parse(new TextDecoder().decode(await read(`/cache/${slug}/calibration_manifest.json`)));
    if (manifest.engine !== ENGINE_VERSION || manifest.release !== RELEASE.id || !manifest.complete || manifest.catalog?.file !== "calib_stars.json" || !Array.isArray(manifest.frames)) throw new Error(`Incompatible evidence manifest for ${slug}.`);
    for (const entry of [manifest.catalog, ...manifest.frames]) {
      if (!/^[a-f0-9]{64}$/.test(entry.sha256) || entry.file !== "calib_stars.json" && !/^frames\/\d{4}W\d{2}_[A-Z0-9]+_\d+_\dD[1-6]_0\.2\.bin$/.test(entry.file)) throw new Error(`Invalid evidence reference for ${slug}.`);
      const key = `/cache/${slug}/${entry.file}`;
      if (expected.has(key)) throw new Error(`Duplicate evidence reference: ${key}.`);
      expected.set(key, entry);
    }
  }
  const verified: typeof fetch = async file => {
    const key = String(file), entry = expected.get(key);
    if (!entry && key !== "/cache/epsindib/motion_analysis.json") throw new Error(`Unlisted evidence input: ${key}.`);
    const buffer = await read(key), record = inputs.get(key)!;
    if (entry) {
      if (record.sha256 !== entry.sha256) throw new Error(`Checksum mismatch: ${key}. No verified report was produced.`);
      record.manifestMatch = true;
      if (key.endsWith(".bin")) {
        const f = decodeFrame(buffer);
        if (f.meta.sourceFits !== entry.source || f.meta.nx !== entry.nx || f.meta.ny !== entry.ny || !f.meta.sourceFits.startsWith("https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/")) throw new Error(`Original observation identity mismatch: ${key}.`);
        record.originalFits = f.meta.sourceFits; record.date = f.meta.dateAvg; record.wavelengthMicrons = f.meta.target.wl;
      }
    }
    return new Response(buffer.slice(0));
  };
  const motion = await loadFeaturedMotion(signal, verified);
  const fileFor = (slug: string, obsid: string, detector: number) => `/cache/${slug}/frames/${obsid}D${detector}_0.2.bin`;
  const cases: EvidenceCase[] = [{ id: "motion", title: "Epsilon Indi B · measured motion", outcome: "Measured reference-corrected displacement", value: motion.result.shift, error: motion.result.shiftError, unit: "arcsec", files: motion.frames.map(f => fileFor("epsindib", f.meta.obsid, f.meta.detector)), comparisonUrl: "/timetravel?target=epsindib&guide=1&mode=swipe" }];
  for (const id of ["rwaur", "epsindib", "blend", "gpmon"] as (LabId | "gpmon")[]) {
    const r = await loadLabCase(id, signal, verified), c = r.calibration;
    cases.push({ id, title: id === "blend" ? "Overlapping-star control" : `${id === "rwaur" ? "RW Aur" : id === "epsindib" ? "Epsilon Indi B" : "GP Mon"} · brightness`, outcome: c.ok ? r.interpretation === "supported" ? "Brightness change supported so far" : "No significant brightness change" : `Refused: ${c.reason}`, value: c.ok ? c.changePct : null, error: c.ok ? c.changePctErr : null, unit: "%", files: r.frames.map(f => fileFor(id === "blend" ? "rwaur" : id, f.meta.obsid, f.meta.detector)), comparisonUrl: r.comparisonUrl });
  }
  signal.throwIfAborted();
  return { schema: "cosmos-evidence-audit-v1", checkedAt: new Date().toISOString(), engine: ENGINE_VERSION, release: RELEASE.id, inputs: [...inputs.values()].sort((a, b) => a.file.localeCompare(b.file)), cases, limits: ["Recomputed with the production engine from this site's saved native images and Gaia fields; not independent scientific replication.", "Image and reference-field hashes match this site's unsigned manifests. This checks local consistency, not a NASA digital signature or archive authenticity.", "Manifest and selection-file hashes are recorded, not externally authenticated. The saved motion answer is ignored; the selection file chooses inputs only.", "These selected cases do not establish discovery completeness, a sky-wide false-positive rate, learning gains or superiority over other products."] };
}
