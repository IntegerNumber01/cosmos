// SPHEREx DR1 all-sky HiPS cube — values copied verbatim from the HiPS `properties` file:
// https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube/properties
// (hips_release_date 2026-11-01). frameIndex = 17*(band-1) + (channel-1), 0-based.

export const HIPS_URL = "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube";
export const HIPS_DOI = "10.26131/IRSA679";
export const L2_DOI = "10.26131/IRSA678";

export const WAVELENGTHS_UM: number[] = [
  0.753, 0.771, 0.79, 0.809, 0.828, 0.848, 0.868, 0.889, 0.91, 0.932, 0.955, 0.978, 1.001, 1.025, 1.05, 1.075, 1.102,
  1.113, 1.139, 1.167, 1.195, 1.224, 1.254, 1.284, 1.315, 1.346, 1.378, 1.412, 1.446, 1.481, 1.517, 1.554, 1.592,
  1.631, 1.656, 1.695, 1.735, 1.775, 1.818, 1.861, 1.905, 1.949, 1.995, 2.041, 2.089, 2.139, 2.189, 2.24, 2.292, 2.345,
  2.399, 2.445, 2.506, 2.575, 2.646, 2.719, 2.794, 2.871, 2.951, 3.033, 3.118, 3.204, 3.293, 3.383, 3.476, 3.57,
  3.667, 3.768, 3.833, 3.867, 3.901, 3.935, 3.97, 4.005, 4.04, 4.076, 4.112, 4.148, 4.184, 4.22, 4.257, 4.294, 4.331,
  4.368, 4.405, 4.435, 4.467, 4.5, 4.533, 4.566, 4.6, 4.635, 4.669, 4.704, 4.739, 4.773, 4.808, 4.843, 4.879, 4.915,
  4.951, 4.988,
];
export const DEPTH = 102;
const EM_MIN_M = 7.43e-7;
const EM_MAX_M = 5.009e-6;

/** Frames 50 and 51 (band 3 ch 17, band 4 ch 1) are blank — dichroic transition. */
export const BLANK_FRAMES = new Set([50, 51]);

/** Striping artefacts are reported near these wavelengths (governing brief, HiPS notes). */
export const STRIPING_UM = [1.88, 3.3, 4.05];
export function stripingNear(frame: number): number | null {
  const w = WAVELENGTHS_UM[frame];
  for (const s of STRIPING_UM) if (Math.abs(w - s) <= 0.03) return s;
  return null;
}

export function bandOf(frame: number) {
  return Math.floor(frame / 17) + 1;
}
export function channelOf(frame: number) {
  return (frame % 17) + 1;
}

/** Each SPHEREx band is read by one detector array (D1–D6). */
export const BANDS = [
  { band: 1, range: "0.75–1.10 µm", note: "Edge of human vision — starlight dominates" },
  { band: 2, range: "1.11–1.63 µm", note: "Near-infrared — stars glow through dust" },
  { band: 3, range: "1.63–2.42 µm", note: "Dust lanes thin out — the Galaxy's hidden center appears" },
  { band: 4, range: "2.42–3.82 µm", note: "Water-ice and organic (3.3 µm) features" },
  { band: 5, range: "3.83–4.41 µm", note: "Warm dust and CO₂ ice (4.27 µm)" },
  { band: 6, range: "4.42–5.00 µm", note: "Longest SPHEREx wavelengths — cool, dusty regions" },
];

/**
 * Aladin Lite maps a cube frame to frequency as floor((f - fLo)/(fHi - fLo) * depth), with
 * fLo/fHi from em_max/em_min. Pass the frequency at the middle of the frame interval.
 * (Same approach as IRSA's own HiPS landing page, Aladin Lite 3.8.2.)
 */
export function frameToFrequencyHz(frame: number) {
  const c = 299792458.0;
  const fLo = c / EM_MAX_M;
  const fHi = c / EM_MIN_M;
  return fLo + ((frame + 0.5) / DEPTH) * (fHi - fLo);
}

/** False-colour hue for a wavelength (display only — infrared has no "real" colour). */
export function wavelengthColor(um: number, alpha = 1) {
  const t = Math.min(1, Math.max(0, (um - 0.75) / (5.0 - 0.75)));
  // violet → blue → cyan → green → amber → red
  const stops = [
    [124, 92, 255],
    [64, 140, 255],
    [40, 210, 230],
    [90, 230, 140],
    [255, 196, 70],
    [255, 92, 72],
  ];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

export function nearestValidFrame(frame: number, dir = 1) {
  let f = Math.max(0, Math.min(DEPTH - 1, frame));
  while (BLANK_FRAMES.has(f)) f += dir;
  return Math.max(0, Math.min(DEPTH - 1, f));
}

export function frameForWavelength(um: number) {
  let best = 0;
  for (let i = 0; i < DEPTH; i++) {
    if (BLANK_FRAMES.has(i)) continue;
    if (Math.abs(WAVELENGTHS_UM[i] - um) < Math.abs(WAVELENGTHS_UM[best] - um)) best = i;
  }
  return best;
}

/**
 * Five plain-language "stops" along the spectrum for the default Explore view. They match the
 * landing-page globe captures. These are the wavelengths kept preloaded for instant switching.
 */
export const STOPS = [
  { frame: 5, name: "Almost visible", note: "Just past red light. Dark dust clouds still block the view." },
  { frame: 30, name: "Through the haze", note: "Infrared slips through thin dust. Hidden stars start to appear." },
  { frame: 47, name: "Galaxy's heart", note: "Dust turns nearly see-through. The crowded center of our galaxy shines." },
  { frame: 62, name: "Glowing dust", note: "Carbon-rich dust glows around newborn stars." },
  { frame: 88, name: "Warm dust", note: "Near the longest infrared SPHEREx sees. Warm dust glows." },
];
export const STOP_FRAMES = STOPS.map((s) => s.frame);
export function nearestStop(frame: number) {
  let best = STOPS[0];
  for (const s of STOPS) if (Math.abs(s.frame - frame) < Math.abs(best.frame - frame)) best = s;
  return best;
}

/** ICRS (≈J2000) RA/Dec in degrees → Galactic longitude/latitude in degrees (IAU 1958 / Hipparcos rotation). */
export function toGalactic(raDeg: number, decDeg: number) {
  const d2r = Math.PI / 180;
  const ra = raDeg * d2r;
  const dec = decDeg * d2r;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  // rows of the equatorial → galactic rotation matrix
  const gx = -0.0548755604 * x - 0.8734370902 * y - 0.4838350155 * z;
  const gy = 0.4941094279 * x - 0.4448296300 * y + 0.7469822445 * z;
  const gz = -0.8676661490 * x - 0.1980763734 * y + 0.4559837762 * z;
  let l = Math.atan2(gy, gx) / d2r;
  if (l < 0) l += 360;
  const b = Math.asin(Math.max(-1, Math.min(1, gz))) / d2r;
  return { l, b };
}
