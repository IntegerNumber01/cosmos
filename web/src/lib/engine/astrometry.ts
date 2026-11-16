import ephemeris from "./earth-barycentric.json";

const RAD = Math.PI / 180;
export const deltaRA = (a: number, b: number) => ((a - b + 540) % 360) - 180;

/** Barycentric Earth position in AU. No extrapolation beyond the packaged ephemeris. */
export function earthAt(mjd: number): number[] | null {
  const x = (mjd - ephemeris.startMjd) / ephemeris.stepDays;
  if (!Number.isFinite(x) || x < 0 || x > ephemeris.xyz.length - 1) return null;
  const i = Math.min(Math.floor(x), ephemeris.xyz.length - 2), f = x - i;
  return ephemeris.xyz[i].map((v, k) => v * (1 - f) + ephemeris.xyz[i + 1][k] * f);
}

/** Apparent east/north offset in arcseconds from a supplied catalogue parallax (mas).
 * Geocentre approximation; four-day interpolation checked against Astropy off-grid.
 * The catalogue value is an INPUT, never an independently fitted distance.
 */
export function parallaxOffset(ra: number, dec: number, mjd: number, mas: number): [number, number] | null {
  if (![ra, dec, mas].every(Number.isFinite) || mas < 0) return null;
  if (mas === 0) return [0, 0];
  const xyz = earthAt(mjd);
  if (!xyz) return null;
  const [x, y, z] = xyz, a = ra * RAD, d = dec * RAD, p = mas / 1000;
  return [p * (x * Math.sin(a) - y * Math.cos(a)), p * (x * Math.cos(a) * Math.sin(d) + y * Math.sin(a) * Math.sin(d) - z * Math.cos(d))];
}

export function propagate(ra: number, dec: number, pmra: number, pmdec: number, refMjd: number, mjd: number, parallaxMas = 0): [number, number] | null {
  const dt = (mjd - refMjd) / 365.25, cos = Math.cos(dec * RAD);
  if (![ra, dec, pmra, pmdec, dt].every(Number.isFinite) || Math.abs(cos) < 1e-5) return null;
  const p = parallaxOffset(ra, dec, mjd, parallaxMas);
  if (!p) return null;
  const a = ra + (pmra * dt / 1000 + p[0]) / (3600 * cos), d = dec + (pmdec * dt / 1000 + p[1]) / 3600;
  if (Math.abs(d) > 90) return null;
  return [((a % 360) + 360) % 360, d];
}
