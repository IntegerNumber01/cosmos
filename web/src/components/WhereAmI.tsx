"use client";
import { useMemo } from "react";
import Advanced from "@/components/Advanced";
import { toGalactic } from "@/lib/spherex";

/**
 * Orientation inset: a top-down sketch of the Milky Way with the Sun marked, and an arrow
 * showing which way the current view points. The arrow is computed from the real view
 * centre (galactic longitude); the galaxy drawing itself is a schematic.
 *
 * Seen from above the galaxy's north pole, with the centre "up": galactic longitude 90°
 * (the direction the Sun orbits) points LEFT, so the galaxy turns clockwise.
 */

const C = { x: 110, y: 92 }; // galactic centre in the sketch
const R = 84; // ≈ 50,000 light-years
const SUN = { x: C.x, y: C.y + R * (26 / 50) }; // Sun ≈ 26,000 ly from the centre

function arm(phase: number) {
  // logarithmic spiral, trailing clockwise
  const pts: string[] = [];
  for (let t = 0; t <= 1; t += 0.04) {
    const r = 14 + t * (R - 10);
    const a = phase - t * 4.2;
    pts.push(`${(C.x + r * Math.cos(a)).toFixed(1)},${(C.y + r * Math.sin(a) * 0.98).toFixed(1)}`);
  }
  return `M${pts.join(" L")}`;
}
const ARMS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map(arm);

export function describeDirection(ra: number, dec: number) {
  const { l, b } = toGalactic(ra, dec);
  let where: string;
  if (Math.abs(b) > 30) where = b > 0 ? "up, out of our galaxy's disc" : "down, out of our galaxy's disc";
  else if (l < 30 || l > 330) where = "toward the center of our galaxy";
  else if (l > 150 && l < 210) where = "away from the center, toward the galaxy's outer edge";
  else where = "along the disc of our galaxy";
  return { l, b, where };
}

export default function WhereAmI({ ra, dec, fov, onClose }: { ra: number; dec: number; fov: number; onClose?: () => void }) {
  const { l, b, where } = useMemo(() => describeDirection(ra, dec), [ra, dec]);
  const a = (l * Math.PI) / 180;
  const dir = { x: -Math.sin(a), y: -Math.cos(a) }; // l=0 up, l=90 left (seen from galactic north)
  const half = (Math.min(fov, 120) / 2) * (Math.PI / 180);
  const len = 66 * Math.max(0.35, Math.cos((b * Math.PI) / 180)); // looking out of the disc → shorter arrow
  const ang = Math.atan2(dir.y, dir.x);
  const r1 = (v: number) => Math.round(v * 10) / 10; // stable server/client markup
  const p1 = { x: r1(SUN.x + len * Math.cos(ang - half)), y: r1(SUN.y + len * Math.sin(ang - half)) };
  const p2 = { x: r1(SUN.x + len * Math.cos(ang + half)), y: r1(SUN.y + len * Math.sin(ang + half)) };
  const tip = { x: r1(SUN.x + len * dir.x), y: r1(SUN.y + len * dir.y) };
  const lenR = r1(len);

  return (
    <div className="glass w-[236px] rounded-2xl p-3">
      <div className="flex items-start justify-between">
        <div className="label">Where am I looking?</div>
        {onClose && (
          <button className="-mt-0.5 text-[12px] text-muted hover:text-white" onClick={onClose} aria-label="Hide map">
            ✕
          </button>
        )}
      </div>
      <svg viewBox="0 0 220 186" className="mt-1 w-full" role="img" aria-label={`Sketch of the Milky Way from above. You are at the Sun, looking ${where}.`}>
        <defs>
          <radialGradient id="wai-disc" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffe2b0" stopOpacity="0.55" />
            <stop offset="25%" stopColor="#c9b6ff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#7fd8ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="wai-cone" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7fd8ff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#7fd8ff" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <circle cx={C.x} cy={C.y} r={R} fill="url(#wai-disc)" />
        {ARMS.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#c9d4ff" strokeOpacity="0.22" strokeWidth="5" strokeLinecap="round" />
        ))}
        <ellipse cx={C.x} cy={C.y} rx="15" ry="6" transform={`rotate(-28 ${C.x} ${C.y})`} fill="#fff1d0" fillOpacity="0.55" />
        <text x={C.x} y={C.y - 12} textAnchor="middle" fontSize="8.5" fill="#f4f4f5" fillOpacity="0.7">
          Galaxy center
        </text>
        {/* view cone */}
        <path d={`M${SUN.x},${SUN.y} L${p1.x},${p1.y} A${lenR},${lenR} 0 0 1 ${p2.x},${p2.y} Z`} fill="#7fd8ff" fillOpacity="0.16" stroke="#7fd8ff" strokeOpacity="0.5" strokeWidth="0.8" />
        <line x1={SUN.x} y1={SUN.y} x2={tip.x} y2={tip.y} stroke="#7fd8ff" strokeWidth="1.6" />
        <circle cx={tip.x} cy={tip.y} r="2.2" fill="#7fd8ff" />
        {/* you are here */}
        <circle cx={SUN.x} cy={SUN.y} r="6" fill="#ffc857" fillOpacity="0.25" />
        <circle cx={SUN.x} cy={SUN.y} r="3" fill="#ffc857" />
        <text x={SUN.x + 8} y={SUN.y + 13} fontSize="9" fill="#ffc857">
          You: Sun &amp; Earth
        </text>
      </svg>
      <p className="mt-1 text-[12.5px] leading-snug text-text/90">
        You&apos;re on Earth, inside the Milky Way, looking <b className="text-white">{where}</b>.
      </p>
      <Advanced className="mt-1.5" label="About this map" openLabel="Hide">
        <p>
          The galaxy is a sketch: nobody has photographed the Milky Way from outside. The arrow is real. It points from the Sun
          toward the center of your view (galactic longitude {l.toFixed(0)}°, latitude {b.toFixed(0)}°).
        </p>
        <p className="mt-1.5">
          Seen from above, with the center at the top. The Sun is about 26,000 light-years from the center; Earth is only
          8 light-minutes from the Sun, so at this scale they are the same dot. The infrared sky around you is the inside of
          a sphere with you at its center.
        </p>
      </Advanced>
    </div>
  );
}
