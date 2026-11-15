"use client";
import { useEffect, useRef, useState } from "react";
import {
  BANDS,
  BLANK_FRAMES,
  DEPTH,
  WAVELENGTHS_UM,
  bandOf,
  channelOf,
  nearestValidFrame,
  stripingNear,
  wavelengthColor,
} from "@/lib/spherex";

type Props = {
  frame: number;
  onChange: (f: number) => void;
};

export default function WavelengthDial({ frame, onChange }: Props) {
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [blankNote, setBlankNote] = useState(false);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  // autoplay: sweep through the spectrum, slow enough for tiles to arrive
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      let f = frameRef.current + 3;
      if (f >= DEPTH) f = 0;
      onChange(nearestValidFrame(f, 1));
    }, 2200);
    return () => clearInterval(id);
  }, [playing, onChange]);

  // keyboard: ← → step one channel, Shift jumps a band
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const step = e.shiftKey ? 17 : 1;
        onChange(nearestValidFrame(frameRef.current + dir * step, dir));
        e.preventDefault();
      } else if (e.key === " ") {
        setPlaying((p) => !p);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange]);

  const set = (f: number, dir = 1) => {
    if (BLANK_FRAMES.has(f)) {
      setBlankNote(true);
      setTimeout(() => setBlankNote(false), 4000);
    }
    onChange(nearestValidFrame(f, dir));
  };

  const shown = hover ?? frame;
  const um = WAVELENGTHS_UM[frame];
  const band = bandOf(frame);
  const stripe = stripingNear(frame);
  const color = wavelengthColor(um);

  return (
    <div className="glass w-full max-w-[980px] rounded-2xl px-4 pb-3 pt-3 sm:px-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex items-end gap-4">
          <div>
            <div className="label">Wavelength</div>
            <div className="flex items-baseline gap-2">
              <span className="data text-[34px] font-semibold leading-none" style={{ color }}>
                {um.toFixed(3)}
              </span>
              <span className="text-[15px] text-muted">µm</span>
            </div>
          </div>
          <div className="hidden pb-1 sm:block">
            <div className="text-[13px] text-text">
              Band {band} · Channel {channelOf(frame)} <span className="text-dim">· frame {frame + 1}/102</span>
            </div>
            <div className="text-[12px] text-muted">{BANDS[band - 1].note}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stripe && (
            <span
              className="rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-[11px] text-warn"
              title="The SPHEREx DR1 all-sky cube shows striping artefacts near this wavelength. Treat linear patterns with caution."
            >
              ⚠ striping reported near {stripe} µm
            </span>
          )}
          <button className="btn" onClick={() => set(frame - 1, -1)} aria-label="Previous channel">
            ←
          </button>
          <button
            className={`btn ${playing ? "btn-primary" : ""}`}
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause wavelength sweep" : "Sweep through wavelengths"}
          >
            {playing ? "❚❚ Pause" : "▶ Sweep"}
          </button>
          <button className="btn" onClick={() => set(frame + 1, 1)} aria-label="Next channel">
            →
          </button>
        </div>
      </div>

      {/* spectrum ribbon */}
      <div className="relative mt-3 select-none">
        <div className="flex h-[34px] w-full overflow-hidden rounded-md">
          {WAVELENGTHS_UM.map((w, i) => {
            const blank = BLANK_FRAMES.has(i);
            const active = i === frame;
            return (
              <div
                key={i}
                className="relative h-full flex-1"
                style={{
                  background: blank
                    ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0 3px, transparent 3px 6px)"
                    : wavelengthColor(w, active ? 1 : i === hover ? 0.85 : 0.42),
                  marginRight: i % 17 === 16 ? 2 : 0,
                }}
              >
                {active && <div className="absolute inset-y-[-3px] left-1/2 w-[3px] -translate-x-1/2 rounded bg-white shadow-[0_0_12px_white]" />}
              </div>
            );
          })}
        </div>
        <input
          type="range"
          className="spectrum absolute inset-0"
          min={0}
          max={DEPTH - 1}
          step={1}
          value={frame}
          aria-label="SPHEREx wavelength channel"
          aria-valuetext={`${um.toFixed(3)} micrometres, band ${band}`}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            set(v, v >= frame ? 1 : -1);
          }}
          onMouseMove={(e) => {
            const r = (e.target as HTMLInputElement).getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left) / r.width) * (DEPTH - 1));
            setHover(Math.max(0, Math.min(DEPTH - 1, i)));
          }}
          onMouseLeave={() => setHover(null)}
        />
        {hover !== null && (
          <div
            className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md bg-black/80 px-2 py-0.5 text-[11px] data"
            style={{ left: `${(hover / (DEPTH - 1)) * 100}%` }}
          >
            {BLANK_FRAMES.has(hover) ? "blank (dichroic)" : `${WAVELENGTHS_UM[shown].toFixed(3)} µm`}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex w-full text-[10.5px] text-dim">
        {BANDS.map((b) => (
          <button
            key={b.band}
            className="flex-1 text-left transition hover:text-text"
            onClick={() => set(nearestValidFrame((b.band - 1) * 17 + 8))}
            title={b.note}
          >
            <span className={band === b.band ? "text-text" : ""}>Band {b.band}</span>{" "}
            <span className="hidden md:inline">{b.range}</span>
          </button>
        ))}
      </div>
      {blankNote && (
        <div className="mt-2 text-[12px] text-warn">
          Frames 51–52 (2.40 and 2.45 µm) are blank in the DR1 cube. Light there falls on the dichroic that splits the
          beam between detectors, so it was skipped.
        </div>
      )}
    </div>
  );
}
