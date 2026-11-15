// Release and cache provenance live here so adding a release does not change the viewer.
// DR1 remains the reproducible project baseline. Do not silently mix calibrations/releases.
export const RELEASE = {
  id: "dr1",
  label: "SPHEREx DR1",
  collection: "spherex_dr1",
  doi: "10.26131/IRSA678",
} as const;
export const CACHE_SCHEMA = 2;
export const ENGINE_VERSION = "dr1-wcs-v2";
export const FIELD_SIZES = [0.05, 0.1, 0.2, 0.3];

export function validCoordinates(ra: number, dec: number) {
  return Number.isFinite(ra) && ra >= 0 && ra < 360 && Number.isFinite(dec) && Math.abs(dec) <= 90;
}

export function validSize(size: number) {
  return Number.isFinite(size) && size >= 0.02 && size <= 0.3;
}
