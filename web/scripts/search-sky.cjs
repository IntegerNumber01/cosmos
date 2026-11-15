// Run COSMOS's actual public change-finding engine over prepared real observations.
// No expected object positions seed the candidate search. This produces leads, never discoveries.
require("./register-ts.cjs");
const fs = require("node:fs");
const path = require("node:path");
const { decodeFrame, makeGrid, reproject, skyLevel, findChanges, measure } = require("../src/lib/engine/sequence.ts");
const { temporalInputs } = require("../src/lib/engine/combine.ts");
const root = path.resolve(__dirname, "../..");
const names = process.argv.slice(2).length ? process.argv.slice(2) : ["barnard", "epsindib", "wise0855", "rwaur", "rdra", "swan"];
const out = path.join(root, "data/work/discovery");
fs.mkdirSync(out, { recursive: true });
for (const name of names) {
  const dir = path.join(root, "web/public/cache", name, "frames");
  const entries = fs.readdirSync(dir).filter((n) => n.endsWith("_0.1.bin")).map((n) => {
    const b = fs.readFileSync(path.join(dir, n));
    return { file: path.relative(root, path.join(dir, n)), frame: decodeFrame(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) };
  }).sort((a, b) => a.frame.meta.mjdAvg - b.frame.meta.mjdAvg);
  if (!entries.length) continue;
  const t = entries[0].frame.meta.target, g = makeGrid(t.ra, t.dec, 0.1);
  const grids = entries.map((e) => reproject(e.frame, g, skyLevel(e.frame).level));
  const candidates = [];
  let pairs = 0;
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const a = entries[i].frame, b = entries[j].frame;
    if (a.meta.detector !== b.meta.detector || b.meta.mjdAvg - a.meta.mjdAvg < 40) continue;
    const cm = findChanges(...temporalInputs(a, b, grids[i], grids[j], g), g, 5);
    if (cm.validFrac < 0.05 || !Number.isFinite(cm.sigma)) continue;
    pairs++;
    for (const c of cm.candidates) {
      const ma = measure(a, c.ra, c.dec), mb = measure(b, c.ra, c.dec);
      candidates.push({ ...c, field: name, file_a: entries[i].file, file_b: entries[j].file, detector: a.meta.detector,
        date_a: a.meta.dateAvg, date_b: b.meta.dateAvg, wavelength_a: ma.wl, wavelength_b: mb.wl,
        valid_fraction: cm.validFrac, noise: cm.sigma, measurement_a: ma, measurement_b: mb,
        url: `/timetravel?target=${name}&mode=changes&anchor=${a.meta.obsid}D${a.meta.detector}&before=${a.meta.obsid}D${a.meta.detector}&after=${b.meta.obsid}D${b.meta.detector}` });
    }
  }
  candidates.sort((a, b) => b.peakZ - a.peakZ);
  fs.writeFileSync(path.join(out, `${name}_cosmos.json`), JSON.stringify({ field: name, engine: "COSMOS public findChanges + temporalInputs + native measure", generated: new Date().toISOString(), frames: entries.length, usable_pairs: pairs, candidates }, null, 2));
  console.log(`${name}: ${entries.length} frames, ${pairs} usable pairs, ${candidates.length} leads`);
  for (const c of candidates.filter((c) => c.kind !== "residual").slice(0, 10)) console.log(`  ${c.ra.toFixed(6)} ${c.dec.toFixed(6)} ${c.kind} D${c.detector} ${c.wavelength_a.toFixed(3)}µm peak ${c.peakZ.toFixed(1)}σ ${c.date_a.slice(0,10)} → ${c.date_b.slice(0,10)}`);
}
