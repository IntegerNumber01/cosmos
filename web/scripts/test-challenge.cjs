// Run with `node --test scripts/test-challenge.cjs`. Uses the installed TypeScript compiler and
// Node's test runner; no extra package or archive connection is required.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const root = path.resolve(__dirname, "..");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : name, ...args);
};
require.extensions[".ts"] = (mod, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, resolveJsonModule: true },
  });
  mod._compile(outputText, filename);
};
const seq = require("../src/lib/engine/sequence.ts");
const { visits, stackVisit, comparableStacks, temporalInputs } = require("../src/lib/engine/combine.ts");
const { spectralChannel, spectralSample, broadBand, spectrumPoint, spectrumCsv } = require("../src/lib/engine/spectral.ts");
const { readViewState, viewQuery, observationKey, inDateRange } = require("../src/lib/engine/viewState.ts");
const { CACHE_SCHEMA, ENGINE_VERSION } = require("../src/lib/engine/releases.ts");
const { getObservations, getFrame, parseCoords } = require("../src/lib/engine/client.ts");
const { pack } = require("../src/lib/engine/cutout.ts");
const { waveAt, sky2pix } = require("../src/lib/engine/wcs.ts");
const { cloudCutout, mirrorUrl } = require("../src/lib/engine/cloudCutout.ts");
const { rice32 } = require("../src/lib/engine/rice.ts");
const { createHash } = require("node:crypto");

