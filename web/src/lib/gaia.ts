// Gaia DR3 star sample loader (assets built by pipeline/build_gaia_assets.py).
export type GaiaMeta = {
  n: number;
  stride: number;
  fields: string[];
  frame: string;
  selection: string[];
  source: string;
  max_distance_pc: number;
  labels: { name: string; i: number; sep_deg: number }[];
  teff: (number | null)[];
  ruwe: (number | null)[];
};

export type GaiaData = { meta: GaiaMeta; f: Float32Array; ids: Uint32Array };

let cache: Promise<GaiaData> | null = null;

export function loadGaia(): Promise<GaiaData> {
  if (!cache) {
    cache = Promise.all([
      fetch("/data/gaia/stars.json").then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
      fetch("/data/gaia/stars.f32").then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`)))),
      fetch("/data/gaia/ids.u32").then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`)))),
    ])
      .then(([meta, f, ids]) => ({ meta, f: new Float32Array(f), ids: new Uint32Array(ids) }))
      .catch((e) => {
        cache = null;
        throw e;
      });
  }
  return cache;
}

export const PC_TO_LY = 3.26156;

export function sourceId(ids: Uint32Array, i: number) {
  return ((BigInt(ids[2 * i]) << BigInt(32)) | BigInt(ids[2 * i + 1])).toString();
}

export type StarInfo = {
  i: number;
  name?: string;
  sourceId: string;
  ra: number;
  dec: number;
  distPc: number;
  distErrPc: number;
  parallax: number;
  parallaxErr: number;
  g: number;
  absG: number;
  bpRp: number | null;
  teff: number | null;
  ruwe: number | null;
  pos: [number, number, number]; // scene coordinates
};

/** ICRS (x, y, z) -> scene (x, z, -y): north celestial pole is "up"; a proper rotation, no mirroring. */
export function eqToScene(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y];
}

export function dirFromRaDec(raDeg: number, decDeg: number): [number, number, number] {
  const a = (raDeg * Math.PI) / 180;
  const d = (decDeg * Math.PI) / 180;
  return eqToScene(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d));
}

export function starInfo(g: GaiaData, i: number): StarInfo {
  const s = g.meta.stride;
  const x = g.f[i * s],
    y = g.f[i * s + 1],
    z = g.f[i * s + 2];
  const plx = g.f[i * s + 6];
  const eplx = g.f[i * s + 7];
  const d = 1000 / plx;
  const r = Math.hypot(x, y, z);
  const ra = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const dec = (Math.asin(z / r) * 180) / Math.PI;
  const bp = g.f[i * s + 5];
  const lab = g.meta.labels.find((l) => l.i === i);
  return {
    i,
    name: lab?.name,
    sourceId: sourceId(g.ids, i),
    ra,
    dec,
    distPc: d,
    distErrPc: d * (eplx / plx),
    parallax: plx,
    parallaxErr: eplx,
    g: g.f[i * s + 4],
    absG: g.f[i * s + 3],
    bpRp: bp < -50 ? null : bp,
    teff: g.meta.teff[i],
    ruwe: g.meta.ruwe[i],
    pos: eqToScene(x, y, z),
  };
}

/** Approximate star colour from Gaia BP-RP (display only). */
export function bpRpToRGB(bp: number): [number, number, number] {
  if (bp < -50) return [1, 1, 1];
  const stops: [number, [number, number, number]][] = [
    [-0.4, [0.61, 0.7, 1.0]],
    [0.0, [0.68, 0.76, 1.0]],
    [0.4, [0.92, 0.93, 1.0]],
    [0.8, [1.0, 0.96, 0.9]],
    [1.2, [1.0, 0.85, 0.66]],
    [1.8, [1.0, 0.73, 0.46]],
    [2.6, [1.0, 0.6, 0.35]],
    [3.6, [1.0, 0.47, 0.3]],
  ];
  if (bp <= stops[0][0]) return stops[0][1];
  for (let k = 0; k < stops.length - 1; k++) {
    const [a, ca] = stops[k];
    const [b, cb] = stops[k + 1];
    if (bp <= b) {
      const t = (bp - a) / (b - a);
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
    }
  }
  return stops[stops.length - 1][1];
}
