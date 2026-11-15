"use client";
import { useEffect, useRef } from "react";
import { Frame, Grid, gridToSky } from "@/lib/engine/sequence";
import { sky2pix } from "@/lib/engine/wcs";

export default function QualityOverlay({ frames, grid }: { frames: Frame[]; grid: Grid }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = c.height = grid.n;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const im = ctx.createImageData(grid.n, grid.n);
    for (let j = 0; j < grid.n; j++) for (let i = 0; i < grid.n; i++) {
      let level = 0;
      const [ra, dec] = gridToSky(grid, i, j);
      for (const f of frames) {
        const [x, y] = sky2pix(f.meta.wcs, ra, dec);
        const ix = Math.round(x), iy = Math.round(y);
        if (ix < 0 || iy < 0 || ix >= f.meta.nx || iy >= f.meta.ny) { level = 3; continue; }
        const k = iy * f.meta.nx + ix;
        level = Math.max(level, !f.valid[k] ? 3 : f.outlier[k] ? 2 : f.flags[k] ? 1 : 0);
      }
      if (level) {
        const o = ((grid.n - j - 1) * grid.n + i) * 4;
        const color = level === 3 ? [255, 185, 60] : level === 2 ? [200, 100, 255] : [80, 210, 245];
        im.data.set([...color, 120], o);
      }
    }
    ctx.putImageData(im, 0, 0);
  }, [frames, grid]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full pixelated" aria-label="Quality overlay: amber unusable or missing; purple outlier; cyan other flags" role="img" />;
}
