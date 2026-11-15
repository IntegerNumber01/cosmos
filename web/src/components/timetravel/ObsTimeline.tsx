"use client";
import { useMemo, useState } from "react";
import type { MatchedSet, Observation } from "@/lib/engine/sequence";
import { wavelengthColor } from "@/lib/spherex";

type Props = {
  obs: Observation[];
  selected: MatchedSet | null;
  onPick: (o: Observation) => void;
};

const W = 760;
const H = 300;
const PAD = { l: 48, r: 14, t: 14, b: 34 };

/** Every SPHEREx frame covering the target: date (x) vs wavelength at the target (y). */
export default function ObsTimeline({ obs, selected, onPick }: Props) {
  const [hover, setHover] = useState<Observation | null>(null);
  const inside = useMemo(() => obs.filter((o) => o.inside), [obs]);
  const t0 = Math.min(...inside.map((o) => o.mjd)) - 10;
  const t1 = Math.max(...inside.map((o) => o.mjd)) + 10;
  const x = (mjd: number) => PAD.l + ((mjd - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (wl: number) => H - PAD.b - ((wl - 0.7) / (5.05 - 0.7)) * (H - PAD.t - PAD.b);
  const selIds = new Set(selected?.frames.map((f) => f.obsid + f.detector));
  const months: { mjd: number; label: string }[] = [];
  const d = new Date((t0 - 40587) * 86400000);
  d.setUTCDate(1);
  for (let k = 0; k < 40; k++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1));
    const mjd = m.getTime() / 86400000 + 40587;
    if (mjd > t1) break;
    if (mjd >= t0) months.push({ mjd, label: m.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }) });
  }
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Timeline of ${inside.length} SPHEREx frames covering this position`}>
        {[1, 2, 3, 4, 5].map((wl) => (
          <g key={wl}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(wl)} y2={y(wl)} stroke="rgba(150,175,255,0.08)" />
            <text x={PAD.l - 8} y={y(wl) + 4} textAnchor="end" fontSize={11} fill="#8d96bd">
              {wl} µm
            </text>
          </g>
        ))}
        {months.map((m, i) => (
          <g key={m.mjd}>
            <line x1={x(m.mjd)} x2={x(m.mjd)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(150,175,255,0.06)" />
            {(months.length < 10 || i % 2 === 0) && (
              <text x={x(m.mjd)} y={H - PAD.b + 16} textAnchor="middle" fontSize={10.5} fill="#8d96bd">
                {m.label}
              </text>
            )}
          </g>
        ))}
        {selected && (
          <rect
            x={PAD.l}
            width={W - PAD.l - PAD.r}
            y={y(selected.lambdaRef + selected.bandwidth / 2)}
            height={Math.max(2, y(selected.lambdaRef - selected.bandwidth / 2) - y(selected.lambdaRef + selected.bandwidth / 2))}
            fill="rgba(255,255,255,0.06)"
            stroke="rgba(255,255,255,0.25)"
            strokeDasharray="3 3"
          />
        )}
        {inside.map((o) => {
          const sel = selIds.has(o.obsid + o.detector);
          return (
            <circle
              key={o.obsid + o.detector}
              cx={x(o.mjd)}
              cy={y(o.wl)}
              r={sel ? 5.5 : 3.2}
              fill={wavelengthColor(o.wl, selected && !sel ? 0.35 : 0.9)}
              stroke={sel ? "white" : "none"}
              strokeWidth={1.6}
              className="cursor-pointer"
              onMouseEnter={() => setHover(o)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPick(o)}
            >
              <title>{`${o.date.slice(0, 16)} UTC · D${o.detector} · ${o.wl.toFixed(3)} µm`}</title>
            </circle>
          );
        })}
        <text x={W - PAD.r} y={PAD.t + 10} textAnchor="end" fontSize={10.5} fill="#5d668c">
          click a dot to compare every date in that infrared colour
        </text>
      </svg>
      {hover && (
        <div className="data pointer-events-none absolute left-14 top-2 rounded-md bg-black/80 px-2 py-1 text-[11px]">
          {hover.date.slice(0, 16).replace("T", " ")} UTC · {hover.obsid} · D{hover.detector} · {hover.wl.toFixed(3)} µm
        </div>
      )}
    </div>
  );
}
