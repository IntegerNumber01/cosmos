"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Advanced from "@/components/Advanced";
import { getKnown, Known } from "@/lib/engine/client";
import { exactWindow, Frame, measure, Measurement } from "@/lib/engine/sequence";
import { ENGINE_VERSION, RELEASE } from "@/lib/engine/releases";

type SbPart = { ok: true; rows: NonNullable<Known["small_bodies"]["rows"]> } | { ok: false; error: string };

/** "20:56:58.19" / "-05 41'18.5\"" -> degrees */
function hmsToDeg(h: string) {
  const [a, b, c] = h.split(/[: ]/).map(Number);
  return (a + b / 60 + c / 3600) * 15;
}
function dmsToDeg(d: string) {
  const m = d.match(/([+-]?)(\d+)\D+(\d+)\D+([\d.]+)/);
  if (!m) return NaN;
  const v = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600;
  return m[1] === "-" ? -v : v;
}

type Props = {
  frames: Frame[];
  at: { ra: number; dec: number; label: string; partner?: { ra: number; dec: number }; mjd?: number; when?: string; pm?: [number, number]; epochYear?: number };
  slug?: string;
  noiseHint: number;
};

const fmtDate = (iso: string) =>
  new Date(iso.endsWith("Z") ? iso : iso + "Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });

function Chart({ pts, unit, label }: { pts: { t: number; v: number; e: number; label: string; pred?: number }[]; unit: string; label: string }) {
  const W = 360,
    H = 130,
    P = { l: 46, r: 8, t: 10, b: 22 };
  const ok = pts.filter((p) => Number.isFinite(p.v));
  if (ok.length < 2) return null;
  const t0 = Math.min(...ok.map((p) => p.t)),
    t1 = Math.max(...ok.map((p) => p.t));
  const vals = ok.flatMap((p) => [p.v - (Number.isFinite(p.e) ? p.e : 0), p.v + (Number.isFinite(p.e) ? p.e : 0), ...(p.pred !== undefined ? [p.pred] : [])]);
  let v0 = Math.min(...vals),
    v1 = Math.max(...vals);
  if (v1 - v0 < 1e-9) {
    v0 -= 1;
    v1 += 1;
  }
  const pad = (v1 - v0) * 0.12;
  v0 -= pad;
  v1 += pad;
  const x = (t: number) => P.l + ((t - t0) / Math.max(1e-6, t1 - t0)) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - ((v - v0) / (v1 - v0)) * (H - P.t - P.b);
  const predPts = ok.filter((p) => p.pred !== undefined);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
      <text x={4} y={12} fontSize={10} fill="#8d96bd">
        {unit}
      </text>
      {[v0 + pad, (v0 + v1) / 2, v1 - pad].map((v, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="rgba(150,175,255,0.08)" />
          <text x={P.l - 4} y={y(v) + 3} fontSize={9.5} fill="#5d668c" textAnchor="end">
            {Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)}
          </text>
        </g>
      ))}
      {predPts.length >= 2 && (
        <polyline points={predPts.map((p) => `${x(p.t)},${y(p.pred!)}`).join(" ")} fill="none" stroke="#7fd8ff" strokeDasharray="4 3" strokeWidth={1.4} />
      )}
      {ok.map((p, i) => (
        <g key={i}>
          {Number.isFinite(p.e) && <line x1={x(p.t)} x2={x(p.t)} y1={y(p.v - p.e)} y2={y(p.v + p.e)} stroke="#6ef0b0" strokeWidth={1.2} />}
          <circle cx={x(p.t)} cy={y(p.v)} r={3.2} fill="#6ef0b0" />
          {(i === 0 || i === ok.length - 1) && (
            <text x={x(p.t)} y={H - 6} fontSize={9} fill="#5d668c" textAnchor={i === 0 ? "start" : "end"}>
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export default function MeasurePanel({ frames, at, slug }: Props) {
  // follow proper motion (if known) so the aperture stays on a fast-moving star on every date
  const posAt = (mjd: number): [number, number] => {
    if (!at.pm || at.epochYear === undefined) return [at.ra, at.dec];
    const dt = (mjd - (51544.5 + (at.epochYear - 2000) * 365.25)) / 365.25;
    return [at.ra + (at.pm[0] * dt) / 3.6e6 / Math.cos((at.dec * Math.PI) / 180), at.dec + (at.pm[1] * dt) / 3.6e6];
  };
  const rows: Measurement[] = useMemo(
    () => frames.map((f) => measure(f, ...posAt(f.meta.mjdAvg))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frames, at],
  );
  const partnerRows: Measurement[] | null = useMemo(
    () => (at.partner ? frames.map((f) => measure(f, at.partner!.ra, at.partner!.dec)) : null),
    [frames, at],
  );
  // catalogue epoch: the date the source was actually visible (earlier date for something that faded)
  const lastMjd = at.mjd ?? frames[frames.length - 1].meta.mjdAvg;
  const whenIso = new Date((lastMjd - 40587) * 86400000).toISOString();
  const [known, setKnown] = useState<Known | null>(null);
  const [knownErr, setKnownErr] = useState("");
  const [sb, setSb] = useState<{ comets: SbPart; asteroids: SbPart } | null | "loading">(null);
  const lookupGeneration = useRef(0);

  useEffect(() => {
    const generation = ++lookupGeneration.current;
    let active = true;
    setKnown(null);
    setKnownErr("");
    setSb(null);
    const [kra, kdec] = posAt(lastMjd);
    getKnown(kra, kdec, 0.0028, lastMjd, "gaia,simbad", slug)
      .then((result) => active && setKnown(result))
      .catch((e) => active && setKnownErr(String(e.message ?? e)));
    return () => { active = false; lookupGeneration.current = generation + 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, lastMjd, slug]);

  const checkSmallBodies = () => {
    const generation = lookupGeneration.current;
    setSb("loading");
    const part = (x: PromiseSettledResult<Known>): SbPart =>
      x.status === "rejected"
        ? { ok: false, error: String((x.reason as Error)?.message ?? x.reason) }
        : x.value.small_bodies.ok
          ? { ok: true, rows: x.value.small_bodies.rows ?? [] }
          : { ok: false, error: x.value.small_bodies.error ?? "lookup failed" };
    Promise.allSettled([getKnown(at.ra, at.dec, 0.02, lastMjd, "sbc", slug), getKnown(at.ra, at.dec, 0.02, lastMjd, "sba", slug)]).then(([c, a]) => {
      if (generation === lookupGeneration.current) setSb({ comets: part(c), asteroids: part(a) });
    });
  };

  const gaiaMatch = known?.gaia.ok ? known.gaia.rows?.find((r) => r.sep_arcsec < 6) : undefined;
  // prefer the object itself over its planets / sub-components at the same position
  const simbadRows = known?.simbad.ok
    ? [...(known.simbad.rows ?? [])].sort(
        (a, b) => Number(String(a.otype).startsWith("Pl")) - Number(String(b.otype).startsWith("Pl")) || a.sep_arcsec - b.sep_arcsec,
      )
    : [];
  const simbadTop = simbadRows[0];
  const pmAgree = (a: [number, number], b: [number, number]) =>
    Math.abs(a[0] - b[0]) < Math.max(50, 0.2 * Math.hypot(...a)) && Math.abs(a[1] - b[1]) < Math.max(50, 0.2 * Math.hypot(...a));
  const simbadPm: [number, number] | null =
    simbadTop && (Number(simbadTop.pmra) || Number(simbadTop.pmdec)) ? [Number(simbadTop.pmra) || 0, Number(simbadTop.pmdec) || 0] : null;
  const targetPm: [number, number] | null = at.pm ?? simbadPm;
  // the Gaia source is the target only if its proper motion matches what we know about the target
  const gaiaIsTarget = !!gaiaMatch && (!targetPm || pmAgree(targetPm, [gaiaMatch.pmra, gaiaMatch.pmdec]));
  const predPm: [number, number] | null = targetPm ?? (gaiaMatch ? [gaiaMatch.pmra, gaiaMatch.pmdec] : null);
  // the sequence is matched at the search target; re-check the wavelengths at THIS position
  const bwHere = rows.map((r) => r.bw).sort((a, b) => a - b)[rows.length >> 1];
  const cmp = exactWindow(rows, (r) => r.wl, bwHere);
  const cmpIds = new Set(cmp.keep.map((r) => r.obsid));
  // position track relative to the first good centroid (comparable dates only), with the target's predicted motion
  const firstC = rows.find((r) => r.centroid && cmpIds.has(r.obsid))?.centroid;
  const cosd = Math.cos((at.dec * Math.PI) / 180);
  const t0 = rows.find((r) => r.centroid && cmpIds.has(r.obsid))?.mjd ?? rows[0].mjd;
  const track = rows.filter((r) => cmpIds.has(r.obsid)).map((r) => ({
    t: r.mjd,
    label: fmtDate(r.date),
    dN: r.centroid && firstC ? (r.centroid.dec - firstC.dec) * 3600 : NaN,
    dE: r.centroid && firstC ? (r.centroid.ra - firstC.ra) * cosd * 3600 : NaN,
    e: r.centroid?.errArcsec ?? NaN,
    predN: predPm ? (predPm[1] / 1000) * ((r.mjd - t0) / 365.25) : undefined,
    predE: predPm ? (predPm[0] / 1000) * ((r.mjd - t0) / 365.25) : undefined,
  }));
  const withC = track.filter((p) => Number.isFinite(p.dN));
  // does any measured centroid coincide (within 2") with a Gaia star that is NOT the target?
  const centroidOnNeighbour =
    !!gaiaMatch &&
    rows.some((r) => {
      if (!r.centroid) return false;
      const dt = (r.mjd - lastMjd) / 365.25;
      const gra = gaiaMatch.ra_epoch + (gaiaMatch.pmra * dt) / 3.6e6 / Math.cos((gaiaMatch.dec_epoch * Math.PI) / 180);
      const gdec = gaiaMatch.dec_epoch + (gaiaMatch.pmdec * dt) / 3.6e6;
      return Math.hypot((r.centroid.ra - gra) * Math.cos((gdec * Math.PI) / 180), r.centroid.dec - gdec) * 3600 < 2;
    });
  const lastT = withC[withC.length - 1];
  const totalShift = lastT ? Math.hypot(lastT.dN, lastT.dE) : NaN;
  const predShift = lastT && predPm ? Math.hypot(lastT.predN!, lastT.predE!) : NaN;
  const shiftErr = lastT ? Math.hypot(lastT.e, withC[0].e) : NaN;

  // photometric variation: only dates whose wavelengths match AT THIS POSITION, with clean apertures
  const good = cmp.keep.filter((r) => Number.isFinite(r.flux) && Number.isFinite(r.fluxErrEmp) && !r.partial);
  const wavelengthSpan = good.length > 1 ? Math.max(...good.map((r) => r.wl)) - Math.min(...good.map((r) => r.wl)) : 0;
  const channelSpan = good.length > 1 ? wavelengthSpan / Math.min(...good.map((r) => r.bw)) : 0;
  let varText = "";
  let plainVar = "";
  if (good.length >= 2) {
    const hi = good.reduce((a, b) => (b.flux > a.flux ? b : a));
    const lo = good.reduce((a, b) => (b.flux < a.flux ? b : a));
    const sig = (hi.flux - lo.flux) / Math.hypot(hi.fluxErrEmp, lo.fluxErrEmp);
    const pct = lo.flux > 0 ? ((hi.flux - lo.flux) / lo.flux) * 100 : NaN;
    const loIsZero = Math.abs(lo.flux) < 3 * lo.fluxErrEmp;
    varText =
      sig < 5
        ? `Brightness is consistent between dates within the empirical noise (largest difference ${sig.toFixed(1)}×).`
        : loIsZero
          ? `Present on ${fmtDate(hi.date)} but consistent with nothing on ${fmtDate(lo.date)}: a ${sig.toFixed(0)}× change compared with the empirical noise.`
          : `Brightness differs between dates by ${pct.toFixed(0)}% (${sig.toFixed(1)}× the empirical noise).`;
    plainVar =
      sig < 5
        ? "No clear brightness difference stands out in this sample. This does not rule out smaller changes."
        : loIsZero
          ? `Visible on ${fmtDate(hi.date)} but not on ${fmtDate(lo.date)}.`
          : Number.isFinite(pct)
            ? `The brightness changes by about ${pct.toFixed(0)}% between dates.`
            : "The brightness changes between dates.";
  }
  const nUnusable = rows.filter((r) => !Number.isFinite(r.flux)).length;
  const saturated = rows.some((r) => r.flagsHere.some((f) => ["OVERFLOW", "NONLINEAR", "SUR_ERROR"].includes(f)));


  const sbRows = sb && sb !== "loading" ? [...(sb.comets.ok ? sb.comets.rows : []), ...(sb.asteroids.ok ? sb.asteroids.rows : [])].sort((a, b) => a.sep_arcsec - b.sep_arcsec) : [];
  // compare JPL's predicted position with OUR measured centroid on the date the object was visible
  const visibleRow = rows.find((r) => Math.abs(r.mjd - lastMjd) < 1e-3);
  let assoc: { level: "consistent" | "possible"; text: string } | null = null;
  if (sbRows.length) {
    const b = sbRows[0];
    const bra = hmsToDeg(b.ra_hms);
    const bdec = dmsToDeg(b.dec_dms);
    const c = visibleRow?.centroid;
    if (c && Number.isFinite(bra) && Number.isFinite(bdec)) {
      const off = Math.hypot((c.ra - bra) * Math.cos((bdec * Math.PI) / 180), c.dec - bdec) * 3600;
      const tol = Math.max(3 * c.errArcsec, 6.15);
      assoc =
        off <= tol
          ? {
              level: "consistent",
              text: `Consistent with known object ${b.name}: our measured position on ${fmtDate(whenIso)} is ${off.toFixed(1)}″ from NASA/JPL's prediction (tolerance ${tol.toFixed(1)}″). Its motion isn't checked here. Treat this as an association with a known object, not a discovery.`,
            }
          : {
              level: "possible",
              text: `Possible association with ${b.name}: JPL predicts it ${b.sep_arcsec.toFixed(0)}″ from this spot, but our measured position is ${off.toFixed(1)}″ from the prediction (tolerance ${tol.toFixed(1)}″). Not confirmed.`,
            };
    } else {
      assoc = {
        level: "possible",
        text: `Possible association with ${b.name}: JPL predicts it ${b.sep_arcsec.toFixed(0)}″ from this spot at that time. There's no reliable measured position to compare, so this isn't confirmed.`,
      };
    }
  }
  const catalogueGaps = [!known?.gaia.ok && "Gaia", !known?.simbad.ok && "SIMBAD"].filter(Boolean) as string[];
  // everyday-language summary of the same verdict (full wording stays under "Show the science")
  let plainVerdict = "";
  if (known && assoc) {
    plainVerdict =
      assoc.level === "consistent"
        ? `The measured position is consistent with known object ${sbRows[0].name}. Its motion has not been checked here.`
        : `A known asteroid or comet (${sbRows[0].name}) may be nearby, but the match isn't confirmed.`;
  } else if (known) {
    if (simbadTop) plainVerdict = `Already known: ${simbadTop.main_id.replace(/^NAME /, "")}${simbadTop.otype_label ? ` (${simbadTop.otype_label})` : ""}.`;
    else if (gaiaMatch) plainVerdict = "Already known: a star listed in the Gaia star catalogue.";
    else
      plainVerdict = catalogueGaps.length
        ? "We couldn't reach the star catalogues, so we can't say whether this is already known."
        : "Nothing known is listed here. That is NOT a discovery: it could be a glitch, so it needs more checks.";
  }
  let verdict = "";
  if (known && assoc) {
    verdict = assoc.text;
  } else if (known) {
    if (simbadTop || gaiaMatch) {
      const sName = simbadTop ? `${simbadTop.main_id.replace(/^NAME /, "")}${simbadTop.otype_label ? ` (${simbadTop.otype_label})` : ""}` : "";
      if (simbadTop && gaiaMatch && gaiaIsTarget)
        verdict = `Known object: ${sName} = Gaia DR3 ${gaiaMatch.source_id}, within ${Math.min(gaiaMatch.sep_arcsec, simbadTop.sep_arcsec).toFixed(1)}″ at this date.`;
      else if (simbadTop)
        verdict = `Known object: ${sName}, ${simbadTop.sep_arcsec.toFixed(1)}″ away at this date.${
          gaiaMatch ? ` The nearest Gaia DR3 source (${gaiaMatch.source_id}, ${gaiaMatch.sep_arcsec.toFixed(1)}″) is a different star: its proper motion doesn't match.` : ""
        }`;
      else verdict = `Known star: Gaia DR3 ${gaiaMatch!.source_id}, ${gaiaMatch!.sep_arcsec.toFixed(1)}″ away at this date.`;
    } else {
      verdict = catalogueGaps.length
        ? `${catalogueGaps.join(" and ")} could not be checked, so we can't say whether this is known.`
        : "No Gaia DR3 or SIMBAD object within 10″ at this date. That is NOT a discovery. Check for artefacts (flags below), confirm on more dates, and check known solar-system objects.";
    }
  }

  const firstFlux = good[0];
  const lastFlux = good[good.length - 1];
  const endpointNoise = good.length > 1 ? Math.hypot(firstFlux.fluxErrEmp, lastFlux.fluxErrEmp) : NaN;
  const endpointChange = good.length > 1 ? lastFlux.flux - firstFlux.flux : NaN;
  const endpointRatio = firstFlux && firstFlux.flux > 3 * firstFlux.fluxErrEmp && lastFlux?.flux > 0 ? endpointChange / firstFlux.flux * 100 : NaN;
  const endpointStrength = Math.abs(endpointChange) / endpointNoise;
  const brightnessSummary = good.length < 2
    ? "Not enough clean, wavelength-matched brightness measurements to compare dates."
    : endpointStrength < 5
      ? `No clear brightness change between ${fmtDate(firstFlux.date)} and ${fmtDate(lastFlux.date)} against the measured blank-sky noise.`
      : Number.isFinite(endpointRatio)
        ? `About ${Math.abs(endpointRatio).toFixed(0)}% ${endpointRatio >= 0 ? "brighter" : "fainter"} on ${fmtDate(lastFlux.date)} than on ${fmtDate(firstFlux.date)}.`
        : `Brightness differs between ${fmtDate(firstFlux.date)} and ${fmtDate(lastFlux.date)}. A percentage would be unreliable because one measurement is close to zero.`;
  const positionSummary = withC.length < 2
    ? "Not enough reliable positions to measure a shift."
    : `Measured shift: ${totalShift.toFixed(1)} ± ${shiftErr.toFixed(1)} arcseconds from ${withC[0].label} to ${lastT.label}.`;

  const downloadEvidence = (format: "json" | "csv") => {
    const clean = (v: number) => Number.isFinite(v) ? v : null;
    const limitations = [
      "Exploratory native-pixel aperture photometry; no PSF/aperture correction, deblending or annual parallax correction.",
      "Flux uses MJy/sr summed over aperture pixels, not calibrated integrated source flux.",
      "Flux errors measure blank-sky aperture scatter; calibration, spectral and PSF differences can imitate variability.",
      "Position errors include a 0.5 arcsecond alignment allowance; a catalogue prediction is not a detection.",
      "Matching within half a channel does not remove all spectral false positives. No discovery is established.",
    ];
    const measurements = rows.map((r, i) => ({
      ...r, usableForBrightness: cmpIds.has(r.obsid) && Number.isFinite(r.flux) && Number.isFinite(r.fluxErrEmp) && !r.partial,
      flux: clean(r.flux), fluxErrEmp: clean(r.fluxErrEmp), snr: clean(r.snr),
      sourceFits: frames[i].meta.sourceFits, cutoutUrl: frames[i].meta.cutoutUrl, detector: frames[i].meta.detector,
      measuredAt: { ra: posAt(r.mjd)[0], dec: posAt(r.mjd)[1] },
    }));
    const report = {
      schema: "cosmos-investigation-v1", release: RELEASE.label, engine: ENGINE_VERSION,
      exportedAt: new Date().toISOString(), investigationUrl: window.location.href,
      target: at, catalogueEpochMjd: lastMjd, fluxUnit: "MJy/sr * pixel (aperture sum)",
      summary: { brightness: brightnessSummary, position: positionSummary, catalogue: knownErr ? "Lookup failed: " + knownErr : plainVerdict || "Lookup pending" },
      measurements, catalogues: { stars: known, error: knownErr || null, smallBodies: sb === null ? { status: "not_requested" } : sb === "loading" ? { status: "pending" } : sb }, limitations,
    };
    const cell = (value: unknown) => {
      const s = value === null || value === undefined ? "" : String(value);
      return '"' + (/^[=+@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"';
    };
    const headings = ["release", "engine", "obsid", "detector", "date_utc", "mjd", "wavelength_um", "bandwidth_um", "measured_ra_deg", "measured_dec_deg", "flux_MJy_sr_pixel", "empirical_error_MJy_sr_pixel", "snr", "usable_for_brightness", "partial_aperture", "core_flagged", "centroid_ra_deg", "centroid_dec_deg", "centroid_error_arcsec", "flags", "source_fits", "cutout_url", "investigation_url", "limitations"];
    const csv = [headings, ...measurements.map((r) => [RELEASE.label, ENGINE_VERSION, r.obsid, r.detector, r.date, r.mjd, r.wl, r.bw, r.measuredAt.ra, r.measuredAt.dec, r.flux, r.fluxErrEmp, r.snr, r.usableForBrightness, r.partial, r.coreFlagged, r.centroid?.ra, r.centroid?.dec, r.centroid?.errArcsec, r.flagsHere.join("; "), r.sourceFits, r.cutoutUrl, window.location.href, limitations.join(" ")])].map((row) => row.map(cell).join(",")).join("\r\n");
    const blob = new Blob([format === "json" ? JSON.stringify(report, null, 2) : csv], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `cosmos-${(slug ?? "position").replace(/[^a-z0-9-]/gi, "-")}-measurements.${format}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="glass rounded-2xl p-4">
      <div className="label">Take a closer look · {at.label}</div>
      <p className="mt-1 text-[12.5px] text-muted">We measure how bright this spot is, and where exactly it sits, on every date.</p>

      <section aria-label="Measurement summary" className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.04] p-4">
        <h3 className="font-display text-[20px] font-semibold">What these measurements show</h3>
        <p className="mt-1 text-[12px] text-muted">Calculated from the current sequence; separate from the checked case-study results.</p>
        <dl className="mt-3 space-y-3 text-[13px] leading-relaxed">
          <div><dt className="font-semibold text-accent">Brightness</dt><dd>{brightnessSummary}</dd></div>
          <div><dt className="font-semibold text-accent">Position</dt><dd>{positionSummary}{withC.length >= 2 && Number.isFinite(predShift) && <> The catalogue predicts {predShift.toFixed(1)} arcseconds over these dates.</>}</dd></div>
        </dl>
        <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-warn">A measurement is evidence, not a discovery. Colour, calibration and overlapping sources can imitate changes. Check the errors, image quality and independent case-study results.</p>
      </section>

      <div className="mt-3 rounded-xl border border-line p-3">
        <div className="label mb-1">Is it already known?</div>
        {!known && !knownErr && <div className="text-[12.5px] text-muted">Checking star catalogues for this date…</div>}
        {knownErr && <div className="text-[12.5px] text-warn">The catalogue check failed ({knownErr}). We cannot tell whether this source is already known from this lookup.</div>}
        {known && (
          <>
            <p
              className={`text-[13px] ${
                assoc ? (assoc.level === "consistent" ? "text-good" : "text-warn") : simbadTop || gaiaMatch ? "text-good" : catalogueGaps.length ? "text-warn" : "text-text"
              }`}
            >
              {plainVerdict}
            </p>
            {gaiaMatch && !gaiaIsTarget && centroidOnNeighbour && (
              <p className="mt-1 text-[12px] text-warn">We may be measuring a neighbouring star instead of the target here. Try a different infrared colour.</p>
            )}
            <div className="mt-2">
              {sb === null && (
                <button className="btn !py-1 !text-[12px]" onClick={checkSmallBodies}>
                  Check known asteroids &amp; comets (NASA JPL)
                </button>
              )}
              {sb === "loading" && <span className="text-[12px] text-muted">Asking NASA/JPL which asteroids and comets were here on {fmtDate(whenIso)}… (up to a minute)</span>}
              {sb && sb !== "loading" && (
                <div className="space-y-0.5 text-[12px]">
                  {sbRows.slice(0, 4).map((r) => (
                    <div key={r.name} className="text-text/85">
                      JPL: {r.name} predicted {r.sep_arcsec.toFixed(0)}″ from this spot (V {r.vmag}), moving{" "}
                      {Math.hypot(r.ra_rate_arcsec_h, r.dec_rate_arcsec_h).toFixed(0)}″/h
                    </div>
                  ))}
                  {(["comets", "asteroids"] as const).map((k) =>
                    sb[k].ok ? (
                      sb[k].rows.length === 0 && (
                        <div key={k} className="text-muted">
                          JPL: no known {k === "comets" ? "comet" : "asteroid (V ≤ 21)"} within 72″ at that time.
                        </div>
                      )
                    ) : (
                      <div key={k} className="text-warn">
                        JPL {k} lookup failed ({sb[k].error}). We can&apos;t tell whether a known {k === "comets" ? "comet" : "asteroid"} was here.
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
            <Advanced className="mt-2">
              <p className="data">
                RA {at.ra.toFixed(5)}°, Dec {at.dec.toFixed(5)}°
                {at.pm && ` · following proper motion ${(Math.hypot(at.pm[0], at.pm[1]) / 1000).toFixed(2)}″/yr`}
              </p>
              <p className="mt-1">
                Gaia DR3 and SIMBAD checked for {fmtDate(whenIso)}
                {at.when ? `, ${at.when}` : ""}.
              </p>
              <p className="mt-1 text-text/85">{verdict}</p>
              <ul className="mt-1.5 space-y-0.5">
                {!known.gaia.ok && <li className="text-warn">Gaia unavailable: {known.gaia.error}</li>}
                {!known.simbad.ok && <li className="text-warn">SIMBAD unavailable: {known.simbad.error}</li>}
                {gaiaMatch && !gaiaIsTarget && centroidOnNeighbour && (
                  <li className="text-warn">
                    Our measured centroid sits on that other Gaia star. At this wavelength the target may be too faint, so we are probably measuring the neighbour.
                    Try a different wavelength set.
                  </li>
                )}
                {gaiaMatch && (
                  <li>
                    {gaiaIsTarget ? "" : "Nearest Gaia star: "}Gaia: G = {gaiaMatch.g.toFixed(2)}, proper motion {Math.hypot(gaiaMatch.pmra, gaiaMatch.pmdec).toFixed(0)} mas/yr
                    {gaiaMatch.parallax && gaiaMatch.parallax_error && gaiaMatch.parallax / gaiaMatch.parallax_error > 5
                      ? `, distance ${(1000 / gaiaMatch.parallax).toFixed(gaiaMatch.parallax > 100 ? 2 : 0)} pc`
                      : ""}
                  </li>
                )}
                {known.simbad.ok &&
                  simbadRows.slice(0, 4).map((s) => (
                    <li key={s.main_id}>
                      SIMBAD: {s.main_id.replace(/^NAME /, "")} · {s.otype_label ?? s.otype} · {s.sep_arcsec.toFixed(1)}″
                    </li>
                  ))}
              </ul>
            </Advanced>
          </>
        )}
      </div>

      <div className="mt-3">
        <div className="label mb-1">Brightness on each date</div>
        {cmp.drop.length > 0 && (
          <p className="text-[12px] text-warn">
            Left out here: {cmp.drop.map((r) => fmtDate(r.date)).join(", ")}, because the infrared colour at this spot doesn&apos;t match the other dates.
          </p>
        )}
        <Chart
          unit="flux (MJy/sr · px)"
          label="Aperture brightness on each date"
          pts={cmp.keep.map((r) => ({ t: r.mjd, v: r.flux, e: r.fluxErrEmp, label: fmtDate(r.date) }))}
        />
        {nUnusable > 0 && (
          <p className="text-[12px] text-warn">
            {nUnusable === rows.length
              ? "No date could be measured here"
              : `${nUnusable} of ${rows.length} dates could not be measured here`}
            , usually because a bright star overloaded the camera or a pixel was bad.
          </p>
        )}
        {plainVar && <p className="text-[12.5px] text-text/85">{plainVar}</p>}
        {good.length > 1 && <p className="mt-1 text-[12px] text-warn">Tiny colour differences can still fake a brightness change, so treat this as a hint, not proof.</p>}
        {saturated && <p className="text-[12px] text-warn">On some dates this spot is too bright for the camera (saturated), so its brightness there is unreliable.</p>}
        <Advanced className="mt-1">
          <p>Brightness is measured in a small circle (aperture) on native pixels, using only dates whose wavelengths match at this position.</p>
          {cmp.drop.length > 0 && (
            <p className="mt-1">
              The filter wavelength here differs from the other dates by more than half a channel. (The sequence was matched at the search target, not at this spot.)
            </p>
          )}
          {nUnusable > 0 && (
            <p className="mt-1">
              Pixels in the core are flagged (often saturation of a bright star, or a bad pixel or cosmic-ray hit), so no brightness or position is reported for{" "}
              {nUnusable === rows.length ? "any date" : nUnusable === 1 ? "that date" : "those dates"}.
            </p>
          )}
          {varText && <p className="mt-1 text-text/85">{varText}</p>}
          {good.length > 1 && (
            <p className="mt-1">
              These wavelengths span {wavelengthSpan.toFixed(5)} µm ({channelSpan.toFixed(3)} channel widths).
              Even within the half-channel cutoff, a strong spectral feature can imitate a brightness change.
              Check the spectrum and independent exposures before interpreting it as variability.
            </p>
          )}
          {varText && (
            <p className="mt-1">
              &quot;Noise&quot; here is the scatter of blank-sky apertures in each frame. It doesn&apos;t include calibration or point-spread differences between dates,
              so large ratios overstate the confidence. Our validation records use reference stars in the same frames for that.
            </p>
          )}
          {saturated && <p className="mt-1">Saturation/nonlinearity flags (OVERFLOW, NONLINEAR, SUR_ERROR) are set at this position on some dates.</p>}
        </Advanced>
      </div>

      {withC.length >= 2 && (
        <div className="mt-3">
          <div className="label mb-1">Position on each date</div>
          <Chart
            unit="Δ north (″)"
            label="Northward shift of the measured position"
            pts={track.map((p) => ({ t: p.t, v: p.dN, e: p.e, label: p.label, pred: p.predN }))}
          />
          <Chart
            unit="Δ east (″)"
            label="Eastward shift of the measured position"
            pts={track.map((p) => ({ t: p.t, v: p.dE, e: p.e, label: p.label, pred: p.predE }))}
          />
          <p className="text-[12.5px] text-text/85">
            It shifted about <b className="data">{totalShift.toFixed(1)}″</b> between {withC[0].label} and {lastT.label}
            {gaiaMatch && Number.isFinite(predShift) && (
              <>
                ; the star catalogue predicts <b className="data text-accent">{predShift.toFixed(1)}″</b> (dashed line)
              </>
            )}
            . <span className="text-dim">(″ = arcseconds, a tiny angle on the sky.) Shifts under about 1.5″ don&apos;t mean much.</span>
          </p>
          <Advanced className="mt-1">
            <p>
              Measured centroid shift {withC[0].label} → {lastT.label}: <span className="data">{totalShift.toFixed(1)}″</span> ± {shiftErr.toFixed(1)}″ (about{" "}
              {(totalShift / 6.15).toFixed(2)} SPHEREx pixels).
              {gaiaMatch && (
                <>
                  {" "}
                  {at.pm || simbadPm ? "The catalogue" : "Gaia's"} proper motion predicts <span className="data">{predShift.toFixed(1)}″</span> (dashed line).
                </>
              )}
            </p>
            <p className="mt-1">
              Error bars combine an S/N-based centroid estimate with a 0.5″ allowance for alignment between dates. (Field stars shifted 0.25–0.8″ between
              SPHEREx dates in our comet analysis.) Treat shifts under about 1.5″ as not significant.
            </p>
          </Advanced>
        </div>
      )}

      {partnerRows && (
        <Advanced className="mt-3" label="Show the paired spot (where it faded)" openLabel="Hide the paired spot">
          <div className="rounded-xl bg-white/5 p-3">
            <div className="label mb-1">Paired spot (where it faded)</div>
            {partnerRows.map((r) => (
              <div key={r.obsid} className="data flex justify-between">
                <span>{fmtDate(r.date)}</span>
                <span>
                  {Number.isFinite(r.snr) ? `S/N ${r.snr.toFixed(1)}` : "—"}
                  {r.partial ? " (partial)" : ""}
                </span>
              </div>
            ))}
          </div>
        </Advanced>
      )}

      <Advanced className="mt-3" label="Per-date measurements and flags" openLabel="Hide per-date measurements">
        <table className="data mt-1 w-full text-[11.5px]">
          <thead className="text-dim">
            <tr>
              <th className="text-left font-normal">date</th>
              <th className="text-right font-normal">λ here µm</th>
              <th className="text-right font-normal">S/N</th>
              <th className="text-left font-normal pl-2">flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.obsid} className="border-t border-line/50">
                <td>{fmtDate(r.date)}</td>
                <td className="text-right">{r.wl.toFixed(4)}</td>
                <td className="text-right">{Number.isFinite(r.snr) ? r.snr.toFixed(1) : "—"}</td>
                <td className="pl-2 text-muted">
                  {r.flagsHere.join(", ") || "none"}
                  {r.partial ? " · partial aperture" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Advanced>

      <section id="measurement-evidence" aria-label="Save investigation evidence" className="mt-5 scroll-mt-24 border-t border-line pt-4">
        <h3 className="font-display text-[20px] font-semibold">Check and save your evidence</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">Keep the dates, measurements, errors, flags and original image links together. The JSON report also records catalogue results, failed checks and the current comparison link.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={() => downloadEvidence("json")}>Download evidence JSON</button>
          <button type="button" className="btn" onClick={() => downloadEvidence("csv")}>Download measurements CSV</button>
          <Link className="btn" href={slug === "gy152" || slug === "gpmon" ? `/investigate/search#${slug}` : slug === "swan" ? "/investigate/swan" : slug ? `/validation#${slug}` : "/about"}>Compare with the checked case study →</Link>
        </div>
        <p className="mt-3 text-[12px] text-muted">Before making a claim: do other dates agree? Are the pixels clean? Could colour or blending explain it? Was each catalogue check successful?</p>
      </section>
    </div>
  );
}
