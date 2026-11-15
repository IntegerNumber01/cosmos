// Client-side sequence engine: matched-wavelength selection, reprojection for DISPLAY, change finding,
// and native-grid measurements. Scientific rules:
//  * frames are only compared when same detector AND every pair agrees within 0.5 × bandwidth at the
//    target (members within ±0.25 × bandwidth of the set's reference wavelength);
//  * measurements (photometry, centroids) use each frame's NATIVE pixels and its own WCS;
//  * change maps use a common valid-pixel mask and an EMPIRICAL noise scale (robust scatter of the
//    difference image), because resampling correlates noise and nominal variances are not calibrated.
import { REJECT_FLAGS } from "./fits";
import { CutoutMeta, unpack } from "./cutout";
import { pix2sky, sky2pix, tanDeproject, tanProject, waveAt } from "./wcs";

export type Observation = {
  obsid: string;
  detector: number;
  url: string;
  mjd: number;
  date: string;
  exptime: number;
  inside: boolean;
  wl: number;
  bw: number;
};

export type MatchedSet = {
  key: string;
  detector: number;
  lambdaRef: number;
  bandwidth: number;
  frames: Observation[]; // one per visit (distinct day), closest wavelength to the reference
  nDays: number;
  spanDays: number;
};

export type Frame = {
  meta: CutoutMeta;
  image: Float32Array;
  flags: Int32Array;
  variance: Float32Array;
  valid: Uint8Array; // 1 = pixel usable (no reject flags, finite)
  outlier: Uint8Array; // 1 = OUTLIER flag (reported, not rejected)
};

export function decodeFrame(buf: ArrayBuffer): Frame {
  const { meta, image, flags, variance } = unpack(buf);
  let reject = 0;
  let out = 0;
  for (const f of meta.flags) {
    if (REJECT_FLAGS.includes(f.name)) reject |= f.mask;
    if (f.name === "OUTLIER") out |= f.mask;
  }
  const n = image.length;
  const valid = new Uint8Array(n);
  const outlier = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    valid[i] = (flags[i] & reject) === 0 && Number.isFinite(image[i]) && Number.isFinite(variance[i]) ? 1 : 0;
    outlier[i] = flags[i] & out ? 1 : 0;
  }
  return { meta, image, flags, variance, valid, outlier };
}

/** Wavelength-matched sets: same detector, all members within ±0.25·bw of the reference (so any two
 * frames differ by ≤ 0.5·bw), one frame per day. */
export const MATCH_TOL = 0.25; // half-width of the allowed window, in channel bandwidths (window = 0.5 bw)

/** One frame per day inside a wavelength window [lo, lo + 0.5·bw] on one detector. */
function windowSet(frames: Observation[], det: number, lo: number, bw: number, prefer?: Observation): Observation[] {
  const hi = lo + 2 * MATCH_TOL * bw;
  const c = (lo + hi) / 2;
  const byDay = new Map<number, Observation>();
  for (const m of frames) {
    if (m.detector !== det || m.wl < lo - 1e-9 || m.wl > hi + 1e-9) continue;
    const day = Math.floor(m.mjd);
    const cur = byDay.get(day);
    if (prefer && cur === prefer) continue;
    if (!cur || m === prefer || Math.abs(m.wl - c) < Math.abs(cur.wl - c)) byDay.set(day, m);
  }
  return [...byDay.values()].sort((a, b) => a.mjd - b.mjd);
}

/** Best matched set containing a given frame: the 0.5·bw window (containing it) with the most dates. */
export function setContaining(obs: Observation[], ref: Observation): MatchedSet {
  const inside = obs.filter((o) => o.inside);
  const bw = ref.bw;
  let best: Observation[] = [ref];
  // candidate window lower edges: every frame wavelength within half a bandwidth below the reference
  const edges = inside.filter((o) => o.detector === ref.detector && o.wl <= ref.wl && o.wl >= ref.wl - 2 * MATCH_TOL * bw).map((o) => o.wl);
  for (const lo of edges) {
    const f = windowSet(inside, ref.detector, lo, bw, ref);
    if (f.includes(ref) && (f.length > best.length || (f.length === best.length && span(f) > span(best)))) best = f;
  }
  return mk(ref.detector, best, bw, `pick:${ref.obsid}:${ref.detector}`);
}