function fixture() {
  const file = path.join(root, "public/cache/epsindib/frames/2025W17_4B_0027_3D2_0.1.bin");
  const bytes = fs.readFileSync(file);
  return seq.decodeFrame(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
function artificial(value, time = 60000) {
  const f = fixture();
  f.image.fill(0); f.variance.fill(1); f.valid.fill(1); f.flags.fill(0); f.outlier.fill(0);
  const [x, y] = sky2pix(f.meta.wcs, f.meta.target.ra, f.meta.target.dec);
  for (let j = 0; j < f.meta.ny; j++) for (let i = 0; i < f.meta.nx; i++) if (Math.hypot(i - x, j - y) < 5) f.image[j * f.meta.nx + i] = value;
  f.meta.mjdAvg = time;
  return f;
}

test("official DR1 Rice quality-mask tiles match independent Astropy/CFITSIO checksums", () => {
  const fixture = require('./fixtures/dr1-flags-rice.json');
  for (const row of fixture.rows) {
    const decoded = rice32(Buffer.from(row.compressed, 'base64'), row.pixels);
    const littleEndian = Buffer.alloc(decoded.length * 4);
    decoded.forEach((value, i) => littleEndian.writeInt32LE(value, i * 4));
    assert.equal(createHash('sha256').update(littleEndian).digest('hex'), row.decodedLittleEndianSha256, `Native row ${row.row}`);
  }
  assert.throws(() => rice32(new Uint8Array([0]), 2040), /Truncated/);
  assert.throws(() => rice32(new Uint8Array(8).fill(255), 32), /Invalid Rice split/);
});

test("AWS fallback restricts the source and refuses ignored or misleading byte ranges", async () => {
  const url = fixture().meta.sourceFits;
  assert(mirrorUrl(url).startsWith('https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/dr1/'));
  for (const bad of [url.replace('/dr1/', '/qr2/'), url + '?host=evil.test', url.replace('irsa.ipac.caltech.edu', 'evil.test'), url.replace('/level2/', '/level2/../')])
    assert.throws(() => mirrorUrl(bad), /Not a supported/);
  const original = global.fetch;
  let consumed = false;
  global.fetch = async () => ({ status: 200, headers: new Headers(), body: { cancel: async () => {} }, arrayBuffer: async () => { consumed = true; return new ArrayBuffer(0); } });
  try {
    await assert.rejects(cloudCutout(url, 331.09644, -56.80059, 0.1), /exact FITS byte range/);
    assert.equal(consumed, false, 'Never download a full exposure when Range is ignored');
    await assert.rejects(cloudCutout(url, NaN, 0, 0.1), /Invalid cloud cutout/);
  } finally { global.fetch = original; }
});

test("every prepared menu contains only matching, shipped real cutouts", async () => {
  const original = global.fetch;
  global.fetch = async (url) => new Response(fs.readFileSync(path.join(root, 'public', url)));
  try {
    for (const target of require('../src/lib/ttTargets.ts').TT_TARGETS) {
      const menu = await getObservations(target.ra, target.dec, target.slug);
      assert.equal(menu.source, 'cache'); assert(menu.frames.length > 0); assert.match(menu.sample, /not a complete observation history/);
      for (const observation of menu.frames) {
        const data = await getFrame(observation, target.ra, target.dec, 0.1, target.slug);
        assert.equal(data.source, 'cache'); assert.equal(data.frame.meta.sourceFits, observation.url);
      }
    }
  } finally { global.fetch = original; }
});

test("all-exposure cadence retains compatible same-day frames; daily cadence still selects one", () => {
  const ref = { obsid: "a", detector: 2, url: "a.fits", mjd: 60000.1, date: "", exptime: 100, inside: true, wl: 1.2, bw: 0.03 };
  const obs = [ref, { ...ref, obsid: "b", mjd: 60000.2 }, { ...ref, obsid: "c", mjd: 60001.1 }];
  assert.equal(seq.setContaining(obs, ref, "exposures").frames.length, 3);
  assert.equal(seq.setContaining(obs, ref, "exposures").nDays, 2);
  assert.equal(seq.setContaining(obs, ref, "daily").frames.length, 2);
});

test("shared wavelength windows recreate selection for every prepared challenge target", () => {
  for (const slug of ["epsindib", "wise0855", "barnard", "rdra", "rwaur", "swan"]) {
    const obs = JSON.parse(fs.readFileSync(path.join(root, `public/cache/${slug}/observations.json`))).frames;
    for (const cadence of ["daily", "exposures"]) {
      const sets = seq.matchedSets(obs, 8, cadence);
      const reference = obs.find((o) => o.inside);
      sets.push(seq.setContaining(obs, reference, cadence));
      for (const s of sets) {
        const restored = seq.restoreMatchedSet(obs, `${s.detector}:${s.windowLo}:${s.bandwidth}`, s.anchor || "", cadence);
        assert.deepEqual(restored.frames.map(observationKey), s.frames.map(observationKey), `${slug}/${cadence}`);
      }
    }
  }
});

test("date filters include the whole UTC end date and no later exposures", () => {
  const mjd = (s) => Date.parse(s) / 86400000 + 40587;
  assert(inDateRange(mjd("2025-11-07T23:59:59Z"), "2025-11-07", "2025-11-07"));
  assert(!inDateRange(mjd("2025-11-08T00:00:00Z"), "2025-11-07", "2025-11-07"));
  assert(!inDateRange(mjd("2025-11-06T23:59:59Z"), "2025-11-07", "2025-11-07"));
});

test("a shared URL cannot widen the wavelength tolerance beyond the archive's bandwidth", () => {
  const obs = [{ obsid: "ref", detector: 2, inside: true, wl: 1.2, bw: 0.03, mjd: 60000 }];
  assert.equal(seq.restoreMatchedSet(obs, "2:1.2:0.8", "refD2", "exposures"), null);
  assert.equal(seq.restoreMatchedSet(obs, "2:1.2:0.03", "refD2", "exposures").frames.length, 1);
});

test("investigation links round-trip field, cadence, pair, page, flags, embed, stacks, and Gaia astrometry", () => {
  const state = { ...readViewState(new URLSearchParams()), size: 0.3, start: "2025-01-01", end: "2026-01-01", page: 2,
    window: "2:1.2:0.03", anchor: "oneD2", frame: "twoD2", before: "oneD2", after: "threeD2", mode: "stacks", split: 0.7,
    gaia: false, quality: true, embed: true, stack: { minutes: 120, first: 1, second: 3, difference: true } };
  const target = { ra: 77.9852, dec: -45.05951, pm: [6500, -5700], epochYear: 2025.9, name: "Kapteyn's Star" };
  const q = viewQuery(target, state, true);
  assert.deepEqual(readViewState(q), state);
  assert.equal(q.get("pmra"), "6500"); assert.equal(q.get("epoch"), "2025.9"); assert.equal(q.get("from"), "gaia");
});

test("invalid URL dates, sizes, modes, and page values cannot crash the viewer", () => {
  const s = readViewState(new URLSearchParams("start=2025-99-31&end=2025-02-30&size=Infinity&page=-10&mode=anything&split=NaN"));
  assert.equal(s.start, ""); assert.equal(s.end, ""); assert.equal(s.size, 0.1); assert.equal(s.page, 0); assert.equal(s.mode, "frames");
  assert.equal(parseCoords("08:60:00 -07:14:42"), null);
  assert.equal(parseCoords("24:00:00 +00:00:00"), null);
});

test("visit grouping bounds total duration instead of chaining a sequence into one long stack", () => {
  const groups = visits([artificial(1, 60000), artificial(1, 60000 + 20 / 1440), artificial(1, 60000 + 40 / 1440)], 30);
  assert.deepEqual(groups.map((g) => g.indices), [[0, 1], [2]]);
});

test("visit means combine usable pixels, preserve coverage, and exclude flagged contributors", () => {
  const a = artificial(10), b = artificial(20);
  const g = seq.makeGrid(a.meta.target.ra, a.meta.target.dec, 0.025);
  const centre = Math.floor(g.n / 2) * g.n + Math.floor(g.n / 2);
  const mean = stackVisit([a, b], g);
  assert.equal(mean.count[centre], 2);
  assert(Math.abs(mean.data[centre] - 15) < 0.01);
  b.valid.fill(0);
  const masked = stackVisit([a, b], g);
  assert.equal(masked.count[centre], 1); assert(Math.abs(masked.data[centre] - 10) < 0.01);
  b.meta.detector = 3;
  assert.throws(() => stackVisit([a, b], g), /one detector/);
});

test("stack and stack-difference comparisons mask locally incompatible wavelengths", () => {
  const a = artificial(10), b = artificial(20);
  b.meta.crpixW = [b.meta.crpixW[0] + 400, b.meta.crpixW[1] + 400];
  const g = seq.makeGrid(a.meta.target.ra, a.meta.target.dec, 0.025);
  const combined = stackVisit([a, b], g);
  assert(combined.count.every((n) => n === 0));
  const left = stackVisit([a], g), right = stackVisit([b], g);
  const [x, y] = comparableStacks(left, right);
  assert(x.every(Number.isNaN)); assert(y.every(Number.isNaN));
  const [before, after] = temporalInputs(a, b, left.data, right.data, g);
  assert(before.every(Number.isNaN)); assert(after.every(Number.isNaN));
});

test("spectral sampling never fills dichroic gaps and limits repeated channel weights", () => {
  assert.equal(spectralChannel(3, 2.399), null); assert.equal(spectralChannel(4, 2.445), null);
  const o = { obsid: "a", detector: 5, inside: true, wl: 4.22, mjd: 60000 };
  assert.equal(spectralSample([o, { ...o, obsid: "b", wl: 4.222 }]).length, 1);
});

test("empty or zero-scatter differences never produce infinite detection significance", () => {
  const g = { n: 4, ra: 0, dec: 0, pixDeg: 0.001 };
  for (const image of [new Float32Array(16).fill(NaN), new Float32Array(16).fill(1)]) {
    const result = seq.findChanges(image, image, g);
    assert(Number.isNaN(result.sigma)); assert.equal(result.candidates.length, 0); assert(result.z.every(Number.isNaN));
  }
});

test("broad-band previews give channels equal weight even with repeated exposures", () => {
  const a = artificial(10), b = artificial(30);
  b.meta.crpixW = [b.meta.crpixW[0] + 150, b.meta.crpixW[1] + 150];
  const [x, y] = sky2pix(a.meta.wcs, a.meta.target.ra, a.meta.target.dec);
  assert.notEqual(spectralChannel(2, waveAt(2, x, y, a.meta.crpixW).wl), spectralChannel(2, waveAt(2, x, y, b.meta.crpixW).wl));
  const g = seq.makeGrid(a.meta.target.ra, a.meta.target.dec, 0.025);
  const once = broadBand([a, b], g, 2), repeated = broadBand([a, a, a, b], g, 2);
  for (let i = 0; i < once.data.length; i++) if (Number.isFinite(once.data[i])) assert(Math.abs(once.data[i] - repeated.data[i]) < 1e-5);
});

test("spectrum rejects flagged cores and CSV retains dates, errors, flags, and original FITS", () => {
  const f = fixture(); f.valid.fill(0);
  const p = spectrumPoint(f, f.meta.target);
  assert.equal(p.fluxMjy, null); assert.equal(p.reason, "Unusable source core");
  const csv = spectrumCsv([p]);
  assert(csv.includes("date_utc")); assert(csv.includes(p.date)); assert(csv.includes(p.source)); assert(csv.includes("empirical_error_mJy"));
  f.meta.bunit = "counts";
  assert.match(spectrumPoint(f, f.meta.target).reason, /Unsupported brightness unit/);
});

test("refresh bypasses caches and never substitutes old observations after an archive failure", async () => {
  const original = global.fetch, calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ error: "archive unavailable" }), { status: 503 }); };
  try {
    await assert.rejects(getObservations(1, 2, "barnard", false, 0.2, true), /archive unavailable/);
    assert.equal(calls.length, 1); assert(calls[0].url.includes("refresh=1")); assert(calls[0].url.includes("size=0.2"));
    assert.equal(calls[0].options.cache, "no-store");
  } finally { global.fetch = original; }
});

