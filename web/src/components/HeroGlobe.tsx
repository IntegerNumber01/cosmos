"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WAVELENGTHS_UM, wavelengthColor } from "@/lib/spherex";
import { useReducedMotion } from "@/lib/useReducedMotion";

// Real captures of the COSMOS Explore view (SPHEREx DR1 all-sky cube), one hemisphere centred on
// the Galactic Centre, at five wavelengths. Same sky; only the wavelength changes.
const FRAMES = [
  { f: 5, note: "Dark dust lanes split the Milky Way" },
  { f: 30, note: "Dust starts to thin" },
  { f: 47, note: "The Galaxy's bulge emerges" },
  { f: 62, note: "Star-forming clouds light up" },
  { f: 88, note: "Longest wavelengths: warm dust" },
];

export default function HeroGlobe() {
  const [k, setK] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setK((x) => (x + 1) % FRAMES.length), 2600);
    return () => clearInterval(id);
  }, [reduced]);
  const cur = FRAMES[k];
  const um = WAVELENGTHS_UM[cur.f];
  return (
    <Link
      href={`/explore?ra=266.405&dec=-28.936&fov=140&frame=${cur.f}`}
      className="group relative block aspect-square w-full max-w-[560px]"
      aria-label="Open this view in Explore"
    >
      <div
        className="absolute inset-[6%] rounded-full blur-3xl transition-colors duration-1000"
        style={{ background: wavelengthColor(um, 0.22) }}
      />
      {FRAMES.map((fr, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={fr.f}
          src={`/img/globe-${fr.f}.webp`}
          alt={`The Milky Way in the SPHEREx all-sky map at ${WAVELENGTHS_UM[fr.f].toFixed(2)} micrometres`}
          className="absolute inset-0 h-full w-full transition-opacity duration-1000 group-hover:scale-[1.01]"
          style={{ opacity: i === k ? 1 : 0 }}
        />
      ))}
      <div className="absolute -bottom-2 left-1/2 w-max -translate-x-1/2 text-center">
        <div className="glass inline-flex items-center gap-3 rounded-full px-4 py-1.5">
          <span className="data text-[18px] font-semibold" style={{ color: wavelengthColor(um) }}>
            {um.toFixed(2)} µm
          </span>
          <span className="text-[12.5px] text-text/80">{cur.note}</span>
        </div>
        <div className="mt-2 flex justify-center gap-1.5">
          {FRAMES.map((fr, i) => (
            <button
              key={fr.f}
              type="button"
              aria-label={`Show ${WAVELENGTHS_UM[fr.f].toFixed(2)} micrometres`}
              onClick={(e) => {
                e.preventDefault();
                setK(i);
              }}
              className="h-1.5 w-6 rounded-full transition"
              style={{ background: i === k ? wavelengthColor(WAVELENGTHS_UM[fr.f]) : "rgba(255,255,255,0.15)" }}
            />
          ))}
        </div>
      </div>
    </Link>
  );
}
