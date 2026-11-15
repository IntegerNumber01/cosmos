// Browser data layer: live IRSA access through our /api routes, with a prepared cache for featured
// targets (same bytes the live route returns) so demos keep working if the archive is unreachable.
import { decodeFrame, Frame, Observation } from "./sequence";

export type Source = "live" | "cache";

async function getJSON(url: string, timeoutMs: number) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      msg = (await r.json()).error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

export async function getObservations(ra: number, dec: number, slug?: string, preferCache = true) {
  const live = () => getJSON(`/api/observations?ra=${ra}&dec=${dec}`, 60000).then((d) => ({ ...d, source: "live" as Source }));
  const cache = () => getJSON(`/cache/${slug}/observations.json`, 15000).then((d) => ({ ...d, source: "cache" as Source }));
  if (slug && preferCache) return cache().catch(live);
  try {
    return await live();
  } catch (e) {
    if (slug) return cache();
    throw e;
  }
}

export function frameKey(o: Observation, size: number) {
  return `${o.obsid}D${o.detector}_${size}`;
}

export async function getFrame(o: Observation, ra: number, dec: number, size: number, slug?: string, preferCache = true) {
  const liveUrl = `/api/cutout?url=${encodeURIComponent(o.url)}&ra=${ra}&dec=${dec}&size=${size}`;
  const cacheUrl = `/cache/${slug}/frames/${frameKey(o, size)}.bin`;
  const get = async (u: string, ms: number) => {
    const r = await fetch(u, { signal: AbortSignal.timeout(ms) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.arrayBuffer();
  };
  let buf: ArrayBuffer;
  let source: Source = "live";
  if (slug && preferCache) {
    try {
      buf = await get(cacheUrl, 15000);
      source = "cache";
    } catch {
      buf = await get(liveUrl, 70000);
    }
  } else {
    try {
      buf = await get(liveUrl, 70000);
    } catch (e) {
      if (!slug) throw e;
      buf = await get(cacheUrl, 15000);
      source = "cache";
    }
  }
  return { frame: decodeFrame(buf), source } as { frame: Frame; source: Source };
}

export type Known = {
  query: { ra: number; dec: number; radius_deg: number; mjd: number; epoch_year: number; time_utc: string };
  gaia: { service: string; ok: boolean; rows?: GaiaRow[]; error?: string };
  simbad: { service: string; ok: boolean; rows?: SimbadRow[]; error?: string };
  small_bodies: { service: string; ok: boolean; rows?: SmallBodyRow[]; error?: string };
};
export type GaiaRow = {
  source_id: string;
  g: number;
  parallax: number | null;
  parallax_error: number | null;
  pmra: number;
  pmdec: number;
  ra_epoch: number;
  dec_epoch: number;
  sep_arcsec: number;
};
export type SimbadRow = {
  main_id: string;
  otype: string;
  otype_label: string | null;
  sep_arcsec: number;
  ra_epoch: number;
  dec_epoch: number;
  pmra?: number;
  pmdec?: number;
};
export type SmallBodyRow = { name: string; ra_hms: string; dec_dms: string; sep_arcsec: number; vmag: string; ra_rate_arcsec_h: number; dec_rate_arcsec_h: number };

export async function getKnown(ra: number, dec: number, r: number, mjd: number, services: string, slug?: string): Promise<Known> {
  const url = `/api/known?ra=${ra.toFixed(6)}&dec=${dec.toFixed(6)}&r=${r}&mjd=${mjd.toFixed(5)}&services=${services}`;
  try {
    return await getJSON(url, 62000);
  } catch (e) {
    if (slug) {
      const key = `${ra.toFixed(4)}_${dec.toFixed(4)}_${services}`;
      return getJSON(`/cache/${slug}/known_${key}.json`, 15000);
    }
    throw e;
  }
}

/** Parse "269.446 4.768", "17:57:47.1 +04:46:04", "17h57m47s +4d46m4s" -> degrees. */
export function parseCoords(s: string): { ra: number; dec: number } | null {
  const t = s.trim().replace(/,/g, " ");
  const dec = t.split(/\s+/);
  if (dec.length === 2 && dec.every((x) => /^[+-]?\d+(\.\d+)?$/.test(x))) {
    const ra = parseFloat(dec[0]);
    const d = parseFloat(dec[1]);
    if (ra >= 0 && ra < 360 && Math.abs(d) <= 90) return { ra, dec: d };
    return null;
  }
  const m = t.match(/^(\d{1,2})[h: ]\s*(\d{1,2})[m: ]\s*(\d{1,2}(?:\.\d+)?)s?\s+([+-−]?)(\d{1,2})[d°: ]\s*(\d{1,2})['′m: ]\s*(\d{1,2}(?:\.\d+)?)["″s]?$/);
  if (!m) return null;
  const ra = (parseInt(m[1]) + parseInt(m[2]) / 60 + parseFloat(m[3]) / 3600) * 15;
  const sign = m[4] === "-" || m[4] === "−" ? -1 : 1;
  const d = sign * (parseInt(m[5]) + parseInt(m[6]) / 60 + parseFloat(m[7]) / 3600);
  if (ra >= 360 || Math.abs(d) > 90) return null;
  return { ra, dec: d };
}
