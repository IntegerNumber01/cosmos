"use client";
import type { Frame, Sequence } from "@/lib/caseTypes";
import { fmtUTC } from "@/lib/caseTypes";
import { wavelengthColor } from "@/lib/spherex";

function Row({ k, v, mono = true }: { k: React.ReactNode; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
      <span className="text-[11.5px] text-muted">{k}</span>
      <span className={`text-right text-[12px] ${mono ? "data" : ""}`}>{v}</span>
    </div>
  );
}

const TREAT: Record<string, string> = {
  informational: "text-muted",
  rejected: "text-bad",
  reported: "text-warn",
};

export default function EvidencePanel({ seq, frame }: { seq: Sequence; frame: Frame }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <div className="label">Evidence inspector</div>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10.5px] text-muted">
          frame {frame.index + 1}/{seq.n}
        </span>
      </div>
      <div className="mt-2">
        <Row k="Observation ID" v={frame.obsid} />
        <Row k="Detector" v={`D${frame.detector}`} />
        <Row k="Mid-exposure" v={fmtUTC(frame.date_avg, true)} />
        <Row k="Exposure" v={`${frame.exposure_s.toFixed(1)} s`} />
        <Row
          k="Wavelength at comet"
          v={
            <span style={{ color: wavelengthColor(frame.wavelength_um) }}>
              {frame.wavelength_um.toFixed(4)} µm <span className="text-dim">(bandwidth {frame.bandwidth_um.toFixed(4)})</span>
            </span>
          }
        />
        <Row k="Pipeline QA (L2DQAFLG)" v={frame.l2dqa} />
        <Row k="Comet S/N (r = 3 px)" v={frame.measured.snr.toFixed(0)} />
        <Row
          k={<span className="text-good">Measured RA, Dec</span>}
          v={`${frame.measured.ra.toFixed(5)}°, ${frame.measured.dec.toFixed(5)}°`}
        />
        <Row k="Fit uncertainty" v={`± ${frame.measured.err_arcsec.toFixed(2)}″`} />
        <Row
          k={<span className="text-accent">Predicted (mid-exp.)</span>}
          v={`${frame.predicted_mid.ra.toFixed(5)}°, ${frame.predicted_mid.dec.toFixed(5)}°`}
        />
        <Row k="Measured − predicted" v={`${frame.offset_mid_arcsec.toFixed(1)}″ (${(frame.offset_mid_arcsec / 6.15).toFixed(2)} px)`} />
      </div>
      <div className="mt-3">
        <div className="label mb-1">Flags in the comet aperture</div>
        {frame.flags_in_aperture.length === 0 ? (
          <div className="text-[12px] text-muted">None</div>
        ) : (
          <ul className="space-y-1">
            {frame.flags_in_aperture.map((fl) => (
              <li key={fl.name} className="text-[11.5px] leading-snug">
                <span className="data font-semibold">{fl.name}</span>{" "}
                <span className="text-muted">— {fl.description}</span>{" "}
                <span className={TREAT[fl.treatment] ?? "text-muted"}>[{fl.treatment}]</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[10.5px] leading-snug text-dim">
          Flag names and descriptions are read from this file&apos;s FITS header, not typed in by us.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a className="btn !py-1 !text-[12px]" href={frame.source_fits} target="_blank" rel="noreferrer">
          Original FITS (IRSA) ↗
        </a>
        <a className="btn !py-1 !text-[12px]" href={frame.cutout_url} target="_blank" rel="noreferrer">
          Exact cutout used ↗
        </a>
      </div>
    </div>
  );
}
