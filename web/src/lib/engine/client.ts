// Browser data layer: live IRSA access through our /api routes, with a prepared cache for featured
// targets (same bytes the live route returns) so demos keep working if the archive is unreachable.
import { decodeFrame, Frame, Observation } from "./sequence";
import { CACHE_SCHEMA, ENGINE_VERSION, RELEASE } from "./releases";
import { CAL_FIELD_DEG, FieldStar } from "./photometry";
import { bodyPosition, skySeparation } from "./smallBodies";

export type Source = "live" | "cache" | "aws";

async function getJSON(url: string, timeoutMs: number, fresh = false) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), ...(fresh ? { cache: "no-store" as const } : {}) });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      msg = (await r.json()).error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

export async function getObservations(ra: number, dec: number, slug?: string, preferCache = true, size = 0.1, refresh = false) {
  const live = () => getJSON(`/api/observations?ra=${ra}&dec=${dec}&size=${size}${refresh ? "&refresh=1" : ""}`, 60000, refresh).then((d) => ({ ...d, source: (d.inventoryFallback ? "cache" : "live") as Source }));
  const cache = async () => {
    const d = await getJSON(`/cache/${slug}/prepared.json`, 15000)
      .catch(() => getJSON(`/cache/${slug}/observations.json`, 15000));
    // Legacy centre searches remain useful for the original 6′ demo, but cannot claim full-field coverage.
    const legacy = d.schema === undefined;
    if ((!legacy && (d.schema !== CACHE_SCHEMA || d.engine !== ENGINE_VERSION || d.release !== RELEASE.id)) ||
      !Number.isFinite(d.target?.ra) || !Number.isFinite(d.target?.dec) ||
      Math.abs(d.target?.ra - ra) > 1e-5 || Math.abs(d.target?.dec - dec) > 1e-5 ||
      (legacy ? size !== 0.1 : d.fieldSize !== size)) throw new Error("Prepared observations do not match this field/release.");
    return { ...d, legacy: legacy || d.legacy === true, source: "cache" as Source };
  };
  // A refresh must either return a new archive answer or report failure, never silently return old data.
  if (refresh) return live();
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

async function loadFrame(o: Observation, ra: number, dec: number, size: number, slug?: string, preferCache = true) {
  const liveUrl = `/api/cutout?url=${encodeURIComponent(o.url)}&ra=${ra}&dec=${dec}&size=${size}`;
  const cacheUrl = `/cache/${slug}/frames/${frameKey(o, size)}.bin`;
  const get = async (u: string, ms: number) => {
    const r = await fetch(u, { signal: AbortSignal.timeout(ms) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = await r.arrayBuffer();
    const meta = decodeFrame(buf).meta;
    if (meta.sourceFits !== o.url || !Number.isFinite(meta.target.ra) || !Number.isFinite(meta.target.dec) || Math.abs(meta.target.ra - ra) > 1e-5 || Math.abs(meta.target.dec - dec) > 1e-5 || (meta.engine && meta.engine !== ENGINE_VERSION))
      throw new Error("Cutout provenance does not match the requested exposure/position/engine.");
    return buf;
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
  const frame = decodeFrame(buf);
  if (source === "live" && frame.meta.delivery === "aws") source = "aws";
  return { frame, source } as { frame: Frame; source: Source };
}

// Share validated cutouts between playback and the wavelength lab. Bounded to avoid retaining an
// unbounded sky survey in browser memory; failed requests never poison a later retry.
const frameRequests = new Map<string, ReturnType<typeof loadFrame>>();
export function getFrame(o: Observation, ra: number, dec: number, size: number, slug?: string, preferCache = true) {
  const key = `${ENGINE_VERSION}|${o.url}|${ra}|${dec}|${size}|${slug ?? ""}|${preferCache}`;
  const old = frameRequests.get(key);
  if (old) return old;
  const promise = loadFrame(o, ra, dec, size, slug, preferCache).catch((e) => { frameRequests.delete(key); throw e; });
  frameRequests.set(key, promise);
  if (frameRequests.size > 96) frameRequests.delete(frameRequests.keys().next().value!);
  return promise;
}

export type Known = {
  query: { ra: number; dec: number; radius_deg: number; mjd: number; epoch_year: number; time_utc: string; services?: string[] };
  lookupInfo?: Partial<Record<"gaia" | "simbad" | "small_bodies", { delivery: "prepared" | "live"; retrieved?: string; file?: string; query?: Known["query"]; requestUrl?: string }>>;
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
  variable?: boolean;
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

export type KnownIndexEntry = { file: string; ra: number; dec: number; r: number; mjd: number; services: string };

/** A saved field must contain the whole requested cone at the same observation time (within one second).
 * Both index and stored query are checked. Never reuse moving-object answers at another epoch. */
function sameQuery(q: { ra: number; dec: number; r: number; mjd: number; services: string }, ra: number, dec: number, r: number, mjd: number, services: string) {
  const sep = skySeparation(q.ra,q.dec,ra,dec) / 3600;
  return services.split(',').every(s => q.services.split(',').includes(s)) &&
    (!/sbc|sba/.test(services) || q.services === services) &&
    (sep < 1e-6 && Math.abs(q.r-r) < 1e-6 || sep + r <= q.r + 1e-8) && Math.abs(q.mjd - mjd) <= 1.2e-5;
}

export async function getKnown(ra: number, dec: number, r: number, mjd: number, services: string, slug?: string): Promise<Known> {
  const url = `/api/known?ra=${ra.toFixed(6)}&dec=${dec.toFixed(6)}&r=${r}&mjd=${mjd.toFixed(5)}&services=${services}`;
  const query = { ra, dec, radius_deg:r, mjd, services:services.split(','), epoch_year:2000+(mjd-51544.5)/365.25, time_utc:new Date((mjd-40587)*86400000).toISOString() };
  const unavailable = { ok:false, error:'not requested' };
  const saved: Known = { query, gaia:{service:'Gaia DR3',...unavailable}, simbad:{service:'SIMBAD',...unavailable}, small_bodies:{service:'NASA/JPL Small-Body Identification',...unavailable}, lookupInfo:{} };
  const key = (s: string) => s === 'sbc' || s === 'sba' ? 'small_bodies' as const : s as 'gaia' | 'simbad';
  if (slug) {
    const rawIndex = await getJSON(`/cache/${slug}/known_index.json`, 15000).catch(() => []);
    const index: KnownIndexEntry[] = Array.isArray(rawIndex) ? rawIndex.filter(x => x && typeof x.services === 'string' && typeof x.file === 'string' && [x.ra,x.dec,x.r,x.mjd].every(Number.isFinite)) : [];
    for (const service of query.services) {
      for (const hit of index.filter(x => sameQuery(x,ra,dec,r,mjd,service))) {
        try {
          const k: Known & { retrieved?:string; provenance?:{requestUrl?:string} } = await getJSON(`/cache/${slug}/${hit.file}`,15000);
          const q = k.query, part = k[key(service)];
          if (!sameQuery({ra:q.ra,dec:q.dec,r:q.radius_deg,mjd:q.mjd,services:(q.services ?? []).join(',')},ra,dec,r,mjd,service) || !part.ok || !Array.isArray(part.rows)) continue;
          if (service === 'gaia' && k.gaia.rows!.some(s => !/^\d+$/.test(s.source_id) || ![s.ra_epoch,s.dec_epoch,s.g,s.pmra,s.pmdec].every(Number.isFinite))) continue;
          if (service === 'simbad' && k.simbad.rows!.some(s => !s.main_id || ![s.ra_epoch,s.dec_epoch].every(Number.isFinite))) continue;
          if ((service === 'sbc' || service === 'sba') && k.small_bodies.rows!.some(s => !s.name || ![s.sep_arcsec,s.ra_rate_arcsec_h,s.dec_rate_arcsec_h].every(Number.isFinite))) continue;
          if (service === 'gaia') saved.gaia = { ...k.gaia, rows:k.gaia.rows!.map(s => ({...s,sep_arcsec:skySeparation(ra,dec,s.ra_epoch,s.dec_epoch)})).filter(s => s.sep_arcsec <= r*3600).sort((a,b)=>a.sep_arcsec-b.sep_arcsec) };
          else if (service === 'simbad') saved.simbad = { ...k.simbad, rows:k.simbad.rows!.map(s => ({...s,sep_arcsec:skySeparation(ra,dec,s.ra_epoch,s.dec_epoch)})).filter(s => s.sep_arcsec <= r*3600).sort((a,b)=>a.sep_arcsec-b.sep_arcsec) };
          else saved.small_bodies = { ...k.small_bodies, rows:k.small_bodies.rows!.map(s => ({...s,sep_arcsec:skySeparation(ra,dec,...bodyPosition(s))})).filter(s => s.sep_arcsec <= r*3600).sort((a,b)=>a.sep_arcsec-b.sep_arcsec) };
          saved.lookupInfo![key(service)] = {delivery:'prepared',file:`/cache/${slug}/${hit.file}`,retrieved:k.retrieved,query:k.query,requestUrl:k.provenance?.requestUrl};
          break;
        } catch { /* An invalid saved answer must never become an empty successful search. */ }
      }
    }
  }
  const missing = query.services.filter(s => !saved[key(s)].ok);
  if (!missing.length) return saved;
  let live: Known;
  try { live = await getJSON(url.replace(`services=${services}`,`services=${missing.join(',')}`),62000); }
  catch (e) {
    if (missing.length === query.services.length) throw e;
    for (const s of missing) saved[key(s)] = {service:saved[key(s)].service,ok:false,error:e instanceof Error ? e.message : String(e)};
    return saved;
  }
  // Preserve every successful saved service even when the server returns HTTP 200 with partial failures.
  for (const s of missing) { Object.assign(saved,{[key(s)]:live[key(s)]}); saved.lookupInfo![key(s)]={delivery:'live'}; }
  return saved;
}

/** Gaia stars for reference-star calibration of a 12′ field: the prepared validation catalogue for featured
 * targets (it must cover the whole field), otherwise a live Gaia DR3 query. Failures are thrown, never hidden. */
export async function getCalibrationStars(ra: number, dec: number, mjd: number, slug?: string): Promise<{ stars: FieldStar[]; mjd: number; source: string }> {
  if (slug) {
    try {
      const c = await getJSON(`/cache/${slug}/calib_stars.json`, 15000);
      const sep = Math.hypot((c.query.ra - ra) * Math.cos((dec * Math.PI) / 180), c.query.dec - dec);
      if (c.query.radius_deg >= CAL_FIELD_DEG / Math.SQRT2 + sep && Array.isArray(c.stars)) return { stars: c.stars, mjd: c.query.epoch_mjd, source: c.source };
    } catch {}
  }
  const k: Known = await getJSON(`/api/known?ra=${ra.toFixed(6)}&dec=${dec.toFixed(6)}&r=0.16&mjd=${mjd.toFixed(5)}&services=gaia`, 62000);
  if (!k.gaia.ok) throw new Error(`Gaia star catalog unavailable (${k.gaia.error ?? "lookup failed"})`);
  return { stars: k.gaia.rows ?? [], mjd: k.query.mjd, source: k.gaia.service };
}

/** The same exposure as a 12′ cutout (same native pixels, wider window) unless the frame is already that wide. */
export async function getCalibrationFrame(f: Frame, slug?: string): Promise<Frame> {
  if ((Math.min(f.meta.nx, f.meta.ny) * 6.15) / 3600 >= CAL_FIELD_DEG * 0.95) return f;
  const o = { obsid: f.meta.obsid, detector: f.meta.detector, url: f.meta.sourceFits } as Observation;
  return (await getFrame(o, f.meta.target.ra, f.meta.target.dec, CAL_FIELD_DEG, slug)).frame;
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
  if (Number(m[1]) >= 24 || Number(m[2]) >= 60 || Number(m[3]) >= 60 || Number(m[6]) >= 60 || Number(m[7]) >= 60) return null;
  const ra = (parseInt(m[1]) + parseInt(m[2]) / 60 + parseFloat(m[3]) / 3600) * 15;
  const sign = m[4] === "-" || m[4] === "−" ? -1 : 1;
  const d = sign * (parseInt(m[5]) + parseInt(m[6]) / 60 + parseFloat(m[7]) / 3600);
  if (ra >= 360 || Math.abs(d) > 90) return null;
  return { ra, dec: d };
}