const span = (f: Observation[]) => (f.length ? f[f.length - 1].mjd - f[0].mjd : 0);
const mk = (det: number, frames: Observation[], bw: number, key: string): MatchedSet => ({
  key,
  detector: det,
  lambdaRef: frames.reduce((a, f) => a + f.wl, 0) / Math.max(1, frames.length),
  bandwidth: bw,
  frames,
  nDays: frames.length,
  spanDays: span(frames),
});

/** Wavelength-matched sets: same detector, every pair of frames within half a channel bandwidth (a 0.5·bw
 * window), one frame per day. Windows are tried at every frame's wavelength as the lower edge. */
export function matchedSets(obs: Observation[], max = 8): MatchedSet[] {
  const inside = obs.filter((o) => o.inside);
  const sets: MatchedSet[] = [];
  const seen = new Set<string>();
  for (const ref of inside) {
    const frames = windowSet(inside, ref.detector, ref.wl, ref.bw);
    if (frames.length < 2) continue;
    const key = `D${ref.detector}:` + frames.map((f) => f.obsid).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    sets.push(mk(ref.detector, frames, ref.bw, key));
  }
  // prefer more distinct dates, then a longer time baseline; drop overlapping windows
  sets.sort((a, b) => b.nDays - a.nDays || b.spanDays - a.spanDays);
  const out: MatchedSet[] = [];
  for (const s of sets) {
    const dup = out.some((o) => o.detector === s.detector && Math.abs(o.lambdaRef - s.lambdaRef) < 0.5 * s.bandwidth);
    if (!dup) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Keep the largest subset whose EXACT wavelengths all lie within half a bandwidth of each other. */
export function exactWindow<T>(items: T[], wl: (t: T) => number, bw: number): { keep: T[]; drop: T[] } {
  const sorted = [...items].sort((a, b) => wl(a) - wl(b));
  let best: T[] = sorted.slice(0, 1);
  for (let i = 0; i < sorted.length; i++) {
    const w: T[] = [];
    for (let j = i; j < sorted.length && wl(sorted[j]) - wl(sorted[i]) <= 2 * MATCH_TOL * bw + 1e-9; j++) w.push(sorted[j]);
    if (w.length > best.length) best = w;
  }
  return { keep: items.filter((x) => best.includes(x)), drop: items.filter((x) => !best.includes(x)) };
}

export type Grid = { n: number; ra: number; dec: number; pixDeg: number };

export function makeGrid(ra: number, dec: number, sizeDeg: number, pixArcsec = 6.15): Grid {
  return { n: Math.max(16, Math.round((sizeDeg * 3600) / pixArcsec)), ra, dec, pixDeg: pixArcsec / 3600 };
}

/** Grid pixel (i right, j up; 0-based centres) -> sky. North up, east left. */
export function gridToSky(g: Grid, i: number, j: number): [number, number] {
  const c = (g.n - 1) / 2;
  return tanDeproject(-(i - c) * g.pixDeg, (j - c) * g.pixDeg, g.ra, g.dec);
}
export function skyToGrid(g: Grid, ra: number, dec: number): [number, number] {
  const c = (g.n - 1) / 2;
  const [xi, eta] = tanProject(ra, dec, g.ra, g.dec);
  return [c - xi / g.pixDeg, c + eta / g.pixDeg];
}

/** Bilinear reprojection for DISPLAY and change maps. NaN where any contributing pixel is invalid. */
export function reproject(f: Frame, g: Grid, bg = 0): Float32Array {
  const { nx, ny, wcs } = f.meta;
  const out = new Float32Array(g.n * g.n).fill(NaN);
  for (let j = 0; j < g.n; j++)
    for (let i = 0; i < g.n; i++) {
      const [ra, dec] = gridToSky(g, i, j);
      const [x, y] = sky2pix(wcs, ra, dec);
      const x0 = Math.floor(x),
        y0 = Math.floor(y);
      if (x0 < 0 || y0 < 0 || x0 + 1 >= nx || y0 + 1 >= ny) continue;
      const k = y0 * nx + x0;
      if (!f.valid[k] || !f.valid[k + 1] || !f.valid[k + nx] || !f.valid[k + nx + 1]) continue;
      const tx = x - x0,
        ty = y - y0;
      out[j * g.n + i] =
        f.image[k] * (1 - tx) * (1 - ty) + f.image[k + 1] * tx * (1 - ty) + f.image[k + nx] * (1 - tx) * ty + f.image[k + nx + 1] * tx * ty - bg;
    }
  return out;
}

export function median(a: ArrayLike<number>) {
  const v = Array.from(a).filter(Number.isFinite).sort((x, y) => x - y);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export function robustSigma(a: ArrayLike<number>) {
  const m = median(a);
  const dev = Array.from(a)
    .filter(Number.isFinite)
    .map((x) => Math.abs(x - m));
  return 1.4826 * median(dev);
}

/** Sky level of a frame: median of valid native pixels. */
export function skyLevel(f: Frame) {
  const v: number[] = [];
  for (let i = 0; i < f.image.length; i++) if (f.valid[i]) v.push(f.image[i]);
  return { level: median(v), sigma: robustSigma(v) };
}

export type Candidate = {
  id: number;
  kind: "brightened" | "faded" | "moved" | "residual" | "unmatched";
  dLambdaBw?: number; // |Δλ| between the two dates AT this position, in channel bandwidths
  x: number;
  y: number;
  ra: number;
  dec: number;
  peakZ: number;
  npix: number;
  partner?: { x: number; y: number; ra: number; dec: number; sepArcsec: number };
  note: string;
};

export type ChangeMap = { z: Float32Array; sigma: number; validFrac: number; candidates: Candidate[] };

/**
 * Change map between two wavelength-matched frames on a common grid: D = after - before over the
 * COMMON valid pixels; Z = D / σ_emp with σ_emp = 1.4826·MAD(D) (empirical, indicative only).
 */
export function findChanges(before: Float32Array, after: Float32Array, g: Grid, thresh = 5): ChangeMap {
  const n = g.n;
  const D = new Float32Array(n * n).fill(NaN);
  let nv = 0;
  for (let k = 0; k < n * n; k++)
    if (Number.isFinite(before[k]) && Number.isFinite(after[k])) {
      D[k] = after[k] - before[k];
      nv++;
    }
  // remove a robust plane: the zodiacal-light level AND gradient differ between seasons
  let keep = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) keep[k] = Number.isFinite(D[k]) ? 1 : 0;
  let pa = 0,
    pb = 0,
    pc = 0;
  for (let it = 0; it < 4; it++) {
    // least squares D ~ pa + pb*i + pc*j over kept pixels
    let s1 = 0, si = 0, sj = 0, sii = 0, sjj = 0, sij = 0, sd = 0, sdi = 0, sdj = 0;
    for (let k = 0; k < n * n; k++) {
      if (!keep[k]) continue;
      const i = k % n,
        j = (k / n) | 0,
        d = D[k];
      s1++; si += i; sj += j; sii += i * i; sjj += j * j; sij += i * j; sd += d; sdi += d * i; sdj += d * j;
    }
    const M = [
      [s1, si, sj],
      [si, sii, sij],
      [sj, sij, sjj],
    ];
    const v = [sd, sdi, sdj];
    const det3 = (m: number[][]) =>
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const dM = det3(M);
    if (!Number.isFinite(dM) || Math.abs(dM) < 1e-9) break;
    const col = (c: number) => M.map((row, r) => row.map((x, k2) => (k2 === c ? v[r] : x)));
    pa = det3(col(0)) / dM;
    pb = det3(col(1)) / dM;
    pc = det3(col(2)) / dM;
    const res: number[] = [];
    for (let k = 0; k < n * n; k++) if (Number.isFinite(D[k])) res.push(D[k] - (pa + pb * (k % n) + pc * ((k / n) | 0)));
    const rs = robustSigma(res);
    const rm = median(res);
    const nk = new Uint8Array(n * n);
    for (let k = 0; k < n * n; k++)
      if (Number.isFinite(D[k]) && Math.abs(D[k] - (pa + pb * (k % n) + pc * ((k / n) | 0)) - rm) < 3 * rs) nk[k] = 1;
    keep = nk;
  }
  for (let k = 0; k < n * n; k++) if (Number.isFinite(D[k])) D[k] -= pa + pb * (k % n) + pc * ((k / n) | 0);
  const sigma = robustSigma(D);
  const z = new Float32Array(n * n).fill(NaN);
  for (let k = 0; k < n * n; k++) if (Number.isFinite(D[k])) z[k] = D[k] / sigma;
  // pixels within 5 px of a pixel that is unusable on either date (e.g. a saturated core)
  const nearMask = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) {
    if (Number.isFinite(D[k])) continue;
    const ki = k % n,
      kj = (k / n) | 0;
    for (let dj = -5; dj <= 5; dj++)
      for (let di = -5; di <= 5; di++) {
        const ii = ki + di,
          jj = kj + dj;
        if (ii >= 0 && jj >= 0 && ii < n && jj < n) nearMask[jj * n + ii] = 1;
      }
  }
  const refSig = robustSigma(before);
  const refMed = median(before);
  // connected components of |Z| ≥ thresh with consistent sign (8-connectivity)
  const lab = new Int32Array(n * n);
  const comps: { sign: number; px: number[] }[] = [];
  for (let k = 0; k < n * n; k++) {
    if (lab[k] || !(Math.abs(z[k]) >= thresh)) continue;
    const sign = Math.sign(z[k]);
    const id = comps.length + 1;
    const stack = [k];
    const px: number[] = [];
    lab[k] = id;
    while (stack.length) {
      const q = stack.pop()!;
      px.push(q);
      const qi = q % n,
        qj = (q / n) | 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = qi + di,
            jj = qj + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const r = jj * n + ii;
          if (!lab[r] && Math.abs(z[r]) >= thresh && Math.sign(z[r]) === sign) {
            lab[r] = id;
            stack.push(r);
          }
        }
    }
    comps.push({ sign, px });
  }
  type C = { sign: number; x: number; y: number; peak: number; npix: number; refPeak: number; sumZ: number; px: number; py: number; nearMaskFrac: number; bothPeak: number };
  const cs: C[] = comps
    .filter((c) => c.px.length >= 3)
    .map((c) => {
      let sw = 0,
        sx = 0,
        sy = 0,
        peak = 0,
        pk = c.px[0],
        refPeak = -Infinity,
        bothPeak = -Infinity,
        nNear = 0;
      for (const q of c.px) {
        const w = Math.abs(z[q]);
        sw += w;
        sx += w * (q % n);
        sy += w * ((q / n) | 0);
        if (w > Math.abs(peak)) {
          peak = z[q];
          pk = q;
        }
        if (nearMask[q]) nNear++;
        if (Number.isFinite(before[q]) && Number.isFinite(after[q]))
          bothPeak = Math.max(bothPeak, Math.min((before[q] - refMed) / refSig, (after[q] - refMed) / refSig));
        if (Number.isFinite(before[q])) refPeak = Math.max(refPeak, (before[q] - refMed) / refSig);
        if (Number.isFinite(after[q])) refPeak = Math.max(refPeak, (after[q] - refMed) / refSig);
      }
      // extended changes (e.g. a coma with a tail) are located at their peak, not their centroid
      const ext = c.px.length > 60;
      return {
        sign: c.sign,
        x: ext ? pk % n : sx / sw,
        y: ext ? (pk / n) | 0 : sy / sw,
        peak,
        npix: c.px.length,
        refPeak,
        sumZ: sw,
        px: pk % n,
        py: (pk / n) | 0,
        nearMaskFrac: nNear / c.px.length,
        bothPeak,
      };
    });
  const used = new Set<number>();
  const out: Candidate[] = [];
  const toSky = (x: number, y: number) => gridToSky(g, x, y);
  cs.forEach((c, ic) => {
    // a star's halo is bright on BOTH dates; a comet or transient is bright on only one
    if (c.nearMaskFrac >= 0.2 && c.bothPeak > 15) {
      used.add(ic);
      const [ra, dec] = toSky(c.x, c.y);
      out.push({
        id: 0,
        kind: "residual",
        x: c.x,
        y: c.y,
        ra,
        dec,
        peakZ: Math.abs(c.peak),
        npix: c.npix,
        note: "Hugs the flagged (usually saturated) core of a bright star. The star's halo changed between dates, from its own motion and/or point-spread differences. Not a separate object.",
      });
    }
  });
  // pair opposite-sign components: a source that MOVED leaves a faded spot and a brightened spot
  cs.forEach((a, ia) => {
    if (used.has(ia) || a.sign > 0) return;
    let best = -1,
      bestD = Infinity;
    cs.forEach((b, ib) => {
      if (ib === ia || used.has(ib) || b.sign < 0) return;
      // a moving source leaves two spots of similar size and strength
      const sizeRatio = Math.max(a.npix, b.npix) / Math.min(a.npix, b.npix);
      const strengthRatio = Math.max(a.sumZ, b.sumZ) / Math.min(a.sumZ, b.sumZ);
      if (sizeRatio > 3 || strengthRatio > 3) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < bestD) {
        bestD = d;
        best = ib;
      }
    });
    if (best >= 0 && bestD <= 20) {
      const b = cs[best];
      const [ra, dec] = toSky(b.x, b.y);
      const [pra, pdec] = toSky(a.x, a.y);
      used.add(ia);
      used.add(best);
      // < 1.5 px around a bright source: most likely imperfect subtraction of a star (PSF / sub-pixel)
      const residual = bestD < 1.5 && Math.max(a.refPeak, b.refPeak) > 30;
      out.push({
        id: out.length + 1,
        kind: residual ? "residual" : "moved",
        x: b.x,
        y: b.y,
        ra,
        dec,
        peakZ: Math.max(Math.abs(a.peak), Math.abs(b.peak)),
        npix: a.npix + b.npix,
        partner: { x: a.x, y: a.y, ra: pra, dec: pdec, sepArcsec: bestD * g.pixDeg * 3600 },
        note: residual
          ? "Faded/brightened pair right on top of a bright star. Most likely imperfect subtraction (point-spread or sub-pixel differences), not real motion."
          : `Faded at one spot and brightened ${(bestD * g.pixDeg * 3600).toFixed(0)}″ away: what a moving source would leave. Check it against catalogues.`,
      });
    }
  });
  cs.forEach((c, ic) => {
    if (used.has(ic)) return;
    const [ra, dec] = toSky(c.x, c.y);
    const residual = c.refPeak > 80 && c.npix < 6;
    const extended = c.npix > 60;
    const areaArcmin2 = (c.npix * (g.pixDeg * 60) ** 2).toFixed(1);
    out.push({
      id: out.length + 1,
      kind: residual ? "residual" : c.sign > 0 ? "brightened" : "faded",
      x: c.x,
      y: c.y,
      ra,
      dec,
      peakZ: Math.abs(c.peak),
      npix: c.npix,
      note: residual
        ? "Small change on a very bright star. Often a subtraction residual or saturation, so treat with caution."
        : extended
          ? `Large, extended change (about ${areaArcmin2} arcmin²) that is ${c.sign > 0 ? "brighter" : "fainter"} on the later date. A diffuse object such as a comet's coma, or a background-level difference.`
          : c.sign > 0
            ? "Brighter on the later date at a matched wavelength."
            : "Fainter on the later date at a matched wavelength.",
    });
  });
  out.sort((a, b) => (a.kind === "residual" ? 1 : 0) - (b.kind === "residual" ? 1 : 0) || b.peakZ * Math.sqrt(b.npix) - a.peakZ * Math.sqrt(a.npix));
  out.forEach((c, i) => (c.id = i + 1));
  return { z, sigma, validFrac: nv / (n * n), candidates: out.slice(0, 30) };
}

