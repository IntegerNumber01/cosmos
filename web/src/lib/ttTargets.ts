// Time Travel quick picks. Positions are propagated to 2025.9 (middle of SPHEREx DR1) from catalogue
// astrometry (SIMBAD, Harvard mirror, retrieved 2026-11-14), so fast-moving stars are where SPHEREx saw them.
export type TTTarget = {
  slug: string;
  name: string;
  kind: string;
  ra: number;
  dec: number;
  why: string;
  challenge?: boolean;
  pm?: [number, number]; // mas/yr (for display)
  prefer?: { obsid: string; detector: number }; // open on the wavelength set containing this exposure
};

export const TT_TARGETS: TTTarget[] = [
  {
    slug: "barnard",
    name: "Barnard's Star",
    kind: "Fastest-moving star",
    ra: 269.44629,
    dec: 4.76792,
    pm: [-801.6, 10362.4],
    challenge: true,
    why: "Moves about 10.4″ per year (1.7 SPHEREx pixels), so dates a year apart should show it shifting north.",
  },
  {
    slug: "wise0855",
    name: "WISE 0855−0714",
    kind: "Coldest known brown dwarf",
    ra: 133.75999,
    dec: -7.2422,
    pm: [-8123.7, 673.2],
    challenge: true,
    why: "At about 250 K it is extremely faint and glows mainly beyond 4 µm, so it's a hard test of what SPHEREx can detect.",
    prefer: { obsid: "2025W45_2A_0292_3", detector: 5 }, // 4.22 µm set where the validation detected it (by stacking)
  },
  {
    slug: "epsindib",
    name: "Epsilon Indi B",
    kind: "Brown-dwarf binary",
    ra: 331.09644,
    dec: -56.80059,
    pm: [3982.0, -2466.8],
    challenge: true,
    why: "A nearby pair of brown dwarfs 6.7′ from the bright star ε Indi A, moving about 4.7″ per year.",
    prefer: { obsid: "2025W17_4B_0027_3", detector: 2 }, // 1.108 µm, one-year baseline (validation: confirmed)
  },
  {
    slug: "rwaur",
    name: "RW Aurigae",
    kind: "Young variable star",
    ra: 76.95659,
    dec: 30.40129,
    challenge: true,
    why: "A young star system known for deep, irregular dimming events.",
    prefer: { obsid: "2025W36_1A_0233_2", detector: 1 }, // 0.744 µm: the only unsaturated matched pair
  },
  {
    slug: "rdra",
    name: "R Draconis",
    kind: "Mira variable",
    ra: 248.16723,
    dec: 66.75502,
    challenge: true,
    why: "A pulsating giant with a period of about 246 days. It sits near the ecliptic pole, where SPHEREx looks often.",
  },
  {
    slug: "swan",
    name: "Comet SWAN's 27 Oct field",
    kind: "Featured: moving object",
    ra: 314.2453,
    dec: -5.6884,
    why: "Comet C/2025 R2 crossed this spot on 27 Oct 2025. Other dates show the same stars without it.",
    prefer: { obsid: "2025W44_1A_0045_2", detector: 1 },
  },
];

export const TT_BY_SLUG = Object.fromEntries(TT_TARGETS.map((t) => [t.slug, t]));
