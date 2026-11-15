// "Is it already known?" Catalogue lookups around a position at a given time:
//  * ESA Gaia DR3: positions propagated from J2016.0 to the observation epoch with proper motion
//  * SIMBAD: named objects and their types (Harvard mirror first, then CDS)
//  * NASA/JPL Small-Body Identification: known asteroids/comets in the field AT that time
import { NextRequest, NextResponse } from "next/server";
import { parseCsv } from "@/lib/engine/observations";

export const runtime = "nodejs";
export const maxDuration = 60;

async function tap(url: string, query: string, timeoutMs = 25000) {
  const body = new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "json", QUERY: query });
  const r = await fetch(url, { method: "POST", body, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  if (text.trimStart().startsWith("<")) throw new Error("service unavailable");
  return JSON.parse(text) as { metadata?: { name: string }[]; data?: unknown[][] };
}

function rowsOf(j: { metadata?: { name: string }[]; data?: unknown[][] }) {
  const names = (j.metadata ?? []).map((m) => m.name);
  return (j.data ?? []).map((r) => Object.fromEntries(names.map((n, i) => [n, r[i]])) as Record<string, unknown>);
}

function sexRA(deg: number) {
  const h = (((deg % 360) + 360) % 360) / 15;
  const hh = Math.floor(h);
  const m = (h - hh) * 60;
  const mm = Math.floor(m);
  const ss = (m - mm) * 60;
  return `${String(hh).padStart(2, "0")}-${String(mm).padStart(2, "0")}-${ss.toFixed(2).padStart(5, "0")}`;
}
function sexDec(deg: number) {
  const s = deg < 0 ? "M" : "";
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = (a - d) * 60;
  const mm = Math.floor(m);
  const ss = (m - mm) * 60;
  return `${s}${String(d).padStart(2, "0")}-${String(mm).padStart(2, "0")}-${ss.toFixed(1).padStart(4, "0")}`;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const ra = Number(p.get("ra"));
  const dec = Number(p.get("dec"));
  const r = Math.min(0.05, Math.max(0.001, Number(p.get("r") ?? 0.01)));
  const services = (p.get("services") ?? "gaia,simbad").split(",");
  const mjd = Number(p.get("mjd") ?? 61000);
  if (![ra, dec, mjd].every(Number.isFinite)) return NextResponse.json({ error: "bad parameters" }, { status: 400 });
  const yr = 2000 + (mjd - 51544.5) / 365.25;
  const dt = yr - 2016.0;

  const gaiaQ =
    "SELECT TOP 200 source_id, ra, dec, pmra, pmdec, parallax, parallax_error, phot_g_mean_mag FROM gaiadr3.gaia_source " +
    `WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra}, ${dec}, ${r + 0.04})) ORDER BY phot_g_mean_mag`;
  // CSV keeps the 64-bit Gaia source_id exact (JSON numbers would round it)
  const gaia = () => fetch("https://gea.esac.esa.int/tap-server/tap/sync", {
    method: "POST",
    body: new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "csv", QUERY: gaiaQ }),
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
  })
    .then((x) => {
      if (!x.ok) throw new Error(`HTTP ${x.status}`);
      return x.text();
    })
    .then((text) =>
    (parseCsv(text) as Record<string, unknown>[])
      .map((s) => {
        const pmra = Number(s.pmra) || 0;
        const pmdec = Number(s.pmdec) || 0;
        const d0 = Number(s.dec);
        const dEp = d0 + (pmdec * dt) / 3.6e6;
        const aEp = Number(s.ra) + (pmra * dt) / 3.6e6 / Math.cos((d0 * Math.PI) / 180);
        const sep = Math.hypot((aEp - ra) * Math.cos((dec * Math.PI) / 180), dEp - dec) * 3600;
        return {
          source_id: String(s.source_id),
          g: Number(s.phot_g_mean_mag),
          parallax: s.parallax === "" ? null : Number(s.parallax),
          parallax_error: s.parallax_error === "" ? null : Number(s.parallax_error),
          pmra,
          pmdec,
          ra_epoch: aEp,
          dec_epoch: dEp,
          sep_arcsec: sep,
        };
      })
      .filter((s) => s.sep_arcsec <= r * 3600)
      .sort((a, b) => a.sep_arcsec - b.sep_arcsec),
  );

  const simbadQ =
    "SELECT TOP 300 b.main_id, b.ra, b.dec, b.otype, o.label AS otype_label, b.pmra, b.pmdec, " +
    `DISTANCE(POINT('ICRS', b.ra, b.dec), POINT('ICRS', ${ra}, ${dec})) * 3600 AS sep_arcsec ` +
    "FROM basic AS b LEFT JOIN otypedef AS o ON b.otype = o.otype " +
    `WHERE CONTAINS(POINT('ICRS', b.ra, b.dec), CIRCLE('ICRS', ${ra}, ${dec}, ${r + 0.1})) = 1 ORDER BY sep_arcsec`;
  const simbad = () => tap("https://simbad.harvard.edu/simbad/sim-tap/sync", simbadQ)
    .catch(() => tap("https://simbad.cds.unistra.fr/simbad/sim-tap/sync", simbadQ))
    .then((j) =>
      rowsOf(j)
        .map((o) => {
          // SIMBAD positions are J2000; propagate with proper motion to the observation epoch
          const pmra = Number(o.pmra) || 0;
          const pmdec = Number(o.pmdec) || 0;
          const d0 = Number(o.dec);
          const dt2000 = yr - 2000.0;
          const dEp = d0 + (pmdec * dt2000) / 3.6e6;
          const aEp = Number(o.ra) + (pmra * dt2000) / 3.6e6 / Math.cos((d0 * Math.PI) / 180);
          const sep = Math.hypot((aEp - ra) * Math.cos((dec * Math.PI) / 180), dEp - dec) * 3600;
          return { main_id: String(o.main_id), otype: o.otype, otype_label: o.otype_label, pmra, pmdec, ra_epoch: aEp, dec_epoch: dEp, sep_arcsec: sep };
        })
        .filter((o) => o.sep_arcsec <= r * 3600)
        .sort((a, b) => a.sep_arcsec - b.sep_arcsec)
        .slice(0, 25),
    );

  const t = new Date((mjd - 40587) * 86400000).toISOString();
  const obsTime = `${t.slice(0, 10)}_${t.slice(11, 19)}`;
  const hw = Math.max(r, 0.01);
  const sbUrl =
    "https://ssd-api.jpl.nasa.gov/sb_ident.api?mpc-code=500" +
    `&obs-time=${obsTime}&fov-ra-center=${sexRA(ra)}&fov-dec-center=${sexDec(dec)}` +
    `&fov-ra-hwidth=${hw}&fov-dec-hwidth=${hw}&two-pass=true&suppress-first-pass=true` +
    // comets (often no magnitude model) and asteroids (V <= 21, beyond SPHEREx's reach) as separate,
    // faster queries; each stays inside a 60 s serverless limit
    (services.includes("sbc") ? "&sb-kind=c&mag-required=false" : "&sb-kind=a&vmag-lim=21");
  // A JPL answer counts only if it is HTTP 200 AND structurally valid. "No matching records" is the only
  // empty result accepted as a successful search; anything else is an error, never "nothing known".
  const sb = () =>
    fetch(sbUrl, { signal: AbortSignal.timeout(57000), cache: "no-store" })
      .then(async (x) => {
        if (!x.ok) throw new Error(`JPL HTTP ${x.status}`);
        const j = (await x.json()) as {
          signature?: { source?: string };
          data_second_pass?: string[][];
          n_second_pass?: number;
          warning?: string;
          message?: string;
          code?: string | number;
        };
        if (!j.signature?.source?.includes("Small-Body Identification")) throw new Error("JPL returned an unexpected response");
        if (Array.isArray(j.data_second_pass)) {
          if (!j.data_second_pass.every((row) => Array.isArray(row) && row.length >= 9)) throw new Error("JPL rows malformed");
          return j.data_second_pass;
        }
        if (typeof j.warning === "string" && /no matching records/i.test(j.warning)) return [];
        throw new Error(`JPL: ${j.message ?? j.warning ?? "no result data"}`);
      })
      .then((rows) =>
      rows.map((row) => ({
        name: row[0],
        ra_hms: row[1],
        dec_dms: row[2],
        sep_arcsec: Number(row[5]),
        vmag: row[6],
        ra_rate_arcsec_h: Number(row[7]),
        dec_rate_arcsec_h: Number(row[8]),
      })),
    );

  const NOT_REQUESTED = Symbol("not requested");
  const run = <T,>(want: boolean, f: () => Promise<T>): Promise<T | typeof NOT_REQUESTED> => (want ? f() : Promise.resolve(NOT_REQUESTED));
  const [g, s, b] = await Promise.allSettled([
    run(services.includes("gaia"), gaia),
    run(services.includes("simbad"), simbad),
    run(services.some((x) => x === "sbc" || x === "sba"), sb),
  ]);
  const wrap = <T,>(x: PromiseSettledResult<T | typeof NOT_REQUESTED>) =>
    x.status === "rejected"
      ? { ok: false as const, error: String((x.reason as Error)?.message ?? x.reason) }
      : x.value === NOT_REQUESTED
        ? { ok: false as const, requested: false as const, error: "not requested" }
        : { ok: true as const, rows: x.value as T };
  return NextResponse.json(
    {
      query: { ra, dec, radius_deg: r, mjd, services, epoch_year: Number(yr.toFixed(4)), time_utc: t },
      gaia: { service: "ESA Gaia DR3 (positions propagated to the epoch)", ...wrap(g) },
      simbad: { service: "SIMBAD (Harvard mirror, CDS fallback)", ...wrap(s) },
      small_bodies: { service: "NASA/JPL Small-Body Identification (geocentric; SPHEREx orbits the Earth)", ...wrap(b) },
    },
    {
      headers: {
        "Cache-Control": [g, s, b].some((x) => x.status === "rejected") ? "no-store" : "public, s-maxage=86400",
      },
    },
  );
}
