"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WAVELENGTHS_UM, wavelengthColor } from "@/lib/spherex";
import { useReducedMotion } from "@/lib/useReducedMotion";

// Real captures of the COSMOS Explore view (SPHEREx DR1 all-sky cube): a wide (~140°) view of the sky
// from Earth, centred on the Galactic Centre, at five wavelengths. Same sky; only the wavelength changes.
const FRAMES = [
  { f: 5, note: "Dust clouds block the view" },
  { f: 30, note: "The dust starts to fade" },
  { f: 47, note: "The galaxy's bright center appears" },
  { f: 62, note: "Clouds where stars are born light up" },
  { f: 88, note: "Warm dust glows" },
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
    <figure className="w-full max-w-[560px]">
      <Link
        href={`/explore?ra=266.405&dec=-28.936&fov=140&frame=${cur.f}`}
        className="group relative block aspect-square w-full"
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
            alt={`The Milky Way seen from Earth in infrared light (${WAVELENGTHS_UM[fr.f].toFixed(2)} micrometers)`}
            className="absolute inset-0 h-full w-full transition-opacity duration-1000 group-hover:scale-[1.01]"
            style={{ opacity: i === k ? 1 : 0 }}
          />
        ))}
        <div className="absolute -bottom-2 left-1/2 w-max max-w-full -translate-x-1/2 text-center">
          <div className="glass inline-flex items-baseline gap-2 rounded-full px-4 py-1.5">
            <span className="text-[13px] font-medium text-white">{cur.note}</span>
            <span className="data text-[10.5px]" style={{ color: wavelengthColor(um) }}>
              {um.toFixed(2)} µm
            </span>
          </div>
          <div className="mt-2 flex justify-center gap-1.5">
            {FRAMES.map((fr, i) => (
              <button
                key={fr.f}
                type="button"
                aria-label={`Show infrared at ${WAVELENGTHS_UM[fr.f].toFixed(2)} micrometers`}
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
      <figcaption className="mx-auto mt-6 max-w-[440px] text-center text-[13px] leading-relaxed text-muted">
        <b className="font-medium text-text/90">What am I looking at?</b> Our sky as seen from Earth, looking toward the center of our
        galaxy, the Milky Way. We live inside it, so we see it edge-on, as a glowing band.
      </figcaption>
    </figure>
  );
}
