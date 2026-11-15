"use client";
import { useEffect, useRef, useState } from "react";
import { STOPS, WAVELENGTHS_UM, nearestStop, stripingNear, wavelengthColor } from "@/lib/spherex";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * The default wavelength control: five named stops along the infrared spectrum instead of 102
 * numbered channels. The stops are preloaded by SkyViewer, so switching is an instant crossfade.
 */
export default function WavelengthStops({ frame, onChange }: { frame: number; onChange: (f: number) => void }) {
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const exact = STOPS.find((s) => s.frame === frame);
  const cur = exact ?? nearestStop(frame);
  const idx = STOPS.indexOf(cur);
  const um = WAVELENGTHS_UM[frame];
  const stripe = stripingNear(frame);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const i = STOPS.findIndex((s) => s.frame === frameRef.current);
      onChange(STOPS[(i + 1) % STOPS.length].frame);
    }, reduced ? 4000 : 2600);
    return () => clearInterval(id);
  }, [playing, onChange, reduced]);

  // ← → step between stops
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      // Let native controls keep Space/arrow behavior, including expandable science panels.
      if (target?.closest("input, textarea, select, button, a, [contenteditable='true'], [role='slider']")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const i = STOPS.indexOf(nearestStop(frameRef.current));
        const j = Math.max(0, Math.min(STOPS.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)));
        onChange(STOPS[j].frame);
        e.preventDefault();
      } else if (e.key === " ") {
        setPlaying((p) => !p);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange]);

  const gradient = `linear-gradient(90deg, ${STOPS.map((s, i) => `${wavelengthColor(WAVELENGTHS_UM[s.frame], 0.85)} ${(i / (STOPS.length - 1)) * 100}%`).join(", ")})`;

  return (
    <div className="glass w-full max-w-[720px] rounded-2xl px-4 pb-3 pt-3 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[19px] font-semibold leading-tight" style={{ color: wavelengthColor(um) }}>
              {exact ? cur.name : "Custom colour"}
            </span>
            <span className="data text-[11.5px] text-dim">{um.toFixed(2)} µm</span>
          </div>
          <div className="truncate text-[12.5px] text-muted">
            {exact ? cur.note : "A wavelength you picked in Advanced."}
            {stripe && <span className="text-warn/90"> Straight stripes here are a camera artefact.</span>}
          </div>
        </div>
        <button
          className={`btn shrink-0 ${playing ? "btn-primary" : ""}`}
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause the colour tour" : "Play a tour through the infrared colours"}
        >
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
      </div>

      <div className="relative mt-3 select-none" role="radiogroup" aria-label="Infrared colour">
        <div className="absolute inset-x-[10%] top-1/2 h-[6px] -translate-y-1/2 rounded-full" style={{ background: gradient }} />
        <div className="relative flex justify-between">
          {STOPS.map((s, i) => {
            const active = s.frame === frame;
            const c = wavelengthColor(WAVELENGTHS_UM[s.frame]);
            return (
              <button
                key={s.frame}
                role="radio"
                aria-checked={active}
                tabIndex={active || (!exact && i === idx) ? 0 : -1}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  e.preventDefault();
                  const j = (i + (e.key === "ArrowRight" ? 1 : STOPS.length - 1)) % STOPS.length;
                  setPlaying(false);
                  onChange(STOPS[j].frame);
                  const buttons = e.currentTarget.closest("[role='radiogroup']")?.querySelectorAll<HTMLButtonElement>("[role='radio']");
                  buttons?.[j].focus();
                }}
                onClick={() => {
                  setPlaying(false);
                  onChange(s.frame);
                }}
                className="group flex w-1/5 flex-col items-center gap-1.5 pt-1"
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded-full border-2 transition"
                  style={{
                    borderColor: c,
                    background: active ? c : "rgba(3,4,10,0.9)",
                    boxShadow: active ? `0 0 16px ${c}` : undefined,
                    transform: active ? "scale(1.15)" : undefined,
                  }}
                />
                <span className={`text-center text-[11.5px] leading-tight transition ${active || (!exact && i === idx) ? "text-white" : "text-muted group-hover:text-text"}`}>
                  {s.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex justify-between px-1 text-[10.5px] text-dim">
        <span>← closer to what eyes see</span>
        <span>deeper infrared →</span>
      </div>
    </div>
  );
}
