// Optional integration check: anonymous live reads from NASA's AWS mirror, no IRSA search needed.
// npm test remains offline. Run `node scripts/check-cloud.cjs` when validating mirror changes.
require('./register-ts.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { unpack, fetchCutout } = require('../src/lib/engine/cutout.ts');
const { cloudCutout } = require('../src/lib/engine/cloudCutout.ts');
const { wcsFromHeader, sky2pix, waveAt } = require('../src/lib/engine/wcs.ts');
const { TT_BY_SLUG } = require('../src/lib/ttTargets.ts');
async function main() {
  for (const slug of ['epsindib', 'swan', 'wise0855']) {
    const dir = path.join(__dirname, '../public/cache', slug, 'frames');
    const preferred = TT_BY_SLUG[slug].prefer;
    const file = preferred ? `${preferred.obsid}D${preferred.detector}_0.1.bin` : fs.readdirSync(dir).find((name) => name.endsWith('_0.1.bin'));
    const bytes = fs.readFileSync(path.join(dir, file));
    const saved = unpack(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const m = saved.meta;
    const crop = await cloudCutout(m.sourceFits, m.target.ra, m.target.dec, 0.1);
    const wcs = wcsFromHeader(crop.header);
    const xy = sky2pix(wcs, m.target.ra, m.target.dec);
    // Compare overlapping native pixels even if archive and mirror round field edges differently.
    const dx = Math.round(m.wcs.crpix[0] - wcs.crpix[0]);
    const dy = Math.round(m.wcs.crpix[1] - wcs.crpix[1]);
    let checked = 0;
    for (let y = 0; y < crop.ny; y++) for (let x = 0; x < crop.nx; x++) {
      const sx = x + dx, sy = y + dy;
      if (sx < 0 || sx >= m.nx || sy < 0 || sy >= m.ny) continue;
      const a = y * crop.nx + x, b = sy * m.nx + sx;
      assert(Object.is(crop.data[a], saved.image[b]), `${slug}: IMAGE ${x},${y}`);
      assert.equal(crop.flags[a], saved.flags[b], `${slug}: FLAGS ${x},${y}`);
      assert(Object.is(crop.variance[a], saved.variance[b]), `${slug}: VARIANCE ${x},${y}`);
      checked++;
    }
    assert(checked > 500, 'Too little overlap to validate');
    const crpixW = [Number(crop.header.CRPIX1W), Number(crop.header.CRPIX2W)];
    const wave = waveAt(m.detector, ...xy, crpixW);
    assert(Math.abs(wave.wl - m.target.wl) < 1e-10, `${slug}: wavelength`);
    assert(Math.abs(xy[0] + dx - m.target.x) < 1e-8 && Math.abs(xy[1] + dy - m.target.y) < 1e-8, `${slug}: WCS`);
    console.log(`PASS ${slug} D${m.detector}: ${checked} identical native IMAGE/FLAGS/VARIANCE pixels, WCS and wavelength`);
    if (slug === 'epsindib') {
      const original = global.fetch;
      global.fetch = (url, options) => String(url).startsWith('https://irsa.ipac.caltech.edu/') ? Promise.resolve(new Response('Injected IBE outage', { status: 503 })) : original(url, options);
      try {
        const fallback = unpack(await fetchCutout(m.sourceFits, m.target.ra, m.target.dec, 0.1));
        assert.equal(fallback.meta.delivery, 'aws'); assert.equal(fallback.meta.sourceFits, m.sourceFits);
        assert.deepEqual(fallback.image, saved.image); assert.deepEqual(fallback.flags, saved.flags); assert.deepEqual(fallback.variance, saved.variance);
        console.log('PASS injected IRSA failure automatically returns the verified AWS cutout and provenance');
      } finally { global.fetch = original; }
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
