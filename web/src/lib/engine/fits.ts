// Minimal FITS reader for SPHEREx Level-2 cutouts: headers, image HDUs (big-endian).
export type Header = Record<string, string | number | boolean>;
export type HDU = { header: Header; dataOffset: number; dataBytes: number; name: string };

const BLOCK = 2880;

function parseValue(raw: string): string | number | boolean {
  const s = raw.trim();
  if (s.startsWith("'")) {
    // FITS string: '' is an escaped quote; value ends at the first lone quote
    let out = "";
    for (let i = 1; i < s.length; i++) {
      if (s[i] === "'") {
        if (s[i + 1] === "'") {
          out += "'";
          i++;
        } else break;
      } else out += s[i];
    }
    return out.trimEnd();
  }
  const v = s.split("/")[0].trim();
  if (v === "T") return true;
  if (v === "F") return false;
  const n = Number(v);
  return Number.isFinite(n) && v !== "" ? n : v;
}

export function parseFits(buf: ArrayBuffer): HDU[] {
  const bytes = new Uint8Array(buf);
  const dec = new TextDecoder("ascii");
  const hdus: HDU[] = [];
  let off = 0;
  while (off + BLOCK <= bytes.length) {
    const header: Header = {};
    let end = false;
    let p = off;
    while (!end && p + 80 <= bytes.length) {
      const card = dec.decode(bytes.subarray(p, p + 80));
      p += 80;
      const key = card.slice(0, 8).trim();
      if (key === "END") {
        end = true;
        break;
      }
      if (key === "HIERARCH") {
        const eq = card.indexOf("=");
        if (eq > 0) header[card.slice(9, eq).trim()] = parseValue(card.slice(eq + 1));
      } else if (card[8] === "=" && key) {
        header[key] = parseValue(card.slice(10));
      }
    }
    if (!end) break;
    const hdrEnd = Math.ceil((p - off) / BLOCK) * BLOCK + off;
    const bitpix = Math.abs(Number(header.BITPIX ?? 8));
    const naxis = Number(header.NAXIS ?? 0);
    let n = naxis > 0 ? 1 : 0;
    for (let i = 1; i <= naxis; i++) n *= Number(header[`NAXIS${i}`] ?? 0);
    const dataBytes = (bitpix / 8) * n * Number(header.GCOUNT ?? 1) + Number(header.PCOUNT ?? 0) * (naxis > 0 ? 1 : 0);
    hdus.push({ header, dataOffset: hdrEnd, dataBytes, name: String(header.EXTNAME ?? (hdus.length === 0 ? "PRIMARY" : "")) });
    off = hdrEnd + Math.ceil(dataBytes / BLOCK) * BLOCK;
  }
  return hdus;
}

/** Read a 2-D image HDU into a Float32Array (row-major, y then x). */
export function readImage(buf: ArrayBuffer, h: HDU): { data: Float32Array; nx: number; ny: number } {
  const nx = Number(h.header.NAXIS1);
  const ny = Number(h.header.NAXIS2);
  const bitpix = Number(h.header.BITPIX);
  const dv = new DataView(buf, h.dataOffset, h.dataBytes);
  const out = new Float32Array(nx * ny);
  const bscale = Number(h.header.BSCALE ?? 1);
  const bzero = Number(h.header.BZERO ?? 0);
  for (let i = 0; i < nx * ny; i++) {
    let v: number;
    if (bitpix === -32) v = dv.getFloat32(i * 4, false);
    else if (bitpix === -64) v = dv.getFloat64(i * 8, false);
    else if (bitpix === 32) v = dv.getInt32(i * 4, false);
    else if (bitpix === 16) v = dv.getInt16(i * 2, false);
    else v = dv.getUint8(i);
    out[i] = v * bscale + bzero;
  }
  return { data: out, nx, ny };
}

/** Read an int32 FLAGS image exactly (no float conversion). */
export function readInt32Image(buf: ArrayBuffer, h: HDU): Int32Array {
  const nx = Number(h.header.NAXIS1);
  const ny = Number(h.header.NAXIS2);
  const dv = new DataView(buf, h.dataOffset, h.dataBytes);
  const out = new Int32Array(nx * ny);
  for (let i = 0; i < nx * ny; i++) out[i] = dv.getInt32(i * 4, false);
  return out;
}

export type FlagDef = { name: string; bit: number; mask: number; desc: string };

export function flagDefs(h: Header): FlagDef[] {
  const out: FlagDef[] = [];
  for (const k of Object.keys(h)) {
    const m = /^MSKN(\d{4})$/.exec(k);
    if (m) {
      const n = m[1];
      out.push({ name: String(h[k]).trim(), bit: parseInt(n, 10), mask: Number(h[`MSKM${n}`]), desc: String(h[`MSKD${n}`] ?? "").trim() });
    }
  }
  return out.sort((a, b) => a.bit - b.bit);
}

/** Flags that make a pixel value unreliable (documented names, read from the header). OUTLIER is
 * handled separately: moving or variable sources trigger the multi-frame outlier detector. */
export const REJECT_FLAGS = ["TRANSIENT", "OVERFLOW", "SUR_ERROR", "NONFUNC", "MISSING_DATA", "HOT", "COLD", "NONLINEAR", "PHANMISS", "PERSIST"];