test("prepared observations with incompatible release or field coverage fall back to the archive", async () => {
  const original = global.fetch, calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return new Response(JSON.stringify(url.startsWith("/cache") ? { target: { ra: 1, dec: 2 }, schema: CACHE_SCHEMA, engine: ENGINE_VERSION, release: "qr2", fieldSize: 0.1, frames: [] } : { frames: [{ obsid: "fresh" }] }));
  };
  try { const r = await getObservations(1, 2, "barnard"); assert.equal(r.source, "live"); assert.equal(calls.length, 2); }
  finally { global.fetch = original; }
});

test("stale cutouts with a different processing URL are rejected and fetched live", async () => {
  const f = fixture(), original = global.fetch, calls = [];
  const o = { obsid: f.meta.obsid, detector: f.meta.detector, url: f.meta.sourceFits + "?new-processing" };
  const freshMeta = { ...f.meta, sourceFits: o.url };
  global.fetch = async (url) => {
    calls.push(url);
    return new Response(pack(url.startsWith("/cache") ? f.meta : freshMeta, f.image, f.flags, f.variance));
  };
  try { const r = await getFrame(o, f.meta.target.ra, f.meta.target.dec, 0.1, "epsindib"); assert.equal(r.source, "live"); assert.equal(calls.length, 2); }
  finally { global.fetch = original; }
});

