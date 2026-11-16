import { catalogueText } from './catalogue';

export type SmallBody = { name: string; ra_hms: string; dec_dms: string; sep_arcsec: number; vmag: string; ra_rate_arcsec_h: number; dec_rate_arcsec_h: number };
export function bodyPosition(row: Pick<SmallBody, 'ra_hms' | 'dec_dms'>): [number, number] {
  const ra = /^(\d+):(\d+):([\d.]+)$/.exec(row.ra_hms);
  const dec = /^([+-]?)(\d+)\D+(\d+)\D+([\d.]+)/.exec(row.dec_dms);
  if (!ra || !dec) throw new Error('Malformed JPL coordinates');
  const a = (Number(ra[1]) + Number(ra[2]) / 60 + Number(ra[3]) / 3600) * 15;
  const d = (dec[1] === '-' ? -1 : 1) * (Number(dec[2]) + Number(dec[3]) / 60 + Number(dec[4]) / 3600);
  if (a < 0 || a >= 360 || Math.abs(d) > 90 || Number(ra[2]) >= 60 || Number(ra[3]) >= 60 || Number(dec[3]) >= 60 || Number(dec[4]) >= 60) throw new Error('Invalid JPL coordinates');
  return [a, d];
}
export function skySeparation(ra: number, dec: number, a: number, d: number) {
  const rad = Math.PI / 180, dr = (((a - ra + 540) % 360) - 180) * rad;
  return 2 * Math.asin(Math.min(1, Math.sqrt(Math.sin((d - dec) * rad / 2) ** 2 + Math.cos(dec * rad) * Math.cos(d * rad) * Math.sin(dr / 2) ** 2))) / rad * 3600;
}
const sex = (value: number, isRa = false) => {
  const v = isRa ? value / 15 : Math.abs(value), ticks = Math.round(v * 3600e6);
  const a = Math.floor(ticks / 3600e6) % (isRa ? 24 : 100), b = Math.floor(ticks / 60e6) % 60, c = ticks % 60e6 / 1e6;
  // More precision than the original query avoids rounding a request onto the next minute.
  return `${!isRa && value < 0 ? 'M' : ''}${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}-${c.toFixed(6).padStart(9,'0')}`;
};
export function smallBodyUrl(ra: number, dec: number, radius: number, mjd: number, kind: 'sbc' | 'sba') {
  const utc = new Date((mjd - 40587) * 86400000).toISOString();
  return 'https://ssd-api.jpl.nasa.gov/sb_ident.api?' + new URLSearchParams({
    // SB Identification explicitly rejects MPC code 500. Zero Earth-relative state is geocentric.
    xobs: '0,0,0,0,0,0', 'obs-time': `${utc.slice(0,10)}_${utc.slice(11,19)}`,
    'fov-ra-center': sex(ra, true), 'fov-dec-center': sex(dec),
    'fov-ra-hwidth': String(Math.min(180, radius / Math.max(0.001, Math.cos(dec * Math.PI / 180)))),
    'fov-dec-hwidth': String(radius), 'two-pass': 'true', 'suppress-first-pass': 'true',
    'sb-kind': kind === 'sbc' ? 'c' : 'a', ...(kind === 'sbc' ? { 'mag-required': 'false' } : { 'vmag-lim': '21' }),
  });
}
export function parseSmallBodies(text: string): SmallBody[] {
  const j = JSON.parse(text);
  if (j.signature?.source !== 'NASA/JPL Small-Body Identification API' || j.signature?.version !== '1.1') throw new Error('Unsupported JPL response/signature');
  if (!Array.isArray(j.data_second_pass)) {
    if (typeof j.warning === 'string' && /no matching records/i.test(j.warning)) return [];
    throw new Error(`JPL: ${j.message ?? j.warning ?? 'no result data'}`);
  }
  if (Number(j.n_second_pass) !== j.data_second_pass.length || !Array.isArray(j.fields_second) ||
    j.fields_second[7] !== 'RA rate ("/h)' || j.fields_second[8] !== 'Dec rate ("/h)') throw new Error('Unsupported JPL table or rate units');
  return j.data_second_pass.map((row: unknown[]) => {
    if (!Array.isArray(row) || row.length !== 9 || row.some(v => typeof v !== 'string') || !row[0] || ![5,7,8].every(i => String(row[i]).trim() !== '' && Number.isFinite(Number(row[i]))) || Number(row[5]) < 0) throw new Error('Malformed JPL row');
    const r = { name: String(row[0]), ra_hms: String(row[1]), dec_dms: String(row[2]), sep_arcsec: Number(row[5]), vmag: String(row[6]), ra_rate_arcsec_h: Number(row[7]), dec_rate_arcsec_h: Number(row[8]) };
    bodyPosition(r);
    return r;
  });
}
// JPL requests are serialized per server process, including concurrent comet/asteroid checks.
let pending: Promise<void> = Promise.resolve();
export async function lookupSmallBodies(ra: number, dec: number, r: number, mjd: number, kind: 'sbc' | 'sba', deadline: AbortSignal, attemptMs = 50000) {
  const before = pending;
  let release: () => void = () => {};
  pending = new Promise<void>(resolve => { release = resolve; });
  try {
    await before; deadline.throwIfAborted();
    const url = smallBodyUrl(ra,dec,r,mjd,kind);
    let text = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try { text = await catalogueText(url, {}, deadline, attemptMs); break; }
      catch (e) {
        if (attempt || deadline.aborted || !/HTTP (429|500|502|503|504)|fetch failed|timed out|timeout/i.test(String(e))) throw e;
        await new Promise(resolve => setTimeout(resolve,500));
      }
    }
    const rows = parseSmallBodies(text).map(row => ({ ...row, sep_arcsec: skySeparation(ra,dec,...bodyPosition(row)) })).filter(row => row.sep_arcsec <= r * 3600);
    return { rows, url, retrieved: new Date().toISOString() };
  } finally { release(); }
}
