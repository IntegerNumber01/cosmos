import { Frame, Grid, gridToSky, median, reproject, robustSigma, skyLevel } from "./sequence";
import { sky2pix, waveAt } from "./wcs";
import { propagate } from "./astrometry";
import type { MotionTarget } from "./motion";

export type TrackedStack = { data: Float32Array; count: Uint16Array; frames: number; minWave: Float32Array; maxWave: Float32Array };

/** Exploratory, equal-exposure mean following a SPECIFIED trajectory; no motion search.
 * Evaluate wavelength/flags at the actual sampled native location for every output pixel.
 * All inputs remain unmodified. No interpolated variance is treated as a probability.
 */
export function stackAlongTrack(frames: Frame[], grid: Grid, target: MotionTarget): TrackedStack {
  if (!frames.length || new Set(frames.map((f) => f.meta.detector)).size !== 1) throw new Error("Tracking stacks need at least one exposure from one detector.");
  if (!target.pm || target.epochYear === undefined || ![...target.pm, target.epochYear].every(Number.isFinite)) throw new Error("Specify a finite east/north motion and its reference epoch.");
  const epoch = 51544.5 + (target.epochYear - 2000) * 365.25, n = grid.n * grid.n;
  const sums = new Float64Array(n), count = new Uint16Array(n), minWave = new Float32Array(n).fill(Infinity), maxWave = new Float32Array(n).fill(-Infinity), bw = new Float32Array(n).fill(Infinity);
  const seen = new Set<string>();
  for (const f of frames) {
    const key = `${f.meta.obsid}D${f.meta.detector}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = propagate(target.ra, target.dec, ...target.pm, epoch, f.meta.mjdAvg, target.parallaxMas ?? 0);
    if (!p) throw new Error("The trajectory cannot be evaluated at this observation date.");
    const sampling = { ...grid, ra: p[0], dec: p[1] }, image = reproject(f, sampling, skyLevel(f).level);
    for (let j = 0; j < grid.n; j++) for (let i = 0; i < grid.n; i++) {
      const k = j * grid.n + i;
      if (!Number.isFinite(image[k])) continue;
      const [x, y] = sky2pix(f.meta.wcs, ...gridToSky(sampling, i, j)), w = waveAt(f.meta.detector, x, y, f.meta.crpixW);
      if (!Number.isFinite(w.wl) || !(w.bw > 0)) continue;
      sums[k] += image[k]; count[k]++; minWave[k] = Math.min(minWave[k], w.wl); maxWave[k] = Math.max(maxWave[k], w.wl); bw[k] = Math.min(bw[k], w.bw);
    }
  }
  const data = new Float32Array(n).fill(NaN);
  for (let k = 0; k < n; k++) if (count[k] && maxWave[k] - minWave[k] <= 0.5 * bw[k]) data[k] = sums[k] / count[k]; else count[k] = 0;
  return { data, count, frames: seen.size, minWave, maxWave };
}

/** Fixed central aperture versus blank apertures on the DISPLAY grid. Indicative only. */
export function stackNoise(data: Float32Array, n: number): { flux: number; noise: number; ratio: number; controls: number } | null {
  const aperture = (x: number, y: number) => {
    const inner: number[] = [], annulus: number[] = [];
    for (let j = Math.floor(y - 8); j <= Math.ceil(y + 8); j++) for (let i = Math.floor(x - 8); i <= Math.ceil(x + 8); i++) {
      const d = Math.hypot(i - x, j - y), v = i >= 0 && j >= 0 && i < n && j < n ? data[j * n + i] : NaN;
      if (d <= 2) { if (!Number.isFinite(v)) return NaN; inner.push(v); }
      else if (d >= 5 && d <= 8 && Number.isFinite(v)) annulus.push(v);
    }
    return annulus.length >= 20 ? inner.reduce((a, b) => a + b, 0) - median(annulus) * inner.length : NaN;
  };
  const c = (n - 1) / 2, flux = aperture(c, c), controls: number[] = [];
  for (let k = 0; k < 48; k++) { const a = k * Math.PI / 24, r = 12 + (k % 3) * 5, f = aperture(c + r * Math.cos(a), c + r * Math.sin(a)); if (Number.isFinite(f)) controls.push(f); }
  const noise = robustSigma(controls);
  return Number.isFinite(flux) && controls.length >= 12 && noise > 0 ? { flux, noise, ratio: flux / noise, controls: controls.length } : null;
}
