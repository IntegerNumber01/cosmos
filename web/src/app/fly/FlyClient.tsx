"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import NavBar from "@/components/NavBar";
import StarField, { StarFieldHandle } from "@/components/StarField";
import { GaiaData, PC_TO_LY, StarInfo, starInfo } from "@/lib/gaia";

function fmtDist(pc: number) {
  if (pc < 0.01) return "at the Sun";
  return `${pc < 10 ? pc.toFixed(2) : pc.toFixed(1)} pc · ${(pc * PC_TO_LY).toFixed(pc < 10 ? 1 : 0)} ly`;
}

export default function FlyClient() {
  const sp = useSearchParams();
  const ra = sp.get("ra") ? parseFloat(sp.get("ra")!) : 266.4;
  const dec = sp.get("dec") ? parseFloat(sp.get("dec")!) : -28.9;
  const field = useRef<StarFieldHandle>(null);
  const [g, setG] = useState<GaiaData | null>(null);
  const [sel, setSel] = useState<StarInfo | null>(null);
  const [cam, setCam] = useState({ distPc: 0, speed: 2 });
  const [help, setHelp] = useState(true);
  const [sky, setSky] = useState(true);
  const [tourOpen, setTourOpen] = useState(true);
  useEffect(() => {
    if (window.innerWidth < 768) {
      setTourOpen(false);
      setHelp(false);
    }
  }, []);

  const tour = g ? [...g.meta.labels].map((l) => starInfo(g, l.i)).sort((a, b) => a.distPc - b.distPc) : [];

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#020308]">
      <div className="absolute inset-0 isolate z-0">
        <StarField
          ref={field}
          mode="fly"
          lookRa={ra}
          lookDec={dec}
          selected={sel?.i ?? null}
          onSelect={(s) => setSel(s)}
          onCamera={setCam}
          onReady={setG}
          skyStrength={sky ? 0.55 : 0}
        />
      </div>
      <NavBar />

      {/* left: tour */}
      <button
        className="btn absolute left-4 top-20 z-30 md:hidden"
        onClick={() => setTourOpen((o) => !o)}
        style={{ display: tourOpen ? "none" : undefined }}
      >
        ☆ Neighbours
      </button>
      <aside className={`absolute left-4 top-20 z-30 w-[270px] sm:left-5 ${tourOpen ? "" : "hidden"}`}>
        <div className="glass scrollbar-thin max-h-[calc(100vh-200px)] overflow-y-auto rounded-2xl p-3">
          <div className="flex items-center justify-between px-1">
            <div className="label">Fly to a neighbour</div>
            <button className="text-[12px] text-muted hover:text-white md:hidden" onClick={() => setTourOpen(false)}>
              Hide
            </button>
          </div>
          <p className="px-1 pb-2 pt-1 text-[11.5px] leading-snug text-muted">
            Named only when a Gaia source matches the star&apos;s position, distance and brightness.
          </p>
          <ul className="space-y-0.5">
            {tour.map((s) => (
              <li key={s.i}>
                <button
                  onClick={() => {
                    setSel(s);
                    field.current?.flyToStar(s.i);
                    if (window.innerWidth < 768) setTourOpen(false);
                  }}
                  className={`flex w-full items-baseline justify-between rounded-lg px-2.5 py-1.5 text-left transition ${
                    sel?.i === s.i ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <span className="text-[13px]">{s.name}</span>
                  <span className="data text-[11px] text-muted">{s.distPc.toFixed(2)} pc</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="btn mt-2 w-full justify-center" onClick={() => field.current?.home()}>
            ☉ Return to the Sun
          </button>
        </div>
      </aside>

      {/* right: selected star */}
      {sel && (
        <div key={sel.i} className="fade-up absolute inset-x-4 bottom-28 z-30 sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-20 sm:w-[330px]">
          <div className="glass rounded-2xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="label">Gaia DR3 measurement</div>
                <h2 className="font-display mt-0.5 text-[20px] font-semibold">{sel.name ?? "Unnamed star"}</h2>
                <div className="data text-[11px] text-muted">Gaia DR3 {sel.sourceId}</div>
              </div>
              <button className="text-muted hover:text-white" onClick={() => setSel(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="mt-3 rounded-xl bg-white/5 p-3">
              <div className="label">Distance from the Sun</div>
              <div className="data mt-1 text-[22px] font-semibold">
                {sel.distPc.toFixed(sel.distPc < 10 ? 3 : 2)} <span className="text-[13px] text-muted">± {sel.distErrPc.toFixed(sel.distErrPc < 0.01 ? 4 : 3)} pc</span>
              </div>
              <div className="text-[12px] text-muted">
                {(sel.distPc * PC_TO_LY).toFixed(2)} light-years. The light you see left it about {(sel.distPc * PC_TO_LY).toFixed(0)} years ago.
              </div>
            </div>
            <div className="data mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
              <span className="text-muted">Parallax</span>
              <span className="text-right">
                {sel.parallax.toFixed(3)} ± {sel.parallaxErr.toFixed(3)} mas
              </span>
              <span className="text-muted">G magnitude</span>
              <span className="text-right">{sel.g.toFixed(2)}</span>
              <span className="text-muted">Absolute G</span>
              <span className="text-right">{sel.absG.toFixed(2)}</span>
              <span className="text-muted">BP − RP colour</span>
              <span className="text-right">{sel.bpRp === null ? "—" : sel.bpRp.toFixed(2)}</span>
              <span className="text-muted">Teff (GSP-Phot)</span>
              <span className="text-right">{sel.teff ? `${sel.teff} K` : "—"}</span>
              <span className="text-muted">RUWE</span>
              <span className="text-right">{sel.ruwe ?? "—"}</span>
              <span className="text-muted">RA, Dec (J2016)</span>
              <span className="text-right">
                {sel.ra.toFixed(4)}°, {sel.dec.toFixed(4)}°
              </span>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-dim">
              Distance = 1 / parallax. Precise because parallax / error = {(sel.parallax / sel.parallaxErr).toFixed(0)}. Colour on
              screen is approximated from BP − RP.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn" onClick={() => field.current?.flyToStar(sel.i)}>
                Fly here
              </button>
              <Link className="btn" href={`/explore?ra=${sel.ra.toFixed(4)}&dec=${sel.dec.toFixed(4)}&fov=0.5&frame=20`}>
                See it in SPHEREx infrared
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* bottom HUD */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-4 pb-4">
        {help && (
          <div className="glass flex items-center gap-4 rounded-full px-4 py-2 text-[12px] text-muted">
            <span>
              <b className="text-text">Drag</b> to look
            </span>
            <span>
              <b className="text-text">W A S D</b> / arrows to fly · <b className="text-text">Q E</b> down/up
            </span>
            <span>
              <b className="text-text">Scroll</b> to change speed
            </span>
            <span>
              <b className="text-text">Click</b> a star to inspect it
            </span>
            <button className="text-dim hover:text-white" onClick={() => setHelp(false)} aria-label="Dismiss help">
              ✕
            </button>
          </div>
        )}
        <div className="glass data flex flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-full px-5 py-2 text-[12px]">
          <span>
            <span className="text-dim">you are </span>
            {cam.distPc < 0.01 ? "at the Sun" : `${fmtDist(cam.distPc)} from the Sun`}
          </span>
          <span>
            <span className="text-dim">speed </span>
            {cam.speed.toFixed(2)} pc/s
          </span>
          <span className="text-muted">{g ? `${g.meta.n.toLocaleString()} stars, every one placed by a Gaia DR3 parallax` : "loading Gaia DR3…"}</span>
          <button
            className={`font-sans rounded-full border px-2.5 py-0.5 text-[11px] transition ${sky ? "border-accent/50 text-accent" : "border-line text-muted"}`}
            onClick={() => setSky((v) => !v)}
            title="SPHEREx all-sky map at 2.24 µm, drawn infinitely far away for orientation. It carries no depth."
          >
            Infrared sky backdrop {sky ? "on" : "off"}
          </button>
        </div>
        <div className="text-center text-[10.5px] text-dim">
          ESA Gaia DR3 · all stars within 50 pc with parallax/error &gt; 10, plus naked-eye stars (G &lt; 6.5, parallax/error &gt; 5) ·
          3D comes from Gaia only. The infrared backdrop (SPHEREx 2.24 µm) is drawn at infinity and carries no depth.
        </div>
      </div>
    </main>
  );
}
