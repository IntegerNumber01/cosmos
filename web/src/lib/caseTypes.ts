export type Pos = { ra: number; dec: number; x: number; y: number };

export type Flag = { name: string; description: string; treatment: string };

export type Frame = {
  index: number;
  productid: string;
  obsid: string;
  detector: number;
  date_avg: string;
  date_beg: string;
  date_end: string;
  mjd_avg: number;
  exposure_s: number;
  wavelength_um: number;
  bandwidth_um: number;
  png: string;
  flags_png: string;
  measured: Pos & { err_arcsec: number; snr: number };
  predicted_mid: Pos & { note: string };
  predicted_most_row: Pos & { vmag: number; note: string };
  offset_mid_arcsec: number;
  offset_along_cross_arcsec: [number, number];
  flags_in_aperture: Flag[];
  l2dqa: string;
  source_fits: string;
  cutout_url: string;
};

export type Sequence = {
  id: string;
  obs_block: string;
  detector: number;
  n: number;
  grid: { n: number; pixel_arcsec: number; center_ra: number; center_dec: number; orientation: string };
  wavelength_range_um: [number, number];
  date_first: string;
  date_last: string;
  diff_png: string;
  measured_rate_arcsec_per_min: number;
  measured_rate_err: number;
  measured_pa_err: number;
  diff_wavelength_gap_um: number;
  diff_wavelength_gap_channels: number;
  predicted_rate_arcsec_per_min: number;
  measured_pa_deg: number;
  predicted_pa_deg: number;
  measured_total_motion_arcsec: number;
  span_minutes: number;
  median_offset_mid_arcsec: number;
  star_control: { n_stars: number; median_shift_arcsec: number; max_shift_arcsec: number };
  vacancy_ratio: number;
  frames: Frame[];
};

export type TrackPoint = { mjd: number; date: string; ra: number; dec: number; vmag: number; r_au: number; delta_au: number };

export type CaseFile = {
  object: { name: string; naif_id: number; type: string };
  data_release: string;
  most: { service: string; catalog: string; query_window: string; n_matched_frames: number; n_distinct_times: number; note: string };
  sequences: Sequence[];
  predicted_track: TrackPoint[];
  method: Record<string, string>;
  verdict: string;
};

export type TTSide = {
  productid: string;
  obsid: string;
  date_avg: string;
  wavelength_um: number;
  bandwidth_um: number;
  png: string;
  source_fits: string;
  cutout_url?: string;
  l2dqa?: string;
};

export type TTPair = {
  id: string;
  detector: number;
  before: TTSide;
  after: TTSide;
  delta_wavelength_um: number;
  delta_over_bandwidth: number;
  days_apart: number;
  z_png: string;
  z_scale: number;
  comet_aperture: { x: number; y: number; r_px: number; flux_before: number; flux_after: number; err_before: number; err_after: number; z: number };
  z_calibration: { nominal_field_scatter: number; note: string };
  field_frac_absz_gt5: number;
  grid: Sequence["grid"];
  seq: string;
};

export type TTFile = { position: { ra: number; dec: number }; method: string; pairs: TTPair[] };

export function fmtUTC(iso: string, withSeconds = false) {
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    timeZone: "UTC",
    hour12: false,
  });
  return `${date} · ${time} UTC`;
}
