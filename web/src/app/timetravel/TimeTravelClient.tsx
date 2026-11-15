"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NavBar from "@/components/NavBar";
import GridCanvas from "@/components/timetravel/GridCanvas";
import ObsTimeline from "@/components/timetravel/ObsTimeline";
import MeasurePanel from "@/components/timetravel/MeasurePanel";
import VisitStacks from "@/components/timetravel/VisitStacks";
import QualityOverlay from "@/components/timetravel/QualityOverlay";
import SpectralLab from "@/components/timetravel/SpectralLab";
import { inDateRange, observationKey, readViewState, viewQuery, ViewMode } from "@/lib/engine/viewState";
import type { Cadence } from "@/lib/engine/sequence";
import { validCoordinates } from "@/lib/engine/releases";
import { temporalInputs } from "@/lib/engine/combine";
import { getFrame, getKnown, getObservations, GaiaRow, parseCoords, Source } from "@/lib/engine/client";
import {
  Candidate,
  ChangeMap,
  findChanges,
  Frame,
  Grid,
  gridToSky,
  makeGrid,
  MatchedSet,
  matchedSets,
  setContaining,
  restoreMatchedSet,
  exactWindow,
  Observation,
  reproject,
  robustSigma,
  skyLevel,
  skyToGrid,
} from "@/lib/engine/sequence";
import { sky2pix, waveAt } from "@/lib/engine/wcs";
import { wavelengthColor } from "@/lib/spherex";
import { TT_BY_SLUG, TT_TARGETS } from "@/lib/ttTargets";

type Target = { ra: number; dec: number; name?: string; slug?: string; pm?: [number, number]; epochYear?: number };

/** Position of a target with proper motion (mas/yr) at a given MJD. */
function targetAt(t: Target, mjd: number): [number, number] {
  if (!t.pm || t.epochYear === undefined) return [t.ra, t.dec];
  const dt = (mjd - (51544.5 + (t.epochYear - 2000) * 365.25)) / 365.25;
  return [t.ra + (t.pm[0] * dt) / 3.6e6 / Math.cos((t.dec * Math.PI) / 180), t.dec + (t.pm[1] * dt) / 3.6e6];
}
type Loaded = {
  frames: Frame[];
  sources: Source[];
  grids: Float32Array[];
  grid: Grid;
  lo: number;
  hi: number;
  excluded: { obsid: string; reason: string }[];
  lambdaSpread: { centre: number; corners: number; bw: number };
};

function usePrefersReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const f = () => setR(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return r;
}