const siaHeader = "dataproduct_subtype,access_url,obs_id,energy_bandpassname,s_region,s_ra,s_dec,t_min,t_exptime\n";

test("full-field discovery includes square corners in its SIA query", async () => {
  const { findObservations } = require("../src/lib/engine/observations.ts");
  const original = global.fetch;
  let url;
  global.fetch = async (u) => { url = u; return new Response(siaHeader); };
  try {
    await findObservations(1, 2, 30, 0.3);
    const radius = Number(new URL(url).searchParams.get("POS").split(" ").at(-1));
    assert(Math.abs(radius - 0.3 / Math.SQRT2) < 1e-6);
  } finally { global.fetch = original; }
});

test("archive search recovers from a timeout and a gateway failure without changing coordinates or coverage", async () => {
  const { findObservations } = require("../src/lib/engine/observations.ts");
  const original = global.fetch, calls = [];
  const csv = siaHeader + 'science,https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/example.fits,real-frame,SPHEREx-D2,"POLYGON ICRS 0.9 1.9 1.1 1.9 1.1 2.1 0.9 2.1",1,2,60000,100\n';
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    if (calls.length === 2) return new Response("Bad gateway", { status: 502 });
    return new Response(csv);
  };
  try {
    const result = await findObservations(1, 2, 30, 0.3);
    assert.equal(calls.length, 3);
    assert(calls.every((c) => c.url === calls[0].url && c.options.cache === "no-store"));
    assert.equal(new URL(calls[0].url).searchParams.get("POS"), "circle 1.000000 2.000000 0.212132");
    assert.equal(result.length, 1); assert.equal(result[0].obsid, "real-frame"); assert.equal(result[0].inside, true);
  } finally { global.fetch = original; }
});

