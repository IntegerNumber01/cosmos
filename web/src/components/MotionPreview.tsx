"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadFeaturedMotion, type FeaturedMotion } from "@/lib/featuredMotion";
import { makeGrid, reproject, skyLevel, skyToGrid, measure } from "@/lib/engine/sequence";
import { propagate } from "@/lib/engine/astrometry";
import { TT_BY_SLUG } from "@/lib/ttTargets";
import GridCanvas from "./timetravel/GridCanvas";

export default function MotionPreview() {
  const [data, setData] = useState<FeaturedMotion | null>(null), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0), [later, setLater] = useState(false), [playing, setPlaying] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    setError(""); setData(null);
    loadFeaturedMotion(c.signal).then(setData).catch(e => { if (!c.signal.aborted) setError(String(e.message ?? e)); });
    return () => c.abort();
  }, [attempt]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setLater(v => !v), 900);
    const stop = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", stop);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", stop); };
  }, [playing]);
  const display = useMemo(() => {
    if (!data) return null;
    const t = TT_BY_SLUG.epsindib, grid = makeGrid(t.ra, t.dec, 0.04);
    const usable = data.frames.filter(f => data.result.positions.some(p => p.obsid === f.meta.obsid)).sort((a,b) => a.meta.mjdAvg - b.meta.mjdAvg);
    const frames = [usable[0], usable.at(-1)!];
    const n = 12, left = Math.floor((grid.n - n) / 2), bottom = left;
    const images = frames.map(f => {
      const full = reproject(f, grid, skyLevel(f).level), pixels = new Float32Array(n * n);
      for (let j=0;j<n;j++) for(let i=0;i<n;i++) pixels[j*n+i]=full[(bottom+j)*grid.n+left+i];
      return pixels;
    });
    const markers = frames.map(f => {
      const p = propagate(t.ra,t.dec,...t.pm!,51544.5+25.9*365.25,f.meta.mjdAvg)!;
      const m = measure(f,...p);
      if (!m.centroid) return null;
      const [x,y] = skyToGrid(grid,m.centroid.ra,m.centroid.dec);
      return { x: (x-left+0.5)/n*100, y: (n-(y-bottom)-0.5)/n*100 };
    });
    const values = images.flatMap(im=>Array.from(im).filter(Number.isFinite)).sort((a,b)=>a-b);
    return { frames, images, markers, n, lo: Math.min(0,values[Math.floor(values.length*.02)]??0), hi: Math.max(1,values[Math.floor(values.length*.995)]??1) };
  }, [data]);
  const index = later ? 1 : 0;
  return <section aria-label="Try a real motion investigation" className="overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4"><div><div className="label">Try it here · real SPHEREx images</div><h2 className="font-display mt-1 text-[20px] font-semibold">One brown dwarf. One year apart.</h2></div><span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">1.11 µm</span></div>
    {!display && !error && <div role="status" className="flex aspect-square items-center justify-center p-8 text-center text-muted">Loading the original pixels and checking the reference stars…</div>}
    {error && <div role="alert" className="p-6"><p className="text-[14px]">{error}</p><button className="btn mt-3" onClick={()=>setAttempt(n=>n+1)}>Retry the real images</button><Link href="/learn" className="link ml-4">Read the investigation guide</Link></div>}
    {display && data && <>
      <div className="px-5 pt-4"><div role="group" aria-label="Choose observation date" className="flex flex-wrap gap-2">{[false,true].map((value,i)=><button key={i} type="button" aria-pressed={later===value} onClick={()=>{setPlaying(false);setLater(value);}} className={`btn grow ${later===value?"btn-primary":""}`}>{i===0?"Earlier":"Later"} · {display.frames[i].meta.dateAvg.slice(0,10)}</button>)}<button type="button" className="btn" aria-pressed={playing} onClick={()=>setPlaying(v=>!v)}>{playing?"Pause blink":"Blink dates"}</button></div></div>
      <figure className="p-5">
        <div className="relative mx-auto aspect-square max-w-[380px] overflow-hidden rounded-xl">
          <GridCanvas data={display.images[index]} n={display.n} mode="image" lo={display.lo} hi={display.hi} label={`Epsilon Indi B on ${display.frames[index].meta.dateAvg.slice(0,10)}, enlarged on the same sky grid`} className="absolute inset-0 h-full w-full" />
          <svg viewBox="0 0 100 100" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
            {display.markers[0] && <circle cx={display.markers[0].x} cy={display.markers[0].y} r="9" fill="none" stroke="white" strokeDasharray="2 1.5" strokeWidth=".5" />}
            {display.markers[index] && <circle cx={display.markers[index]!.x} cy={display.markers[index]!.y} r="7" fill="none" stroke="var(--accent)" strokeWidth=".7" />}
          </svg>
        </div>
        <figcaption className="mt-3 text-[12px] leading-relaxed text-muted">Solid ring: position measured in this image. Dashed ring: its earlier position. The source moves south-east by about {(data.result.shift/6.15).toFixed(2)} original camera pixels. Same sky grid and brightness scale; enlarged pixels add no detail.</figcaption>
      </figure>
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-line px-5 py-4"><div><div className="label">Recalculated from native pixels</div><p className="font-display mt-1 text-[27px] font-semibold">{data.result.shift.toFixed(2)} <span className="text-[17px] text-muted">± {data.result.shiftError.toFixed(2)}″</span></p><p className="mt-1 text-[12px] text-muted">Reference-corrected shift · {data.result.epochs.length} visits</p></div><Link href="/timetravel?target=epsindib&guide=1&mode=swipe" className="btn">Check the evidence →</Link></div>
    </>}
  </section>;
}
