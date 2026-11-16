// Network-free contract tests: malformed replies must not become successful empty searches.
require("./register-ts.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { NextRequest } = require("next/server");
const { GET } = require("../src/app/api/known/route.ts");
const { parseGaiaCsv, parseGaiaTsv, lookupGaia } = require("../src/lib/engine/gaia.ts");
const { catalogueText } = require("../src/lib/engine/catalogue.ts");

const CSV_HEADER = "source_id,ra,dec,pmra,pmdec,parallax,parallax_error,phot_g_mean_mag,phot_variable_flag";
const TSV_HEADER = "Source\tRA_ICRS\tDE_ICRS\tpmRA\tpmDE\tPlx\te_Plx\tGmag\tVarFlag";
const ROW = ["6412596012146801152", "331.09644", "-56.80059", "3982", "-2466.8", "271", "0.1", "13.2", "NOT_AVAILABLE"];
const validCsv = CSV_HEADER + "\r\n" + ROW.join(",") + "\r\n";
const validTsv = "# Gaia DR3\n" + TSV_HEADER + "\n\tdeg\tdeg\tmas/yr\tmas/yr\tmas\tmas\tmag\t\n------\t------\t------\t------\t------\t------\t------\t------\t------\n" + ROW.join("\t") + "\n";
const request = () => new NextRequest("http://local/api/known?ra=331.09644&dec=-56.80059&r=0.02&mjd=61000&services=gaia");
const mockFetch = (t, handler) => {
  const previous = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => { globalThis.fetch = previous; });
};

test("Gaia accepts genuine empty tables, quoted CSV, TSV metadata and exact 64-bit IDs", () => {
  assert.deepEqual(parseGaiaCsv(CSV_HEADER + "\n"), []);
  assert.deepEqual(parseGaiaTsv(TSV_HEADER + "\n"), []);
  assert.equal(parseGaiaCsv(validCsv)[0].source_id, ROW[0]);
  assert.equal(parseGaiaTsv(validTsv)[0].source_id, ROW[0]);
  assert.equal(parseGaiaCsv('"' + CSV_HEADER.replaceAll(",", '","') + '"\n"' + ROW.join('","') + '"')[0].source_id, ROW[0]);
});

test("Gaia rejects HTML, missing/duplicate headers, truncated rows, malformed numbers and IDs", () => {
  const malformed = [
    "", "<html>Temporarily unavailable</html>", "message\nservice down", validCsv.replace("source_id", "wrong_id"),
    validCsv.replace("phot_variable_flag", "source_id"), CSV_HEADER + "\n" + ROW.slice(0, 8).join(","),
    validCsv.replace("331.09644", "not-a-number"), validCsv.replace("-56.80059", "-91"),
    validCsv.replace(ROW[0], "6.412596012146801e18"), CSV_HEADER + '\n"unfinished',
  ];
  for (const text of malformed) assert.throws(() => parseGaiaCsv(text), undefined, text);
  for (const text of ["<html>down</html>", "#INFO Error: database unavailable", "# only comments", TSV_HEADER + "\n" + ROW.slice(0, 8).join("\t"), validTsv.replace("331.09644", "NaN"), TSV_HEADER + "\nservice is unavailable"])
    assert.throws(() => parseGaiaTsv(text), undefined, text);
});

test("HTML with HTTP 200 triggers the Gaia mirror instead of a successful empty result", async (t) => {
  const calls = [];
  mockFetch(t, async (url) => {
    calls.push(new URL(String(url)).host);
    return new Response(calls.length === 1 ? "<html>Temporarily unavailable</html>" : validTsv);
  });
  const response = await GET(request());
  const body = await response.json();
  assert.deepEqual(calls, ["gea.esac.esa.int", "vizier.cfa.harvard.edu"]);
  assert.equal(body.gaia.ok, true);
  assert.equal(body.gaia.rows[0].source_id, ROW[0]);
  assert.match(body.gaia.service, /VizieR/);
  assert.equal(body.simbad.requested, false);
});

test("two malformed providers produce an explicit non-cacheable failure, with no third attempt", async (t) => {
  let calls = 0;
  mockFetch(t, async () => { calls++; return new Response("<html>Unavailable</html>"); });
  const response = await GET(request());
  const body = await response.json();
  assert.equal(calls, 2);
  assert.equal(body.gaia.ok, false);
  assert.match(body.gaia.error, /ESA:.*VizieR:/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("a structurally valid empty ESA result succeeds without a fallback", async (t) => {
  let calls = 0;
  mockFetch(t, async () => { calls++; return new Response(CSV_HEADER + "\n"); });
  const response = await GET(request());
  const body = await response.json();
  assert.equal(body.gaia.ok, true);
  assert.deepEqual(body.gaia.rows, []);
  assert.equal(calls, 1);
});

test("the shared deadline aborts a stalled Gaia body and prevents another provider attempt", async (t) => {
  let calls = 0;
  const parent = new AbortController();
  mockFetch(t, async () => {
    calls++;
    queueMicrotask(() => parent.abort(new Error("Request deadline reached")));
    return { ok: true, text: () => new Promise(() => {}) };
  });
  await assert.rejects(lookupGaia("query", 331, -56, 0.02, parent.signal), /Request deadline reached/);
  assert.equal(calls, 1);
});

test("attempt timeout covers response-body reading, and an expired deadline starts no request", async (t) => {
  let calls = 0;
  mockFetch(t, async () => { calls++; return { ok: true, text: () => new Promise(() => {}) }; });
  await assert.rejects(catalogueText("http://mock", {}, new AbortController().signal, 5), /timed out/);
  const parent = new AbortController(); parent.abort(new Error("Expired"));
  await assert.rejects(catalogueText("http://mock", {}, parent.signal, 100), /Expired/);
  assert.equal(calls, 1);
});
