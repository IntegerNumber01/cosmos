// Prepare every saved quick-pick exposure for motion/photometric calibration.
// First run pipeline/prepare_motion_catalogues.py from the repo root (uses saved Gaia ECSV).
// Then (from web): node scripts/prepare-motion-cache.cjs [slug ...]
// Reads known DR1 objects directly from anonymous AWS; no SIA2 or IBE dependency.
require('./register-ts.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { fetchCloudCutout, unpack } = require('../src/lib/engine/cutout.ts');
const { lookupGaia } = require('../src/lib/engine/gaia.ts');
const { TT_TARGETS } = require('../src/lib/ttTargets.ts');
const { ENGINE_VERSION, RELEASE } = require('../src/lib/engine/releases.ts');
const root = path.resolve(__dirname, '../public/cache');
const only = process.argv.slice(2);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function valid(bytes, observation, target) {
  const { meta } = unpack(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  if (meta.sourceFits !== observation.url || meta.obsid !== observation.obsid || meta.detector !== observation.detector ||
      meta.engine !== ENGINE_VERSION || Math.abs(meta.target.ra - target.ra) > 1e-5 || Math.abs(meta.target.dec - target.dec) > 1e-5)
    throw new Error('Prepared calibration provenance mismatch');
  return meta;
}
async function main() {
  let failed = 0;
  for (const t of TT_TARGETS.filter(t => !only.length || only.includes(t.slug))) {
    const dir = path.join(root, t.slug);
    const prepared = JSON.parse(fs.readFileSync(path.join(dir, 'prepared.json'), 'utf8'));
    // No saved identity lookups is an empty local inventory, never an empty scientific answer.
    const knownIndex = path.join(dir, 'known_index.json');
    if (!fs.existsSync(knownIndex)) fs.writeFileSync(knownIndex, '[]\n');
    const catalogFile = path.join(dir, 'calib_stars.json');
    if (!fs.existsSync(catalogFile)) {
      const cols = 'source_id, ra, dec, pmra, pmdec, parallax, parallax_error, phot_g_mean_mag, phot_variable_flag';
      const query = `SELECT ${cols} FROM gaiadr3.gaia_source WHERE phot_g_mean_mag < 18 AND 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${t.ra},${t.dec},0.16))`;
      const field = await lookupGaia(query, t.ra, t.dec, 0.16, AbortSignal.timeout(55000));
      const optional = s => s === '' ? null : Number(s);
      const stars = field.records.map(s => ({ source_id: s.source_id, g: Number(s.phot_g_mean_mag),
        ra_epoch: Number(s.ra), dec_epoch: Number(s.dec), pmra: Number(s.pmra) || 0, pmdec: Number(s.pmdec) || 0,
        parallax: optional(s.parallax), parallax_error: optional(s.parallax_error), variable: s.phot_variable_flag === 'VARIABLE' }));
      fs.writeFileSync(catalogFile, JSON.stringify({ source: field.service.replace('positions propagated to the epoch', 'original positions at J2016.0'),
        queried: new Date().toISOString(), query: { ra: t.ra, dec: t.dec, radius_deg: 0.16, gmax: 18, epoch_mjd: 57388.5 }, stars }));
      console.log(t.slug, 'saved Gaia field:', stars.length);
    }
    let i = 0;
    const entries = [];
    const worker = async () => {
      while (i < prepared.frames.length) {
        const o = prepared.frames[i++], file = `frames/${o.obsid}D${o.detector}_0.2.bin`, dest = path.join(dir, file);
        try {
          if (!fs.existsSync(dest)) {
            let error;
            for (let attempt = 0; attempt < 3; attempt++) {
              try { const bytes = Buffer.from(await fetchCloudCutout(o.url, t.ra, t.dec, 0.2)); valid(bytes, o, t); fs.writeFileSync(dest, bytes); error = null; break; }
              catch (e) { error = e; }
            }
            if (error) throw error;
            console.log(t.slug, file, 'saved');
          }
          const bytes = fs.readFileSync(dest), meta = valid(bytes, o, t);
          entries.push({ file, source: o.url, sha256: sha256(bytes), nx: meta.nx, ny: meta.ny, delivery: meta.delivery ?? 'irsa' });
        } catch (e) { failed++; console.error(t.slug, file, e.message); }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const catalog = fs.readFileSync(catalogFile);
    fs.writeFileSync(path.join(dir, 'calibration_manifest.json'), JSON.stringify({ engine: ENGINE_VERSION, release: RELEASE.id,
      target: prepared.target, fieldSize: 0.2, requested: prepared.frames.length, complete: entries.length === prepared.frames.length,
      catalog: { file: 'calib_stars.json', sha256: sha256(catalog) }, frames: entries.sort((a,b) => a.file.localeCompare(b.file)) }, null, 2) + '\n');
    console.log(t.slug, entries.length, '/', prepared.frames.length, 'ready');
  }
  if (failed) throw new Error(`${failed} calibration images unavailable`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
