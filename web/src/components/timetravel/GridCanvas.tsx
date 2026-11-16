"use client";
import { useEffect, useRef } from "react";

// 256-entry magma-like LUT (perceptual, dark -> bright) and a diverging blue-black-red LUT.
function lut(stops: [number, number, number, number][]) {
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, r0, g0, b0] = stops[k];
    const [t1, r1, g1, b1] = stops[k + 1];
    const f = (t - t0) / (t1 - t0);
    out[i * 3] = r0 + (r1 - r0) * f;
    out[i * 3 + 1] = g0 + (g1 - g0) * f;
    out[i * 3 + 2] = b0 + (b1 - b0) * f;
  }
  return out;
}
export const MAGMA = lut([
  [0, 3, 3, 12],
  [0.15, 30, 14, 70],
  [0.35, 100, 28, 125],
  [0.55, 180, 54, 122],
  [0.75, 241, 105, 92],
  [0.9, 253, 180, 115],
  [1, 252, 253, 191],
]);
// Dark-centred diverging map: "no change" is near-black so overlaid circles and labels stay
// visible; fainter-later ramps to bright blue, brighter-later ramps to bright red.
export const DIVERGING = lut([
  [0, 150, 210, 255],
  [0.25, 40, 110, 220],
  [0.5, 10, 10, 14],
  [0.75, 210, 50, 50],
  [1, 255, 150, 120],
]);

type Props = {
  data: Float32Array;
  n: number;
  mode: "image" | "diverging";
  lo: number; // image: value at black; diverging: -scale..+scale uses hi
  hi: number;
  className?: string;
  style?: React.CSSProperties;
  label: string;
};

/** Renders an n×n float grid (row j = north up) with asinh stretch or a diverging map. NaN = dark grey. */
export default function GridCanvas({ data, n, mode, lo, hi, className = "", style, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = n;
    c.height = n;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(n, n);
    const soft = 0.08;
    const norm = Math.asinh(1 / soft);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const v = data[j * n + i];
        const o = ((n - 1 - j) * n + i) * 4; // flip: north up
        if (!Number.isFinite(v)) {
          img.data[o] = 22;
          img.data[o + 1] = 24;
          img.data[o + 2] = 34;
          img.data[o + 3] = 255;
          continue;
        }
        let k: number;
        let L: Uint8ClampedArray;
        if (mode === "image") {
          const t = Math.max(0, (v - lo) / (hi - lo));
          k = Math.min(255, Math.round((Math.asinh(t / soft) / norm) * 255));
          L = MAGMA;
        } else {
          k = Math.min(255, Math.max(0, Math.round((0.5 + v / (2 * hi)) * 255)));
          L = DIVERGING;
        }
        img.data[o] = L[k * 3];
        img.data[o + 1] = L[k * 3 + 1];
        img.data[o + 2] = L[k * 3 + 2];
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  }, [data, n, mode, lo, hi]);
  return <canvas ref={ref} className={`pixelated ${className}`} style={style} role="img" aria-label={label} />;
}