test("an HTML gateway response is an archive failure, never an empty observation result", async () => {
  const { findObservations } = require("../src/lib/engine/observations.ts");
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return new Response("<html>Proxy error</html>"); };
  try {
    await assert.rejects(findObservations(1, 2), /temporarily unavailable.*invalid image list/);
    assert.equal(calls, 3);
  } finally { global.fetch = original; }
});

// Reference-star calibration: one changing source, one steady source, and refusals instead of guesses.
const { calibrate } = require("../src/lib/engine/photometry.ts");
function prepared(slug, key) {
  const bytes = fs.readFileSync(path.join(root, `public/cache/${slug}/frames/${key}.bin`));
  return seq.decodeFrame(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
const calibStars = (slug) => JSON.parse(fs.readFileSync(path.join(root, `public/cache/${slug}/calib_stars.json`), "utf8"));
const RW_PAIR = ["2025W36_1A_0233_2D1", "2026W10_2B_0591_3D1"];

test("calibrated brightness reproduces the independently validated RW Aur brightening (offline Δm = −0.53 ± 0.064)", () => {
  const frames = RW_PAIR.map((k) => prepared("rwaur", `${k}_0.2`));
  const { ra, dec } = frames[0].meta.target;
  const c = calibStars("rwaur");
  const r = calibrate(frames, frames.map((f) => seq.measure(f, ra, dec)), c.stars, c.query.epoch_mjd);
  assert.equal(r.ok, true, r.reason);
  assert(r.nRefs >= 3);
  assert(Math.abs(r.last.dmag - -0.53) < 0.1, `Δm ${r.last.dmag}`);
  assert(r.significance >= 5);
  assert(r.last.dmagErr >= r.last.dmagErrNominal && r.last.refScatterMag > 0, "uncertainty includes reference-star scatter");
});

test("a steady brown dwarf stays steady after calibration (Epsilon Indi B over one year)", () => {
  const frames = ["2025W17_4B_0027_3D2", "2026W17_2A_0308_3D2"].map((k) => prepared("epsindib", `${k}_0.2`));
  const T = { ra: 331.09644, dec: -56.80059, pm: [3982.0, -2466.8] };
  const posAt = (mjd) => { const dt = (mjd - (51544.5 + 25.9 * 365.25)) / 365.25; return [T.ra + (T.pm[0] * dt) / 3.6e6 / Math.cos((T.dec * Math.PI) / 180), T.dec + (T.pm[1] * dt) / 3.6e6]; };
  const c = calibStars("epsindib");
  const r = calibrate(frames, frames.map((f) => seq.measure(f, ...posAt(f.meta.mjdAvg))), c.stars, c.query.epoch_mjd);
  assert.equal(r.ok, true, r.reason);
  assert(r.significance < 3, `steady source flagged at ${r.significance}σ`);
});

test("calibration refuses instead of guessing: too few references, a blended neighbour, or no source", () => {
  const c = calibStars("rwaur");
  const small = RW_PAIR.map((k) => prepared("rwaur", `${k}_0.1`));
  const { ra, dec } = small[0].meta.target;
  const few = calibrate(small, small.map((f) => seq.measure(f, ra, dec)), c.stars, c.query.epoch_mjd);
  assert.equal(few.ok, false);
  assert.match(few.reason, /reference star/);
  // artifact control: a steady G = 14.7 field star 11″ from a G = 12.8 star read −54% at 18σ before this check
  const wide = RW_PAIR.map((k) => prepared("rwaur", `${k}_0.2`));
  const s = c.stars.find((x) => x.source_id === "156430890833907584");
  const at = (mjd) => { const dt = (mjd - c.query.epoch_mjd) / 365.25; return [s.ra_epoch + (s.pmra * dt) / 3.6e6 / Math.cos((s.dec_epoch * Math.PI) / 180), s.dec_epoch + (s.pmdec * dt) / 3.6e6]; };
  const blended = calibrate(wide, wide.map((f) => seq.measure(f, ...at(f.meta.mjdAvg))), c.stars, c.query.epoch_mjd);
  assert.equal(blended.ok, false);
  assert.match(blended.reason, /neighbouring star/);
  const empty = [artificial(0, 60000), artificial(0, 60100)];
  const none = calibrate(empty, empty.map((f) => seq.measure(f, f.meta.target.ra, f.meta.target.dec)), c.stars, c.query.epoch_mjd);
  assert.equal(none.ok, false);
});
