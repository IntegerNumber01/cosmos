"use client";
import type { Frame, Sequence } from "@/lib/caseTypes";

type Props = {
  seq: Sequence;
  frameIndex: number;
  mode: "frames" | "difference";
  showPred: boolean;
  showMeas: boolean;
  showFlags: boolean;
  showTrail: boolean;
};

// pixel (x right, y up; 0-based centres) -> SVG coords in a viewBox of N x N (y down)
const sx = (x: number) => x + 0.5;
const sy = (y: number, n: number) => n - 0.5 - y;

export default function FrameStage({ seq, frameIndex, mode, showPred, showMeas, showFlags, showTrail }: Props) {
  const n = seq.grid.n;
  const f: Frame = seq.frames[frameIndex];
  const arcminPx = 60 / seq.grid.pixel_arcsec;
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-line bg-black">
      {mode === "frames" ? (
        seq.frames.map((fr, i) => (
          // all frames stacked; only the current is visible: instant blink, no reload flicker
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={fr.png}
            src={fr.png}
            alt={`SPHEREx ${fr.productid} at ${fr.date_avg} UTC, ${fr.wavelength_um} µm`}
            className="pixelated absolute inset-0 h-full w-full"
            style={{ opacity: i === frameIndex ? 1 : 0 }}
            draggable={false}
          />
        ))
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={seq.diff_png} alt="Difference image: last minus first exposure" className="pixelated absolute inset-0 h-full w-full" draggable={false} />
      )}
      {showFlags && mode === "frames" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={f.flags_png} alt="Flagged pixels overlay" className="pixelated absolute inset-0 h-full w-full" draggable={false} />
      )}
      <svg viewBox={`0 0 ${n} ${n}`} className="absolute inset-0 h-full w-full" aria-hidden>
        {showTrail &&
          seq.frames.map((fr, i) => (
            <circle
              key={i}
              cx={sx(fr.measured.x)}
              cy={sy(fr.measured.y, n)}
              r={0.7}
              fill={i === frameIndex ? "#6ef0b0" : "rgba(110,240,176,0.45)"}
            />
          ))}
        {showTrail && (
          <polyline
            points={seq.frames.map((fr) => `${sx(fr.measured.x)},${sy(fr.measured.y, n)}`).join(" ")}
            fill="none"
            stroke="rgba(110,240,176,0.5)"
            strokeWidth={0.25}
          />
        )}
        {showPred && mode === "frames" && (
          <g stroke="#7fd8ff" strokeWidth={0.35} fill="none">
            <line x1={sx(f.predicted_mid.x) - 4} y1={sy(f.predicted_mid.y, n)} x2={sx(f.predicted_mid.x) - 1.5} y2={sy(f.predicted_mid.y, n)} />
            <line x1={sx(f.predicted_mid.x) + 1.5} y1={sy(f.predicted_mid.y, n)} x2={sx(f.predicted_mid.x) + 4} y2={sy(f.predicted_mid.y, n)} />
            <line x1={sx(f.predicted_mid.x)} y1={sy(f.predicted_mid.y, n) - 4} x2={sx(f.predicted_mid.x)} y2={sy(f.predicted_mid.y, n) - 1.5} />
            <line x1={sx(f.predicted_mid.x)} y1={sy(f.predicted_mid.y, n) + 1.5} x2={sx(f.predicted_mid.x)} y2={sy(f.predicted_mid.y, n) + 4} />
            <text x={sx(f.predicted_mid.x) + 4.6} y={sy(f.predicted_mid.y, n) - 3.2} fill="#7fd8ff" stroke="none" fontSize={2.6} fontFamily="Inter">
              predicted
            </text>
          </g>
        )}
        {showMeas && mode === "frames" && (
          <g>
            <circle cx={sx(f.measured.x)} cy={sy(f.measured.y, n)} r={3} fill="none" stroke="#6ef0b0" strokeWidth={0.35} />
            <text x={sx(f.measured.x) - 4} y={sy(f.measured.y, n) + 6.4} fill="#6ef0b0" fontSize={2.6} fontFamily="Inter">
              measured
            </text>
          </g>
        )}
        {/* compass: north up, east left */}
        <g transform={`translate(${n - 9},${9})`} stroke="rgba(233,237,255,0.8)" strokeWidth={0.3} fill="none">
          <line x1={0} y1={0} x2={0} y2={-5} />
          <line x1={0} y1={0} x2={-5} y2={0} />
          <text x={-1} y={-6} fill="rgba(233,237,255,0.85)" stroke="none" fontSize={2.6} fontFamily="Inter">N</text>
          <text x={-8.2} y={1} fill="rgba(233,237,255,0.85)" stroke="none" fontSize={2.6} fontFamily="Inter">E</text>
        </g>
        {/* scale bar: 1 arcmin */}
        <g transform={`translate(5,${n - 5})`}>
          <line x1={0} y1={0} x2={arcminPx} y2={0} stroke="rgba(233,237,255,0.85)" strokeWidth={0.4} />
          <text x={0} y={-1.5} fill="rgba(233,237,255,0.85)" fontSize={2.6} fontFamily="Inter">1′ (≈ 10 px)</text>
        </g>
      </svg>
      {mode === "difference" && (
        <div className="absolute bottom-3 right-3 rounded-lg bg-black/70 px-2.5 py-1.5 text-[11px] leading-snug">
          <span className="text-[#e46a5a]">red</span>: brighter in the last exposure ·{" "}
          <span className="text-[#6aa5e4]">blue</span>: brighter in the first
          <br />
          <span className="text-muted">
            The comet leaves a blue/red pair. These exposures are {seq.diff_wavelength_gap_channels} channel widths apart in wavelength, so star
            residuals remain. Use this for position only.
          </span>
        </div>
      )}
    </div>
  );
}
