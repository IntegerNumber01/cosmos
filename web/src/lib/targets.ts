// Bookmarks. Coordinates are ICRS degrees. Catalogue positions of fixed objects are standard
// reference values. Moving objects carry the epoch at which the position is valid.

export type Target = {
  id: string;
  name: string;
  kind: string;
  ra: number;
  dec: number;
  fov: number; // degrees
  blurb: string;
  /** Suggested wavelength frame (0-based HiPS frame) that shows the object well. */
  frame?: number;
  caution?: string;
  investigate?: boolean;
};

export const TARGETS: Target[] = [
  {
    id: "galactic-center",
    name: "Galactic Centre",
    kind: "Milky Way core",
    ra: 266.405,
    dec: -28.936,
    fov: 30,
    frame: 47,
    blurb:
      "Visible light can't get through the dust in front of our Galaxy's heart. Move toward 2–5 µm and the dust clears enough to show the crowded starlight near the centre.",
  },
  {
    id: "orion",
    name: "Orion Molecular Cloud",
    kind: "Star-forming region",
    ra: 83.82,
    dec: -5.39,
    fov: 12,
    frame: 62,
    blurb:
      "The nearest large stellar nursery. Near 3.3 µm, emission often linked to organic (PAH) molecules traces gas lit by young stars.",
  },
  {
    id: "rho-oph",
    name: "Rho Ophiuchi",
    kind: "Dark cloud",
    ra: 246.79,
    dec: -24.0,
    fov: 10,
    frame: 44,
    blurb: "A dark dusty cloud. In the infrared, embedded young stars show through the haze.",
  },
  {
    id: "lmc",
    name: "Large Magellanic Cloud",
    kind: "Satellite galaxy",
    ra: 80.89,
    dec: -69.76,
    fov: 14,
    frame: 30,
    blurb: "A dwarf galaxy about 50 kpc away, orbiting the Milky Way. SPHEREx resolves its brightest stars and star-forming regions.",
  },
  {
    id: "andromeda",
    name: "Andromeda Galaxy (M31)",
    kind: "Spiral galaxy",
    ra: 10.6847,
    dec: 41.2687,
    fov: 5,
    frame: 20,
    blurb: "Our nearest large spiral neighbour. The near-infrared shows the smooth glow of its older stars.",
  },
  {
    id: "pleiades",
    name: "Pleiades (M45)",
    kind: "Star cluster",
    ra: 56.75,
    dec: 24.1167,
    fov: 4,
    frame: 10,
    blurb: "A young open cluster about 136 pc away. Gaia measured distances for its stars.",
  },
  {
    id: "carina",
    name: "Carina Nebula",
    kind: "Star-forming region",
    ra: 161.265,
    dec: -59.867,
    fov: 6,
    frame: 62,
    blurb: "One of the largest and brightest nebulae in the sky, home to some of the most massive known stars.",
  },
  {
    id: "swan",
    name: "Comet C/2025 R2 (SWAN)",
    kind: "Comet · Investigation",
    ra: 314.242,
    dec: -5.6897,
    fov: 1.2,
    frame: 3,
    investigate: true,
    blurb:
      "Where SPHEREx caught comet SWAN on 2025-10-27 04:53–04:59 UTC. Open the investigation to see the dated frames and the measured motion.",
    caution:
      "The all-sky map is a time-average of many dates. The comet was only here for hours, so it doesn't appear as a sharp object. The dated frames are in Investigate.",
  },
  {
    id: "wise0855",
    name: "WISE 0855−0714",
    kind: "Coldest known brown dwarf",
    ra: 133.79513,
    dec: -7.245147,
    fov: 0.6,
    frame: 88,
    blurb:
      "One of the Sun's nearest neighbours (about 2.3 pc). It is very cold and very faint, so look at the longest wavelengths.",
    caution:
      "J2000 reference coordinates. WISE 0855 moves about 8.1″ per year across the sky, so by 2025 it sits roughly 3.4 arcminutes from this marker.",
  },
  {
    id: "barnard",
    name: "Barnard's Star",
    kind: "Nearby red dwarf",
    ra: 269.452075,
    dec: 4.69339,
    fov: 0.6,
    frame: 20,
    blurb: "At 1.8 pc, the closest single star to the Sun, and the star with the fastest proper motion in our sky (about 10.4″/yr).",
    caution:
      "J2000 reference coordinates. By 2025 the star has moved about 4.4 arcminutes from this marker, so the bright star you see is offset from it.",
  },
];

export const TARGET_BY_ID = Object.fromEntries(TARGETS.map((t) => [t.id, t]));
