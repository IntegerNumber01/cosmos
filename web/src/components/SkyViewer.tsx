"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { loadAladin } from "@/lib/aladin";
import { HIPS_URL, frameToFrequencyHz } from "@/lib/spherex";

export type SkyMarker = { id: string; name: string; ra: number; dec: number; color?: string; size?: number; label?: boolean };
export type SkyLine = { id: string; points: [number, number][]; color: string; width?: number; dashed?: boolean };

export type SkyViewerHandle = {
  flyTo: (ra: number, dec: number, fov: number, seconds?: number) => void;
  getView: () => { ra: number; dec: number; fov: number } | null;
};

type Props = {
  ra: number;
  dec: number;
  fov: number;
  frame: number;
  colormap: string;
  showGrid?: boolean;
  wiseOpacity?: number;
  onWiseStatus?: (message: string) => void;
  markers?: SkyMarker[];
  lines?: SkyLine[];
  interactive?: boolean;
  onView?: (v: { ra: number; dec: number; fov: number }) => void;
  onMarkerClick?: (id: string) => void;
  onStatus?: (s: "loading" | "ready" | "error", msg?: string) => void;
  onPointer?: (p: { ra: number; dec: number } | null) => void;
  /**
   * Wavelength frames to prefetch for the current view. Their tiles are fetched in the
   * background into the browser cache, so switching to them doesn't wait on the network.
   */
  stops?: number[];
};

/** Wait for the slider to settle before asking IRSA for a new wavelength. Each request flood
 *  of intermediate wavelengths otherwise queues ahead of the one the user actually stopped on. */
const SETTLE_MS = 220;

/**
 * Full-sky SPHEREx viewer. Layers of the same cube are stacked:
 *  - BASE (bottom) follows the current wavelength a moment later, as a fallback.
 * Optional `stops` are prefetched into the HTTP cache for whatever the user is looking at.
 *  - FREE (top) jumps to the new wavelength (after the slider settles) and fades in. Tiles that haven't arrived are see-through, so the
 *    previous view stays visible instead of flashing to black.
 */
