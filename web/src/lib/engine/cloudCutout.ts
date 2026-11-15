// Anonymous, bounded byte-range reads of the official DR1 S3 mirror. No AWS account or SDK.
// Crop native pixels: never reproject or resample science/variance/flag planes here.
import { Header, HDU, parseFits } from "./fits";
import { sky2pix, wcsFromHeader } from "./wcs";
import { rice32 } from "./rice";

const IBE = "https://irsa.ipac.caltech.edu/ibe/data/spherex/";
const S3 = "https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/";
const BLOCK = 2880;

export function mirrorUrl(url: string): string {
  // Restrict both source and destination, including release and path shape. No redirects or user hosts.
  const key = url.startsWith(IBE) ? url.slice(IBE.length) : "";
  if (!/^dr1\/level2\/\d{4}W\d{2}_[A-Z0-9]+\/l2b-[a-z0-9-]+\/[1-6]\/level2_[A-Za-z0-9_-]+\.fits$/.test(key))
    throw new Error("Not a supported DR1 mirror path");
  return S3 + key;
}

export async function cloudCutout(url: string, ra: number, dec: number, size: number, deadline = Date.now() + 40000) {
  const source = mirrorUrl(url);
  if (!Number.isFinite(ra) || ra < 0 || ra >= 360 || !Number.isFinite(dec) || Math.abs(dec) > 90 || ![0.05, 0.1, 0.2, 0.3].includes(size))
    throw new Error("Invalid cloud cutout field");
  let objectSize = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
  const range = async (start: number, length: number) => {
    if (controller.signal.aborted || Date.now() >= deadline) throw new Error("Cloud cutout timed out");
    if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(length) || length < 1 || length > 6_000_000)
      throw new Error("Invalid FITS byte range");
    const r = await fetch(source, { headers: { Range: `bytes=${start}-${start + length - 1}` }, cache: "no-store", redirect: "error", signal: controller.signal });
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(r.headers.get("content-range") ?? "");
    if (r.status !== 206 || !match || Number(match[1]) !== start || Number(match[2]) !== start + length - 1 ||
      (objectSize && objectSize !== Number(match[3]))) {
      await r.body?.cancel();
      throw new Error("Mirror did not return the exact FITS byte range");
    }
    objectSize = Number(match[3]);
    if (objectSize > 200_000_000 || objectSize < start + length) throw new Error("Invalid mirror FITS size");
    const buf = await r.arrayBuffer();
    if (buf.byteLength !== length) throw new Error("Truncated mirror FITS range");
    return buf;
  };
  const headerAt = async (offset: number): Promise<HDU> => {
    // Most extension headers fit in eight blocks; primary headers can be longer.
    const chunks: Uint8Array[] = [];
    for (let blocks = 0; blocks < 128; blocks += 8) {
      chunks.push(new Uint8Array(await range(offset + blocks * BLOCK, 8 * BLOCK)));
      const bytes = new Uint8Array((blocks + 8) * BLOCK);
      chunks.forEach((chunk, i) => bytes.set(chunk, i * 8 * BLOCK));
      const first = parseFits(bytes.buffer)[0];
      if (first) {
        if (!Number.isSafeInteger(first.dataBytes) || first.dataBytes < 0 || first.dataBytes > 150_000_000)
          throw new Error("Invalid FITS extension size");
        return { ...first, dataOffset: offset + first.dataOffset };
      }
    }
    throw new Error("Mirror FITS header is too large");
  };
  try {
    const hdus = new Map<string, HDU>();
    let offset = 0;
    for (let i = 0; i < 16; i++) {
      const hdu = await headerAt(offset);
      hdus.set(hdu.name, hdu);
      if (["IMAGE", "FLAGS", "VARIANCE"].every((name) => hdus.has(name))) break;
      offset = hdu.dataOffset + Math.ceil(hdu.dataBytes / BLOCK) * BLOCK;
      if (offset >= objectSize) break;
    }
    const image = hdus.get("IMAGE"), flags = hdus.get("FLAGS"), variance = hdus.get("VARIANCE");
    if (!image || !flags || !variance) throw new Error("Mirror FITS is missing IMAGE/FLAGS/VARIANCE");
    const h = image.header;
    const identity = /\/level2_([^/]+)D([1-6])_spx_/.exec(url);
    if (!identity || String(h.OBSID) !== identity[1] || Number(h.DETECTOR) !== Number(identity[2]) ||
      !Number.isFinite(Number(h["MJD-AVG"]))) throw new Error("Mirror exposure identity does not match its source path");
    const fullNx = Number(h.NAXIS1), fullNy = Number(h.NAXIS2);
    for (const plane of [image, variance]) {
      if (Number(plane.header.NAXIS) !== 2 || Number(plane.header.NAXIS1) !== fullNx || Number(plane.header.NAXIS2) !== fullNy ||
        Number(plane.header.BITPIX) !== -32 || fullNx !== 2040 || fullNy !== 2040)
        throw new Error("Unsupported DR1 image dimensions or pixel type");
    }
    const wcs = wcsFromHeader(h);
    const [x, y] = sky2pix(wcs, ra, dec);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x >= fullNx || y < 0 || y >= fullNy)
      throw new Error("Requested position is outside this exposure");
    const scale = Math.sqrt(Math.abs(wcs.cd[0] * wcs.cd[3] - wcs.cd[1] * wcs.cd[2]));
    const side = Math.ceil(size / scale);
    if (!Number.isFinite(side) || side < 1 || side > 200) throw new Error("Invalid cutout pixel scale");
    const x0 = Math.max(0, Math.round(x - (side - 1) / 2));
    const y0 = Math.max(0, Math.round(y - (side - 1) / 2));
    const nx = Math.min(side, fullNx - x0), ny = Math.min(side, fullNy - y0);
    const flagPlane = async () => {
      const f = flags.header;
      if (!f.ZIMAGE) {
        if (Number(f.BITPIX) !== 32 || Number(f.NAXIS1) !== fullNx || Number(f.NAXIS2) !== fullNy) throw new Error("Unsupported FLAGS image");
        return plane(flags, true) as Promise<Int32Array>;
      }
      if (f.ZCMPTYPE !== "RICE_1" || Number(f.ZBITPIX) !== 32 || Number(f.ZNAXIS) !== 2 || Number(f.ZNAXIS1) !== fullNx || Number(f.ZNAXIS2) !== fullNy ||
        Number(f.ZTILE1) !== fullNx || Number(f.ZTILE2) !== 1 || Number(f.ZVAL1) !== 32 || Number(f.ZVAL2) !== 4 ||
        Number(f.TFIELDS) !== 1 || Number(f.NAXIS1) !== 8 || !/^1PB(?:\(\d+\))?$/.test(String(f.TFORM1)))
        throw new Error("Unsupported compressed FLAGS format");
      const descriptors = new DataView(await range(flags.dataOffset + y0 * 8, ny * 8));
      const rows = Array.from({ length: ny }, (_, i) => ({ length: descriptors.getUint32(i * 8, false), at: descriptors.getUint32(i * 8 + 4, false) }));
      const tableBytes = fullNy * 8;
      const heap = Number(f.THEAP ?? tableBytes);
      const heapBytes = flags.dataBytes - heap;
      if (heap < tableBytes || rows.some((r) => r.length < 4 || r.at + r.length > heapBytes)) throw new Error("Invalid FLAGS heap descriptor");
      const first = Math.min(...rows.map((r) => r.at)), end = Math.max(...rows.map((r) => r.at + r.length));
      const compressed = new Uint8Array(await range(flags.dataOffset + heap + first, end - first));
      const out = new Int32Array(nx * ny);
      rows.forEach((r, row) => {
        const decoded = rice32(compressed.subarray(r.at - first, r.at - first + r.length), fullNx);
        out.set(decoded.subarray(x0, x0 + nx), row * nx);
      });
      return out;
    };
    const plane = async (hdu: HDU, integer = false) => {
      // Three contiguous row slabs, rather than hundreds of tiny per-row requests.
      const buf = await range(hdu.dataOffset + y0 * fullNx * 4, ny * fullNx * 4);
      const view = new DataView(buf);
      const out = integer ? new Int32Array(nx * ny) : new Float32Array(nx * ny);
      const bscale = Number(hdu.header.BSCALE ?? 1), bzero = Number(hdu.header.BZERO ?? 0);
      if (integer && (bscale !== 1 || bzero !== 0)) throw new Error("Unsupported scaled FLAGS plane");
      for (let row = 0; row < ny; row++) for (let col = 0; col < nx; col++) {
        const at = ((row * fullNx) + x0 + col) * 4;
        out[row * nx + col] = integer ? view.getInt32(at, false) : view.getFloat32(at, false) * bscale + bzero;
      }
      return out;
    };
    const [data, mask, noise] = await Promise.all([plane(image), flagPlane(), plane(variance)]);
    const cropped: Header = { ...h, NAXIS1: nx, NAXIS2: ny };
    for (const [key, shift] of [["CRPIX1", x0], ["CRPIX2", y0], ["CRPIX1W", x0], ["CRPIX2W", y0]] as const) {
      if (!Number.isFinite(Number(h[key]))) throw new Error(`Missing FITS ${key}`);
      cropped[key] = Number(h[key]) - shift;
    }
    return { header: cropped, flagHeader: flags.header, data: data as Float32Array, flags: mask as Int32Array, variance: noise as Float32Array, nx, ny, source, crop: { x: x0, y: y0, nx, ny } };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
