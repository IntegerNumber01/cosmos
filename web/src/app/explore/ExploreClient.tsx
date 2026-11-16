"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Advanced from "@/components/Advanced";
import NavBar from "@/components/NavBar";
import SkyViewer, { SkyViewerHandle } from "@/components/SkyViewer";
import WavelengthDial from "@/components/WavelengthDial";
import WavelengthStops from "@/components/WavelengthStops";
import WhereAmI from "@/components/WhereAmI";
import { BLANK_FRAMES, HIPS_DOI, STOP_FRAMES, WAVELENGTHS_UM, nearestValidFrame } from "@/lib/spherex";
import { TARGETS, TARGET_BY_ID, Target } from "@/lib/targets";

const COLORMAPS = [
  { id: "magma", label: "Heat" },
  { id: "grayscale", label: "Mono" },
  { id: "cubehelix", label: "Helix" },
  { id: "viridis", label: "Viridis" },
];
const INTRO_KEY = "cosmos.explore.intro.v1";

function num(v: string | null, d: number) {
  const n = v === null ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : d;
}

function fmtRA(deg: number) {
  const h = (((deg % 360) + 360) % 360) / 15;
  const hh = Math.floor(h);
  const m = (h - hh) * 60;
  const mm = Math.floor(m);
  const ss = (m - mm) * 60;
  return `${String(hh).padStart(2, "0")}h ${String(mm).padStart(2, "0")}m ${ss.toFixed(1).padStart(4, "0")}s`;
}
function fmtDec(deg: number) {
  const s = deg < 0 ? "−" : "+";
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = (a - d) * 60;
  const mm = Math.floor(m);
  const ss = (m - mm) * 60;
  return `${s}${String(d).padStart(2, "0")}° ${String(mm).padStart(2, "0")}′ ${ss.toFixed(0).padStart(2, "0")}″`;
}
function fmtFov(fov: number) {
  if (fov >= 1) return `${fov.toFixed(fov >= 10 ? 0 : 1)}°`;
  if (fov * 60 >= 1) return `${(fov * 60).toFixed(1)}′`;
  return `${(fov * 3600).toFixed(0)}″`;
}
/** How much of the sky is on screen, in words (full moon ≈ 0.5°). */
function fovWords(fov: number) {
  if (fov >= 90) return "about half the sky";
  if (fov >= 30) return "a big patch of sky";
  if (fov >= 2) return `about ${Math.round(fov / 0.5)} full moons across`;
  if (fov >= 0.5) return "about one full moon across";
  return "a tiny patch, smaller than the Moon";
}

