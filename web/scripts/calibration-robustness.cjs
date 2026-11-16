// Robustness of the public reference-star calibration (web/src/lib/engine/photometry.ts) on shipped real data.
//  1. Agreement with independent offline results (RW Aur, GP Mon D2/D5) and a steady control (Epsilon Indi B).
//  2. Reference-selection sensitivity: leave-one-reference-out, and a grid over every selection threshold.
//  3. False alarms: every Gaia field star (G 11-15) in the same images treated as the target.
// GP Mon was never used while developing the method. Usage: node scripts/calibration-robustness.cjs [out.json]
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : name, ...args);
};
require.extensions[".ts"] = (mod, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, resolveJsonModule: true } });
  mod._compile(outputText, filename);
};
const seq = require("../src/lib/engine/sequence.ts");
const { calibrate, CAL } = require("../src/lib/engine/photometry.ts");

const load = (slug, key) => {
  const b = fs.readFileSync(path.join(root, `public/cache/${slug}/frames/${key}_0.2.bin`));
  return seq.decodeFrame(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const starsOf = (slug) => JSON.parse(fs.readFileSync(path.join(root, `public/cache/${slug}/calib_stars.json`), "utf8"));
const propagate = (s, mjd0, mjd) => {
  const dt = (mjd - mjd0) / 365.25;
  return [s.ra_epoch + (s.pmra * dt) / 3.6e6 / Math.cos((s.dec_epoch * Math.PI) / 180), s.dec_epoch + (s.pmdec * dt) / 3.6e6];
};
const epsPos = (mjd) => {
  const dt = (mjd - (51544.5 + 25.9 * 365.25)) / 365.25;
  return [331.09644 + (3982.0 * dt) / 3.6e6 / Math.cos((-56.80059 * Math.PI) / 180), -56.80059 + (-2466.8 * dt) / 3.6e6];
};
const dmOf = (ratio, err) => ({ dmag: -2.5 * Math.log10(ratio), err: 1.0857 * (err / ratio) });
const CASES = [
  { name: "RW Aur D1 0.744 µm", slug: "rwaur", keys: ["2025W36_1A_0233_2D1", "2026W10_2B_0591_3D1"], expect: { dmag: -0.53, err: 0.064, source: "VALIDATION.md (aperture, 4 references)" } },
  { name: "Epsilon Indi B D2 1.108 µm", slug: "epsindib", keys: ["2025W17_4B_0027_3D2", "2026W17_2A_0308_3D2"], pos: epsPos, expect: { dmag: 0, err: null, source: "steady brown dwarf (control)" } },
  { name: "GP Mon D2 1.193 µm", slug: "gpmon", keys: ["2025W40_1A_0132_1D2", "2025W46_1A_0377_1D2"], expect: { ...dmOf(2.299, 0.161), source: "DISCOVERY_SEARCH.md (differential EPSF, 24 references)" } },
  { name: "GP Mon D5 3.936 µm", slug: "gpmon", keys: ["2025W40_1A_0132_1D5", "2025W46_1A_0377_1D5"], expect: { ...dmOf(1.111, 0.069), source: "DISCOVERY_SEARCH.md (differential EPSF, 35 references)" } },
];
const GRID = { minSnr: [5, 10, 15, 20, 30], maxG: [15.5, 16.5, 17.5], isoDmag: [1, 2, 3], apR: [1.5, 2, 2.5], clip: [3, 5, 1e9] };
const r3 = (x) => Math.round(x * 1000) / 1000;

const out = [];
for (const c of CASES) {
  const frames = c.keys.map((k) => load(c.slug, k));
  const field = starsOf(c.slug);
  const pos = c.pos ?? (() => [frames[0].meta.target.ra, frames[0].meta.target.dec]);
  const run = (cfg) => calibrate(frames, frames.map((f) => seq.measure(f, ...pos(f.meta.mjdAvg), cfg.apR)), field.stars, field.query.epoch_mjd, cfg);
  const base = run(CAL);
  const row = { case: c.name, expected: c.expect };
  if (!base.ok) { row.default = { ok: false, reason: base.reason }; out.push(row); console.log(c.name, "FAIL", base.reason); continue; }
  row.default = { nRefs: base.nRefs, dmag: r3(base.last.dmag), err: r3(base.last.dmagErr), sigma: r3(base.significance), changePct: r3(base.changePct), changePctErr: r3(base.changePctErr) };
  row.vsExpected = c.expect.err === null
    ? { sigmaFromZero: r3(base.significance) }
    : { difference: r3(base.last.dmag - c.expect.dmag), combinedSigma: r3(Math.abs(base.last.dmag - c.expect.dmag) / Math.hypot(base.last.dmagErr, c.expect.err)) };
  row.leaveOneOut = { maxShift: r3(base.looMaxShift), dmags: base.leaveOneOut.map((x) => r3(x.dmag)) };
  // one-at-a-time grid around the defaults
  const variants = [];
  for (const [k, vals] of Object.entries(GRID))
    for (const v of vals) {
      if (v === CAL[k]) continue;
      const r = run({ ...CAL, [k]: v });
      variants.push({ param: k, value: v, ok: r.ok, ...(r.ok ? { nRefs: r.nRefs, dmag: r3(r.last.dmag), err: r3(r.last.dmagErr) } : { reason: r.reason }) });
    }
  const okv = variants.filter((v) => v.ok);
  row.grid = { variants: variants.length, calibrated: okv.length, dmagRange: okv.length ? [Math.min(...okv.map((v) => v.dmag)), Math.max(...okv.map((v) => v.dmag))] : null, maxShiftInDefaultErrors: okv.length ? r3(Math.max(...okv.map((v) => Math.abs(v.dmag - base.last.dmag))) / base.last.dmagErr) : null, details: variants };
  // false alarms: steady-looking field stars measured exactly like a target
  const sig = [];
  for (const s of field.stars.filter((s) => s.g >= 11 && s.g <= 15 && !s.variable)) {
    const ms = frames.map((f) => seq.measure(f, ...propagate(s, field.query.epoch_mjd, f.meta.mjdAvg)));
    if (ms.some((m) => m.x < CAL.edgePx || m.y < CAL.edgePx || m.x > frames[0].meta.nx - 1 - CAL.edgePx || m.y > frames[0].meta.ny - 1 - CAL.edgePx)) continue;
    const t = frames.map((f) => seq.measure(f, ...pos(f.meta.mjdAvg)));
    if (Math.hypot(ms[0].x - t[0].x, ms[0].y - t[0].y) < 10) continue;
    const r = calibrate(frames, ms, field.stars, field.query.epoch_mjd);
    if (r.ok) sig.push({ id: s.source_id, g: s.g, dmag: r3(r.last.dmag), err: r3(r.last.dmagErr), sigma: r3(r.significance) });
  }
  row.fieldStarControls = { calibrated: sig.length, over3sigma: sig.filter((x) => x.sigma >= 3).length, over5sigma: sig.filter((x) => x.sigma >= 5).length, stars: sig };
  out.push(row);
  console.log(`${c.name}: Δm ${row.default.dmag} ± ${row.default.err} (${row.default.nRefs} refs) vs expected ${r3(c.expect.dmag)}${c.expect.err ? ` ± ${r3(c.expect.err)}` : ""} | LOO max shift ${row.leaveOneOut.maxShift} | grid ${okv.length}/${variants.length} calibrated, Δm ${row.grid.dmagRange?.join("…")} | field stars ${sig.length}, ≥3σ ${row.fieldStarControls.over3sigma}, ≥5σ ${row.fieldStarControls.over5sigma}`);
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ generated: new Date().toISOString(), defaults: CAL, cases: out }, null, 2));
