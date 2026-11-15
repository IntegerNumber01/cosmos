// Builds the prepared cache for featured Time Travel targets by running the SAME engine code the live
// /api routes use (SIA2 search, IBE cutout fetch + FITS parse + pack). Output: public/cache/<slug>/...
// Usage: npx tsx scripts/build-cache.ts [slug ...]   (needs the dev server on :3001 for catalogue JSON)
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { findObservations } from "../src/lib/engine/observations";
import { fetchCutout, unpack } from "../src/lib/engine/cutout";
import { matchedSets, Observation, setContaining } from "../src/lib/engine/sequence";
import { TT_TARGETS } from "../src/lib/ttTargets";

const SIZE = 0.1;
const OUT = new URL("../public/cache/", import.meta.url);

const pick = setContaining;

async function main() {
  const only = process.argv.slice(2);
  for (const t of TT_TARGETS.filter((x) => !only.length || only.includes(x.slug))) {
    const dir = new URL(`${t.slug}/frames/`, OUT);
    mkdirSync(dir, { recursive: true });
    for (const fn of existsSync(new URL(`${t.slug}/`, OUT)) ? readdirSync(new URL(`${t.slug}/`, OUT)) : [])
      if (fn.startsWith("known_")) unlinkSync(new URL(`${t.slug}/${fn}`, OUT));
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
    // Catalogue responses for the requests the page makes by default, stored with their full query so the
    // client only uses them for exactly that question (position, radius, time, services).
    const def = pref ? pick(obs, pref) : sets[0];
    if (def) {
      const metas = def.frames
        .slice(0, 12)
        .map((f) => {
          const fp = new URL(`${f.obsid}D${f.detector}_${SIZE}.bin`, dir);
          return existsSync(fp) ? unpack(new Uint8Array(readFileSync(fp)).buffer).meta : null;
        })
        .filter(Boolean) as ReturnType<typeof unpack>["meta"][];
      if (metas.length) {
        const first = metas[0].mjdAvg;
        const last = metas[metas.length - 1].mjdAvg;
        const at = (mjd: number): [number, number] => {
          if (!t.pm) return [t.ra, t.dec];
          const dt = (mjd - (51544.5 + 25.9 * 365.25)) / 365.25;
          return [t.ra + (t.pm[0] * dt) / 3.6e6 / Math.cos((t.dec * Math.PI) / 180), t.dec + (t.pm[1] * dt) / 3.6e6];
        };
        const reqs: { ra: number; dec: number; r: number; mjd: number; services: string }[] = [
          { ra: t.ra, dec: t.dec, r: Math.min(0.05, SIZE * 0.75), mjd: first, services: "gaia" },
          { ra: at(last)[0], dec: at(last)[1], r: 0.0028, mjd: last, services: "gaia,simbad" },
        ];
        const index: { file: string; ra: number; dec: number; r: number; mjd: number; services: string }[] = [];
        for (const [k, q] of reqs.entries()) {
          const res = await fetch(
            `http://localhost:3001/api/known?ra=${q.ra.toFixed(6)}&dec=${q.dec.toFixed(6)}&r=${q.r}&mjd=${q.mjd.toFixed(5)}&services=${q.services}`,
          ).catch(() => null);
          if (!res || !res.ok) continue;
          const body = await res.json();
          const okAll = q.services.split(",").every((sv) => body[sv === "sbc" || sv === "sba" ? "small_bodies" : sv]?.ok);
          if (!okAll) continue; // never cache a failed lookup
          const file = `known_${k}.json`;
          writeFileSync(new URL(`${t.slug}/${file}`, OUT), JSON.stringify(body));
          index.push({ file, ...q, ra: Number(q.ra.toFixed(6)), dec: Number(q.dec.toFixed(6)), mjd: Number(q.mjd.toFixed(5)) });
        }
        writeFileSync(new URL(`${t.slug}/known_index.json`, OUT), JSON.stringify(index));
      }
    }
  }
}
main();
