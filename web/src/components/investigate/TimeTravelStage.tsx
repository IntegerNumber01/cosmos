"use client";
import { useEffect, useRef, useState } from "react";
import { TTPair, fmtUTC } from "@/lib/caseTypes";

type Props = { pair: TTPair; view: "wipe" | "blink" | "change" };

export default function TimeTravelStage({ pair, view }: Props) {
  const [split, setSplit] = useState(0.5);
  const [showAfter, setShowAfter] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const n = pair.grid.n;

  useEffect(() => {
    if (view !== "blink") return;
    const id = setInterval(() => setShowAfter((s) => !s), 900);
    return () => clearInterval(id);
  }, [view]);

  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setSplit(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  };

  const cx = pair.comet_aperture.x + 0.5;
  const cy = n - 0.5 - pair.comet_aperture.y;

  return (
    <div
      ref={box}
      className="relative aspect-square w-full select-none overflow-hidden rounded-2xl border border-line bg-black"
      onPointerDown={(e) => {
        if (view !== "wipe") return;
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && move(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      style={{ cursor: view === "wipe" ? "ew-resize" : "default" }}
    >
      {view === "change" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pair.z_png} alt="Significance of change between the two dates" className="pixelated absolute inset-0 h-full w-full" draggable={false} />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pair.after.png} alt={`After: ${pair.after.date_avg}`} className="pixelated absolute inset-0 h-full w-full" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pair.before.png}
            alt={`Before: ${pair.before.date_avg}`}
            className="pixelated absolute inset-0 h-full w-full"
            draggable={false}
            style={
              view === "wipe"
                ? { clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` }
                : { opacity: showAfter ? 0 : 1, transition: "opacity 120ms" }
            }
          />
        </>
      )}
      <svg viewBox={`0 0 ${n} ${n}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <circle cx={cx} cy={cy} r={6} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={0.3} strokeDasharray="1 1" />
      </svg>
      {view === "wipe" && (
        <div className="pointer-events-none absolute inset-y-0" style={{ left: `${split * 100}%` }}>
          <div className="absolute inset-y-0 -translate-x-1/2 w-[2px] bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.7)]" />
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-black/70 px-2 py-1 text-[11px]">
            ⟷
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/70 px-2.5 py-1.5 text-[11px]">
        {view === "change" ? (
          <span>
            Change, scaled by the measured field scatter · <span className="text-[#6aa5e4]">blue</span> = faded,{" "}
            <span className="text-[#e46a5a]">red</span> = brightened (scale ±{pair.z_scale}σ)
          </span>
        ) : view === "blink" ? (
          <span className="data">{showAfter ? fmtUTC(pair.after.date_avg) : fmtUTC(pair.before.date_avg)}</span>
        ) : (
          <span className="data">◀ {fmtUTC(pair.before.date_avg)}</span>
        )}
      </div>
      {view === "wipe" && (
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(split * 100)}
          onChange={(e) => setSplit(parseInt(e.target.value, 10) / 100)}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute inset-x-6 bottom-3 accent-cyan-300"
          aria-label="Swipe between the two dates (arrow keys move it)"
        />
      )}
      {view === "wipe" && (
        <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-black/70 px-2.5 py-1.5 text-[11px] data">
          {fmtUTC(pair.after.date_avg)} ▶
        </div>
      )}
    </div>
  );
}
