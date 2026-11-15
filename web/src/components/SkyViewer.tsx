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
};

/**
 * Full-sky SPHEREx viewer. Two HiPS layers of the same cube are stacked: the TOP layer jumps
 * to a new wavelength immediately, and the BASE layer follows a moment later. Tiles that
 * haven't arrived on top are see-through, so the previous wavelength stays visible instead
 * of flashing to black.
 */
const SkyViewer = forwardRef<SkyViewerHandle, Props>(function SkyViewer(
  { ra, dec, fov, frame, colormap, showGrid = false, wiseOpacity = 0, onWiseStatus, markers = [], lines = [], onView, onMarkerClick, onStatus, onPointer },
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
      .then((A) => {
        if (cancelled || !divRef.current) return;
        const opts = { name: "SPHEREx DR1", imgFormat: "png", colormap, stretch: "linear" };
        const base = A.imageHiPS(HIPS_URL, {
          ...opts,
          successCallback: (h: any) => h.setFrequency({ value: frameToFrequencyHz(frame), unit: "Hz" }),
          errorCallback: () => cbRef.current.onStatus?.("error", "Could not reach the SPHEREx HiPS service."),
        });
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
            setReady(true);
            cbRef.current.onStatus?.("ready");
          },
        });
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
      .catch((e) => cbRef.current.onStatus?.("error", String(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // wavelength change with crossfade
  useEffect(() => {
    if (!ready) return;
    const f = frameToFrequencyHz(frame);
    try {
      topRef.current?.setFrequency({ value: f, unit: "Hz" });
    } catch {}
    if (followTimer.current) clearTimeout(followTimer.current);
    followTimer.current = setTimeout(() => {
      try {
        baseRef.current?.setFrequency({ value: f, unit: "Hz" });
      } catch {}
    }, 1800);
  }, [frame, ready]);

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