const fmtDate = (iso: string) =>
  new Date(iso.endsWith("Z") ? iso : iso + "Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDateTime = (iso: string) => `${fmtDate(iso)} ${iso.slice(11, 16)} UTC`;

function pickSet(obs: Observation[], ref: Observation, cadence: Cadence): MatchedSet {
  return setContaining(obs, ref, cadence);
}

export default function TimeTravelClient() {
  const sp = useSearchParams();
  const [shared] = useState(() => readViewState(sp));
  const reduced = usePrefersReducedMotion();
  const initial: Target | null = useMemo(() => {
    const slug = sp.get("target");
    if (slug && TT_BY_SLUG[slug]) {
      const t = TT_BY_SLUG[slug];
      return { ra: t.ra, dec: t.dec, name: t.name, slug, pm: t.pm, epochYear: t.pm ? 2025.9 : undefined };
    }
    const ra = parseFloat(sp.get("ra") ?? "");
    const dec = parseFloat(sp.get("dec") ?? "");
    const pmra = parseFloat(sp.get("pmra") ?? "");
    const pmdec = parseFloat(sp.get("pmdec") ?? "");
    const epoch = parseFloat(sp.get("epoch") ?? "");
    if (validCoordinates(ra, dec))
      return {
        ra,
        dec,
        name: sp.get("name") ?? undefined,
        pm: Number.isFinite(pmra) && Number.isFinite(pmdec) ? ([pmra, pmdec] as [number, number]) : undefined,
        epochYear: Number.isFinite(epoch) ? epoch : undefined,
      };
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [target, setTarget] = useState<Target | null>(initial);
  const [fromGaia] = useState(() => sp.get("from") === "gaia");
  const [input, setInput] = useState(initial ? `${initial.ra.toFixed(5)} ${initial.dec.toFixed(5)}` : "");
  const [inputErr, setInputErr] = useState("");
  const [size, setSize] = useState(shared.size);
  const [cadence, setCadence] = useState<Cadence>(shared.cadence);
  const [start, setStart] = useState(shared.start);
  const [end, setEnd] = useState(shared.end);
  const [page, setPage] = useState(shared.page);
  const [obsState, setObsState] = useState<{ status: "idle" | "loading" | "ready" | "error"; error?: string; obs?: Observation[]; source?: Source; queried?: string; legacy?: boolean }>({
    status: "idle",
  });
  const [set, setSet] = useState<MatchedSet | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; error?: string } | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<ViewMode>("frames");
  const [pair, setPair] = useState<[number, number]>([0, 1]);
  const [split, setSplit] = useState(shared.split);
  const [stackSettings, setStackSettings] = useState(shared.stack);
  const [change, setChange] = useState<ChangeMap | null>(null);
  const [cand, setCand] = useState<Candidate | null>(null);
  const [measureAt, setMeasureAt] = useState<{
    ra: number;
    dec: number;
    label: string;
    partner?: { ra: number; dec: number };
    mjd?: number;
    when?: string;
    pm?: [number, number];
    epochYear?: number;
  } | null>(null);
  const [gaia, setGaia] = useState<{ rows: GaiaRow[]; mjd: number } | null>(null);
  const [showGaia, setShowGaia] = useState(shared.gaia);
  const [showQuality, setShowQuality] = useState(shared.quality);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [frameWarnings, setFrameWarnings] = useState<string[]>([]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const restoring = useRef(true);
  const sharedAnchor = useRef(shared.anchor);
  const loadToken = useRef(0);
  const searchToken = useRef(0);

  const obs = useMemo(() => (obsState.obs ?? []).filter((o) => inDateRange(o.mjd, start, end)), [obsState.obs, start, end]);
  const sets = useMemo(() => matchedSets(obs, 8, cadence), [obs, cadence]);
  const nInside = obs.filter((o) => o.inside).length;
  const nDays = new Set(obs.filter((o) => o.inside).map((o) => Math.floor(o.mjd))).size;

  // 1) find observations
  const search = useCallback(
    (t: Target, field = size, restore = false) => {
      if (!restore) { restoring.current = false; sharedAnchor.current = ""; setPage(0); }
      setTarget(t);
      setSet(null);
      setLoaded(null);
      setChange(null);
      setCand(null);
      setMeasureAt(null);
      setGaia(null);
      setProgress(null);
      setPlaying(false);
      setRefreshError("");
      setFrameWarnings([]);
      setObsState({ status: "loading" });
      const token = ++searchToken.current;
      loadToken.current++; // cancel any frame loading from the previous search
      getObservations(t.ra, t.dec, t.slug, true, field)
        .then((d) => token === searchToken.current && setObsState({ status: "ready", obs: d.frames as Observation[], source: d.source, queried: d.queried, legacy: d.legacy }))
        .catch((e) => token === searchToken.current && setObsState({ status: "error", error: String(e.message ?? e) }));
    },
    [size],
  );

  useEffect(() => {
    if (initial) search(initial, shared.size, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // default: the matched set with the most distinct dates
  useEffect(() => {
    if (obsState.status !== "ready" || set) return;
    const restored = restoring.current && shared.window ? restoreMatchedSet(obs, shared.window, shared.anchor, cadence) : null;
    if (restored) { setSet(restored); return; }
    const saved = sharedAnchor.current && obs.find((o) => o.inside && observationKey(o) === sharedAnchor.current);
    const pref = target?.slug ? TT_BY_SLUG[target.slug]?.prefer : undefined;
    const po = saved || (pref && obs.find((o) => o.inside && o.obsid === pref.obsid && o.detector === pref.detector));
    if (po) setSet(pickSet(obs, po, cadence));
    else if (sets.length) setSet(sets[0]);
    else if (obs.some((o) => o.inside)) setSet(pickSet(obs, obs.find((o) => o.inside)!, cadence));
  }, [obsState.status, sets, set, obs, target, cadence, shared]);

  const chooseSet = (s: MatchedSet) => { restoring.current = false; sharedAnchor.current = ""; setPage(0); setSet(s); };
  const resetSelection = () => { restoring.current = false; sharedAnchor.current = ""; loadToken.current++; setPlaying(false); setLoaded(null); setSet(null); setPage(0); };

  const refresh = async () => {
    if (!target) return;
    const token = ++searchToken.current;
    setRefreshing(true); setRefreshError("");
    try {
      const d = await getObservations(target.ra, target.dec, target.slug, false, size, true);
      if (token !== searchToken.current) return;
      sharedAnchor.current = set?.frames[0] ? observationKey(set.frames[0]) : "";
      loadToken.current++; setLoaded(null); setSet(null); setPage(0); restoring.current = false;
      setObsState({ status: "ready", obs: d.frames, source: d.source, queried: d.queried, legacy: false });
    } catch (e) { if (token === searchToken.current) setRefreshError(`Refresh failed; the previous result is still shown. ${String((e as Error).message)}`); }
    finally { setRefreshing(false); }
  };

  // 2) load the frames of the chosen set
  useEffect(() => {
    if (!set || !target || set.frames.length < 1) return;
    const token = ++loadToken.current;
    let alive = true;
    setLoaded(null);
    setChange(null);
    setCand(null);
    setMeasureAt(null);
    setView("frames"); setPlaying(false);
    setIdx(0);
    const actualPage = Math.min(page, Math.max(0, Math.ceil(set.frames.length / 12) - 1));
    if (actualPage !== page) { setPage(actualPage); return; }
    const todo = set.frames.slice(page * 12, (page + 1) * 12);
    setProgress({ done: 0, total: todo.length });
    const results: ({ frame: Frame; source: Source } | null)[] = new Array(todo.length).fill(null);
    let next = 0;
    let done = 0;
    let lastErr = "";
    const worker = async () => {
      while (next < todo.length) {
        if (!alive || token !== loadToken.current) return;
        const k = next++;
        try {
          results[k] = await getFrame(todo[k], target.ra, target.dec, size, target.slug);
        } catch (e) {
          lastErr = String((e as Error).message ?? e);
        }
        done++;
        if (alive && token === loadToken.current) setProgress({ done, total: todo.length, error: lastErr || undefined });
      }
    };
    Promise.all([worker(), worker(), worker()]).then(() => {
      if (!alive || token !== loadToken.current) return;
      const ok = results.filter(Boolean) as { frame: Frame; source: Source }[];
      // exact wavelengths (from each cutout header) must agree pairwise within half a bandwidth:
      // keep the largest subset that fits in a 0.5·bw window
      const { keep, drop } = exactWindow(ok, (r) => r.frame.meta.target.wl, set.bandwidth);
      const excluded: Loaded["excluded"] = drop.map((r) => ({
        obsid: r.frame.meta.obsid,
        reason: `exact λ ${r.frame.meta.target.wl.toFixed(4)} µm doesn't fit within half a channel of the other dates`,
      }));
      const failures = todo.filter((_, i) => !results[i]).map((o) => `Could not load ${observationKey(o)}. Try this page again.`);
      setFrameWarnings(failures);
      if (!keep.length) {
        setProgress({ done, total: todo.length, error: lastErr || "No frames could be loaded." });
        return;
      }
      const grid = makeGrid(target.ra, target.dec, size);
      const grids = keep.map((r) => reproject(r.frame, grid, skyLevel(r.frame).level));
      const sig = keep.map((r) => skyLevel(r.frame).sigma).filter(Number.isFinite);
      const all: number[] = [];
      grids.forEach((g) => g.forEach((v) => Number.isFinite(v) && all.push(v)));
      all.sort((a, b) => a - b);
      const hi = all[Math.floor(all.length * 0.997)] ?? 1;
      const lo = -2 * (sig.sort((a, b) => a - b)[sig.length >> 1] ?? 0.1);
      // wavelength consistency across the field (LVF gradient differs between frames)
      const corners: [number, number][] = [
        [0, 0],
        [grid.n - 1, 0],
        [0, grid.n - 1],
        [grid.n - 1, grid.n - 1],
      ];
      let cornerSpread = 0;
      for (const [ci, cj] of corners) {
        const [cra, cdec] = gridToSky(grid, ci, cj);
        const wls = keep.map((r) => {
          const [x, y] = sky2pix(r.frame.meta.wcs, cra, cdec);
          return waveAt(r.frame.meta.detector, x, y, r.frame.meta.crpixW).wl;
        });
        cornerSpread = Math.max(cornerSpread, Math.max(...wls) - Math.min(...wls));
      }
      const cw = keep.map((r) => r.frame.meta.target.wl);
      setLoaded({
        frames: keep.map((r) => r.frame),
        sources: keep.map((r) => r.source),
        grids,
        grid,
        lo,
        hi,
        excluded,
        lambdaSpread: { centre: Math.max(...cw) - Math.min(...cw), corners: cornerSpread, bw: set.bandwidth },
      });
      const lookup = (key: string, fallback: number) => { const i = keep.findIndex((r) => observationKey(r.frame.meta) === key); return i < 0 ? fallback : i; };
      setPair(restoring.current ? [lookup(shared.before, 0), lookup(shared.after, keep.length - 1)] : [0, keep.length - 1]);
      setIdx(restoring.current ? lookup(shared.frame, 0) : 0);
      setView(restoring.current ? shared.mode : "frames");
      setPlaying(!restoring.current && !reduced && keep.length > 1);
      restoring.current = false;
      setProgress(null);
    });
    return () => { alive = false; };
  }, [set, target, size, reduced, page, shared, loadAttempt]);

  // Gaia overlay (positions propagated to each frame's date)
  useEffect(() => {
    if (!loaded || !target) return;
    const mjd = loaded.frames[0].meta.mjdAvg;
    let alive = true;
    getKnown(target.ra, target.dec, Math.min(0.05, size * 0.75), mjd, "gaia", target.slug)
      .then((k) => alive && k.gaia.ok && setGaia({ rows: (k.gaia.rows ?? []).filter((r) => r.g < 17 || Math.hypot(r.pmra, r.pmdec) > 300), mjd: k.query.mjd }))
      .catch(() => alive && setGaia(null));
    return () => {
      alive = false;
    };
  }, [loaded, target, size]);

  // blink
  useEffect(() => {
    if (!playing || !loaded || view !== "frames") return;
    const id = setInterval(() => setIdx((i) => (i + 1) % loaded.frames.length), 900);
    return () => clearInterval(id);
  }, [playing, loaded, view]);

  const runChanges = useCallback(() => {
    if (!loaded) return;
    const cm = findChanges(...temporalInputs(loaded.frames[pair[0]], loaded.frames[pair[1]], loaded.grids[pair[0]], loaded.grids[pair[1]], loaded.grid), loaded.grid);
    // the set is matched at the search target; the filter wavelength drifts across the field, so check each
    // candidate's own position on both dates and refuse a temporal reading where they differ > half a channel
    const fa = loaded.frames[pair[0]];
    const fb = loaded.frames[pair[1]];
    const lamAt = (f: Frame, ra: number, dec: number) => {
      const [x, y] = sky2pix(f.meta.wcs, ra, dec);
      return waveAt(f.meta.detector, x, y, f.meta.crpixW);
    };
    for (const c of cm.candidates) {
      const pts = [[c.ra, c.dec], ...(c.partner ? [[c.partner.ra, c.partner.dec]] : [])];
      let worst = 0;
      for (const [ra, dec] of pts) {
        const a = lamAt(fa, ra, dec);
        const b = lamAt(fb, ra, dec);
        worst = Math.max(worst, Math.abs(a.wl - b.wl) / ((a.bw + b.bw) / 2));
      }
      c.dLambdaBw = worst;
      if (worst > 0.5 && c.kind !== "residual") {
        c.kind = "unmatched";
        c.note = `At this spot the two dates differ by ${worst.toFixed(2)} channel widths in wavelength (more than half a channel), so this change may be spectral rather than temporal. No temporal claim.`;
      }
    }
    const rank = (k: Candidate["kind"]) => (k === "residual" ? 2 : k === "unmatched" ? 1 : 0);
    cm.candidates.sort((a, b) => rank(a.kind) - rank(b.kind) || b.peakZ * Math.sqrt(b.npix) - a.peakZ * Math.sqrt(a.npix));
    cm.candidates.forEach((c, i) => (c.id = i + 1));
    setChange(cm);
    setView("changes");
    setPlaying(false);
    setCand(null);
  }, [loaded, pair]);

  useEffect(() => { if (loaded && view === "changes" && !change) runChanges(); }, [loaded, view, change, runChanges]);

  useEffect(() => {
    if (!target || !loaded || restoring.current) return;
    const q = viewQuery(target, {
      size, cadence, start, end, page, anchor: set!.anchor ?? "", window: `${set!.detector}:${set!.windowLo}:${set!.bandwidth}`,
      frame: observationKey(loaded.frames[Math.min(idx, loaded.frames.length - 1)].meta),
      before: observationKey(loaded.frames[pair[0]].meta), after: observationKey(loaded.frames[pair[1]].meta),
      mode: view, split, gaia: showGaia, quality: showQuality, embed: shared.embed, stack: stackSettings,
    }, fromGaia);
    window.history.replaceState(null, "", `/timetravel?${q.toString()}`);
  }, [target, loaded, set, size, cadence, start, end, page, idx, pair, view, split, showGaia, showQuality, shared.embed, fromGaia, stackSettings]);

  const share = async (embed = false) => {
    setPlaying(false);
    const url = new URL(window.location.href);
    if (embed) url.searchParams.set("embed", "1");
    const text = embed ? `<iframe src="${url.href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" title="COSMOS SPHEREx sky comparison" width="100%" height="900" loading="lazy"></iframe>` : url.href;
    try { await navigator.clipboard.writeText(text); setShareStatus(embed ? "Embed code copied" : "Link copied"); }
    catch { setShareStatus(text); }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = parseCoords(input);
    if (!c) {
      setInputErr("Enter RA and Dec, e.g. 269.4463 4.7679 or 17:57:47 +04:46:05");
      return;
    }
    setInputErr("");
    search({ ra: c.ra, dec: c.dec });
  };

  const n = loaded?.grid.n ?? 1;
  const cur = loaded ? loaded.frames[Math.min(idx, loaded.frames.length - 1)] : null;
  const gaiaMarks =
    loaded && gaia && showGaia && cur
      ? gaia.rows.map((r) => {
          const dt = (cur.meta.mjdAvg - gaia.mjd) / 365.25;
          const dec = r.dec_epoch + (r.pmdec * dt) / 3.6e6;
          const ra = r.ra_epoch + (r.pmra * dt) / 3.6e6 / Math.cos((r.dec_epoch * Math.PI) / 180);
          const [x, y] = skyToGrid(loaded.grid, ra, dec);
          return { id: r.source_id, x, y, g: r.g, fast: Math.hypot(r.pmra, r.pmdec) > 300 };
        })
      : [];
  const sx = (x: number) => x + 0.5;
  const sy = (y: number) => n - 0.5 - y;
  // crosshair follows the target's proper motion to the date shown
  const tgt = loaded && cur ? skyToGrid(loaded.grid, ...targetAt(target!, cur.meta.mjdAvg)) : [0, 0];

  return (
    <main className="relative min-h-screen bg-bg pb-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(80,120,255,0.12),transparent_70%)]" />
      {!shared.embed && <NavBar />}
      <div className="relative mx-auto max-w-[1320px] px-4 pt-20 sm:px-6">
        <div className="label text-accent">Time Travel</div>
        <h1 className="font-display mt-1 text-[30px] font-semibold leading-tight sm:text-[38px]">Pick any spot in the sky. See how it looked on different dates.</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-muted">
          Enter coordinates or pick a target. COSMOS asks NASA/IPAC IRSA for every SPHEREx DR1 exposure covering that position. It then picks out the
          exposures you can fairly compare (same detector, same wavelength), lines them up, and helps you find what changed. Browse every exposure or one per day.
        </p>

        {/* search */}
        <form onSubmit={submit} className="glass mt-5 flex flex-wrap items-center gap-2 rounded-2xl p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="RA Dec, e.g. 269.4463 4.7679 or 17:57:47 +04:46:05"
            aria-label="Sky coordinates (RA Dec)"
            className="data min-w-[260px] flex-1 rounded-lg border border-line bg-black/30 px-3 py-2 text-[14px] focus:border-accent/60 focus:outline-none"
          />
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            Field
            <select
              value={size}
              onChange={(e) => { const field = Number(e.target.value); resetSelection(); setSize(field); if (target) search(target, field); }}
              className="rounded-lg border border-line bg-black/40 px-2 py-2 text-text"
              aria-label="Field of view"
            >
              <option value={0.05}>3′</option>
              <option value={0.1}>6′</option>
              <option value={0.2}>12′</option>
              <option value={0.3}>18′</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit">
            Find observations
          </button>
          {inputErr && <div className="w-full text-[12px] text-warn">{inputErr}</div>}
          <div className="flex w-full flex-wrap items-center gap-3 text-[12px] text-muted">
            <label>Playback <select aria-label="Playback cadence" value={cadence} onChange={(e) => { resetSelection(); setCadence(e.target.value as Cadence); }} className="rounded-lg border border-line bg-bg p-2">
              <option value="exposures">Every compatible exposure</option><option value="daily">One exposure per day</option>
            </select></label>
            <label>From (UTC) <input type="date" aria-label="Start date" value={start} max={end || undefined} onChange={(e) => { resetSelection(); setStart(e.target.value); }} className="rounded-lg border border-line bg-bg p-2" /></label>
            <label>Through (UTC) <input type="date" aria-label="End date" value={end} min={start || undefined} onChange={(e) => { resetSelection(); setEnd(e.target.value); }} className="rounded-lg border border-line bg-bg p-2" /></label>
            {(start || end) && <button type="button" className="btn" onClick={() => { resetSelection(); setStart(""); setEnd(""); }}>All dates</button>}
            <span>Larger fields take longer to load; image area grows with the square of the width.</span>
          </div>
          <div className="flex w-full flex-wrap gap-1.5 pt-1">
            {TT_TARGETS.map((t) => (
              <button
                key={t.slug}
                type="button"
                onClick={() => {
                  setInput(`${t.ra.toFixed(5)} ${t.dec.toFixed(5)}`);
                  search({ ra: t.ra, dec: t.dec, name: t.name, slug: t.slug, pm: t.pm, epochYear: t.pm ? 2025.9 : undefined });
                }}
                className={`rounded-full border px-3 py-1 text-[12px] transition ${
                  target?.slug === t.slug ? "border-accent/60 bg-accent/10 text-white" : "border-line text-muted hover:text-white"
                }`}
                title={t.why}
              >
                {t.challenge && <span className="mr-1 text-accent">★</span>}
                {t.name}
              </button>
            ))}
            <span className="self-center pl-1 text-[11px] text-dim">★ = challenge validation targets</span>
          </div>
        </form>

        {target?.name && !target.slug && (
          <p className="mt-2 text-[12.5px] text-muted">
            <b className="text-text">{target.name}</b>
            {fromGaia
              ? ` · Gaia DR3 position propagated to ${target.epochYear ?? 2016} with its proper motion${
                  target.pm ? ` (${(Math.hypot(target.pm[0], target.pm[1]) / 1000).toFixed(2)}″/yr). The crosshair and measurements follow it date by date` : ""
                }.`
              : " · position from the COSMOS map bookmark."}
          </p>
        )}
        {target?.slug && TT_BY_SLUG[target.slug] && (
          <p className="mt-2 text-[12.5px] text-muted">
            <b className="text-text">{TT_BY_SLUG[target.slug].name}:</b> {TT_BY_SLUG[target.slug].why}{" "}
            {TT_BY_SLUG[target.slug].pm && <span className="text-dim">Position propagated to 2025.9 with its catalogue proper motion.</span>}{" "}
            <Link href={`/validation#${target.slug}`} className="text-accent hover:underline">
              Validation record →
            </Link>
          </p>
        )}

        {/* observations */}
        {obsState.status === "loading" && <div className="glass mt-5 rounded-2xl p-5 text-[13px] text-muted">Searching SPHEREx DR1 for every exposure of this position…</div>}
        {obsState.status === "error" && (
          <div className="glass mt-5 rounded-2xl p-5 text-[13px] text-warn">
            The archive search failed: {obsState.error}.{" "}
            <button className="btn ml-2" onClick={() => target && search(target)}>
              Try again
            </button>
          </div>
        )}
        {obsState.status === "ready" && (
          <section className="glass mt-5 rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-[20px] font-semibold">
                {nInside ? (
                  <>
                    SPHEREx imaged this spot <span className="text-accent">{nInside}</span> times on <span className="text-accent">{nDays}</span> different days
                  </>
                ) : (
                  "No usable SPHEREx DR1 exposure at this position in the selected date range"
                )}
              </h2>
              <span className="text-[11px] text-dim">
                {obsState.source === "cache" ? "prepared copy of the IRSA response" : "live from IRSA SIA2"} ·{" "}
                {target && `${target.ra.toFixed(4)}°, ${target.dec.toFixed(4)}°`}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <span>DR1 · Archive checked {obsState.queried ? fmtDateTime(obsState.queried) : "at an unknown time"}.</span>
              <button type="button" className="btn" disabled={refreshing} onClick={refresh}>{refreshing ? "Checking archive…" : "Check for newer observations"}</button>
              {loaded && <><button type="button" className="btn" onClick={() => share()}>Share investigation</button><button type="button" className="btn" onClick={() => share(true)}>Copy embed code</button></>}
            </div>
            {shareStatus && <p role="status" className="mt-2 break-all text-[12px] text-accent">{shareStatus}</p>}
            {refreshError && <p role="alert" className="mt-2 text-[12px] text-warn">{refreshError}</p>}
            {obsState.legacy && <p className="mt-2 text-[11px] text-dim">Prepared demo searches cover the centre. Check the archive to include exposures overlapping the full field.</p>}
            {obs.length > nInside && <p className="mt-2 text-[11px] text-dim">{obs.length - nInside} additional archive footprints overlap the search region but do not safely cover its centre; they are excluded from target comparisons. Edge coverage can be incomplete.</p>}
            {nInside > 0 && (
              <>
                <p className="mt-1 text-[12.5px] text-muted">
                  Each dot is one exposure: its date, and the wavelength SPHEREx recorded <i>at this exact spot</i>. SPHEREx&apos;s filter changes colour across
                  the detector, so a fair &quot;before and after&quot; needs two dots on the same detector at the same height.
                </p>
                <div className="mt-3">
                  <ObsTimeline obs={obs} selected={set} onPick={(o) => chooseSet(pickSet(obs, o, cadence))} />
                </div>
                <div className="mt-3">
                  <div className="label mb-1.5">Comparable sets (same detector; every pair of dates within half a channel in wavelength)</div>
                  {sets.length === 0 ? (
                    <p className="text-[12.5px] text-warn">
                      No two dates share a detector and wavelength here, so a fair comparison isn&apos;t possible. You can still pick a single dot to view it.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {sets.map((s) => (
                        <button
                          key={s.key}
                          onClick={() => chooseSet(s)}
                          className={`rounded-xl border px-3 py-1.5 text-left transition ${set?.key === s.key ? "border-white/50 bg-white/10" : "border-line hover:bg-white/5"}`}
                        >
                          <div className="data text-[12.5px]" style={{ color: wavelengthColor(s.lambdaRef) }}>
                            {s.lambdaRef.toFixed(3)} µm · D{s.detector}
                          </div>
                          <div className="text-[11px] text-muted">
                            {s.frames.length} exposures · {s.nDays} days · {Math.round(s.spanDays)} days apart
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* viewer */}
        {set && (
          <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="glass mb-3 flex flex-wrap items-center gap-2 rounded-xl p-3 text-[12px]">
                <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous exposures</button>
                <span>Page {page + 1} of {Math.ceil(set.frames.length / 12)} · {set.frames.length} compatible exposures</span>
                <button className="btn" disabled={(page + 1) * 12 >= set.frames.length} onClick={() => setPage((p) => p + 1)}>Next exposures</button>
                <span className="text-dim">Loads up to 12 at a time.</span>
              </div>
              {progress && (
                <div className="glass rounded-2xl p-5 text-[13px] text-muted">
                  Fetching and aligning SPHEREx frames… {progress.done}/{progress.total}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-accent transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
                  </div>
                  {progress.error && <div className="mt-2 text-warn">Some frames failed: {progress.error}</div>}
                  {progress.error && progress.done === progress.total && <button className="btn mt-2" onClick={() => setLoadAttempt((v) => v + 1)}>Retry these exposures</button>}
                </div>
              )}
              {loaded && cur && (
                <>
                  {frameWarnings.map((warning) => <p key={warning} role="alert" className="mb-2 text-[12px] text-warn">{warning}</p>)}
                  {!!frameWarnings.length && <button className="btn mb-2" onClick={() => setLoadAttempt((v) => v + 1)}>Retry failed exposures</button>}
                  {view === "stacks" ? <VisitStacks frames={loaded.frames} grid={loaded.grid} lo={loaded.lo} hi={loaded.hi} settings={stackSettings} onSettings={setStackSettings} /> : <div
                    className="relative aspect-square w-full cursor-crosshair overflow-hidden rounded-2xl border border-line bg-black"
                    title="Click a source to measure its position and inspect its spectrum below"
                    onClick={(e) => {
                      if (view === "changes") return;
                      const bounds = e.currentTarget.getBoundingClientRect();
                      const [ra, dec] = gridToSky(loaded.grid, (e.clientX - bounds.left) / bounds.width * n - 0.5, (1 - (e.clientY - bounds.top) / bounds.height) * n - 0.5);
                      setMeasureAt({ ra, dec, label: "Selected sky position", mjd: cur.meta.mjdAvg }); setCand(null);
                    }}
                  >
                    {view === "frames" && (
                      <GridCanvas
                        data={loaded.grids[Math.min(idx, loaded.grids.length - 1)]}
                        n={n}
                        mode="image"
                        lo={loaded.lo}
                        hi={loaded.hi}
                        className="absolute inset-0 h-full w-full"
                        label={`SPHEREx ${cur.meta.obsid} on ${fmtDateTime(cur.meta.dateAvg)}`}
                      />
                    )}
                    {view === "swipe" && (
                      <>
                        <GridCanvas data={loaded.grids[pair[1]]} n={n} mode="image" lo={loaded.lo} hi={loaded.hi} className="absolute inset-0 h-full w-full" label="later date" />
                        <GridCanvas
                          data={loaded.grids[pair[0]]}
                          n={n}
                          mode="image"
                          lo={loaded.lo}
                          hi={loaded.hi}
                          className="absolute inset-0 h-full w-full"
                          style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` }}
                          label="earlier date"
                        />
                        <div className="pointer-events-none absolute inset-y-0 w-[2px] -translate-x-1/2 bg-white/80" style={{ left: `${split * 100}%` }} />
                      </>
                    )}
                    {view === "changes" && change && (
                      <GridCanvas data={change.z} n={n} mode="diverging" lo={0} hi={8} className="absolute inset-0 h-full w-full" label="Change map" />
                    )}
                    {showQuality && <QualityOverlay frames={view === "frames" ? [cur] : [loaded.frames[pair[0]], loaded.frames[pair[1]]]} grid={loaded.grid} />}
                    <svg viewBox={`0 0 ${n} ${n}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                      <g stroke="rgba(255,255,255,0.75)" strokeWidth={n / 400} fill="none">
                        <line x1={sx(tgt[0]) - n * 0.06} y1={sy(tgt[1])} x2={sx(tgt[0]) - n * 0.025} y2={sy(tgt[1])} />
                        <line x1={sx(tgt[0]) + n * 0.025} y1={sy(tgt[1])} x2={sx(tgt[0]) + n * 0.06} y2={sy(tgt[1])} />
                        <line x1={sx(tgt[0])} y1={sy(tgt[1]) - n * 0.06} x2={sx(tgt[0])} y2={sy(tgt[1]) - n * 0.025} />
                        <line x1={sx(tgt[0])} y1={sy(tgt[1]) + n * 0.025} x2={sx(tgt[0])} y2={sy(tgt[1]) + n * 0.06} />
                      </g>
                      {view !== "changes" &&
                        gaiaMarks.map((m) => (
                          <circle key={m.id} cx={sx(m.x)} cy={sy(m.y)} r={m.fast ? n * 0.03 : n * 0.018} fill="none" stroke={m.fast ? "#ffc857" : "rgba(127,216,255,0.4)"} strokeWidth={m.fast ? n / 300 : n / 500} />
                        ))}
                      {view === "changes" &&
                        change?.candidates.map((c) => (
                          <g key={c.id} className="pointer-events-auto cursor-pointer" onClick={() => setCand(c)}>
                            <circle cx={sx(c.x)} cy={sy(c.y)} r={n * 0.035} fill="none" stroke={cand?.id === c.id ? "white" : c.kind === "residual" || c.kind === "unmatched" ? "rgba(255,255,255,0.35)" : "#ffc857"} strokeWidth={n / 300} />
                            <text x={sx(c.x) + n * 0.04} y={sy(c.y) - n * 0.03} fontSize={n * 0.04} fill="#ffe7a8">
                              {c.id}
                            </text>
                            {c.partner && <line x1={sx(c.partner.x)} y1={sy(c.partner.y)} x2={sx(c.x)} y2={sy(c.y)} stroke="#ffc857" strokeWidth={n / 400} strokeDasharray="1 1" />}
                          </g>
                        ))}
                      <text x={n * 0.03} y={n * 0.97} fontSize={n * 0.035} fill="rgba(233,237,255,0.8)">
                        N ↑ E ←
                      </text>
                    </svg>
                    <div className="data pointer-events-none absolute left-3 top-3 rounded-lg bg-black/70 px-2.5 py-1.5 text-[11.5px]">
                      {view === "frames" && fmtDateTime(cur.meta.dateAvg)}
                      {view === "swipe" && `◀ ${fmtDate(loaded.frames[pair[0]].meta.dateAvg)}`}
                      {view === "changes" && `${fmtDate(loaded.frames[pair[0]].meta.dateAvg)} → ${fmtDate(loaded.frames[pair[1]].meta.dateAvg)}`}
                    </div>
                    {view === "swipe" && (
                      <div className="data pointer-events-none absolute right-3 top-3 rounded-lg bg-black/70 px-2.5 py-1.5 text-[11.5px]">
                        {fmtDate(loaded.frames[pair[1]].meta.dateAvg)} ▶
                      </div>
                    )}
                  </div>}

                  {/* controls */}
                  <div className="glass mt-3 rounded-2xl p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {(
                        [
                          ["frames", "Play dates"],
                          ["swipe", "Swipe"],
                          ["changes", "Find changes"],
                          ["stacks", "Stack visits"],
                        ] as const
                      ).map(([v, l]) => (
                        <button
                          key={v}
                          className={`btn ${view === v ? "btn-primary" : ""}`}
                          disabled={loaded.frames.length < 2 && v !== "frames"}
                          onClick={() => (v === "changes" ? runChanges() : (setView(v), v !== "frames" && setPlaying(false)))}
                        >
                          {l}
                        </button>
                      ))}
                      {view === "frames" && loaded.frames.length > 1 && (
                        <button className="btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
                          {playing ? "❚❚" : "▶"}
                        </button>
                      )}
                      <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[12px] text-muted">
                        <input type="checkbox" checked={showGaia} onChange={(e) => setShowGaia(e.target.checked)} className="accent-cyan-300" />
                        Gaia stars <span className="text-dim">(G &lt; 17, moved to each date; <span className="text-warn">○</span> fast movers)</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted"><input type="checkbox" checked={showQuality} onChange={(e) => setShowQuality(e.target.checked)} /> Quality overlay</label>
                      <div className="w-full text-[11px] text-dim">
                        Dark grey pixels are flagged as unusable in that exposure (saturation, bad pixels, cosmic-ray hits), using the flag definitions in each file&apos;s header.
                        {showQuality && " Overlay: amber = unusable or outside coverage; purple = outlier (retained for moving/variable sources); cyan = other flags."}
                      </div>
                    </div>
                    {view === "frames" && (
                      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                        {loaded.frames.map((f, i) => (
                          <button
                            key={f.meta.obsid + i}
                            onClick={() => {
                              setIdx(i);
                              setPlaying(false);
                            }}
                            className={`min-w-[92px] flex-1 rounded-lg border px-2 py-1.5 text-left ${i === idx ? "border-white/40 bg-white/10" : "border-line hover:bg-white/5"}`}
                          >
                            <div className="data text-[11.5px]">{fmtDateTime(f.meta.dateAvg)}</div>
                            <div className="data text-[10.5px]" style={{ color: wavelengthColor(f.meta.target.wl) }}>
                              {f.meta.target.wl.toFixed(4)} µm
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {(view === "swipe" || view === "changes") && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                        <span className="text-muted">Compare</span>
                        <select
                          value={pair[0]}
                          onChange={(e) => { setChange(null); setPair([parseInt(e.target.value), pair[1]]); }}
                          className="rounded-lg border border-line bg-black/40 px-2 py-1"
                          aria-label="Earlier date"
                        >
                          {loaded.frames.map((f, i) => (
                            <option key={i} value={i}>
                              {fmtDateTime(f.meta.dateAvg)}
                            </option>
                          ))}
                        </select>
                        <span className="text-muted">with</span>
                        <select
                          value={pair[1]}
                          onChange={(e) => { setChange(null); setPair([pair[0], parseInt(e.target.value)]); }}
                          className="rounded-lg border border-line bg-black/40 px-2 py-1"
                          aria-label="Later date"
                        >
                          {loaded.frames.map((f, i) => (
                            <option key={i} value={i}>
                              {fmtDateTime(f.meta.dateAvg)}
                            </option>
                          ))}
                        </select>
                        {view === "changes" && (
                          <button className="btn !py-1" onClick={runChanges}>
                            Recompute
                          </button>
                        )}
                        {view === "swipe" && (
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(split * 100)}
                            onChange={(e) => setSplit(parseInt(e.target.value) / 100)}
                            className="min-w-[160px] flex-1 accent-cyan-300"
                            aria-label="Swipe position between the two dates (arrow keys work)"
                          />
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* side panel */}
            <div className="min-w-0 space-y-4">
              {loaded && (
                <div className="glass rounded-2xl p-4">
                  <div className="label">This sequence</div>
                  <div className="mt-1 text-[14px]">
                    Detector D{set.detector} at{" "}
                    <span className="data" style={{ color: wavelengthColor(set.lambdaRef) }}>
                      {set.lambdaRef.toFixed(3)} µm
                    </span>{" "}
                    · {loaded.frames.length} dates
                    <span className="text-dim"> · {cadence === "daily" ? "one exposure per day" : "every compatible exposure"} · page {page + 1}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-[12px]">
                    <li>
                      <span className={loaded.lambdaSpread.centre <= 0.5 * set.bandwidth ? "text-good" : "text-warn"}>●</span> At the target, exact wavelengths agree within{" "}
                      <span className="data">{loaded.lambdaSpread.centre.toFixed(4)} µm</span> ({Math.round((loaded.lambdaSpread.centre / set.bandwidth) * 100)}% of the{" "}
                      {set.bandwidth.toFixed(3)} µm channel width).
                    </li>
                    <li>
                      <span className={loaded.lambdaSpread.corners <= 0.5 * set.bandwidth ? "text-good" : "text-warn"}>●</span> At the field corners they agree within{" "}
                      <span className="data">{loaded.lambdaSpread.corners.toFixed(4)} µm</span> ({Math.round((loaded.lambdaSpread.corners / set.bandwidth) * 100)}%).{" "}
                      {loaded.lambdaSpread.corners > 0.5 * set.bandwidth && "Changes near the edges may be partly spectral, not temporal."}
                    </li>
                    {loaded.excluded.map((x) => (
                      <li key={x.obsid} className="text-warn">
                        Excluded {x.obsid}: {x.reason}
                      </li>
                    ))}
                    <li className="text-dim">
                      {loaded.sources.every((s) => s === "cache")
                        ? "Frames from the prepared cache (byte-identical to the live IRSA response)."
                        : loaded.sources.some((s) => s === "cache")
                          ? "Mix of live IRSA frames and prepared cache."
                          : "Frames fetched live from IRSA."}
                    </li>
                  </ul>
                  {cur && <details className="mt-3 text-[12px] text-muted"><summary className="cursor-pointer">Flag definitions for this exposure</summary>
                    {cur.meta.flags.map((flag) => <p className="mt-1" key={flag.name}><b>{flag.name}</b>: {flag.desc || "No description supplied by the archive."}</p>)}
                  </details>}
                  {cur && view === "frames" && (
                    <div className="mt-3 rounded-xl bg-white/5 p-3 text-[12px]">
                      <div className="data">
                        {cur.meta.obsid} · D{cur.meta.detector} · {cur.meta.exposure.toFixed(0)} s · QA {cur.meta.l2dqa}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3">
                        <a className="text-accent hover:underline" href={cur.meta.sourceFits} target="_blank" rel="noreferrer">
                          Original FITS ↗
                        </a>
                        <a className="text-accent hover:underline" href={cur.meta.cutoutUrl} target="_blank" rel="noreferrer">
                          Exact cutout ↗
                        </a>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link className="btn" href={`/explore?ra=${target!.ra}&dec=${target!.dec}&fov=${size}&wise=0.5`}>Overlay WISE at this position ↗</Link>
                    <button
                      className="btn"
                      onClick={() => {
                        setMeasureAt({ ra: target!.ra, dec: target!.dec, label: target!.name ?? "Target position", pm: target!.pm, epochYear: target!.epochYear });
                        setCand(null);
                      }}
                    >
                      Measure the target on every date
                    </button>
                    {loaded.frames.length > 1 && view !== "changes" && (
                      <button className="btn btn-primary" onClick={runChanges}>
                        Find changes →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {view === "changes" && change && loaded && (
                <div className="glass rounded-2xl p-4">
                  <div className="label">What changed between {fmtDate(loaded.frames[pair[0]].meta.dateAvg)} and {fmtDate(loaded.frames[pair[1]].meta.dateAvg)}</div>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">
                    Blue: fainter later. Red: brighter later. Significance is scaled by the <b className="text-text">measured</b> scatter of this difference image
                    (σ = {Number.isFinite(change.sigma) ? change.sigma.toPrecision(3) : "unavailable"} MJy/sr), over pixels valid on both dates ({Math.round(change.validFrac * 100)}% of the field). Treat it as an
                    indicator, not a calibrated probability. Pixels that differ by more than half a channel at their own position are excluded.
                  </p>
                  {!Number.isFinite(change.sigma) || change.validFrac < 0.05 ? (
                    <p className="mt-3 text-[13px] text-warn">Insufficient usable, wavelength-matched overlap to evaluate changes. Try another pair of exposures or a smaller field.</p>
                  ) : change.candidates.length === 0 ? (
                    <p className="mt-3 text-[13px] text-text">No coherent change above 5σ. The sky looks the same on both dates at this wavelength.</p>
                  ) : (
                    <ul className="scrollbar-thin mt-3 max-h-[320px] space-y-1 overflow-y-auto">
                      {change.candidates.map((c) => (
                        <li key={c.id}>
                          <button
                            onClick={() => {
                              setCand(c);
                              const faded = c.kind === "faded";
                              setMeasureAt({
                                ra: c.ra,
                                dec: c.dec,
                                label: `Change #${c.id}`,
                                partner: c.partner ? { ra: c.partner.ra, dec: c.partner.dec } : undefined,
                                mjd: loaded.frames[faded ? pair[0] : pair[1]].meta.mjdAvg,
                                when: faded ? "when it was still visible" : "when it was visible",
                              });
                            }}
                            className={`w-full rounded-lg px-2.5 py-1.5 text-left transition ${cand?.id === c.id ? "bg-white/10" : "hover:bg-white/5"}`}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[13px]">
                                #{c.id}{" "}
                                <span
                                  className={
                                    c.kind === "residual" || c.kind === "unmatched"
                                      ? "text-dim"
                                      : c.kind === "moved"
                                        ? "text-warn"
                                        : c.kind === "brightened"
                                          ? "text-[#ff8f7a]"
                                          : "text-[#8fb8ff]"
                                  }
                                >
                                  {c.kind === "residual" ? "likely subtraction residual" : c.kind === "unmatched" ? "different wavelength here" : c.kind}
                                </span>
                              </span>
                              <span className="data text-[11px] text-muted">{c.peakZ.toFixed(0)}σ (empirical)</span>
                            </div>
                            <div className="text-[11px] text-dim">{c.note}</div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {measureAt && loaded && (
                <MeasurePanel
                  key={`${measureAt.ra}_${measureAt.dec}`}
                  frames={loaded.frames}
                  at={measureAt}
                  slug={target?.slug}
                  noiseHint={robustSigma(loaded.grids[0])}
                />
              )}
            </div>
          </section>
        )}

        {target && obsState.status === "ready" && obs.some((o) => o.inside) && <SpectralLab
          key={`${target.ra}_${target.dec}_${size}_${start}_${end}_${obsState.queried}`}
          observations={obs} target={target} size={size}
          selected={measureAt ? { ra: measureAt.ra, dec: measureAt.dec, pm: measureAt.pm, epochYear: measureAt.epochYear } : undefined}
        />}

        {!target && obsState.status === "idle" && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TT_TARGETS.map((t) => (
              <button
                key={t.slug}
                onClick={() => {
                  setInput(`${t.ra.toFixed(5)} ${t.dec.toFixed(5)}`);
                  search({ ra: t.ra, dec: t.dec, name: t.name, slug: t.slug, pm: t.pm, epochYear: t.pm ? 2025.9 : undefined });
                }}
                className="glass rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:border-accent/40"
              >
                <div className="label">{t.kind}</div>
                <div className="font-display mt-1 text-[18px] font-semibold">
                  {t.challenge && <span className="mr-1 text-accent">★</span>}
                  {t.name}
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{t.why}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