export default function ExploreClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const initTarget = sp.get("target") ? TARGET_BY_ID[sp.get("target")!] : undefined;
  const init = useMemo(
    () => ({
      ra: num(sp.get("ra"), initTarget?.ra ?? 266.405),
      dec: num(sp.get("dec"), initTarget?.dec ?? -28.936),
      fov: num(sp.get("fov"), initTarget?.fov ?? 140),
      frame: nearestValidFrame(Math.round(num(sp.get("frame"), initTarget?.frame ?? 47))),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const viewer = useRef<SkyViewerHandle>(null);
  const [clean] = useState(() => sp.get("clean") === "1"); // hide all UI (for recording / captures)
  const [frame, setFrame] = useState(init.frame);
  const [cmap, setCmap] = useState(() => (COLORMAPS.some((c) => c.id === sp.get("cmap")) ? sp.get("cmap")! : "magma"));
  const [grid, setGrid] = useState(() => sp.get("grid") === "1");
  const [wiseOpacity, setWiseOpacity] = useState(() => Math.max(0, Math.min(1, num(sp.get("wise"), 0))));
  const [wiseStatus, setWiseStatus] = useState("");
  const [view, setView] = useState({ ra: init.ra, dec: init.dec, fov: init.fov });
  const [pointer, setPointer] = useState<{ ra: number; dec: number } | null>(null);
  const [status, setStatus] = useState<{ s: "loading" | "ready" | "error"; msg?: string }>({ s: "loading" });
  const [selected, setSelected] = useState<Target | null>(initTarget ?? null);
  const [placesOpen, setPlacesOpen] = useState(true);
  const [mapOpen, setMapOpen] = useState(true);
  const [advanced, setAdvanced] = useState(() => sp.get("adv") === "1");
  const [intro, setIntro] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gotoText, setGotoText] = useState("");
  // Preloading five wavelengths costs ~5× the tile downloads per view: skip on small screens / data saver.
  const [stops] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    return window.innerWidth >= 768 && !saveData ? STOP_FRAMES : [];
  });

  // keep the URL shareable
  useEffect(() => {
    const id = setTimeout(() => {
      const q = new URLSearchParams({
        ra: view.ra.toFixed(4),
        dec: view.dec.toFixed(4),
        fov: view.fov.toPrecision(4),
        frame: String(frame),
      });
      if (cmap !== "magma") q.set("cmap", cmap);
      if (grid) q.set("grid", "1");
      if (wiseOpacity > 0) q.set("wise", String(wiseOpacity));
      if (clean) q.set("clean", "1");
      window.history.replaceState(null, "", `/explore?${q.toString()}`);
    }, 400);
    return () => clearTimeout(id);
  }, [view, frame, clean, cmap, grid, wiseOpacity]);

  // phones: start with panels tucked away so the sky is visible; first visit: show the intro
  useEffect(() => {
    if (window.innerWidth < 768) {
      setPlacesOpen(false);
      setMapOpen(false);
    }
    try {
      if (!localStorage.getItem(INTRO_KEY) && !initTarget && !sp.get("ra")) setIntro(true);
    } catch {
      if (!initTarget && !sp.get("ra")) setIntro(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dismissIntro = () => {
    setIntro(false);
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {}
  };

  const onFrame = useCallback((f: number) => setFrame(f), []);

  const goTarget = (t: Target) => {
    setSelected(t);
    dismissIntro();
    viewer.current?.flyTo(t.ra, t.dec, t.fov, 3);
    if (t.frame !== undefined && !BLANK_FRAMES.has(t.frame)) setFrame(t.frame);
    if (window.innerWidth < 768) setPlacesOpen(false);
  };

  const onGoto = (e: React.FormEvent) => {
    e.preventDefault();
    // coordinates only (decimal degrees "ra dec"); no external name resolver dependency
    const parts = gotoText.trim().split(/[\s,]+/).map(parseFloat);
    if (parts.length >= 2 && parts.every(Number.isFinite) && Math.abs(parts[1]) <= 90) {
      viewer.current?.flyTo(((parts[0] % 360) + 360) % 360, parts[1], Math.min(view.fov, 2), 2.5);
      setSelected(null);
    } else {
      const t = TARGETS.find((x) => x.name.toLowerCase().includes(gotoText.trim().toLowerCase()));
      if (t) goTarget(t);
    }
  };

  const markers = useMemo(() => TARGETS.map((t) => ({ id: t.id, name: t.name, ra: t.ra, dec: t.dec })), []);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const um = WAVELENGTHS_UM[frame];

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      <SkyViewer
        ref={viewer}
        ra={init.ra}
        dec={init.dec}
        fov={init.fov}
        frame={frame}
        colormap={cmap}
        showGrid={grid}
        wiseOpacity={wiseOpacity}
        onWiseStatus={setWiseStatus}
        markers={clean ? [] : markers}
        onView={setView}
        onPointer={setPointer}
        onStatus={(s, msg) => setStatus({ s, msg })}
        onMarkerClick={(id) => TARGET_BY_ID[id] && goTarget(TARGET_BY_ID[id])}
        stops={stops}
      />
      {/* vignette for legibility */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(9,9,11,0.65)_100%)]" />

      {!clean && <NavBar />}

      {!clean && status.s === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="glass rounded-full px-5 py-2.5 text-[13px] text-muted">Loading NASA&apos;s infrared map of the sky…</div>
        </div>
      )}
      {status.s === "error" && (
        <div className="absolute inset-x-0 top-20 z-30 mx-auto w-fit max-w-lg">
          <div className="glass rounded-xl px-5 py-3 text-[13px] text-warn">
            The sky map couldn&apos;t load. It streams live from NASA&apos;s archive, so check your connection and reload.
            <Link className="mt-2 block link" href="/timetravel?target=epsindib">Open saved dated photos instead →</Link>
          </div>
        </div>
      )}

      {!clean && (
        <>
          {/* first visit: what am I looking at? */}
          {intro && status.s === "ready" && (
            <div className="absolute inset-0 z-40 grid place-items-center bg-black/30 px-4" onClick={dismissIntro}>
              <div className="glass-strong fade-up max-w-[440px] rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <div className="label">What you&apos;re looking at</div>
                <h2 className="font-display mt-2 text-[24px] font-semibold leading-tight">The whole sky around Earth, in light your eyes can&apos;t see</h2>
                <p className="mt-3 text-[14px] leading-relaxed text-text/85">
                  Imagine standing on Earth inside a giant ball painted with every star. That&apos;s this map, and you&apos;re at its
                  center looking out. The glowing band is our own galaxy, the Milky Way, seen from the inside.
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-text/85">
                  It was made by NASA&apos;s SPHEREx telescope, which photographs the entire sky in infrared light.
                </p>
                <ul className="mt-4 space-y-1.5 text-[13px] text-muted">
                  <li>
                    <b className="text-text">Drag</b> to look around · <b className="text-text">scroll or pinch</b> to zoom
                  </li>
                  <li>
                    <b className="text-text">Change the color</b> at the bottom to see through dust
                  </li>
                  <li>
                    <b className="text-text">Pick a place</b> to fly there
                  </li>
                </ul>
                <button className="btn btn-primary mt-5 w-full justify-center !py-2.5" onClick={dismissIntro}>
                  Start exploring
                </button>
              </div>
            </div>
          )}

          {/* places */}
          {!advanced && <aside className="absolute left-4 top-20 z-30 sm:left-5">
            {placesOpen ? (
              <div className="glass scrollbar-thin max-h-[calc(100vh-420px)] min-h-[140px] w-[248px] overflow-y-auto rounded-2xl p-2">
                <div className="flex items-center justify-between px-2 pb-1 pt-1">
                  <div className="label">Places to visit</div>
                  <button className="text-[12px] text-muted hover:text-white" onClick={() => setPlacesOpen(false)} aria-label="Hide places">
                    ✕
                  </button>
                </div>
                <ul>
                  {TARGETS.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => goTarget(t)}
                        className={`w-full rounded-lg px-2 py-1.5 text-left transition ${selected?.id === t.id ? "bg-white/10" : "hover:bg-white/5"}`}
                      >
                        <div className="text-[13px] font-medium leading-tight">{t.name}</div>
                        <div className="text-[11.5px] text-muted">{t.kind}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <button className="btn glass" onClick={() => setPlacesOpen(true)}>
                ☆ Places to visit
              </button>
            )}
          </aside>}

          {/* orientation */}
          {!advanced && <div className={`absolute left-4 top-[132px] z-30 sm:left-5 md:bottom-4 md:top-auto ${placesOpen || selected ? "hidden md:block" : ""}`}>
            {mapOpen ? (
              <WhereAmI ra={view.ra} dec={view.dec} fov={view.fov} onClose={() => setMapOpen(false)} />
            ) : (
              <button className="btn glass" onClick={() => setMapOpen(true)}>
                ◎ Where am I?
              </button>
            )}
          </div>}

          {/* selected place */}
          {selected && (
            <div key={selected.id} className="fade-up absolute inset-x-4 bottom-[218px] z-30 md:inset-x-auto md:bottom-auto md:right-5 md:top-20 md:w-[320px]">
              <div className="glass rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="label">{selected.kind}</div>
                    <h2 className="font-display mt-0.5 text-[20px] font-semibold leading-tight">{selected.name}</h2>
                  </div>
                  <button className="text-muted hover:text-white" onClick={() => setSelected(null)} aria-label="Close">
                    ✕
                  </button>
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-text/90">{selected.blurb}</p>
                {selected.caution && <p className="mt-2 text-[12.5px] leading-relaxed text-warn/90">{selected.caution}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {selected.investigate ? (
                    <Link href="/investigate/swan" className="btn btn-primary">
                      Open the case file →
                    </Link>
                  ) : (
                    <Link
                      href={`/timetravel?ra=${selected.ra.toFixed(5)}&dec=${selected.dec.toFixed(5)}&name=${encodeURIComponent(selected.name)}`}
                      className="btn btn-primary"
                    >
                      See it on different dates →
                    </Link>
                  )}
                </div>
                <Advanced className="mt-3">
                  {selected.detail && <p>{selected.detail}</p>}
                  <p className="data mt-1.5">
                    RA {selected.ra.toFixed(4)}° · Dec {selected.dec.toFixed(4)}°
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {selected.investigate && (
                      <Link
                        className="link"
                        href={`/timetravel?ra=${selected.ra.toFixed(5)}&dec=${selected.dec.toFixed(5)}&name=${encodeURIComponent(selected.name)}`}
                      >
                        Time Travel here
                      </Link>
                    )}
                    <button className="link" onClick={() => router.push(`/fly?ra=${selected.ra.toFixed(3)}&dec=${selected.dec.toFixed(3)}`)}>
                      Face this way in 3D Fly
                    </button>
                  </div>
                </Advanced>
              </div>
            </div>
          )}

          {/* advanced drawer */}
          {advanced && (
            <div className="fade-up absolute left-4 top-20 z-30 w-[min(330px,calc(100vw-2rem))] sm:left-5">
              <div className="glass-strong scrollbar-thin max-h-[calc(100vh-290px)] overflow-y-auto rounded-2xl p-4 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <div className="label">Advanced</div>
                  <button className="text-muted hover:text-white" onClick={() => setAdvanced(false)} aria-label="Close advanced">
                    ✕
                  </button>
                </div>

                <div className="mt-3 text-muted">Color scheme</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {COLORMAPS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCmap(c.id)}
                      className={`chip !rounded-full px-3 py-1 ${cmap === c.id ? "is-on" : ""}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex flex-col gap-1.5 text-muted">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Coordinate grid
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={wiseOpacity > 0} onChange={(e) => setWiseOpacity(e.target.checked ? 0.5 : 0)} /> Older WISE
                    infrared map on top
                  </label>
                  {wiseOpacity > 0 && (
                    <div className="pl-6">
                      <input
                        aria-label="WISE overlay opacity"
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={wiseOpacity}
                        onChange={(e) => setWiseOpacity(Number(e.target.value))}
                        className="w-full accent-cyan-300"
                      />
                      <div className="text-[11.5px] text-dim">{wiseStatus || "Loading WISE…"}</div>
                      <div className="text-[11.5px] text-warn/90">Different dates and wavelengths: for visual context only.</div>
                    </div>
                  )}
                </div>

                <div className="mt-4 text-muted">View center</div>
                <div className="data mt-1 text-[11.5px] text-text">
                  {fmtRA(view.ra)} {fmtDec(view.dec)}
                  <div className="text-muted">
                    field {fmtFov(view.fov)}
                    {pointer && (
                      <>
                        {" "}
                        · cursor {pointer.ra.toFixed(3)}°, {pointer.dec.toFixed(3)}°
                      </>
                    )}
                  </div>
                </div>
                <form onSubmit={onGoto} className="mt-2">
                  <input
                    value={gotoText}
                    onChange={(e) => setGotoText(e.target.value)}
                    placeholder="Go to RA Dec (degrees)"
                    className="w-full field px-3 py-1.5 text-[12.5px] text-text placeholder:text-dim"
                    aria-label="Go to coordinates"
                  />
                </form>
                <div className="mt-2 flex flex-wrap gap-3">
                  <button className="link" onClick={() => router.push(`/timetravel?ra=${view.ra.toFixed(5)}&dec=${view.dec.toFixed(5)}`)}>
                    Time Travel the center
                  </button>
                  <button className="link" onClick={() => router.push(`/fly?ra=${view.ra.toFixed(3)}&dec=${view.dec.toFixed(3)}`)}>
                    Fly from here
                  </button>
                </div>

                <div className="mt-4 text-muted">About this map</div>
                <p className="mt-1 leading-relaxed text-dim">
                  NASA SPHEREx DR1 all-sky spectral cube (IRSA, doi:{HIPS_DOI}): 102 wavelengths from 0.75 to 5 µm. It is a
                  time-averaged mosaic, not a single date. Colors are false color. {um.toFixed(3)} µm is{" "}
                  {(um / 0.7).toFixed(1)}× longer than the reddest light your eyes can see. Use ← → to step one channel, Shift to
                  jump a band.
                </p>
              </div>
            </div>
          )}

          {/* bottom: wavelength */}
          <div className={`absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-1.5 px-3 pb-3 sm:px-5 sm:pb-4 ${advanced ? "md:pr-[150px]" : "md:pl-[270px] md:pr-[150px] xl:px-5"}`}>
            {advanced ? <WavelengthDial frame={frame} onChange={onFrame} /> : <WavelengthStops frame={frame} onChange={onFrame} />}
            <div className="text-center text-[11px] text-dim">
              NASA SPHEREx infrared sky map, 2025–26 · colors are artificial · showing {fovWords(view.fov)}
            </div>
          </div>
          <div className="absolute right-4 top-20 z-30 flex flex-col items-end gap-2 sm:right-5 md:bottom-4 md:top-auto">
            <button className={`btn glass ${advanced ? "is-on" : ""}`} onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}>
              ⚙ Advanced
            </button>
            <button className="btn glass" onClick={share}>
              {copied ? "Link copied ✓" : "Share view"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
