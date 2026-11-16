// Server-side partial inventory. These are original NASA footprints, not synthesized observations.
import inventory from "../../../public/data/exposure-index.json";
import { observationsFromRows } from "./observations";

export type ExposureRow = [string, number, string, number, number, number, number, number[]];
const RAD = Math.PI / 180;
function separation(ra: number, dec: number, otherRa: number, otherDec: number) {
  const a = Math.sin((dec - otherDec) * RAD / 2) ** 2 + Math.cos(dec * RAD) * Math.cos(otherDec * RAD) * Math.sin((ra - otherRa) * RAD / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a)))) / RAD;
}

/** Bound each footprint on the sphere before the tangent-plane projection. Otherwise an
 * opposite-side sky position can project into the same detector. Handles the RA seam and poles. */
export function indexObservations(ra: number, dec: number, rows: ExposureRow[] = inventory.rows as ExposureRow[]) {
  const candidates = rows.filter(r => {
    const radius = Math.max(...[0, 2, 4, 6].map(i => separation(r[5], r[6], r[7][i], r[7][i + 1])));
    return separation(ra, dec, r[5], r[6]) <= radius + 0.01;
  });
  return observationsFromRows(candidates.map(r => ({
    dataproduct_subtype: "science", obs_id: r[0], energy_bandpassname: `SPHEREx-D${r[1]}`,
    access_url: r[2], t_min: String(r[3]), t_exptime: String(r[4]), s_ra: String(r[5]), s_dec: String(r[6]),
    s_region: `POLYGON ICRS ${r[7].join(" ")}`,
  })), ra, dec).filter(o => o.inside);
}

export const inventoryProvenance = {
  schema: inventory.schema, release: inventory.release, provider: inventory.provider, scope: inventory.scope,
  footprints: inventory.rows.length, originalInventories: inventory.sources.length, url: "/data/exposure-index.json",
};