const SkyViewer = forwardRef<SkyViewerHandle, Props>(function SkyViewer(
  { ra, dec, fov, frame, colormap, showGrid = false, wiseOpacity = 0, onWiseStatus, markers = [], lines = [], onView, onMarkerClick, onStatus, onPointer, stops = [] },
  ref,
) {
  const divRef = useRef<HTMLDivElement>(null);
  const aladinRef = useRef<any>(null);
  const baseRef = useRef<any>(null);
  const topRef = useRef<any>(null);
  const wiseRef = useRef<any>(null);
  const wiseStatusRef = useRef(onWiseStatus);
  wiseStatusRef.current = onWiseStatus;
  const catsRef = useRef<Map<string, any>>(new Map());
  const lineOverlayRef = useRef<any>(null);
  const followTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const freeFrame = useRef(-1);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const [ready, setReady] = useState(false);
  const cbRef = useRef({ onView, onMarkerClick, onStatus, onPointer });
  cbRef.current = { onView, onMarkerClick, onStatus, onPointer };

  useImperativeHandle(ref, () => ({
    flyTo(r, d, f, seconds = 2.5) {
      const al = aladinRef.current;
      if (!al) return;
      const cur = al.getFov()[0];
      // zoom out a little, glide, then zoom in: a "flight" between targets
      al.animateToRaDec(r, d, seconds);
      al.zoomToFoV(Math.max(cur, f), seconds * 0.4);
      setTimeout(() => al.zoomToFoV(f, seconds * 0.6), seconds * 450);
    },
    getView() {
      const al = aladinRef.current;
      if (!al) return null;
      const [r, d] = al.getRaDec();
      return { ra: r, dec: d, fov: al.getFov()[0] };
    },
  }));

  // init once
  useEffect(() => {
    let cancelled = false;
    cbRef.current.onStatus?.("loading");
    loadAladin()
      .then(async (A) => {
        if (cancelled || !divRef.current) return;
        const opts = { name: "SPHEREx DR1", imgFormat: "png", colormap, stretch: "linear" };
        const base = A.imageHiPS(HIPS_URL, {
          ...opts,
          successCallback: (h: any) => h.setFrequency({ value: frameToFrequencyHz(frame), unit: "Hz" }),
          errorCallback: () => cbRef.current.onStatus?.("error", "Could not reach the SPHEREx HiPS service."),
        });
        // Aladin 3.8.2 rethrows failed layer queries from an internal promise it doesn't return.
        // Resolve metadata before handing it a layer, so our outer catch owns service failures.
        await base.query;
        if (cancelled || !divRef.current) return;
        const al = A.aladin(divRef.current, {
          survey: base, // never load Aladin's default (DSS from CDS)
          hipsList: [],
          target: `${ra} ${dec}`,
          fov,
          projection: "SIN",
          cooFrame: "ICRSd",
          gridOptions: { enabled: false, color: "rgb(120,170,255)", opacity: 0.35, labelSize: 11, showLabels: true },
          showReticle: false,
          showZoomControl: false,
          showFullscreenControl: false,
          showLayersControl: false,
          showGotoControl: false,
          showFrame: false,
          showCooLocation: false,
          showProjectionControl: false,
          showSimbadPointerControl: false,
          showCooGridControl: false,
          showSettingsControl: false,
          showShareControl: false,
          showStatusBar: false,
          showContextMenu: false,
          showFov: false,
          samp: false,
          log: false, // no usage logging to CDS
          backgroundColor: "rgb(3,4,10)",
        });
        aladinRef.current = al;
        const top = A.imageHiPS(HIPS_URL, {
          ...opts,
          name: "SPHEREx DR1 (fade)",
          successCallback: (h: any) => {
            h.setFrequency({ value: frameToFrequencyHz(frame), unit: "Hz" });
            freeFrame.current = frame;
            setReady(true);
            cbRef.current.onStatus?.("ready");
          },
        });
        await top.query;
        if (cancelled) return;
        al.setOverlayImageLayer(top, "fade");
        baseRef.current = base;
        topRef.current = top;

        const emit = () => {
          const [r, d] = al.getRaDec();
          cbRef.current.onView?.({ ra: r, dec: d, fov: al.getFov()[0] });
        };
        al.on("positionChanged", emit);
        al.on("zoomChanged", emit);
        al.on("objectClicked", (o: any) => {
          if (o?.data?.id) cbRef.current.onMarkerClick?.(o.data.id);
        });
        al.on("mouseMove", (p: any) => {
          if (p && Number.isFinite(p.ra)) cbRef.current.onPointer?.({ ra: p.ra, dec: p.dec });
        });
        emit();
      })
      .catch((e) => { if (!cancelled) cbRef.current.onStatus?.("error", String(e)); });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // wavelength change
  useEffect(() => {
    if (!ready) return;
    const f = frameToFrequencyHz(frame);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    if (followTimer.current) clearTimeout(followTimer.current);
    // Wait for the slider to settle, then fetch only the final wavelength. Prefetched stops
    // come straight from the browser cache, so they go immediately.
    settleTimer.current = setTimeout(() => {
      try {
        if (freeFrame.current !== frame) topRef.current?.setFrequency({ value: f, unit: "Hz" });
        freeFrame.current = frame;
      } catch {}
      followTimer.current = setTimeout(() => {
        try {
          baseRef.current?.setFrequency({ value: f, unit: "Hz" });
        } catch {}
      }, 1800);
    }, stopsRef.current.includes(frame) ? 0 : SETTLE_MS);
  }, [frame, ready]);

  // Prefetch: note which tiles Aladin loads for the view, then fetch the same tiles at each stop
  // wavelength into the HTTP cache. HiPS cube tiles are named Npix<N>_<frame>.png (frame 0 has no suffix).
  useEffect(() => {
    if (!ready || typeof PerformanceObserver === "undefined") return;
    const seen = new Set<string>(); // tile path without the frame suffix
    const done = new Set<string>();
    const queue: string[] = [];
    let active = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pump = () => {
      while (active < 4 && queue.length) {
        const url = queue.shift()!;
        active++;
        fetch(url, { mode: "cors", credentials: "omit" })
          .then((r) => r.blob())
          .catch(() => {})
          .finally(() => {
            active--;
            pump();
          });
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        for (const stem of [...seen].slice(-80)) {
          for (const s of stopsRef.current) {
            const url = `${stem}${s === 0 ? "" : "_" + s}.png`;
            if (!done.has(url)) {
              done.add(url);
              queue.push(url);
            }
          }
        }
        pump();
      }, 1500);
    };
    const obs = new PerformanceObserver((list) => {
      if (!stopsRef.current.length) return;
      let added = false;
      for (const e of list.getEntries()) {
        if (!e.name.startsWith(HIPS_URL + "/Norder")) continue;
        const stem = e.name.replace(/(_\d+)?\.png$/, "");
        if (!seen.has(stem)) {
          seen.add(stem);
          added = true;
        }
      }
      if (added) schedule();
    });
    obs.observe({ type: "resource", buffered: true });
    return () => {
      obs.disconnect();
      if (timer) clearTimeout(timer);
      queue.length = 0;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    for (const l of [baseRef.current, topRef.current]) {
      try {
        l?.setColormap(colormap, { stretch: "linear" });
      } catch {}
    }
  }, [colormap, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      aladinRef.current?.setCooGrid?.({ enabled: showGrid });
    } catch {}
  }, [showGrid, ready]);

  useEffect(() => {
    if (!ready || !aladinRef.current) return;
    const opacity = Math.max(0, Math.min(1, wiseOpacity));
    if (!wiseRef.current && opacity > 0) {
      const A = window.__AladinA;
      wiseStatusRef.current?.("Loading WISE context…");
      const layer = A.imageHiPS("https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/RGB-W4-W2-W1", {
        name: "WISE context (2010-era mosaic)", imgFormat: "jpeg", opacity,
        successCallback: () => wiseStatusRef.current?.("WISE context: 2010-era mosaic · W4/W2/W1 false colour · NASA/IPAC, CDS"),
        errorCallback: () => wiseStatusRef.current?.("WISE context is unavailable; SPHEREx remains visible."),
      });
      wiseRef.current = layer;
      aladinRef.current.setOverlayImageLayer(layer, "wise-context");
    }
    wiseRef.current?.setOpacity(opacity);
  }, [ready, wiseOpacity]);

  useEffect(() => {
    if (!ready || !aladinRef.current) return;
    const A = window.__AladinA;
    const al = aladinRef.current;
    // one catalogue per (colour, size, label) style
    for (const c of catsRef.current.values()) c.removeAll();
    const groups = new Map<string, SkyMarker[]>();
    for (const m of markers) {
      const key = `${m.color ?? "#9be7ff"}|${m.size ?? 14}|${m.label === false ? 0 : 1}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    for (const [key, ms] of groups) {
      let cat = catsRef.current.get(key);
      if (!cat) {
        const [color, size, lab] = key.split("|");
        cat = A.catalog({
          name: `m-${key}`,
          sourceSize: parseFloat(size),
          color,
          shape: "circle",
          displayLabel: lab === "1",
          labelColumn: "name",
          labelColor: color,
          labelFont: "12px Inter, sans-serif",
        });
        al.addCatalog(cat);
        catsRef.current.set(key, cat);
      }
      cat.addSources(ms.map((m) => A.source(m.ra, m.dec, { id: m.id, name: m.name })));
    }
  }, [markers, ready]);

  useEffect(() => {
    if (!ready || !aladinRef.current) return;
    const A = window.__AladinA;
    const al = aladinRef.current;
    if (lineOverlayRef.current) {
      try {
        lineOverlayRef.current.removeAll();
      } catch {}
    } else {
      lineOverlayRef.current = A.graphicOverlay({ name: "lines", color: "#7fd8ff", lineWidth: 2 });
      al.addOverlay(lineOverlayRef.current);
    }
    for (const l of lines) {
      lineOverlayRef.current.add(
        A.polyline(l.points, { color: l.color, lineWidth: l.width ?? 2, lineDash: l.dashed ? [6, 6] : undefined }),
      );
    }
  }, [lines, ready]);

  return <div ref={divRef} className="absolute inset-0 h-full w-full" aria-label="SPHEREx all-sky infrared map" />;
});

export default SkyViewer;
