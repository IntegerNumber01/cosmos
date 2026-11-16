import type { Cadence } from "./sequence";
import { FIELD_SIZES } from "./releases";

export type ViewMode = "frames" | "swipe" | "changes" | "stacks";
export type StackSettings = { minutes: number; first: number; second: number; difference: boolean };
export type MeasurementSelection = { ra: number; dec: number; label: string; partner?: { ra: number; dec: number }; mjd?: number; when?: string; pm?: [number, number]; epochYear?: number };
export type ViewState = {
  size: number;
  cadence: Cadence;
  start: string;
  end: string;
  page: number;
  anchor: string;
  window: string;
  frame: string;
  before: string;
  after: string;
  mode: ViewMode;
  split: number;
  gaia: boolean;
  quality: boolean;
  embed: boolean;
  stack: StackSettings;
  measurement?: MeasurementSelection;
};
function readMeasurement(raw: string | null): MeasurementSelection | undefined {
  if (!raw || raw.length > 1000) return;
  try {
    const m = JSON.parse(raw);
    const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
    const position = (v: { ra: number; dec: number }) => v && finite(v.ra) && finite(v.dec) && v.ra >= 0 && v.ra < 360 && Math.abs(v.dec) <= 90;
    if (!position(m) || typeof m.label !== "string" || m.label.length > 120) return;
    if (m.partner !== undefined && !position(m.partner)) return;
    if (m.mjd !== undefined && (!finite(m.mjd) || m.mjd < 10000 || m.mjd > 100000)) return;
    if (m.when !== undefined && (typeof m.when !== "string" || m.when.length > 100)) return;
    if (m.pm !== undefined && (!Array.isArray(m.pm) || m.pm.length !== 2 || !m.pm.every(finite))) return;
    if (m.epochYear !== undefined && (!finite(m.epochYear) || m.epochYear < 1800 || m.epochYear > 2200)) return;
    if ((m.pm !== undefined) !== (m.epochYear !== undefined)) return;
    return { ra: m.ra, dec: m.dec, label: m.label, ...(m.partner ? { partner: { ra: m.partner.ra, dec: m.partner.dec } } : {}), ...(m.mjd !== undefined ? { mjd: m.mjd } : {}), ...(m.when ? { when: m.when } : {}), ...(m.pm ? { pm: m.pm, epochYear: m.epochYear } : {}) };
  } catch { return; }
}
type Params = Pick<URLSearchParams, "get">;
const date = (s: string | null) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(s + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : "";
};
const num = (s: string | null, fallback: number) => s !== null && s.trim() !== "" && Number.isFinite(Number(s)) ? Number(s) : fallback;

export function readViewState(p: Params): ViewState {
  const size = num(p.get("size"), 0.1);
  const mode = p.get("mode");
  return {
    size: FIELD_SIZES.includes(size) ? size : 0.1,
    cadence: p.get("cadence") === "daily" ? "daily" : "exposures",
    start: date(p.get("start")), end: date(p.get("end")),
    page: Math.min(10000, Math.max(0, Math.floor(num(p.get("page"), 0)))),
    anchor: p.get("anchor") ?? "", window: p.get("window") ?? "", frame: p.get("frame") ?? "",
    before: p.get("before") ?? "", after: p.get("after") ?? "",
    mode: mode === "swipe" || mode === "changes" || mode === "stacks" ? mode : "frames",
    split: Math.min(1, Math.max(0, num(p.get("split"), 0.5))),
    gaia: p.get("gaia") !== "0", quality: p.get("quality") === "1", embed: p.get("embed") === "1",
    stack: {
      minutes: [30, 120, 1440].includes(num(p.get("visitSpan"), 30)) ? num(p.get("visitSpan"), 30) : 30,
      first: Math.max(0, Math.floor(num(p.get("visitA"), 0))),
      second: Math.max(-1, Math.floor(num(p.get("visitB"), -1))),
      difference: p.get("visitDiff") === "1",
    },
    measurement: readMeasurement(p.get("measure")),
  };
}

export type SharedTarget = { ra: number; dec: number; name?: string; slug?: string; pm?: [number, number]; epochYear?: number };
export function viewQuery(t: SharedTarget, s: ViewState, fromGaia = false) {
  const q = new URLSearchParams({ release: "dr1", size: String(s.size), cadence: s.cadence, mode: s.mode });
  if (t.slug) q.set("target", t.slug);
  else { q.set("ra", String(t.ra)); q.set("dec", String(t.dec)); }
  if (t.name) q.set("name", t.name);
  if (t.pm) { q.set("pmra", String(t.pm[0])); q.set("pmdec", String(t.pm[1])); }
  if (t.epochYear !== undefined) q.set("epoch", String(t.epochYear));
  if (fromGaia) q.set("from", "gaia");
  for (const key of ["start", "end", "anchor", "window", "frame", "before", "after"] as const) if (s[key]) q.set(key, s[key]);
  if (s.page) q.set("page", String(s.page));
  q.set("split", String(s.split)); q.set("gaia", s.gaia ? "1" : "0"); q.set("quality", s.quality ? "1" : "0");
  if (s.embed) q.set("embed", "1");
  if (s.measurement) q.set("measure", JSON.stringify(s.measurement));
  q.set("visitSpan", String(s.stack.minutes)); q.set("visitA", String(s.stack.first)); q.set("visitB", String(s.stack.second)); q.set("visitDiff", s.stack.difference ? "1" : "0");
  return q;
}

export function observationKey(o: { obsid: string; detector: number }) { return `${o.obsid}D${o.detector}`; }

export function inDateRange(mjd: number, start: string, end: string) {
  const ms = (mjd - 40587) * 86400000;
  return (!start || ms >= Date.parse(start + "T00:00:00Z")) && (!end || ms < Date.parse(end + "T00:00:00Z") + 86400000);
}
