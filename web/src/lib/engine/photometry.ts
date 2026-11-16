// Reference-star (differential) photometry for the public tool. Port of the offline method in
// pipeline/validation/run.py::photometry_analysis, adapted to the live engine:
//  * the target and every reference star are measured identically on each date's NATIVE pixels (measure());
//  * references: Gaia DR3 stars G <= 16.5, >= 10 px from the target, no comparably bright Gaia neighbour
//    (|ΔG| < 2) within r_ap + 1.5 px, not Gaia-flagged VARIABLE, clean complete aperture, no saturation flags,
//    empirical S/N >= 10 on EVERY date, and a wavelength that agrees within half a channel across the dates AT
//    THE STAR'S OWN POSITION (SPHEREx's filter wavelength varies across the detector; the offline method did not
//    apply this check);
//  * one robustness pass removes a reference whose own differential brightness departs from the others by
//    more than 5× their robust scatter (an unflagged variable would otherwise bias every date);
//  * the target is divided by the summed reference ensemble on each date. The uncertainty combines the
//    blank-sky errors with the empirical scatter of each reference against the ensemble of the others;
//  * fewer than 3 usable references -> no calibrated value, with the reason.
// The S/N cut was first set to 20 and lowered to 10 after the first RW Aur run found only 2 references: the
// offline cut (30 on NOMINAL errors) corresponds to ~10-23 on empirical errors, which are 1.3-3.3x larger, and
// reference errors are propagated into the result. All other thresholds come from the offline method.
import { Frame, measure, Measurement, median } from "./sequence";
import { sky2pix } from "./wcs";

export type FieldStar = { source_id: string; g: number; pmra: number; pmdec: number; ra_epoch: number; dec_epoch: number; variable?: boolean };
/** Field size used for calibration: the offline validation's cutout size (12 arcmin). */
export const CAL_FIELD_DEG = 0.2;

export type CalConfig = { minRefs: number; maxG: number; minSnr: number; minTargetSepPx: number; edgePx: number; isoDmag: number; apR: number; clip: number; scatterFloorMag: number };
export const CAL: Readonly<CalConfig> = { minRefs: 3, maxG: 16.5, minSnr: 10, minTargetSepPx: 10, edgePx: 12, isoDmag: 2, apR: 2, clip: 5, scatterFloorMag: 0.005 };
const SATURATION = ["OVERFLOW", "NONLINEAR", "SUR_ERROR"];

export type CalibratedEpoch = { obsid: string; date: string; mjd: number; ratio: number; dmag: number; dmagErr: number; dmagErrNominal: number; refScatterMag: number };
export type Calibration =
  | {
      ok: true;
      nRefs: number;
      refs: { source_id: string; g: number; medianSnr: number }[];
      rejectedAsVariable: string[];
      leaveOneOut: { source_id: string; dmag: number }[]; // last-vs-first Δm with each reference removed
      looMaxShift: number; // largest |Δm change| from removing a single reference
      epochs: CalibratedEpoch[]; // relative to the first epoch
      first: CalibratedEpoch;
      last: CalibratedEpoch;
      changePct: number; // last vs first, in linear flux
      changePctErr: number;
      significance: number; // |Δm| / σ(Δm)
      candidates: number;
      why: Record<string, number>;
    }
  | { ok: false; reason: string; nRefs: number; candidates: number; why: Record<string, number> };

function at(s: FieldStar, refMjd: number, mjd: number): [number, number] {
  const dt = (mjd - refMjd) / 365.25;
  const dec = s.dec_epoch + (s.pmdec * dt) / 3.6e6;
  return [s.ra_epoch + (s.pmra * dt) / 3.6e6 / Math.cos((s.dec_epoch * Math.PI) / 180), dec];
}

const usable = (m: Measurement) => Number.isFinite(m.flux) && Number.isFinite(m.fluxErrEmp) && !m.partial && !m.coreFlagged && !m.flagsHere.some((f) => SATURATION.includes(f));
const robustScatter = (v: number[]) => 1.4826 * median(v.map((x) => Math.abs(x - median(v))));

