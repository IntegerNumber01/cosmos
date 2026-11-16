// Independent implementation inspired by public time-domain workflows; see docs/MOTION.md.
// Native pixels for positions, field stars for alignment, independent visits for fit weights.
import { Frame, Measurement, measure, median, robustSigma } from "./sequence";
import type { FieldStar } from "./photometry";
import { sky2pix } from "./wcs";
import { deltaRA, parallaxOffset, propagate } from "./astrometry";

export type MotionTarget = { ra: number; dec: number; pm?: [number, number]; epochYear?: number; parallaxMas?: number; parallaxSource?: string };
type Reference = { id: string; east: number; north: number; error: number; parallaxKnown: boolean };
export type AlignedPosition = { obsid: string; date: string; mjd: number; east: number; north: number; error: number; alignEast: number; alignNorth: number; alignError: number; references: Reference[] };
export type MotionEpoch = { mjd: number; date: string; east: number; north: number; error: number; frames: number; minRefs: number; parallaxEast: number; parallaxNorth: number };
export type AxisFit = { rate: number; error: number; intercept: number; chi2: number; dof: number; residualRms: number };
export type MotionResult = { ok: false; reason: string; rejected: { obsid: string; reason: string }[] } | {
  ok: true; positions: AlignedPosition[]; epochs: MotionEpoch[]; rejected: { obsid: string; reason: string }[];
  east: AxisFit | null; north: AxisFit | null; baselineDays: number; shift: number; shiftError: number;
  parallaxMas: number | null; parallaxSource: string | null; controls: { sourceId: string; residualShift: number }[];
  caveats: string[]; origin: { ra: number; dec: number; mjd: number };
};

const refPlx = (s: FieldStar) => s.parallax !== undefined && s.parallax !== null && s.parallax > 0 && s.parallax_error !== undefined && s.parallax_error !== null && s.parallax_error > 0 && s.parallax / s.parallax_error >= 5 ? s.parallax : 0;
const clean = (m: Measurement) => m.centroid && !m.coreFlagged && !m.partial && m.snr >= 10 && Number.isFinite(m.fluxErrEmp) && !m.flagsHere.some((f) => ["OVERFLOW", "NONLINEAR", "SUR_ERROR"].includes(f));
const separation = (a: { ra: number; dec: number }, b: { ra: number; dec: number }) => Math.hypot(deltaRA(a.ra, b.ra) * Math.cos(a.dec * Math.PI / 180), a.dec - b.dec) * 3600;

/** Weighted straight line, error inflated by residuals; does not fit a parallax. */
export function fitAxis(points: { t: number; value: number; error: number }[]): AxisFit | null {
  if (points.length < 3 || points.some((p) => ![p.t, p.value, p.error].every(Number.isFinite) || p.error <= 0)) return null;
  const w = points.map((p) => 1 / p.error ** 2), sum = w.reduce((a, b) => a + b, 0);
  const tm = points.reduce((s, p, i) => s + w[i] * p.t, 0) / sum, vm = points.reduce((s, p, i) => s + w[i] * p.value, 0) / sum;
  const denom = points.reduce((s, p, i) => s + w[i] * (p.t - tm) ** 2, 0);
  if (!(denom > 0)) return null;
  const rate = points.reduce((s, p, i) => s + w[i] * (p.t - tm) * (p.value - vm), 0) / denom, intercept = vm - rate * tm;
  const residuals = points.map((p) => p.value - intercept - rate * p.t), dof = points.length - 2;
  const chi2 = residuals.reduce((s, r, i) => s + w[i] * r * r, 0);
  return { rate, intercept, error: Math.sqrt(Math.max(1, chi2 / dof) / denom), chi2, dof, residualRms: Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / points.length) };
}

