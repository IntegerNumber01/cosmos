import { Frame, Grid, gridToSky, reproject, skyLevel } from "./sequence";
import { sky2pix, waveAt } from "./wcs";

export type Visit = { indices: number[]; start: number; end: number };
/** A visit has a bounded TOTAL duration, so a chain of nearby exposures cannot bridge whole seasons. */
export function visits(frames: Frame[], minutes = 30): Visit[] {
  const out: Visit[] = [];
  for (const { f, i } of frames.map((f, i) => ({ f, i })).sort((a, b) => a.f.meta.mjdAvg - b.f.meta.mjdAvg)) {
    const t = f.meta.mjdAvg;
    const last = out[out.length - 1];
    if (last && (t - last.start) * 1440 <= minutes + 1e-7) { last.indices.push(i); last.end = t; }
    else out.push({ indices: [i], start: t, end: t });
  }
  return out;
}

export type Stack = {
  data: Float32Array;
  count: Uint16Array;
  minWave: Float32Array;
  maxWave: Float32Array;
  bandwidth: Float32Array;
  frames: Frame[];
};

/** Equal-exposure, sky-aligned MEAN in MJy/sr, not a native-grid photometric measurement.
 * Invalid pixels never contribute. The actual wavelength at EACH output pixel is checked.
 * Motion is not removed: a source can smear even within a short visit.
 */
export function stackVisit(frames: Frame[], g: Grid): Stack {
  if (!frames.length || frames.some((f) => f.meta.detector !== frames[0].meta.detector)) throw new Error("A stack needs frames from one detector.");
  const n = g.n * g.n;
  const data = new Float32Array(n).fill(NaN);
  const count = new Uint16Array(n);
  const minWave = new Float32Array(n).fill(Infinity), maxWave = new Float32Array(n).fill(-Infinity);
  const bandwidth = new Float32Array(n).fill(Infinity);
  const sums = new Float64Array(n);
  for (const f of frames) {
    const im = reproject(f, g, skyLevel(f).level);
    for (let j = 0; j < g.n; j++) for (let i = 0; i < g.n; i++) {
      const k = j * g.n + i;
      if (!Number.isFinite(im[k])) continue;
      const [ra, dec] = gridToSky(g, i, j);
      const [x, y] = sky2pix(f.meta.wcs, ra, dec);
      const w = waveAt(f.meta.detector, x, y, f.meta.crpixW);
      if (!Number.isFinite(w.wl) || !(w.bw > 0)) continue;
      sums[k] += im[k]; count[k]++;
      minWave[k] = Math.min(minWave[k], w.wl); maxWave[k] = Math.max(maxWave[k], w.wl);
      bandwidth[k] = Math.min(bandwidth[k], w.bw);
    }
  }
  for (let k = 0; k < n; k++) {
    if (count[k] && maxWave[k] - minWave[k] <= 0.5 * bandwidth[k] + 1e-7) data[k] = sums[k] / count[k];
    else count[k] = 0;
  }
  return { data, count, minWave, maxWave, bandwidth, frames };
}

/** Mask both stacks where their combined passband span is too wide for a temporal comparison. */
export function comparableStacks(a: Stack, b: Stack): [Float32Array, Float32Array] {
  if (a.frames[0].meta.detector !== b.frames[0].meta.detector) throw new Error("Compare the same detector only.");
  const x = a.data.slice(), y = b.data.slice();
  for (let k = 0; k < x.length; k++) {
    const span = Math.max(a.maxWave[k], b.maxWave[k]) - Math.min(a.minWave[k], b.minWave[k]);
    if (!a.count[k] || !b.count[k] || span > 0.5 * Math.min(a.bandwidth[k], b.bandwidth[k]) + 1e-7) x[k] = y[k] = NaN;
  }
  return [x, y];
}

/** A frame pair is matched at the target, but temporal interpretation must also be valid at each
 * field pixel. Mask spectral differences before measuring the difference map's noise or candidates. */
export function temporalInputs(a: Frame, b: Frame, before: Float32Array, after: Float32Array, g: Grid): [Float32Array, Float32Array] {
  if (a.meta.detector !== b.meta.detector) throw new Error("Compare the same detector only.");
  const x = before.slice(), y = after.slice();
  for (let j = 0; j < g.n; j++) for (let i = 0; i < g.n; i++) {
    const k = j * g.n + i;
    if (!Number.isFinite(x[k]) || !Number.isFinite(y[k])) { x[k] = y[k] = NaN; continue; }
    const [ra, dec] = gridToSky(g, i, j);
    const wa = waveAt(a.meta.detector, ...sky2pix(a.meta.wcs, ra, dec), a.meta.crpixW);
    const wb = waveAt(b.meta.detector, ...sky2pix(b.meta.wcs, ra, dec), b.meta.crpixW);
    if (!Number.isFinite(wa.wl) || !Number.isFinite(wb.wl) || Math.abs(wa.wl - wb.wl) > 0.5 * Math.min(wa.bw, wb.bw)) x[k] = y[k] = NaN;
  }
  return [x, y];
}
