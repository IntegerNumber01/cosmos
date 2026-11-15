// FITS RICE_1, 32-bit integers: first sample, then blocks of mapped differences.
// Format reference: https://heasarc.gsfc.nasa.gov/fitsio/fpack/
// Decode with explicit input bounds and modulo-32-bit arithmetic for quality masks.
export function rice32(bytes: Uint8Array, count: number, blockSize = 32): Int32Array {
  if (!Number.isSafeInteger(count) || count < 1 || count > 2040 || blockSize !== 32) throw new Error("Unsupported Rice tile");
  let bit = 0;
  const read = (n: number) => {
    if (bit + n > bytes.length * 8) throw new Error("Truncated Rice tile");
    let value = 0;
    for (let i = 0; i < n; i++, bit++) value = value * 2 + ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
    return value;
  };
  const out = new Int32Array(count);
  let last = read(32) | 0;
  for (let start = 0; start < count; start += blockSize) {
    const split = read(5) - 1;
    if (split > 25) throw new Error("Invalid Rice split code");
    for (let i = start; i < Math.min(count, start + blockSize); i++) {
      let mapped = 0;
      if (split === 25) mapped = read(32);
      else if (split >= 0) {
        let quotient = 0;
        while (read(1) === 0) quotient++;
        mapped = quotient * 2 ** split + read(split);
        if (mapped > 0xffffffff) throw new Error("Invalid Rice difference");
      }
      const delta = mapped % 2 ? -(mapped + 1) / 2 : mapped / 2;
      last = (last + delta) | 0;
      out[i] = last;
    }
  }
  return out;
}
