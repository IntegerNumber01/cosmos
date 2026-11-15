// TAN-SIP celestial WCS (pixel <-> sky) and the SPHEREx WCS-WAVE wavelength lookup.
// Pixel coordinates are 0-based (FITS pixel = p0 + 1). Verified against astropy (scripts/check-wcs.mjs).
import waveTables from "@/data/wave_tables.json";

export type WcsParams = {
  crpix: [number, number];
  crval: [number, number];
  cd: [number, number, number, number]; // CD1_1, CD1_2, CD2_1, CD2_2 (deg/px)
  a: [number, number, number][]; // [p, q, coeff]
  b: [number, number, number][];
  ap: [number, number, number][];
  bp: [number, number, number][];
};

type H = Record<string, string | number | boolean>;
const D2R = Math.PI / 180;

export function wcsFromHeader(h: H): WcsParams {
  const num = (k: string, d = 0) => (h[k] === undefined ? d : Number(h[k]));
  let cd: [number, number, number, number];
  if (h.CD1_1 !== undefined) cd = [num("CD1_1"), num("CD1_2"), num("CD2_1"), num("CD2_2")];
  else {
    const c1 = num("CDELT1", 1),
      c2 = num("CDELT2", 1);
    cd = [c1 * num("PC1_1", 1), c1 * num("PC1_2", 0), c2 * num("PC2_1", 0), c2 * num("PC2_2", 1)];
  }
  const poly = (pre: string, order: number) => {
    const out: [number, number, number][] = [];
    for (let p = 0; p <= order; p++)
      for (let q = 0; q <= order - p; q++) {
        const k = `${pre}_${p}_${q}`;
        if (h[k] !== undefined) out.push([p, q, Number(h[k])]);
      }
    return out;
  };
  const sip = String(h.CTYPE1 ?? "").includes("SIP");
  return {
    crpix: [num("CRPIX1"), num("CRPIX2")],
    crval: [num("CRVAL1"), num("CRVAL2")],
    cd,
    a: sip ? poly("A", num("A_ORDER")) : [],
    b: sip ? poly("B", num("B_ORDER")) : [],
    ap: sip ? poly("AP", num("AP_ORDER")) : [],
    bp: sip ? poly("BP", num("BP_ORDER")) : [],
  };
}

const evalPoly = (c: [number, number, number][], u: number, v: number) => {
  let s = 0;
  for (const [p, q, k] of c) s += k * Math.pow(u, p) * Math.pow(v, q);
  return s;
};

/** Gnomonic (TAN) projection about (ra0, dec0): returns intermediate (xi, eta) in degrees. */
export function tanProject(ra: number, dec: number, ra0: number, dec0: number): [number, number] {
  const a = ra * D2R,
    d = dec * D2R,
    a0 = ra0 * D2R,
    d0 = dec0 * D2R;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
  const xi = (Math.cos(d) * Math.sin(a - a0)) / cosc;
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc;
  return [xi / D2R, eta / D2R];
}

export function tanDeproject(xi: number, eta: number, ra0: number, dec0: number): [number, number] {
  const x = xi * D2R,
    y = eta * D2R,
    d0 = dec0 * D2R;
  const dec = Math.asin((Math.sin(d0) + y * Math.cos(d0)) / Math.sqrt(1 + x * x + y * y));
  const ra = ra0 * D2R + Math.atan2(x, Math.cos(d0) - y * Math.sin(d0));
  return [(((ra / D2R) % 360) + 360) % 360, dec / D2R];
}

export function pix2sky(w: WcsParams, x0: number, y0: number): [number, number] {
  const u = x0 + 1 - w.crpix[0];
  const v = y0 + 1 - w.crpix[1];
  const uu = u + evalPoly(w.a, u, v);
  const vv = v + evalPoly(w.b, u, v);
  const xi = w.cd[0] * uu + w.cd[1] * vv;
  const eta = w.cd[2] * uu + w.cd[3] * vv;
  return tanDeproject(xi, eta, w.crval[0], w.crval[1]);
}

export function sky2pix(w: WcsParams, ra: number, dec: number): [number, number] {
  const [xi, eta] = tanProject(ra, dec, w.crval[0], w.crval[1]);
  const det = w.cd[0] * w.cd[3] - w.cd[1] * w.cd[2];
  const uu = (w.cd[3] * xi - w.cd[1] * eta) / det;
  const vv = (-w.cd[2] * xi + w.cd[0] * eta) / det;
  let u = uu + evalPoly(w.ap, uu, vv);
  let v = vv + evalPoly(w.bp, uu, vv);
  // refine with Newton steps on the forward SIP model (the AP/BP inverse is approximate)
  if (w.a.length) {
    for (let it = 0; it < 3; it++) {
      const fu = u + evalPoly(w.a, u, v) - uu;
      const fv = v + evalPoly(w.b, u, v) - vv;
      const e = 1e-3;
      const j11 = (u + e + evalPoly(w.a, u + e, v) - (u + evalPoly(w.a, u, v))) / e;
      const j12 = (u + evalPoly(w.a, u, v + e) - (u + evalPoly(w.a, u, v))) / e;
      const j21 = (v + evalPoly(w.b, u + e, v) - (v + evalPoly(w.b, u, v))) / e;
      const j22 = (v + e + evalPoly(w.b, u, v + e) - (v + evalPoly(w.b, u, v))) / e;
      const dj = j11 * j22 - j12 * j21;
      u -= (j22 * fu - j12 * fv) / dj;
      v -= (-j21 * fu + j11 * fv) / dj;
    }
  }
  return [u + w.crpix[0] - 1, v + w.crpix[1] - 1];
}

type Table = { x: number[]; y: number[]; wl: number[][]; bw: number[][] };
const TABLES = waveTables as unknown as Record<string, Table>;

function bilinear(t: Table, grid: number[][], rx: number, ry: number) {
  const { x, y } = t;
  let i = 0;
  while (i < x.length - 2 && rx > x[i + 1]) i++;
  let j = 0;
  while (j < y.length - 2 && ry > y[j + 1]) j++;
  const tx = (rx - x[i]) / (x[i + 1] - x[i]);
  const ty = (ry - y[j]) / (y[j + 1] - y[j]);
  return (
    grid[j][i] * (1 - tx) * (1 - ty) + grid[j][i + 1] * tx * (1 - ty) + grid[j + 1][i] * (1 - tx) * ty + grid[j + 1][i + 1] * tx * ty
  );
}

/**
 * Wavelength and bandwidth (µm) at a pixel. `crpixW` are the frame's CRPIX1W/CRPIX2W (cutout offset);
 * for a full 2040x2040 frame use detectorWave(). Raw lookup coordinate = p0 + 2 - CRPIXW.
 */
export function waveAt(det: number, x0: number, y0: number, crpixW: [number, number]): { wl: number; bw: number } {
  const t = TABLES[String(det)];
  const rx = x0 + 2 - crpixW[0];
  const ry = y0 + 2 - crpixW[1];
  return { wl: bilinear(t, t.wl, rx, ry), bw: bilinear(t, t.bw, rx, ry) };
}

/** Wavelength at a full-frame 0-based detector pixel (raw = p0 + 1). */
export function detectorWave(det: number, x0: number, y0: number) {
  return waveAt(det, x0, y0, [1, 1]);
}
