// Analyse the default and offered wavelength/date selections using only shipped real data.
// node scripts/preflight-motion.cjs [--write] (writes reviewable per-target analysis JSON).
require('./register-ts.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { decodeFrame, matchedSets, setContaining, exactWindow } = require('../src/lib/engine/sequence.ts');
const { analyseMotion } = require('../src/lib/engine/motion.ts');
const { TT_TARGETS } = require('../src/lib/ttTargets.ts');
const { ENGINE_VERSION, RELEASE } = require('../src/lib/engine/releases.ts');
const root = path.resolve(__dirname, '../public/cache');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function analyseTarget(t) {
  const dir = path.join(root, t.slug), read = file => fs.readFileSync(path.join(dir, file));
  const prepared = JSON.parse(read('prepared.json')), catalog = JSON.parse(read('calib_stars.json'));
  const files = new Map(prepared.frames.map(o => {
    const file = `frames/${o.obsid}D${o.detector}_0.2.bin`, bytes = read(file);
    return [`${o.obsid}D${o.detector}`, { file, sha256: hash(bytes), frame: decodeFrame(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) }];
  }));
  const target = { ra: t.ra, dec: t.dec, ...(t.pm ? { pm: t.pm, epochYear: 2025.9 } : {}),
    ...(t.parallaxMas !== undefined ? { parallaxMas: t.parallaxMas, parallaxSource: 'saved validation catalog' } : {}) };
  const selections = [], seen = new Set();
  for (const cadence of ['exposures', 'daily']) {
    const sets = matchedSets(prepared.frames, 8, cadence);
    const preferred = t.prefer && prepared.frames.find(o => o.obsid === t.prefer.obsid && o.detector === t.prefer.detector);
    const defaultSet = preferred ? setContaining(prepared.frames, preferred, cadence) : sets[0] ?? setContaining(prepared.frames, prepared.frames[0], cadence);
    for (const [index, set] of [defaultSet, ...sets].entries()) {
      for (let page = 0; page * 12 < set.frames.length; page++) {
        const inputs = set.frames.slice(page * 12, (page + 1) * 12).map(o => files.get(`${o.obsid}D${o.detector}`));
        const { keep } = exactWindow(inputs, o => o.frame.meta.target.wl, set.bandwidth);
        const key = keep.map(o => o.file).join('|');
        // Retain the default marker even when both cadences have identical selections.
        if (seen.has(key) && index !== 0) continue;
        seen.add(key);
        selections.push({ cadence, default: index === 0 && page === 0, page, detector: set.detector,
          sources: keep.map(({ file, sha256 }) => ({ file, sha256 })),
          result: analyseMotion(keep.map(o => o.frame), target, catalog.stars, catalog.query.epoch_mjd) });
      }
    }
  }
  return { engine: ENGINE_VERSION, release: RELEASE.id, target,
    note: 'Preflight of saved selections, recomputed from native pixels. The app recomputes for the actual selected position and frames. A refused measurement is not a scientific non-detection. The SWAN quick pick is a fixed sky field, not a comet ephemeris fit.',
    catalog: { file: 'calib_stars.json', sha256: hash(read('calib_stars.json')), source: catalog.source }, selections };
}
if (require.main === module) {
  for (const t of TT_TARGETS) {
    const report = analyseTarget(t), def = report.selections.find(s => s.default && s.cadence === 'exposures');
    const r = def.result;
    console.log(`${t.slug}: ${r.ok ? `${r.shift.toFixed(2)} +/- ${r.shiftError.toFixed(2)} arcsec, ${r.epochs.length} visits` : r.reason} (${report.selections.length} selections checked)`);
    if (!r.ok) console.log('  exclusions:', [...new Set(r.rejected.map(x => x.reason))].join('; '));
    if (process.argv.includes('--write')) fs.writeFileSync(path.join(root, t.slug, 'motion_analysis.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
module.exports = { analyseTarget };