/**
 * @param frames   the wavelength-matched frames whose target measurements are already clean (same order as `target`)
 * @param target   the target measurement on each frame
 * @param stars    Gaia field stars, positions at `starsMjd`
 */
export function calibrate(frames: Frame[], target: Measurement[], stars: FieldStar[], starsMjd: number, cfg: CalConfig = CAL): Calibration {
  const why: Record<string, number> = {};
  const no = (k: string) => (why[k] = (why[k] ?? 0) + 1);
  const fail = (reason: string, nRefs = 0, candidates = 0): Calibration => ({ ok: false, reason, nRefs, candidates, why });
  if (frames.length < 2 || frames.length !== target.length) return fail("needs at least two clean dates");
  if (target.some((t) => !usable(t))) return fail("the target is not cleanly measured on both dates");
  if (target.some((t) => !(t.flux > 3 * t.fluxErrEmp))) return fail("the source is too faint on one date for a brightness ratio");
  const twl = target.map((t) => t.wl);
  if (Math.max(...twl) - Math.min(...twl) > 0.5 * Math.min(...target.map((t) => t.bw))) return fail("the infrared color (wavelength) at this position differs between the dates");
  // A comparably bright (or brighter) star partly inside the target aperture leaks a PSF- and pixel-phase-dependent
  // share of its light, which can imitate a large change (a steady G=14.7 control star 11" from a G=12.8 star read
  // -54% at 18 sigma). Unresolved companions < 0.5 px away sit wholly inside the aperture and are allowed.
  for (let j = 0; j < frames.length; j++) {
    const f = frames[j];
    const d = stars.map((s) => {
      const [x, y] = sky2pix(f.meta.wcs, ...at(s, starsMjd, f.meta.mjdAvg));
      return { s, d: Math.hypot(x - target[j].x, y - target[j].y) };
    });
    const tG = Math.min(...d.filter((o) => o.d < 0.5).map((o) => o.s.g));
    const blend = d.filter((o) => o.d >= 0.5 && o.d < cfg.apR + 1.5 && o.s.g < (Number.isFinite(tG) ? tG + cfg.isoDmag : cfg.maxG)).sort((a, b) => a.d - b.d)[0];
    if (blend)
      return fail(`a neighboring star (Gaia G = ${blend.s.g.toFixed(1)}, ${(blend.d * 6.15).toFixed(0)}″ away) partly overlaps the measurement, which can imitate a brightness change`);
  }

  const per = new Map<string, Measurement[]>();
  let candidates = 0;
  for (const s of stars) {
    if (!(s.g <= cfg.maxG) || s.variable) { no("catalogue"); continue; }
    const ms: Measurement[] = [];
    let reject = "";
    for (let j = 0; j < frames.length && !reject; j++) {
      const f = frames[j];
      const [ra, dec] = at(s, starsMjd, f.meta.mjdAvg);
      const [x, y] = sky2pix(f.meta.wcs, ra, dec);
      if (x < cfg.edgePx || y < cfg.edgePx || x > f.meta.nx - 1 - cfg.edgePx || y > f.meta.ny - 1 - cfg.edgePx) { reject = "position"; break; }
      if (Math.hypot(x - target[j].x, y - target[j].y) < cfg.minTargetSepPx) { reject = "position"; break; }
      if (j === 0) {
        // a constant neighbour cancels in a same-wavelength ratio; only reject comparably bright close pairs
        const blended = stars.some((o) => {
          if (o === s || Math.abs(o.g - s.g) >= cfg.isoDmag) return false;
          const [ox, oy] = sky2pix(f.meta.wcs, ...at(o, starsMjd, f.meta.mjdAvg));
          return Math.hypot(ox - x, oy - y) < cfg.apR + 1.5;
        });
        if (blended) { reject = "blended"; break; }
      }
      const m = measure(f, ra, dec, cfg.apR);
      if (!usable(m)) reject = m.flagsHere.some((x) => SATURATION.includes(x)) ? "saturated" : "masked";
      else if (m.flux <= 0 || m.snr < cfg.minSnr) reject = "low_snr";
      else ms.push(m);
    }
    if (reject) { no(reject); continue; }
    // wavelength at the star's own position must agree within half a channel across all dates
    const wl = ms.map((m) => m.wl);
    if (Math.max(...wl) - Math.min(...wl) > 0.5 * Math.min(...ms.map((m) => m.bw))) { no("wavelength"); continue; }
    candidates++;
    per.set(s.source_id, ms);
  }

  let ids = [...per.keys()];
  if (ids.length < cfg.minRefs) return fail(`only ${ids.length} usable reference star${ids.length === 1 ? "" : "s"} in the field (needs ${cfg.minRefs})`, ids.length, candidates);

  const nF = frames.length;
  // leave-one-out differential magnitudes of each reference, relative to the first date
  const looDm = (use: string[]) => {
    const ens = Array.from({ length: nF }, (_, j) => use.reduce((a, id) => a + per.get(id)![j].flux, 0));
    return new Map(use.map((id) => {
      const F = per.get(id)!.map((m) => m.flux);
      const r = F.map((v, j) => v / (ens[j] - v));
      return [id, r.map((v) => -2.5 * Math.log10(v / r[0]))] as const;
    }));
  };
  let dm = looDm(ids);
  const rejectedAsVariable: string[] = [];
  if (ids.length > cfg.minRefs) {
    const bad = new Set<string>();
    for (let j = 1; j < nF; j++) {
      const col = ids.map((id) => dm.get(id)![j]);
      const s = Math.max(robustScatter(col), cfg.scatterFloorMag);
      const mid = median(col);
      ids.forEach((id, k) => Math.abs(col[k] - mid) > cfg.clip * s && bad.add(id));
    }
    if (bad.size && ids.length - bad.size >= cfg.minRefs) {
      rejectedAsVariable.push(...bad);
      ids = ids.filter((id) => !bad.has(id));
      dm = looDm(ids);
    }
  }

  const F = ids.map((id) => per.get(id)!);
  const ens = Array.from({ length: nF }, (_, j) => F.reduce((a, ms) => a + ms[j].flux, 0));
  const ensErr = Array.from({ length: nF }, (_, j) => Math.sqrt(F.reduce((a, ms) => a + ms[j].fluxErrEmp ** 2, 0)));
  const ratio = target.map((t, j) => t.flux / ens[j]);
  const relErr = target.map((t, j) => Math.hypot(t.fluxErrEmp / t.flux, ensErr[j] / ens[j]));
  const epochs: CalibratedEpoch[] = target.map((t, j) => {
    const nominal = 1.0857 * Math.hypot(relErr[j], relErr[0]);
    const col = ids.map((id) => dm.get(id)![j]);
    const refScatter = j === 0 ? 0 : robustScatter(col);
    return {
      obsid: t.obsid, date: t.date, mjd: t.mjd, ratio: ratio[j],
      dmag: -2.5 * Math.log10(ratio[j] / ratio[0]),
      dmagErrNominal: j === 0 ? 0 : nominal,
      refScatterMag: refScatter,
      dmagErr: j === 0 ? 0 : Math.hypot(nominal, refScatter),
    };
  });
  const first = epochs[0];
  const last = epochs[nF - 1];
  const frac = 10 ** (-0.4 * last.dmag);
  // reference-selection sensitivity: the last-vs-first Δm with each reference left out of the ensemble
  const leaveOneOut = ids.map((id, k) => {
    const e = (j: number) => ens[j] - F[k][j].flux;
    return { source_id: id, dmag: -2.5 * Math.log10((target[nF - 1].flux / e(nF - 1)) / (target[0].flux / e(0))) };
  });
  const looMaxShift = Math.max(...leaveOneOut.map((x) => Math.abs(x.dmag - last.dmag)));
  return {
    ok: true,
    nRefs: ids.length,
    refs: ids.map((id) => ({ source_id: id, g: stars.find((s) => s.source_id === id)!.g, medianSnr: median(per.get(id)!.map((m) => m.snr)) })),
    leaveOneOut,
    looMaxShift,
    rejectedAsVariable,
    epochs, first, last,
    changePct: (frac - 1) * 100,
    changePctErr: frac * (Math.LN10 / 2.5) * last.dmagErr * 100,
    significance: last.dmagErr > 0 ? Math.abs(last.dmag) / last.dmagErr : 0,
    candidates, why,
  };
}
