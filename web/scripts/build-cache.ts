// Builds the prepared cache for featured Time Travel targets by running the SAME engine code the live
// /api routes use (SIA2 search, IBE cutout fetch + FITS parse + pack). Output: public/cache/<slug>/...
// Usage: npx tsx scripts/build-cache.ts [slug ...]   (needs the dev server on :3001 for catalogue JSON)
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { findObservations } from "../src/lib/engine/observations";
import { fetchCutout } from "../src/lib/engine/cutout";
import { matchedSets, MatchedSet, Observation } from "../src/lib/engine/sequence";
import { TT_TARGETS } from "../src/lib/ttTargets";

const SIZE = 0.1;
const OUT = new URL("../public/cache/", import.meta.url);

function pick(obs: Observation[], ref: Observation): MatchedSet {
  const members = obs.filter((o) => o.inside && o.detector === ref.detector && Math.abs(o.wl - ref.wl) <= 0.5 * ref.bw);
  const byDay = new Map<number, Observation>();
  for (const m of members) {
    const day = Math.floor(m.mjd);
    const cur = byDay.get(day);
    if (!cur || Math.abs(m.wl - ref.wl) < Math.abs(cur.wl - ref.wl)) byDay.set(day, m);
  }
  const frames = [...byDay.values()].sort((a, b) => a.mjd - b.mjd);
  return { key: "pick", detector: ref.detector, lambdaRef: ref.wl, bandwidth: ref.bw, frames, nDays: frames.length, spanDays: 0 };
}

async function main() {
  const only = process.argv.slice(2);
  for (const t of TT_TARGETS.filter((x) => !only.length || only.includes(x.slug))) {
    const dir = new URL(`${t.slug}/frames/`, OUT);
    mkdirSync(dir, { recursive: true });
    const obs = await findObservations(t.ra, t.dec);
    writeFileSync(
      new URL(`${t.slug}/observations.json`, OUT),
      JSON.stringify({
        target: { ra: t.ra, dec: t.dec },
        source: "IRSA SIA2, collection spherex_dr1",
        queried: new Date().toISOString(),
        note: "Prepared copy of the live /api/observations response.",
        frames: obs,
      }),
    );
    const sets = matchedSets(obs, 3);
    const pref = t.prefer && obs.find((o) => o.obsid === t.prefer!.obsid && o.detector === t.prefer!.detector);
    if (pref) sets.unshift(pick(obs, pref));
    const todo = new Map<string, Observation>();
    for (const s of sets.slice(0, 3)) for (const f of s.frames.slice(0, 12)) todo.set(`${f.obsid}D${f.detector}`, f);
    console.log(`${t.slug}: ${obs.length} frames, ${sets.length} sets, caching ${todo.size} cutouts`);
    const list = [...todo.entries()];
    let i = 0;
    const worker = async () => {
      while (i < list.length) {
        const [k, f] = list[i++];
        const dest = new URL(`${k}_${SIZE}.bin`, dir);
        if (existsSync(dest)) continue;
        try {
          const buf = await fetchCutout(f.url, t.ra, t.dec, SIZE);
          writeFileSync(dest, Buffer.from(buf));
        } catch (e) {
          console.log("  failed", k, String(e));
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    // Gaia overlay response (same request the page makes) via the local API route
    for (const [services, r] of [["gaia", 0.05], ["gaia,simbad", 0.0028]] as const) {
      const firstMjd = sets[0]?.frames[0]?.mjd ?? 61000;
      try {
        const res = await fetch(`http://localhost:3001/api/known?ra=${t.ra.toFixed(6)}&dec=${t.dec.toFixed(6)}&r=${r}&mjd=${firstMjd}&services=${services}`);
        if (res.ok) writeFileSync(new URL(`${t.slug}/known_${t.ra.toFixed(4)}_${t.dec.toFixed(4)}_${services}.json`, OUT), await res.text());
      } catch {}
    }
  }
}
main();