export type Measurement = {
  bw: number; // channel bandwidth at the measured position (µm)
  coreFlagged: boolean; // a rejected pixel within r <= 1.5 px (same rule as the validation pipeline)
  obsid: string;
  date: string;
  mjd: number;
  wl: number;
  x: number;
  y: number;
  flux: number; // MJy/sr summed over the aperture (background subtracted)
  fluxErrEmp: number; // empirical: scatter of blank-sky apertures in the same frame
  snr: number;
  partial: boolean; // aperture contained rejected pixels
  centroid: { ra: number; dec: number; errArcsec: number } | null;
  flagsHere: string[];
};

/** Native-grid aperture photometry + centroid at a sky position in one frame. */
export function measure(f: Frame, ra: number, dec: number, r = 2.0): Measurement {
  const { nx, ny, wcs } = f.meta;
  const [x, y] = sky2pix(wcs, ra, dec);
  const ap = (cx: number, cy: number) => {
    let s = 0,
      nbad = 0,
      n = 0;
    const ann: number[] = [];
    for (let j = Math.floor(cy - 9); j <= Math.ceil(cy + 9); j++)
      for (let i = Math.floor(cx - 9); i <= Math.ceil(cx + 9); i++) {
        if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
        const d = Math.hypot(i - cx, j - cy);
        const k = j * nx + i;
        if (d <= r) {
          n++;
          if (f.valid[k]) s += f.image[k];
          else nbad++;
        } else if (d >= 5 && d <= 9 && f.valid[k]) ann.push(f.image[k]);
      }
    const bg = median(ann);
    return { flux: s - bg * (n - nbad), nbad, n };
  };
  const main = ap(x, y);
  // validation-pipeline rule: any rejected pixel in the core (r <= 1.5 px) -> no measurement
  let coreBad = 0;
  for (let j = Math.floor(y - 2); j <= Math.ceil(y + 2); j++)
    for (let i = Math.floor(x - 2); i <= Math.ceil(x + 2); i++) {
      if (i < 0 || j < 0 || i >= nx || j >= ny) {
        if (Math.hypot(i - x, j - y) <= 1.5) coreBad++;
        continue;
      }
      if (Math.hypot(i - x, j - y) <= 1.5 && !f.valid[j * nx + i]) coreBad++;
    }
  // too many rejected pixels (saturation, bad pixels): no trustworthy measurement at all
  const unusable = main.n === 0 || coreBad > 0 || main.nbad > 0.3 * main.n;
  // empirical error: blank apertures on a ring of positions away from the target
  const ctrl: number[] = [];
  for (let k = 0; k < 48; k++) {
    const t = (k / 48) * 2 * Math.PI;
    const rr = 12 + (k % 3) * 5;
    const cx = x + rr * Math.cos(t),
      cy = y + rr * Math.sin(t);
    if (cx < 10 || cy < 10 || cx > nx - 11 || cy > ny - 11) continue;
    const a = ap(cx, cy);
    if (a.nbad === 0) ctrl.push(a.flux);
  }
  const fluxErrEmp = ctrl.length >= 8 ? robustSigma(ctrl) : NaN;
  // centroid (flux-weighted, background-subtracted, r = 2.5 px) when the source is significant
  let centroid: Measurement["centroid"] = null;
  const snr = unusable ? NaN : main.flux / fluxErrEmp;
  // centroids only from a fully valid aperture (no rejected pixels at all), as in the validation pipeline
  if (Number.isFinite(snr) && snr > 8 && main.nbad === 0) {
    let cx = x,
      cy = y;
    for (let it = 0; it < 5; it++) {
      let sw = 0,
        sxx = 0,
        syy = 0;
      const ann: number[] = [];
      for (let j = Math.floor(cy - 8); j <= Math.ceil(cy + 8); j++)
        for (let i = Math.floor(cx - 8); i <= Math.ceil(cx + 8); i++) {
          if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
          const d = Math.hypot(i - cx, j - cy);
          if (d >= 5 && d <= 8 && f.valid[j * nx + i]) ann.push(f.image[j * nx + i]);
        }
      const bg = median(ann);
      for (let j = Math.floor(cy - 3); j <= Math.ceil(cy + 3); j++)
        for (let i = Math.floor(cx - 3); i <= Math.ceil(cx + 3); i++) {
          if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
          const k = j * nx + i;
          if (Math.hypot(i - cx, j - cy) > 2.5 || !f.valid[k]) continue;
          const w = Math.max(0, f.image[k] - bg);
          sw += w;
          sxx += w * i;
          syy += w * j;
        }
      if (sw <= 0) break;
      cx = sxx / sw;
      cy = syy / sw;
    }
    let badNearCentre = 0;
    for (let j = Math.floor(cy - 3); j <= Math.ceil(cy + 3); j++)
      for (let i = Math.floor(cx - 3); i <= Math.ceil(cx + 3); i++)
        if (i >= 0 && j >= 0 && i < nx && j < ny && Math.hypot(i - cx, j - cy) <= 2.5 && !f.valid[j * nx + i]) badNearCentre++;
    const [cra, cdec] = pix2sky(wcs, cx, cy);
    // precision: S/N term (PSF sigma ~1.2 px / S/N) plus a 0.5" allowance for date-to-date alignment
    // (field-star shifts between SPHEREx dates measured at 0.25-0.8" in our SWAN analysis)
    centroid = badNearCentre ? null : { ra: cra, dec: cdec, errArcsec: Math.hypot((1.2 * 6.15) / snr, 0.5) };
  }
  const xi = Math.round(x),
    yi = Math.round(y);
  let present = 0;
  for (let j = yi - 2; j <= yi + 2; j++)
    for (let i = xi - 2; i <= xi + 2; i++) if (i >= 0 && j >= 0 && i < nx && j < ny) present |= f.flags[j * nx + i];
  return {
    obsid: f.meta.obsid,
    date: f.meta.dateAvg,
    mjd: f.meta.mjdAvg,
    // wavelength at THIS position (the filter changes across the detector, so it differs from the target's)
    wl: waveAt(f.meta.detector, x, y, f.meta.crpixW).wl,
    bw: waveAt(f.meta.detector, x, y, f.meta.crpixW).bw,
    coreFlagged: coreBad > 0,
    x,
    y,
    flux: unusable ? NaN : main.flux,
    fluxErrEmp,
    snr,
    partial: main.nbad > 0,
    centroid,
    flagsHere: f.meta.flags.filter((d) => present & d.mask).map((d) => d.name),
  };
}

/** Exact wavelength of a frame at an arbitrary sky position (header WCS + WCS-WAVE). */
export { sky2pix };
