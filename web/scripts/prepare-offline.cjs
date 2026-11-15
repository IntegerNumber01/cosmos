// Generate a small, honest observation menu from validated cutouts actually shipped with the app.
// Keep the original full archive responses unchanged for provenance and later live discovery.
require('./register-ts.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { unpack } = require('../src/lib/engine/cutout.ts');
const { TT_TARGETS } = require('../src/lib/ttTargets.ts');
const { CACHE_SCHEMA, ENGINE_VERSION, RELEASE } = require('../src/lib/engine/releases.ts');
const root = path.resolve(__dirname, '../public/cache');
for (const target of TT_TARGETS) {
  const dir = path.join(root, target.slug);
  const inventory = JSON.parse(fs.readFileSync(path.join(dir, 'observations.json'), 'utf8'));
  const frames = inventory.frames.filter((observation) => {
    const file = path.join(dir, 'frames', `${observation.obsid}D${observation.detector}_0.1.bin`);
    if (!fs.existsSync(file)) return false;
    const bytes = fs.readFileSync(file);
    const { meta, image, flags, variance } = unpack(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    if (meta.sourceFits !== observation.url || meta.obsid !== observation.obsid || meta.detector !== observation.detector ||
      !Number.isFinite(meta.target.ra) || !Number.isFinite(meta.target.dec) ||
      Math.abs(meta.target.ra - target.ra) > 1e-5 || Math.abs(meta.target.dec - target.dec) > 1e-5 ||
      (meta.engine && meta.engine !== ENGINE_VERSION) || !meta.sourceFits.includes(`/spherex/${RELEASE.id}/`) ||
      image.length !== meta.nx * meta.ny || flags.length !== image.length || variance.length !== image.length)
      throw new Error(`Prepared cutout provenance mismatch: ${file}`);
    return true;
  });
  if (!frames.length) throw new Error(`No prepared cutouts for ${target.slug}`);
  const prepared = {
    ...inventory,
    // Preserve whether the archived search was a legacy centre-only search.
    schema: CACHE_SCHEMA, engine: ENGINE_VERSION, release: RELEASE.id, fieldSize: 0.1,
    legacy: inventory.schema === undefined,
    target: { ra: target.ra, dec: target.dec },
    prepared: true, inventoryCount: inventory.frames.length,
    sample: `Saved ${frames.length} real photos for this field. This selected subset works without the archive; it is not a complete observation history. Check the archive for more dates and colours.`,
    frames,
  };
  fs.writeFileSync(path.join(dir, 'prepared.json'), JSON.stringify(prepared, null, 2) + '\n');
  console.log(`${target.slug}: ${frames.length} saved exposures / ${inventory.frames.length} inventory records`);
}
