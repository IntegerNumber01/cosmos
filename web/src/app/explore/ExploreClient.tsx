"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NavBar from "@/components/NavBar";
import SkyViewer, { SkyViewerHandle } from "@/components/SkyViewer";
import WavelengthDial from "@/components/WavelengthDial";
import { BLANK_FRAMES, HIPS_DOI, WAVELENGTHS_UM, nearestValidFrame } from "@/lib/spherex";
import { TARGETS, TARGET_BY_ID, Target } from "@/lib/targets";

const COLORMAPS = [
  { id: "magma", label: "Heat" },
  { id: "grayscale", label: "Mono" },
  { id: "cubehelix", label: "Helix" },
  { id: "viridis", label: "Viridis" },
];

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
  const [cmap, setCmap] = useState(() => COLORMAPS.some((c) => c.id === sp.get("cmap")) ? sp.get("cmap")! : "magma");
  const [grid, setGrid] = useState(() => sp.get("grid") === "1");
  const [wiseOpacity, setWiseOpacity] = useState(() => Math.max(0, Math.min(1, num(sp.get("wise"), 0))));
  const [wiseStatus, setWiseStatus] = useState("");
  const [view, setView] = useState({ ra: init.ra, dec: init.dec, fov: init.fov });
  const [pointer, setPointer] = useState<{ ra: number; dec: number } | null>(null);
  const [status, setStatus] = useState<{ s: "loading" | "ready" | "error"; msg?: string }>({ s: "loading" });
  const [selected, setSelected] = useState<Target | null>(initTarget ?? null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [gotoText, setGotoText] = useState("");

  // keep the URL shareable: ?ra&dec&fov&frame
  useEffect(() => {
    const id = setTimeout(() => {
      const q = new URLSearchParams({
        ra: view.ra.toFixed(4),
        dec: view.dec.toFixed(4),
        fov: view.fov.toPrecision(4),
        frame: String(frame),
        cmap, grid: grid ? "1" : "0", wise: String(wiseOpacity),
      });
      if (clean) q.set("clean", "1");
      window.history.replaceState(null, "", `/explore?${q.toString()}`);
    }, 400);
    return () => clearTimeout(id);
  }, [view, frame, clean, cmap, grid, wiseOpacity]);

  // phones: start with the destinations panel tucked away so the sky is visible
  useEffect(() => {
    if (window.innerWidth < 768) setPanelOpen(false);
  }, []);

  const onFrame = useCallback((f: number) => setFrame(f), []);

  const goTarget = (t: Target) => {
    setSelected(t);
    viewer.current?.flyTo(t.ra, t.dec, t.fov, 3);
    if (t.frame !== undefined && !BLANK_FRAMES.has(t.frame)) setFrame(t.frame);
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
      />
      {/* vignette for legibility */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(3,4,10,0.65)_100%)]" />

      {!clean && <NavBar />}

      {!clean && status.s === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="glass rounded-full px-5 py-2.5 text-[13px] text-muted">Loading the SPHEREx infrared sky…</div>
        </div>
      )}
      {status.s === "error" && (
        <div className="absolute inset-x-0 top-20 z-30 mx-auto w-fit max-w-lg">
          <div className="glass rounded-xl px-5 py-3 text-[13px] text-warn">
            {status.msg ?? "The sky map could not be loaded."} The tiles stream live from NASA/IPAC IRSA. Check your
            connection and reload.
          </div>
        </div>
      )}

      {!clean && (<>
      {/* destinations */}
      <aside
        className={`absolute left-4 top-20 z-30 w-[300px] transition-transform duration-500 sm:left-5 ${
          panelOpen ? "" : "-translate-x-[280px]"
        }`}
      >
        <div className="glass scrollbar-thin max-h-[calc(100vh-290px)] overflow-y-auto rounded-2xl p-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <div className="label">Destinations</div>
            <button className="text-[12px] text-muted hover:text-white" onClick={() => setPanelOpen((o) => !o)}>
              {panelOpen ? "Hide ‹" : "›"}
            </button>
          </div>
          <form onSubmit={onGoto} className="mb-2 px-1">
            <input
              value={gotoText}
              onChange={(e) => setGotoText(e.target.value)}
              placeholder="RA Dec in degrees, or a destination"
              className="w-full rounded-lg border border-line bg-black/30 px-3 py-2 text-[13px] text-text placeholder:text-dim focus:border-accent/60 focus:outline-none"
              aria-label="Go to coordinates"
            />
          </form>
          <ul className="space-y-1">
            {TARGETS.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => goTarget(t)}
                  className={`group w-full rounded-xl px-3 py-2 text-left transition ${
                    selected?.id === t.id ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13.5px] font-medium">{t.name}</span>
                    {t.investigate && (
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                        case file
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] text-muted">{t.kind}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* selected target card */}
      {selected && (
        <div key={selected.id} className="fade-up absolute right-4 top-20 z-30 w-[340px] sm:right-5">
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
            <p className="mt-2 text-[13px] leading-relaxed text-text/85">{selected.blurb}</p>
            {selected.caution && (
              <p className="mt-2 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-[12px] leading-relaxed text-warn/90">
                {selected.caution}
              </p>
            )}
            <div className="data mt-3 text-[11.5px] text-muted">
              RA {selected.ra.toFixed(4)}° · Dec {selected.dec.toFixed(4)}°
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selected.investigate && (
                <Link href="/investigate/swan" className="btn btn-primary">
                  Open the case file →
                </Link>
              )}
              <Link href={`/timetravel?ra=${selected.ra.toFixed(5)}&dec=${selected.dec.toFixed(5)}&name=${encodeURIComponent(selected.name)}`} className="btn">
                Time Travel here
              </Link>
              <button
                className="btn"
                onClick={() => router.push(`/fly?ra=${selected.ra.toFixed(3)}&dec=${selected.dec.toFixed(3)}`)}
              >
                Fly this direction in 3D
              </button>
            </div>
          </div>
        </div>
      )}

      {/* bottom: wavelength + readouts */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-3 pb-3 sm:px-5 sm:pb-4">
        <div className="glass flex max-w-[980px] flex-wrap items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] text-muted">
          <label className="flex items-center gap-2"><input type="checkbox" checked={wiseOpacity > 0} onChange={(e) => setWiseOpacity(e.target.checked ? 0.5 : 0)} /> WISE context</label>
          {wiseOpacity > 0 && <><label className="flex items-center gap-2">Opacity <input aria-label="WISE overlay opacity" type="range" min={0.05} max={1} step={0.05} value={wiseOpacity} onChange={(e) => setWiseOpacity(Number(e.target.value))} className="w-28 accent-cyan-300" /></label><span>{wiseStatus || "Loading WISE context…"}</span><span className="text-warn">Different epochs and wavelengths; visual context only.</span></>}
        </div>
        <div className="flex w-full max-w-[980px] flex-wrap items-center justify-between gap-2">
          <div className="glass data hidden items-center gap-4 rounded-full px-4 py-1.5 text-[11.5px] text-muted sm:flex">
            <span>
              <span className="text-dim">centre </span>
              <span className="text-text">{fmtRA(view.ra)}</span> <span className="text-text">{fmtDec(view.dec)}</span>
            </span>
            <span>
              <span className="text-dim">field </span>
              <span className="text-text">{fmtFov(view.fov)}</span>
            </span>
            {pointer && (
              <span className="hidden lg:inline">
                <span className="text-dim">cursor </span>
                {pointer.ra.toFixed(3)}°, {pointer.dec.toFixed(3)}°
              </span>
            )}
          </div>
          <div className="glass flex items-center gap-1 rounded-full p-1 text-[12px]">
            <span className="hidden items-center gap-1 md:flex">
            {COLORMAPS.map((c) => (
              <button
                key={c.id}
                onClick={() => setCmap(c.id)}
                className={`rounded-full px-3 py-1 transition ${cmap === c.id ? "bg-white/12 text-white" : "text-muted hover:text-white"}`}
              >
                {c.label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-line" />
            <button
              onClick={() => setGrid((g) => !g)}
              className={`rounded-full px-3 py-1 transition ${grid ? "bg-white/12 text-white" : "text-muted hover:text-white"}`}
            >
              Grid
            </button>
            </span>
            <button
              onClick={() => router.push(`/timetravel?ra=${view.ra.toFixed(5)}&dec=${view.dec.toFixed(5)}`)}
              className="rounded-full px-3 py-1 text-accent transition hover:text-white"
              title="Find every dated SPHEREx exposure of the centre of this view"
            >
              Time Travel here
            </button>
            <button
              onClick={() => router.push(`/fly?ra=${view.ra.toFixed(3)}&dec=${view.dec.toFixed(3)}`)}
              className="rounded-full px-3 py-1 text-accent transition hover:text-white"
              title="Leave the 2D sky and fly into 3D, facing this direction"
            >
              Fly from here
            </button>
            <button onClick={share} className="rounded-full px-3 py-1 text-muted transition hover:text-white">
              {copied ? "Link copied ✓" : "Share view"}
            </button>
          </div>
        </div>
        <WavelengthDial frame={frame} onChange={onFrame} />
        <div className="text-center text-[10.5px] text-dim">
          NASA SPHEREx DR1 all-sky cube (IRSA, doi:{HIPS_DOI}) · a time-averaged mosaic, not a single date · false
          colour · {WAVELENGTHS_UM[frame].toFixed(3)} µm is {(WAVELENGTHS_UM[frame] / 0.7).toFixed(1)}× longer than the
          reddest light your eyes can see
        </div>
      </div>
      </>)}
    </main>
  );
}
