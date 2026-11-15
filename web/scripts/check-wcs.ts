// Verifies the TS FITS parser, TAN-SIP WCS and WCS-WAVE lookup against astropy fixtures.
import { readFileSync } from "node:fs";
import { parseFits, readImage, readInt32Image } from "../src/lib/engine/fits";
import { pix2sky, sky2pix, waveAt, wcsFromHeader } from "../src/lib/engine/wcs";

const fx = JSON.parse(readFileSync(new URL("./wcs_fixtures.json", import.meta.url), "utf8"));
let worstSky = 0, worstPix = 0, worstWl = 0, worstSum = 0;
for (const f of fx) {
  const b = readFileSync(new URL("../../" + f.file, import.meta.url));
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const hdus = parseFits(buf);
  const img = hdus.find((h) => h.name === "IMAGE")!;
  const flg = hdus.find((h) => h.name === "FLAGS")!;
  const w = wcsFromHeader(img.header);
  const crw: [number, number] = [Number(img.header.CRPIX1W), Number(img.header.CRPIX2W)];
  const { data } = readImage(buf, img);
  let s = 0; for (const v of data) if (Number.isFinite(v)) s += v;
  worstSum = Math.max(worstSum, Math.abs(s - f.img_sum) / Math.abs(f.img_sum));
  const fl = readInt32Image(buf, flg); let or = 0; for (const v of fl) or |= v;
  if (or !== f.flags_or) console.log("FLAGS mismatch", f.file, or, f.flags_or);
  for (const p of f.pts) {
    const [ra, dec] = pix2sky(w, p.x, p.y);
    const dsky = Math.hypot((ra - p.ra) * Math.cos((p.dec * Math.PI) / 180), dec - p.dec) * 3600;
    const [x, y] = sky2pix(w, p.ra, p.dec);
    const dpix = Math.hypot(x - p.x, y - p.y);
    const wl = waveAt(f.det, p.x, p.y, crw);
    worstSky = Math.max(worstSky, dsky); worstPix = Math.max(worstPix, dpix);
    worstWl = Math.max(worstWl, Math.abs(wl.wl - p.wl), Math.abs(wl.bw - p.bw));
  }
}
console.log(`pix->sky worst ${worstSky.toExponential(2)} arcsec | sky->pix worst ${worstPix.toExponential(2)} px | wave worst ${worstWl.toExponential(2)} um | image sum rel ${worstSum.toExponential(2)}`);
