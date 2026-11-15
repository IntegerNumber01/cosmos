import { BLANK_FRAMES, WAVELENGTHS_UM } from "../spherex";
import { Frame, Grid, gridToSky, measure, Observation, reproject, skyLevel } from "./sequence";
import { pix2sky, sky2pix, tanProject, waveAt } from "./wcs";

/** Nearest nominal channel on the actual detector. Dichroic gaps are never filled/interpolated. */
export function spectralChannel(detector: number, wavelength: number): number | null {
  if (!Number.isInteger(detector) || detector < 1 || detector > 6 || !Number.isFinite(wavelength)) return null;
  const first = (detector - 1) * 17;
  let best = first;
  for (let i = first + 1; i < first + 17; i++) if (Math.abs(WAVELENGTHS_UM[i] - wavelength) < Math.abs(WAVELENGTHS_UM[best] - wavelength)) best = i;
  const spacing = best === first ? WAVELENGTHS_UM[first + 1] - WAVELENGTHS_UM[first] : WAVELENGTHS_UM[best] - WAVELENGTHS_UM[best - 1];
  return BLANK_FRAMES.has(best) || Math.abs(WAVELENGTHS_UM[best] - wavelength) > spacing * 0.65 ? null : best;
}

/** Bounded on-demand sampling: one exposure nearest each nominal channel in the selected date range. */
export function spectralSample(observations: Observation[], detector?: number): Observation[] {
  const channels = new Map<number, Observation>();
  for (const o of observations) {
    if (!o.inside || (detector && o.detector !== detector)) continue;
    const c = spectralChannel(o.detector, o.wl);
    if (c === null) continue;
    const old = channels.get(c);
    if (!old || Math.abs(o.wl - WAVELENGTHS_UM[c]) < Math.abs(old.wl - WAVELENGTHS_UM[c])) channels.set(c, o);
  }
  return [...channels.entries()].sort((a, b) => a[0] - b[0]).map(([, o]) => o);
}

export type SpectrumPoint = {
  detector: number; obsid: string; date: string; wavelength: number; bandwidth: number;
  fluxMjy: number | null; errorMjy: number | null; flags: string[]; reason: string; source: string;
};
export type SpectralPosition = { ra: number; dec: number; pm?: [number, number]; epochYear?: number };
export function positionAt(t: SpectralPosition, mjd: number): [number, number] {
  if (!t.pm || t.epochYear === undefined) return [t.ra, t.dec];
  const dt = (mjd - (51544.5 + (t.epochYear - 2000) * 365.25)) / 365.25;
  return [t.ra + t.pm[0] * dt / 3.6e6 / Math.cos(t.dec * Math.PI / 180), t.dec + t.pm[1] * dt / 3.6e6];
}

export function spectrumPoint(f: Frame, at: SpectralPosition): SpectrumPoint {
  const [ra, dec] = positionAt(at, f.meta.mjdAvg);
  const m = measure(f, ra, dec);
  // Local pixel solid angle from the full TAN-SIP WCS, not the nominal mission pixel size.
  const [x, y] = sky2pix(f.meta.wcs, ra, dec);
  const [r0, d0] = pix2sky(f.meta.wcs, x, y);
  const a = tanProject(...pix2sky(f.meta.wcs, x + 0.5, y), r0, d0);
  const b = tanProject(...pix2sky(f.meta.wcs, x - 0.5, y), r0, d0);
  const c = tanProject(...pix2sky(f.meta.wcs, x, y + 0.5), r0, d0);
  const d = tanProject(...pix2sky(f.meta.wcs, x, y - 0.5), r0, d0);
  const solidAngle = Math.abs((a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0])) * (Math.PI / 180) ** 2;
  const scale = solidAngle * 1e9; // MJy/sr × sr × 1e9 = mJy
  const unitsOK = f.meta.bunit.replace(/\s/g, "").toLowerCase() === "mjy/sr";
  const reason = !unitsOK ? `Unsupported brightness unit: ${f.meta.bunit}` : m.coreFlagged ? "Unusable source core" : m.partial ? "Incomplete aperture" :
    !Number.isFinite(m.flux) || !Number.isFinite(m.fluxErrEmp) || !(m.fluxErrEmp > 0) ? "Insufficient usable pixels or blank-sky controls" : "";
  return { detector: f.meta.detector, obsid: f.meta.obsid, date: f.meta.dateAvg, wavelength: m.wl, bandwidth: m.bw,
    fluxMjy: reason ? null : m.flux * scale, errorMjy: reason ? null : m.fluxErrEmp * scale, flags: m.flagsHere, reason, source: f.meta.sourceFits };
}

export type BroadBand = { detector: number; data: Float32Array; channels: Uint8Array; available: number; expected: number; frames: Frame[] };
/** Equal-channel mean of background-subtracted surface brightness. Repeated exposures first share
 * ONE channel weight. The exact channel is evaluated per pixel, because LVF wavelength varies spatially.
 * This is a static-sky, possibly multi-epoch preview, never a temporal comparison or integrated band flux.
 */
export function broadBand(frames: Frame[], grid: Grid, detector: number): BroadBand {
  const input = frames.filter((f) => f.meta.detector === detector);
  const n = grid.n * grid.n;
  const sum = Array.from({ length: 17 }, () => new Float64Array(n));
  const hits = Array.from({ length: 17 }, () => new Uint16Array(n));
  const first = (detector - 1) * 17;
  const available = new Set<number>();
  for (const f of input) {
    const image = reproject(f, grid, skyLevel(f).level);
    const centreChannel = spectralChannel(detector, f.meta.target.wl);
    if (centreChannel !== null) available.add(centreChannel);
    for (let j = 0; j < grid.n; j++) for (let i = 0; i < grid.n; i++) {
      const k = j * grid.n + i;
      if (!Number.isFinite(image[k])) continue;
      const [ra, dec] = gridToSky(grid, i, j);
      const [x, y] = sky2pix(f.meta.wcs, ra, dec);
      const channel = spectralChannel(detector, waveAt(detector, x, y, f.meta.crpixW).wl);
      if (channel === null) continue;
      sum[channel - first][k] += image[k]; hits[channel - first][k]++;
    }
  }
  const data = new Float32Array(n).fill(NaN), channels = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    let total = 0;
    for (let c = 0; c < 17; c++) if (hits[c][k]) { total += sum[c][k] / hits[c][k]; channels[k]++; }
    if (channels[k]) data[k] = total / channels[k];
  }
  return { detector, data, channels, available: available.size, expected: 17 - [...BLANK_FRAMES].filter((c) => c >= first && c < first + 17).length, frames: input };
}

const csvCell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export function spectrumCsv(points: SpectrumPoint[]) {
  const header = ["detector", "obsid", "date_utc", "wavelength_um", "bandwidth_um", "aperture_flux_mJy", "empirical_error_mJy", "flags", "unusable_reason", "source_fits"];
  return [header.join(","), ...points.map((p) => [p.detector, p.obsid, p.date, p.wavelength, p.bandwidth, p.fluxMjy, p.errorMjy, p.flags.join(";"), p.reason, p.source].map(csvCell).join(","))].join("\r\n");
}
