import type { Cadence } from "./sequence";
import { FIELD_SIZES } from "./releases";

export type ViewMode = "frames" | "swipe" | "changes" | "stacks";
export type StackSettings = { minutes: number; first: number; second: number; difference: boolean };
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
};
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
  q.set("visitSpan", String(s.stack.minutes)); q.set("visitA", String(s.stack.first)); q.set("visitB", String(s.stack.second)); q.set("visitDiff", s.stack.difference ? "1" : "0");
  return q;
}

export function observationKey(o: { obsid: string; detector: number }) { return `${o.obsid}D${o.detector}`; }

export function inDateRange(mjd: number, start: string, end: string) {
  const ms = (mjd - 40587) * 86400000;
  return (!start || ms >= Date.parse(start + "T00:00:00Z")) && (!end || ms < Date.parse(end + "T00:00:00Z") + 86400000);
}
