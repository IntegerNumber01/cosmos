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
  /** Technical notes shown only under "Show the science". */
  detail?: string;
  investigate?: boolean;
};

export const TARGETS: Target[] = [
  {
    id: "galactic-center",
    name: "Galactic Centre",
    kind: "Heart of our galaxy",
    ra: 266.405,
    dec: -28.936,
    fov: 30,
    frame: 47,
    blurb:
      "The heart of our own galaxy, 26,000 light-years away. Thick dust hides it from our eyes, but infrared light shines through.",
    detail: "Best seen from about 2 µm and longer, where dust extinction drops enough to reveal the crowded starlight near the centre.",
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
      "The closest big star nursery to Earth. New stars are being born inside this cloud right now.",
    detail: "Near 3.3 µm, emission often attributed to polycyclic aromatic hydrocarbons (PAHs) traces gas lit by young stars.",
  },
  {
    id: "rho-oph",
    name: "Rho Ophiuchi",
    kind: "Dark cloud",
    ra: 246.79,
    dec: -24.0,
    fov: 10,
    frame: 47,
    blurb: "A dark, dusty cloud. In infrared, young stars hidden inside it shine through the haze.",
  },
  {
    id: "lmc",
    name: "Large Magellanic Cloud",
    kind: "Satellite galaxy",
    ra: 80.89,
    dec: -69.76,
    fov: 14,
    frame: 30,
    blurb: "A small galaxy circling our own, about 160,000 light-years away. You can pick out its brightest stars.",
    detail: "Distance about 50 kpc. SPHEREx resolves its brightest stars and star-forming regions.",
  },
  {
    id: "andromeda",
    name: "Andromeda Galaxy (M31)",
    kind: "Spiral galaxy",
    ra: 10.6847,
    dec: 41.2687,
    fov: 5,
    frame: 30,
    blurb: "The nearest big galaxy to ours, 2.5 million light-years away. Infrared shows the glow of its older stars.",
  },
  {
    id: "pleiades",
    name: "Pleiades (M45)",
    kind: "Star cluster",
    ra: 56.75,
    dec: 24.1167,
    fov: 4,
    frame: 5,
    blurb: "The Seven Sisters: a family of young stars about 440 light-years away, born together.",
    detail: "Open cluster at about 136 pc; ESA Gaia measured distances for its stars.",
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
    kind: "Comet",
    ra: 314.242,
    dec: -5.6897,
    fov: 1.2,
    frame: 5,
    investigate: true,
    blurb:
      "SPHEREx photographed comet SWAN right here in October 2025. Open the case file to watch it move.",
    caution: "This map blends many dates, and the comet was only here for hours, so you won't see it on the map itself.",
    detail: "Caught on 2025-10-27, 04:53–04:59 UTC. The all-sky map is a time-average of many dates; the dated frames and the measured motion are in Investigate.",
  },
  {
    id: "wise0855",
    name: "WISE 0855−0714",
    kind: "Coldest known brown dwarf",
    ra: 133.75999, // 2025.9 position propagated from SIMBAD astrometry (pm -8123.7, +673.2 mas/yr)
    dec: -7.2422,
    fov: 0.6,
    frame: 88,
    blurb:
      "A “failed star” 7.4 light-years away, about as cold as a winter day on Earth. Far too cool for our eyes: look in deep infrared.",
    caution: "It's very faint, so it may not stand out on this map. Time Travel shows dated photos.",
    detail: "About 2.3 pc away. Marker at its mid-2025 position, worked out from catalogue proper motion (about 8.1″ per year westward).",
  },
  {
    id: "barnard",
    name: "Barnard's Star",
    kind: "Nearby red dwarf",
    ra: 269.44636, // 2025.6 position: Gaia DR3 4472832130942575872 propagated with its proper motion
    dec: 4.76705,
    fov: 0.6,
    frame: 30,
    blurb: "The closest single star to the Sun, 6 light-years away, and the fastest-moving star across our sky.",
    caution: "It moves so fast that it can look slightly smeared on this map, which blends many dates.",
    detail: "1.8 pc away; proper motion about 10.4″/yr. The marker is its mid-2025 position from Gaia DR3's measured proper motion (source 4472832130942575872), 4.4′ from its J2000 catalogue position. It moves about 1.7 SPHEREx pixels per year.",
  },
];

export const TARGET_BY_ID = Object.fromEntries(TARGETS.map((t) => [t.id, t]));
