// Server-side: find every SPHEREx DR1 Level-2 frame covering a sky position (IRSA SIA2) and estimate
// the wavelength at that position on each frame, using only the SIA2 footprint polygon + the
// detector's WCS-WAVE table (validated: median 3.3 px, max 7 px position error over 93 frames).
// The exact wavelength is recomputed from each cutout's own header when it is fetched.
import { detectorWave, tanProject } from "./wcs";
import { RELEASE } from "./releases";

export type Observation = {
  obsid: string;
  detector: number;
  url: string;
  mjd: number;
  date: string;
  exptime: number;
  estX: number;
  estY: number;
  inside: boolean;
  wl: number; // estimated wavelength at the target (µm)
  bw: number; // estimated channel bandwidth at the target (µm)
};

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const head = (rows.shift() ?? []).map((h) => h.replace(/^﻿/, ""));
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

/** Solve the 8-parameter homography mapping 4 source points to 4 destination points. */
function homography(src: [number, number][], dst: [number, number][]) {
  const A: number[][] = [];
  const b: number[] = [];
  for (let k = 0; k < 4; k++) {
    const [x, y] = src[k];
    const [u, v] = dst[k];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const h = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * h[c];
    h[i] = s / A[i][i];
  }
  return (x: number, y: number): [number, number] => {
    const w = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
  };
}

const CORNERS: [number, number][] = [
  [0, 0],
  [2039, 0],
  [2039, 2039],
  [0, 2039],
];

export function mjdToIso(mjd: number) {
  return new Date((mjd - 40587) * 86400000).toISOString().replace("Z", "");
}

export async function findObservations(ra: number, dec: number, margin = 30, size = 0.1): Promise<Observation[]> {
  // Circumscribed circle includes the corners of the requested square field.
  const radius = (size / Math.SQRT2).toFixed(6);
  const url = `https://irsa.ipac.caltech.edu/SIA?COLLECTION=${RELEASE.collection}&POS=circle+${ra.toFixed(6)}+${dec.toFixed(6)}+${radius}&RESPONSEFORMAT=csv`;
  let text = "";
  let lastError = "No archive response";
  // Keep all attempts (including reading the response body) inside the route's 60 s budget.
  // fetch throws on network timeouts: these must be retried just like temporary HTTP errors.
  const deadline = Date.now() + 50000;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) break;
    try {
      const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(Math.min(15000, remaining)) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.text();
      const header = body.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const required = ["dataproduct_subtype", "access_url", "obs_id", "energy_bandpassname", "s_region", "s_ra", "s_dec", "t_min", "t_exptime"];
      // A proxy can return an HTML error page with status 200. Never call that an empty sky.
      if (required.some((column) => !header.includes(column))) throw new Error("The archive returned an invalid image list");
      text = body;
      break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    const delay = 750 * (attempt + 1);
    if (attempt < 2 && Date.now() + delay < deadline) await new Promise((res) => setTimeout(res, delay));
  }
  if (!text) throw new Error(`NASA/IPAC's photo search is temporarily unavailable (${lastError}). Please try again.`);
  const rows = parseCsv(text).filter((r) => r.dataproduct_subtype === "science" && r.access_url);
  const out: Observation[] = [];
  for (const r of rows) {
    const det = parseInt(r.energy_bandpassname.slice(-1), 10);
    const nums = r.s_region.split(/\s+/).slice(2).map(Number);
    if (nums.length < 8 || !Number.isFinite(det)) continue;
    const ra0 = Number(r.s_ra),
      dec0 = Number(r.s_dec);
    const src: [number, number][] = [];
    for (let k = 0; k < 4; k++) src.push(tanProject(nums[2 * k], nums[2 * k + 1], ra0, dec0));
    const H = homography(src, CORNERS);
    const [x, y] = H(...tanProject(ra, dec, ra0, dec0));
    const inside = x >= margin && y >= margin && x <= 2039 - margin && y <= 2039 - margin;
    const { wl, bw } = detectorWave(det, Math.min(2039, Math.max(0, x)), Math.min(2039, Math.max(0, y)));
    const mjd = Number(r.t_min);
    out.push({
      obsid: r.obs_id,
      detector: det,
      url: r.access_url,
      mjd,
      date: mjdToIso(mjd),
      exptime: Number(r.t_exptime),
      estX: x,
      estY: y,
      inside,
      wl,
      bw,
    });
  }
  return out.sort((a, b) => a.mjd - b.mjd || a.detector - b.detector);
}
