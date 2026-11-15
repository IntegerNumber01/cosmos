// Server-side: fetch a SPHEREx Level-2 cutout from IRSA IBE, parse it, and pack only what the
// browser needs (IMAGE, FLAGS, VARIANCE + WCS + metadata) into a compact binary.
// Binary layout: [u32 jsonLength][json utf-8][pad to 4][f32 image][i32 flags][f32 variance]
import { flagDefs, parseFits, readImage, readInt32Image } from "./fits";
import { sky2pix, waveAt, wcsFromHeader, WcsParams } from "./wcs";
import { ENGINE_VERSION } from "./releases";
import { cloudCutout } from "./cloudCutout";

export type CutoutMeta = {
  obsid: string;
  detector: number;
  dateAvg: string;
  dateBeg: string;
  mjdAvg: number;
  exposure: number;
  l2dqa: string;
  bunit: string;
  psfFwhm: number | null;
  nx: number;
  ny: number;
  wcs: WcsParams;
  crpixW: [number, number];
  flags: { name: string; mask: number; desc: string }[];
  target: { ra: number; dec: number; x: number; y: number; wl: number; bw: number };
  sourceFits: string;
  cutoutUrl: string;
  engine?: string;
  release?: string;
  delivery?: "irsa" | "aws";
  mirrorFits?: string;
  nativeCrop?: { x: number; y: number; nx: number; ny: number };
};

export const IBE_PREFIX = "https://irsa.ipac.caltech.edu/ibe/data/spherex/";

export function cutoutUrl(url: string, ra: number, dec: number, size: number) {
  return `${url}?center=${ra.toFixed(6)},${dec.toFixed(6)}d&size=${size}`;
}

export async function fetchCutout(url: string, ra: number, dec: number, size: number): Promise<ArrayBuffer> {
  if (!url.startsWith(IBE_PREFIX) || !url.endsWith(".fits")) throw new Error("not a SPHEREx IBE file");
  const cu = cutoutUrl(url, ra, dec, size);
  let buf: ArrayBuffer | null = null;
  const started = Date.now();
  const deadline = started + 14000;
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) break;
    try {
      const r = await fetch(cu, { cache: "no-store", signal: AbortSignal.timeout(Math.min(6000, remaining)) });
      if (r.ok) {
        const b = await r.arrayBuffer();
        if (b.byteLength >= 6 && new TextDecoder().decode(new Uint8Array(b, 0, 6)) === "SIMPLE") {
          buf = b;
          break;
        }
      }
    } catch { /* bounded retry for a busy archive */ }
    if (attempt === 0) await new Promise((res) => setTimeout(res, 500));
  }
  const hdus = buf ? parseFits(buf) : [];
  const img = hdus.find((h) => h.name === "IMAGE");
  const flg = hdus.find((h) => h.name === "FLAGS");
  const vr = hdus.find((h) => h.name === "VARIANCE");
  const mirrored = !buf || !img || !flg || !vr ? await cloudCutout(url, ra, dec, size, started + 54000).catch((e) => {
    throw new Error(`IRSA cutout unavailable; AWS mirror fallback failed: ${(e as Error).message}`);
  }) : null;
  const h = mirrored ? mirrored.header : img!.header;
  const { data, nx, ny } = mirrored ?? readImage(buf!, img!);
  const flags = mirrored ? mirrored.flags : readInt32Image(buf!, flg!);
  const variance = mirrored ? mirrored.variance : readImage(buf!, vr!).data;
  const wcs = wcsFromHeader(h);
  const det = Number(h.DETECTOR);
  const crpixW: [number, number] = [Number(h.CRPIX1W), Number(h.CRPIX2W)];
  const [tx, ty] = sky2pix(wcs, ra, dec);
  const w = waveAt(det, tx, ty, crpixW);
  const meta: CutoutMeta = {
    obsid: String(h.OBSID),
    detector: det,
    dateAvg: String(h["DATE-AVG"]),
    dateBeg: String(h["DATE-BEG"]),
    mjdAvg: Number(h["MJD-AVG"]),
    exposure: Number(h.XPOSURE),
    l2dqa: String(h.L2DQAFLG ?? ""),
    bunit: String(h.BUNIT ?? ""),
    psfFwhm: h.PSF_FWHM === undefined ? null : Number(h.PSF_FWHM),
    nx,
    ny,
    wcs,
    crpixW,
    flags: flagDefs(mirrored ? mirrored.flagHeader : flg!.header).map((f) => ({ name: f.name, mask: f.mask, desc: f.desc })),
    target: { ra, dec, x: tx, y: ty, wl: w.wl, bw: w.bw },
    sourceFits: url,
    cutoutUrl: cutoutUrl(url, ra, dec, size),
    engine: ENGINE_VERSION,
    release: url.slice(IBE_PREFIX.length).split("/")[0],
    delivery: mirrored ? "aws" : "irsa",
    ...(mirrored ? { mirrorFits: mirrored.source, nativeCrop: mirrored.crop } : {}),
  };
  return pack(meta, data, flags, variance);
}

export function pack(meta: CutoutMeta, img: Float32Array, flags: Int32Array, v: Float32Array): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const head = 4 + json.length;
  const pad = (4 - (head % 4)) % 4;
  const n = img.length;
  const out = new ArrayBuffer(head + pad + n * 12);
  new DataView(out).setUint32(0, json.length, true);
  new Uint8Array(out, 4, json.length).set(json);
  const o = head + pad;
  new Float32Array(out, o, n).set(img);
  new Int32Array(out, o + n * 4, n).set(flags);
  new Float32Array(out, o + n * 8, n).set(v);
  return out;
}

export function unpack(buf: ArrayBuffer) {
  const len = new DataView(buf).getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len))) as CutoutMeta;
  const head = 4 + len;
  const o = head + ((4 - (head % 4)) % 4);
  const n = meta.nx * meta.ny;
  return {
    meta,
    image: new Float32Array(buf.slice(o, o + n * 4)),
    flags: new Int32Array(buf.slice(o + n * 4, o + n * 8)),
    variance: new Float32Array(buf.slice(o + n * 8, o + n * 12)),
  };
}