export function analyseMotion(frames: Frame[], target: MotionTarget, stars: FieldStar[], starsMjd: number): MotionResult {
  const rejected: { obsid: string; reason: string }[] = [], fail = (reason: string): MotionResult => ({ ok: false, reason, rejected });
  if (frames.length < 2) return fail("At least two clean dates are needed.");
  if (new Set(frames.map((f) => f.meta.detector)).size !== 1) return fail("Motion comparisons need one detector and matched wavelengths.");
  const epochMjd = target.epochYear === undefined ? starsMjd : 51544.5 + (target.epochYear - 2000) * 365.25;
  const positions: AlignedPosition[] = [], waves: { wl: number; bw: number }[] = [], seen = new Set<string>();
  const selected = stars.filter((s) => s.g <= 16.5 && !s.variable && Number.isFinite(s.pmra) && Number.isFinite(s.pmdec));
  for (const f of [...frames].sort((a, b) => a.meta.mjdAvg - b.meta.mjdAvg)) {
    const key = `${f.meta.obsid}D${f.meta.detector}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const no = (reason: string) => rejected.push({ obsid: f.meta.obsid, reason });
    const search = propagate(target.ra, target.dec, ...(target.pm ?? [0, 0]), epochMjd, f.meta.mjdAvg);
    if (!search) { no("Position propagation unavailable."); continue; }
    const m = measure(f, ...search);
    if (!clean(m)) { no("Target is faint, flagged, incomplete or saturated."); continue; }
    if (separation(m.centroid!, { ra: search[0], dec: search[1] }) > 6.15) { no("Centroid is more than one native pixel from the requested track; possible neighbor."); continue; }
    // Reject a partially overlapping catalogue neighbour, while allowing unresolved systems <0.5 pixel.
    const projected = selected.map((s) => {
      const p = propagate(s.ra_epoch, s.dec_epoch, s.pmra, s.pmdec, starsMjd, f.meta.mjdAvg, refPlx(s));
      const xy = p ? sky2pix(f.meta.wcs, ...p) : [NaN, NaN];
      return { s, p, x: xy[0], y: xy[1] };
    });
    const targetG = Math.min(...projected.filter((s) => Math.hypot(s.x - m.x, s.y - m.y) < 0.5).map((s) => s.s.g));
    if (projected.some((s) => { const d = Math.hypot(s.x - m.x, s.y - m.y); return d >= 0.5 && d < 3.5 && s.s.g < (Number.isFinite(targetG) ? targetG + 2 : 16.5); })) { no("A comparable neighboring star overlaps the target aperture."); continue; }
    let refs: Reference[] = [];
    for (const s of projected) {
      if (!s.p || s.x < 12 || s.y < 12 || s.x > f.meta.nx - 13 || s.y > f.meta.ny - 13 || Math.hypot(s.x - m.x, s.y - m.y) < 10) continue;
      if (projected.some((o) => o !== s && o.s.g < s.s.g + 2 && Math.hypot(o.x - s.x, o.y - s.y) < 4)) continue;
      const r = measure(f, ...s.p);
      if (!clean(r) || separation(r.centroid!, { ra: s.p[0], dec: s.p[1] }) > 3) continue;
      refs.push({ id: s.s.source_id, east: deltaRA(r.centroid!.ra, s.p[0]) * Math.cos(target.dec * Math.PI / 180) * 3600, north: (r.centroid!.dec - s.p[1]) * 3600, error: r.centroid!.errArcsec, parallaxKnown: refPlx(s.s) > 0 });
    }
    if (refs.length < 3) { no(`Only ${refs.length} clean isolated reference stars; at least three are needed.`); continue; }
    const e = median(refs.map((r) => r.east)), n = median(refs.map((r) => r.north));
    const scale = Math.max(0.15, robustSigma(refs.map((r) => r.east)), robustSigma(refs.map((r) => r.north)));
    refs = refs.filter((r) => Math.hypot(r.east - e, r.north - n) <= 3 * scale);
    if (refs.length < 3) { no("Too few references remain after the alignment outlier check."); continue; }
    const ae = median(refs.map((r) => r.east)), an = median(refs.map((r) => r.north));
    // Keep full reference scatter, not scatter/sqrt(N): centroid/PSF effects can be systematic.
    const referenceNoise = 1.253 * Math.sqrt(refs.reduce((sum, r) => sum + Math.max(0.12 ** 2, r.error ** 2 - 0.5 ** 2), 0)) / refs.length;
    const alignError = Math.max(0.15, referenceNoise, robustSigma(refs.map((r) => r.east)), robustSigma(refs.map((r) => r.north)));
    const stat = Math.max(0.12, Math.sqrt(Math.max(0, m.centroid!.errArcsec ** 2 - 0.5 ** 2)));
    positions.push({ obsid: f.meta.obsid, date: f.meta.dateAvg, mjd: f.meta.mjdAvg, east: deltaRA(m.centroid!.ra, target.ra) * Math.cos(target.dec * Math.PI / 180) * 3600 - ae, north: (m.centroid!.dec - target.dec) * 3600 - an, error: Math.hypot(stat, alignError), alignEast: ae, alignNorth: an, alignError, references: refs });
    waves.push(m);
  }
  if (positions.length < 2) return fail("Fewer than two dates have a clean target and at least three isolated reference stars.");
  if (Math.max(...waves.map((w) => w.wl)) - Math.min(...waves.map((w) => w.wl)) > 0.5 * Math.min(...waves.map((w) => w.bw))) return fail("Wavelengths at this source differ by more than half a channel.");
  const groups: AlignedPosition[][] = [];
  for (const p of positions) { const last = groups.at(-1); if (last && p.mjd - last[0].mjd <= 1) last.push(p); else groups.push([p]); }
  const plx = target.parallaxMas !== undefined && target.parallaxMas >= 0 && Number.isFinite(target.parallaxMas) ? target.parallaxMas : null;
  const epochs: MotionEpoch[] = [];
  for (const g of groups) {
    const mjd = median(g.map((p) => p.mjd)), p = plx === null ? [0, 0] : parallaxOffset(target.ra, target.dec, mjd, plx);
    if (!p) return fail("Catalog-parallax correction is outside the packaged ephemeris date range.");
    epochs.push({ mjd, date: g[0].date, east: median(g.map((x) => x.east)), north: median(g.map((x) => x.north)), error: Math.max(...g.map((x) => x.error), robustSigma(g.map((x) => x.east)), robustSigma(g.map((x) => x.north))), frames: g.length, minRefs: Math.min(...g.map((x) => x.references.length)), parallaxEast: p[0], parallaxNorth: p[1] });
  }
  if (epochs.length < 2) return fail("All usable exposures are within one 24-hour visit; another independent visit is needed.");
  const baselineDays = epochs.at(-1)!.mjd - epochs[0].mjd;
  const first = epochs[0], last = epochs.at(-1)!;
  const shift = Math.hypot(last.east - first.east, last.north - first.north), shiftError = Math.hypot(first.error, last.error);
  const fit = (axis: "east" | "north", parallax: "parallaxEast" | "parallaxNorth") => epochs.length >= 3 && baselineDays >= 36.525 ? fitAxis(epochs.map((p) => ({ t: (p.mjd - first.mjd) / 365.25, value: p[axis] - p[parallax], error: p.error }))) : null;
  const controls: { sourceId: string; residualShift: number }[] = [];
  for (const r of positions[0].references) {
    const a = positions[0], b = positions.at(-1)!, end = b.references.find((s) => s.id === r.id);
    if (!end) continue;
    const leave = (p: AlignedPosition, axis: "east" | "north") => median(p.references.filter((s) => s.id !== r.id).map((s) => s[axis]));
    controls.push({ sourceId: r.id, residualShift: Math.hypot((end.east - leave(b, "east")) - (r.east - leave(a, "east")), (end.north - leave(b, "north")) - (r.north - leave(a, "north"))) });
  }
  const caveats = ["Native aperture centroids; no PSF fit or deblending. Unresolved binaries and wavelength-dependent photocenters can bias positions.", "24-hour visits retain the full positional/reference scatter; shared-frame measurements are not independent.", "Reference-star alignment corrects translation only, not field rotation or distortion."];
  if (plx === null) caveats.push("No trusted target parallax supplied: fitted rates include any annual parallax and are apparent motion, not pure proper motion.");
  else caveats.push("Catalog parallax is a fixed input, using interpolated geocentric barycentric positions; no distance is measured by this fit.");
  if (positions.some((p) => p.references.some((r) => !r.parallaxKnown))) caveats.push("Some reference parallaxes are unavailable or low precision and are omitted; their residuals contribute to the alignment scatter.");
  return { ok: true, positions, epochs, rejected, east: fit("east", "parallaxEast"), north: fit("north", "parallaxNorth"), baselineDays, shift, shiftError, parallaxMas: plx, parallaxSource: target.parallaxSource ?? null, controls, caveats, origin: { ra: target.ra, dec: target.dec, mjd: first.mjd } };
}
