// Prepared reference-star calibration data for featured targets (offline-capable demo + regression tests).
//  1. calib_stars.json: the Gaia DR3 field (radius 0.16 deg, G <= 18, J2016 positions, variability flag) that the
//     independent validation queried from ESA TAP: data/raw/validation/<slug>/gaia_field.ecsv.
//  2. 12-arcmin (0.2 deg) cutouts of already-prepared exposures, fetched through the running app's own /api/cutout,
//     so calibration can find enough reference stars even when the viewer shows a 6-arcmin field.
// Usage: node scripts/build-calib-cache.cjs http://localhost:3011 rwaur epsindib
const fs = require("node:fs");
const path = require("node:path");
const [base, ...slugs] = process.argv.slice(2);
const root = path.resolve(__dirname, "..");
const SIZE = 0.2;
(async () => {
  for (const slug of slugs) {
    const dir = path.join(root, "public/cache", slug);
    const ecsv = path.join(root, "..", "data/raw/validation", slug, "gaia_field.ecsv");
    if (fs.existsSync(ecsv)) {
      const lines = fs.readFileSync(ecsv, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
      const head = lines[0].split(" ");
      const stars = lines.slice(1).map((l) => {
        const v = l.match(/"[^"]*"+|\S+/g);
        const o = Object.fromEntries(head.map((h, i) => [h, v[i]]));
        return { source_id: o.source_id, g: +o.phot_g_mean_mag, pmra: +o.pmra || 0, pmdec: +o.pmdec || 0, ra_epoch: +o.ra, dec_epoch: +o.dec, variable: /(^|")VARIABLE/.test(o.phot_variable_flag) };
      });
      const t = JSON.parse(fs.readFileSync(path.join(dir, "prepared.json"), "utf8")).target;
      fs.writeFileSync(path.join(dir, "calib_stars.json"), JSON.stringify({
        source: "ESA Gaia DR3 (gaiadr3.gaia_source via ESA TAP), queried for the independent validation; positions at J2016.0",
        query: { ra: t.ra, dec: t.dec, radius_deg: 0.16, gmax: 18, epoch_mjd: 57388.5 },
        stars,
      }));
      console.log(slug, "calib stars", stars.length);
    }
    const prepared = JSON.parse(fs.readFileSync(path.join(dir, "prepared.json"), "utf8"));
    const have = fs.readdirSync(path.join(dir, "frames")).filter((f) => f.endsWith("_0.1.bin")).map((f) => f.replace(/_0\.1\.bin$/, ""));
    for (const key of have) {
      const dest = path.join(dir, "frames", `${key}_${SIZE}.bin`);
      if (fs.existsSync(dest)) continue;
      const o = prepared.frames.find((f) => `${f.obsid}D${f.detector}` === key);
      if (!o) { console.log(slug, key, "not in prepared list"); continue; }
      const url = `${base}/api/cutout?url=${encodeURIComponent(o.url)}&ra=${prepared.target.ra}&dec=${prepared.target.dec}&size=${SIZE}`;
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(150000) });
        if (!r.ok) { console.log(slug, key, "HTTP", r.status); continue; }
        fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
        console.log(slug, key, "ok");
      } catch (e) { console.log(slug, key, "failed", e.message); }
    }
  }
})();
