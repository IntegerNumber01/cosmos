"use client";
import { useEffect, useMemo, useState } from "react";
import { getKnown, Known } from "@/lib/engine/client";
import { Frame, measure, Measurement } from "@/lib/engine/sequence";

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
  const [sb, setSb] = useState<Known | null | "loading">(null);

  useEffect(() => {
    setKnown(null);
    setKnownErr("");
    const [kra, kdec] = posAt(lastMjd);
    getKnown(kra, kdec, 0.0028, lastMjd, "gaia,simbad", slug)
      .then(setKnown)
      .catch((e) => setKnownErr(String(e.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, lastMjd, slug]);

  const checkSmallBodies = () => {
    setSb("loading");
    Promise.allSettled([getKnown(at.ra, at.dec, 0.02, lastMjd, "sbc", slug), getKnown(at.ra, at.dec, 0.02, lastMjd, "sba", slug)]).then(([c, a]) => {
      const parts = [c, a].filter((x): x is PromiseFulfilledResult<Known> => x.status === "fulfilled").map((x) => x.value);
      if (!parts.length) {
        setSb(null);
        return;
      }
      const ok = parts.filter((k) => k.small_bodies.ok);
      setSb({
        ...parts[0],
        small_bodies: ok.length
          ? { service: parts[0].small_bodies.service, ok: true, rows: ok.flatMap((k) => k.small_bodies.rows ?? []) }
          : parts[0].small_bodies,
      });
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
  // position track relative to the first good centroid, with the target's predicted motion
  const firstC = rows.find((r) => r.centroid)?.centroid;
  const cosd = Math.cos((at.dec * Math.PI) / 180);
  const t0 = rows.find((r) => r.centroid)?.mjd ?? rows[0].mjd;
  const track = rows.map((r) => ({
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

  // photometric variation (same wavelength): max-min relative to combined empirical errors
  const good = rows.filter((r) => Number.isFinite(r.flux) && Number.isFinite(r.fluxErrEmp) && !r.partial);
  let varText = "";
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
  }
  const nUnusable = rows.filter((r) => !Number.isFinite(r.flux)).length;
  const saturated = rows.some((r) => r.flagsHere.some((f) => ["OVERFLOW", "NONLINEAR", "SUR_ERROR"].includes(f)));


  const sbRows = sb && sb !== "loading" && sb.small_bodies.ok ? sb.small_bodies.rows ?? [] : [];
  let verdict = "";
  if (known && sbRows.length) {
    verdict = `Known solar-system object: ${sbRows[0].name}, predicted by NASA/JPL ${sbRows[0].sep_arcsec.toFixed(0)}″ from this position at that time. A recovery of a known object, not a discovery.`;
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
      verdict =
        "No Gaia DR3 or SIMBAD object within 10″ at this date. That is NOT a discovery. Check for artefacts (flags below), confirm on more dates, and check known solar-system objects.";
    }
  }

  return (
    <div className="glass rounded-2xl p-4">
      <div className="label">Investigate · {at.label}</div>
      <div className="data mt-0.5 text-[11.5px] text-muted">
        RA {at.ra.toFixed(5)}°, Dec {at.dec.toFixed(5)}°
        {at.pm && ` · following proper motion ${(Math.hypot(at.pm[0], at.pm[1]) / 1000).toFixed(2)}″/yr`}
      </div>

      <div className="mt-3 rounded-xl border border-line p-3">
        <div className="label mb-1">Is it already known? <span className="normal-case tracking-normal text-dim">(catalogues checked for {fmtDate(whenIso)}{at.when ? `, ${at.when}` : ""})</span></div>
        {!known && !knownErr && <div className="text-[12.5px] text-muted">Checking Gaia DR3 and SIMBAD at this date…</div>}
        {knownErr && <div className="text-[12.5px] text-warn">Catalogue lookup failed ({knownErr}).</div>}
        {known && (
          <>
            <p className={`text-[13px] ${simbadTop || gaiaMatch || sbRows.length ? "text-good" : "text-text"}`}>{verdict}</p>
            <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-muted">
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
            <div className="mt-2">
              {sb === null && (
                <button className="btn !py-1 !text-[12px]" onClick={checkSmallBodies}>
                  Check known asteroids &amp; comets (JPL)
                </button>
              )}
              {sb === "loading" && <span className="text-[12px] text-muted">Asking NASA/JPL which small bodies were here on {fmtDate(whenIso)}… (up to a minute)</span>}
              {sb && sb !== "loading" && (
                <div className="text-[12px]">
                  {!sb.small_bodies.ok ? (
                    <span className="text-warn">JPL lookup failed: {sb.small_bodies.error}</span>
                  ) : (sb.small_bodies.rows ?? []).length === 0 ? (
                    <span className="text-muted">JPL: no known asteroid or comet within 72″ of this position at that time.</span>
                  ) : (
                    (sb.small_bodies.rows ?? []).slice(0, 4).map((r) => (
                      <div key={r.name} className="text-good">
                        JPL: {r.name} predicted {r.sep_arcsec.toFixed(0)}″ away (V {r.vmag}), moving {Math.hypot(r.ra_rate_arcsec_h, r.dec_rate_arcsec_h).toFixed(0)}″/h
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-3">
        <div className="label mb-1">Brightness on each date (same wavelength, native pixels)</div>
        <Chart
          unit="flux (MJy/sr · px)"
          label="Aperture brightness on each date"
          pts={rows.map((r) => ({ t: r.mjd, v: r.flux, e: r.fluxErrEmp, label: fmtDate(r.date) }))}
        />
        {nUnusable > 0 && (
          <p className="text-[12px] text-warn">
            {nUnusable === rows.length ? "No date" : `${nUnusable} of ${rows.length} dates`} had a usable aperture: most pixels at this position are flagged
            (often saturation of a bright star). No brightness or position is reported for {nUnusable === rows.length ? "any date" : "those dates"}.
          </p>
        )}
        {varText && <p className="text-[12px] text-text/85">{varText}</p>}
        {varText && (
          <p className="mt-1 text-[11px] text-dim">
            &quot;Noise&quot; here is the scatter of blank-sky apertures in each frame. It doesn&apos;t include calibration or point-spread differences between dates,
            so large ratios overstate the confidence. Our validation records use reference stars in the same frames for that.
          </p>
        )}
        {saturated && <p className="text-[12px] text-warn">Saturation/nonlinearity flags at this position on some dates: brightness there is unreliable.</p>}
      </div>

      {withC.length >= 2 && (
        <div className="mt-3">
          <div className="label mb-1">Position on each date (measured centroid)</div>
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
          <p className="text-[12px] text-text/85">
            Measured shift {withC[0].label} → {lastT.label}: <b className="data">{totalShift.toFixed(1)}″</b> ± {shiftErr.toFixed(1)}″ (about{" "}
            {(totalShift / 6.15).toFixed(2)} SPHEREx pixels).
            {gaiaMatch && (
              <>
                {" "}
                {at.pm || simbadPm ? "The catalogue" : "Gaia's"} proper motion predicts <b className="data text-accent">{predShift.toFixed(1)}″</b> (dashed line).
              </>
            )}
          </p>
          <p className="mt-1 text-[11px] text-dim">
            Error bars combine an S/N-based centroid estimate with a 0.5″ allowance for alignment between dates. (Field stars shifted 0.25–0.8″ between
            SPHEREx dates in our comet analysis.) Treat shifts under about 1.5″ as not significant.
          </p>
        </div>
      )}

      {partnerRows && (
        <div className="mt-3 rounded-xl bg-white/5 p-3 text-[12px]">
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
      )}

      <details className="mt-3 text-[11.5px]">
        <summary className="cursor-pointer text-muted">Per-date measurements and flags</summary>
        <table className="data mt-2 w-full">
          <thead className="text-dim">
            <tr>
              <th className="text-left font-normal">date</th>
              <th className="text-right font-normal">λ µm</th>
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
      </details>
    </div>
  );
}
