"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Advanced from "@/components/Advanced";
import NavBar from "@/components/NavBar";
import StarField, { StarFieldHandle } from "@/components/StarField";
import { GaiaData, PC_TO_LY, propagate, StarInfo, starInfo } from "@/lib/gaia";
import { TT_TARGETS } from "@/lib/ttTargets";

const INTRO_KEY = "cosmos.fly.introSeen";

/** Light-years, rounded for everyday reading. */
function ly(pc: number) {
  const v = pc * PC_TO_LY;
  return v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString();
}

/** Colour in plain words, from Gaia's measured colour (BP − RP; the Sun is about 0.82), else its temperature estimate. */
function colourWords(s: StarInfo): string | null {
  const b = s.bpRp;
  if (b !== null) {
    if (b < 0.3) return "Appears blue-white in Gaia's measured colour";
    if (b < 0.65) return "Appears white in Gaia's measured colour";
    if (b < 1.0) return "Appears yellow in Gaia's measured colour";
    if (b < 1.8) return "Appears orange in Gaia's measured colour";
    return "Appears red in Gaia's measured colour";
  }
  const t = s.teff;
  if (!t) return null;
  if (t > 7500) return "Blue-white: much hotter than the Sun";
  if (t > 6100) return "White: hotter than the Sun";
  if (t > 5300) return "Yellow: a lot like the Sun";
  if (t > 3900) return "Orange: cooler than the Sun";
  return "Red: much cooler than the Sun";
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
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    if (window.innerWidth < 768) {
      setTourOpen(false);
      setTouch(true);
    }
    try {
      if (localStorage.getItem(INTRO_KEY)) setHelp(false);
    } catch {
      /* storage unavailable: just show the intro */
    }
  }, []);
  const dismissHelp = () => {
    setHelp(false);
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const tour = g ? [...g.meta.labels].map((l) => starInfo(g, l.i)).sort((a, b) => a.distPc - b.distPc) : [];
  const nearest = tour[0];
  const atHome = cam.distPc < 0.01;
  const colour = sel ? colourWords(sel) : null;

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

      {/* left: nearby stars to visit */}
      <button
        className="btn absolute left-4 top-20 z-30 md:hidden"
        onClick={() => setTourOpen((o) => !o)}
        style={{ display: tourOpen ? "none" : undefined }}
      >
        ☆ Nearby stars
      </button>
      <aside className={`absolute left-4 top-20 z-30 w-[250px] sm:left-5 ${tourOpen ? "" : "hidden"}`}>
        <div className="glass scrollbar-thin max-h-[calc(100vh-300px)] overflow-y-auto rounded-2xl p-3 sm:max-h-[calc(100vh-230px)]">
          <div className="flex items-center justify-between px-1 pb-1.5">
            <div className="label">Visit a nearby star</div>
            <button className="text-[12px] text-muted hover:text-white md:hidden" onClick={() => setTourOpen(false)}>
              Hide
            </button>
          </div>
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
                  <span className="data text-[11px] text-muted">{ly(s.distPc)} ly</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="btn mt-2 w-full justify-center" onClick={() => field.current?.home()}>
            ☉ Fly home to the Sun
          </button>
        </div>
      </aside>

      {/* right: selected star */}
      {sel && (
        <div
          key={sel.i}
          className="fade-up absolute inset-x-4 bottom-36 z-30 sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-20 sm:w-[320px]"
        >
          <div className="glass scrollbar-thin max-h-[calc(100vh-230px)] overflow-y-auto rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-[20px] font-semibold leading-tight">{sel.name ?? "Unnamed star"}</h2>
              <button className="text-muted hover:text-white" onClick={() => setSel(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="mt-2 text-[22px] font-semibold">
              {ly(sel.distPc)} <span className="text-[14px] font-normal text-muted">light-years from the Sun</span>
            </div>
            <p className="mt-1 text-[13px] leading-snug text-muted">
              The light we see from Earth left it about {Math.round(sel.distPc * PC_TO_LY)} years ago.
            </p>
            {colour && <p className="mt-1.5 text-[13px] leading-snug">{colour}.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn" onClick={() => field.current?.flyToStar(sel.i)}>
                Fly here
              </button>
              <Link
                className="btn btn-primary"
                href={(() => {
                  const prepared = TT_TARGETS.find((t) => t.gaiaSourceId === sel.sourceId);
                  if (prepared) return `/timetravel?target=${prepared.slug}&from=gaia`;
                  // SPHEREx DR1 spans 2025-2026: hand over the position propagated to 2025.9 plus the proper motion
                  const p = propagate(sel, 2025.9);
                  return `/timetravel?ra=${p.ra.toFixed(5)}&dec=${p.dec.toFixed(5)}&pmra=${sel.pmra.toFixed(1)}&pmdec=${sel.pmdec.toFixed(1)}&epoch=2025.9&name=${encodeURIComponent(sel.name ?? `Gaia DR3 ${sel.sourceId}`)}&from=gaia`;
                })()}
              >
                Time Travel this star →
              </Link>
            </div>
            <Link
              className="mt-2.5 inline-block text-[12px] text-muted underline-offset-2 hover:text-white hover:underline"
              href={`/explore?ra=${sel.ra.toFixed(4)}&dec=${sel.dec.toFixed(4)}&fov=0.5&frame=20`}
            >
              Find it on the infrared map →
            </Link>
            <Advanced className="mt-3 border-t border-white/10 pt-2.5">
              <div className="data grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                <span className="text-dim">Gaia DR3 ID</span>
                <span className="break-all text-right">{sel.sourceId}</span>
                <span className="text-dim">Distance</span>
                <span className="text-right">
                  {sel.distPc.toFixed(sel.distPc < 10 ? 3 : 2)} ± {sel.distErrPc.toFixed(sel.distErrPc < 0.01 ? 4 : 3)} pc
                </span>
                <span className="text-dim">Parallax</span>
                <span className="text-right">
                  {sel.parallax.toFixed(3)} ± {sel.parallaxErr.toFixed(3)} mas
                </span>
                <span className="text-dim">G magnitude</span>
                <span className="text-right">{sel.g.toFixed(2)}</span>
                <span className="text-dim">Absolute G</span>
                <span className="text-right">{sel.absG.toFixed(2)}</span>
                <span className="text-dim">BP − RP colour</span>
                <span className="text-right">{sel.bpRp === null ? "—" : sel.bpRp.toFixed(2)}</span>
                <span className="text-dim">Teff (GSP-Phot)</span>
                <span className="text-right">{sel.teff ? `${sel.teff} K` : "—"}</span>
                <span className="text-dim">RUWE</span>
                <span className="text-right">{sel.ruwe ?? "—"}</span>
                <span className="text-dim">RA, Dec (J2016)</span>
                <span className="text-right">
                  {sel.ra.toFixed(4)}°, {sel.dec.toFixed(4)}°
                </span>
              </div>
              <p className="mt-2.5 text-[11.5px] leading-snug">
                Distance = 1 / parallax (1 pc = {PC_TO_LY} ly). Precise because parallax / error ={" "}
                {(sel.parallax / sel.parallaxErr).toFixed(0)}. Colour on screen and the colour words above come from BP − RP
                (the Sun is about 0.82), or from Teff when BP − RP is missing. A star is named only when a Gaia source matches its
                known position, distance and brightness.
              </p>
            </Advanced>
          </div>
        </div>
      )}

      {/* bottom: intro, "you are here", credits */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-4 pb-3">
        {help && !(touch && (sel || tourOpen)) && (
          <div className="glass pointer-events-auto flex max-w-[560px] items-start gap-3 rounded-2xl px-4 py-2.5 text-[13px]">
            <div className="min-w-0">
              <p className="leading-snug">
                Every dot is a real star near the Sun, placed using distances measured by ESA&apos;s Gaia satellite.
              </p>
              <p className="mt-1 text-[12px] text-muted">
                {touch ? "Drag to look · tap a star · pick a nearby star to fly there" : "Drag to look · WASD to fly · scroll for speed · click a star"}
              </p>
            </div>
            <button className="shrink-0 text-dim hover:text-white" onClick={dismissHelp} aria-label="Dismiss intro">
              ✕
            </button>
          </div>
        )}
        <div className="glass pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-2xl px-4 py-2 text-[13px]">
          <div className="text-center">
            {atHome ? (
              <>
                <span className="font-semibold text-[#ffe9a8]">☉ You&apos;re at home: the Sun</span>
                <span className="block text-[11.5px] text-muted">
                  Earth is here too: 8 light-minutes away, too close to show separately.
                  {nearest &&
                    ` ${nearest.name === "Proxima Centauri" ? "The nearest star" : "The nearest named star"}, ${nearest.name}, is ${ly(nearest.distPc)} light-years away.`}
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold">
                  You&apos;re {ly(cam.distPc)} light-years from the Sun
                </span>
                <span className="block text-[11.5px] text-muted">
                  Speed: {(cam.speed * PC_TO_LY).toFixed(1)} light-years a second
                </span>
              </>
            )}
          </div>
          {!atHome && (
            <button className="btn px-3 py-1 text-[12px]" onClick={() => field.current?.home()}>
              ☉ Fly home
            </button>
          )}
          <button
            className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${sky ? "border-accent/50 text-accent" : "border-line text-muted"}`}
            onClick={() => setSky((v) => !v)}
            title="A NASA SPHEREx infrared map of the whole sky, painted far in the background to help you find your way. It shows direction only, not distance."
          >
            Infrared sky {sky ? "on" : "off"}
          </button>
        </div>
        <div className="pointer-events-auto flex flex-col items-center text-center text-[11px] text-dim">
          <span>Stars: ESA Gaia · Background glow: NASA SPHEREx · {g ? `${g.meta.n.toLocaleString()} stars` : "loading stars…"}</span>
          <Advanced label="About this data" openLabel="Hide details" className="flex flex-col items-center">
            <div className="glass max-w-[620px] rounded-xl px-3 py-2 text-left text-[11.5px] leading-snug">
              ESA Gaia DR3: all stars within 50 pc (163 ly) with parallax/error &gt; 10, plus naked-eye stars (G &lt; 6.5,
              parallax/error &gt; 5). Every 3D position comes from a Gaia parallax. The infrared backdrop is the SPHEREx all-sky map
              at 2.24 µm, drawn infinitely far away for orientation; it carries no depth. Flying speed is{" "}
              {cam.speed.toFixed(2)} pc/s.
            </div>
          </Advanced>
        </div>
      </div>
    </main>
  );
}
