import { catalogueText } from "./catalogue";

const COLUMNS = ["source_id", "ra", "dec", "pmra", "pmdec", "parallax", "parallax_error", "phot_g_mean_mag", "phot_variable_flag"] as const;
const VIZIER_COLUMNS = ["Source", "RA_ICRS", "DE_ICRS", "pmRA", "pmDE", "Plx", "e_Plx", "Gmag", "VarFlag"];
export type GaiaRecord = Record<(typeof COLUMNS)[number], string>;

/** Strict CSV records: a broken/truncated row must not quietly become an empty catalogue. */
function csvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw new Error("Malformed Gaia CSV quoting");
      quoted = true;
    } else if (c === "," || c === "\r" || c === "\n") {
      row.push(cell); cell = ""; closed = false;
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (row.some((v) => v !== "")) records.push(row);
        row = [];
      }
    } else {
      if (closed) throw new Error("Malformed Gaia CSV quoting");
      cell += c;
    }
  }
  if (quoted) throw new Error("Truncated Gaia CSV quoted field");
  if (cell || row.length || closed) { row.push(cell); records.push(row); }
  return records;
}

function validate(record: GaiaRecord): GaiaRecord {
  if (!/^\d{1,20}$/.test(record.source_id) || BigInt(record.source_id) <= BigInt(0) || BigInt(record.source_id) > BigInt("18446744073709551615"))
    throw new Error("Malformed Gaia source identifier");
  const number = (key: (typeof COLUMNS)[number], optional = false) => {
    const value = record[key];
    if (optional && value === "") return;
    if (!value || !Number.isFinite(Number(value))) throw new Error(`Malformed Gaia ${key}`);
  };
  for (const key of ["ra", "dec", "phot_g_mean_mag"] as const) number(key);
  for (const key of ["pmra", "pmdec", "parallax", "parallax_error"] as const) number(key, true);
  if (Number(record.ra) < 0 || Number(record.ra) >= 360 || Math.abs(Number(record.dec)) > 90 || Number(record.parallax_error) < 0)
    throw new Error("Gaia coordinate or uncertainty outside its valid range");
  if (!["", "NOT_AVAILABLE", "CONSTANT", "VARIABLE"].includes(record.phot_variable_flag)) throw new Error("Malformed Gaia variability flag");
  return record;
}

function table(header: string[], rows: string[][], expected: readonly string[]): GaiaRecord[] {
  if (new Set(header).size !== header.length || expected.some((name) => !header.includes(name))) throw new Error("Missing or duplicate Gaia response columns");
  const indices = expected.map((name) => header.indexOf(name));
  return rows.map((values) => {
    if (values.length !== header.length) throw new Error("Malformed Gaia row length");
    return validate(Object.fromEntries(COLUMNS.map((name, i) => [name, values[indices[i]].trim()])) as GaiaRecord);
  });
}

export function parseGaiaCsv(text: string): GaiaRecord[] {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean || clean.startsWith("<")) throw new Error("ESA returned an empty or non-CSV response");
  const [header, ...rows] = csvRecords(clean);
  return table(header ?? [], rows, COLUMNS);
}

export function parseGaiaTsv(text: string): GaiaRecord[] {
  if (/^\s*(?:#ERROR|#INFO\s+Error|\*{4})/im.test(text)) throw new Error("VizieR reported an error");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() && !line.trimStart().startsWith("#"));
  const header = (lines.shift() ?? "").split("\t").map((s) => s.trim());
  // ASU TSV has an optional units row followed by a dashed separator. Only these metadata rows may be skipped.
  const units = ["", "deg", "deg", "mas/yr", "mas/yr", "mas", "mas", "mag", ""];
  const first = lines[0]?.split("\t").map((s) => s.trim());
  if (first && first.length === header.length && header.every((name, i) => first[i] === units[VIZIER_COLUMNS.indexOf(name)])) lines.shift();
  if (lines[0] && /^[\t -]+$/.test(lines[0]) && lines[0].includes("-")) lines.shift();
  return table(header, lines.map((line) => line.split("\t").map((s) => s.trim())), VIZIER_COLUMNS);
}

export async function lookupGaia(query: string, ra: number, dec: number, radius: number, deadline: AbortSignal): Promise<{ records: GaiaRecord[]; service: string }> {
  try {
    const text = await catalogueText("https://gea.esac.esa.int/tap-server/tap/sync", {
      method: "POST", body: new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "csv", QUERY: query }),
    }, deadline, 20_000);
    return { records: parseGaiaCsv(text), service: "ESA Gaia DR3 (positions propagated to the epoch)" };
  } catch (esaError) {
    deadline.throwIfAborted();
    const params = new URLSearchParams({
      "-source": "I/355/gaiadr3", "-c": `${ra} ${dec >= 0 ? "+" : ""}${dec}`, "-c.rd": String(radius + 0.04),
      "-out": VIZIER_COLUMNS.join(","), "-sort": "Gmag", "-out.max": String(radius > 0.05 ? 1500 : 200),
      ...(radius > 0.05 ? { Gmag: "<18" } : {}),
    });
    try {
      // One mirror attempt: the full Gaia chain is at most 20 + 25 seconds, inside the shared 55-second deadline.
      const text = await catalogueText(`https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?${params}`, {}, deadline, 25_000);
      return { records: parseGaiaTsv(text), service: `ESA Gaia DR3 via the CDS VizieR mirror (ESA unavailable: ${(esaError as Error).message}; positions propagated to the epoch)` };
    } catch (mirrorError) {
      throw new Error(`ESA: ${(esaError as Error).message}; VizieR: ${(mirrorError as Error).message}`);
    }
  }
}
