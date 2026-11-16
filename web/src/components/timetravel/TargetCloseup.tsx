"use client";

import { useMemo } from "react";
import GridCanvas from "./GridCanvas";
import { Frame, Grid, skyToGrid } from "@/lib/engine/sequence";

/** Same fixed sky crop, pixels and stretch on both dates; magnification adds no resolution. */
export default function TargetCloseup({ frames, grids, grid, pair, ra, dec, lo, hi }: {
  frames: Frame[]; grids: Float32Array[]; grid: Grid; pair: [number, number];
  ra: number; dec: number; lo: number; hi: number;
}) {
  const width = Math.min(12, grid.n);
  const crops = useMemo(() => {
    const [x, y] = skyToGrid(grid, ra, dec);
    const left = Math.max(0, Math.min(grid.n - width, Math.floor(x - width / 2)));
    const bottom = Math.max(0, Math.min(grid.n - width, Math.floor(y - width / 2)));
    return pair.map((id) => {
      const pixels = new Float32Array(width * width).fill(NaN);
      for (let j = 0; j < width; j++) for (let i = 0; i < width; i++) pixels[j * width + i] = grids[id][(bottom + j) * grid.n + left + i];
      return pixels;
    });
  }, [ra, dec, grids, grid, pair, width]);
  return <section aria-label="Magnified target comparison" className="glass mt-3 rounded-2xl p-4">
    <h3 className="text-[14px] font-semibold">A closer look at the target</h3>
    <div className="mt-3 grid grid-cols-2 gap-3">
      {crops.map((pixels, i) => <figure key={i}>
        <GridCanvas data={pixels} n={width} mode="image" lo={lo} hi={hi} className="aspect-square w-full rounded-lg" label={`Magnified target on ${frames[pair[i]].meta.dateAvg.slice(0, 10)}`} />
        <figcaption className="data mt-1 text-[11.5px] text-muted">{frames[pair[i]].meta.dateAvg.slice(0, 10)}</figcaption>
      </figure>)}
    </div>
    <p className="mt-2 text-[12px] leading-relaxed text-muted">The same patch of sky and brightness scale on both dates. These are enlarged display pixels, with no added detail. Measurements use each original image.</p>
  </section>;
}
