// Failure-mode tests for /api/known with a mocked network: a failed catalogue service must never look like
// a successful empty search, and only requested services may run.  Usage: npx tsx scripts/test-known.ts
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/known/route";

let unhandled = 0;
process.on("unhandledRejection", () => unhandled++);
const calls: string[] = [];
type Mode = { jpl: "503" | "garbage" | "empty" | "hit"; simbad: "fail" | "ok"; gaia: "ok" };

function mock(mode: Mode) {
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = String(input);
    calls.push(new URL(u).host);
    if (u.includes("ssd-api.jpl.nasa.gov")) {
      if (mode.jpl === "503") return new Response("Service Unavailable", { status: 503 });
      if (mode.jpl === "garbage") return new Response(JSON.stringify({ hello: 1 }), { status: 200 });
      const sig = { source: "NASA/JPL Small-Body Identification API", version: "1.1" };
      if (mode.jpl === "empty") return new Response(JSON.stringify({ signature: sig, warning: "no matching records" }), { status: 200 });
      return new Response(
        JSON.stringify({ signature: sig, data_second_pass: [["C/2025 R2 (SWAN)", "20:56:58.19", "-05 41'18.5\"", ".8", "4.5", "4.6", "11.7T", "522", "146"]] }),
        { status: 200 },
      );
    }
    if (u.includes("simbad")) {
      if (mode.simbad === "fail") return new Response("<html>down</html>", { status: 404 });
      return new Response(JSON.stringify({ metadata: [{ name: "main_id" }], data: [] }), { status: 200 });
    }
    if (u.includes("gea.esac.esa.int")) return new Response("source_id,ra,dec,pmra,pmdec,parallax,parallax_error,phot_g_mean_mag\n", { status: 200 });
    throw new Error("unexpected " + u);
  }) as typeof fetch;
}

async function call(services: string) {
  const req = new NextRequest(`http://x/api/known?ra=314.24&dec=-5.69&r=0.02&mjd=60975.2&services=${services}`);
  return (await GET(req)).json();
}

let fails = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!cond) fails++;
};

(async () => {
  mock({ jpl: "503", simbad: "ok", gaia: "ok" });
  let j = await call("sbc");
  check("JPL HTTP 503 -> small_bodies.ok === false", j.small_bodies.ok === false, j.small_bodies.error);
  check("JPL-only request makes no Gaia/SIMBAD calls", calls.every((h) => h.includes("jpl")), calls.join(","));

  mock({ jpl: "garbage", simbad: "ok", gaia: "ok" });
  j = await call("sba");
  check("JPL malformed 200 -> error, not empty", j.small_bodies.ok === false, j.small_bodies.error);

  mock({ jpl: "empty", simbad: "ok", gaia: "ok" });
  j = await call("sbc");
  check("JPL 'no matching records' -> ok with 0 rows", j.small_bodies.ok === true && j.small_bodies.rows.length === 0);

  mock({ jpl: "hit", simbad: "ok", gaia: "ok" });
  j = await call("sbc");
  check("JPL hit -> 1 row with name", j.small_bodies.ok === true && j.small_bodies.rows[0]?.name === "C/2025 R2 (SWAN)");

  mock({ jpl: "hit", simbad: "fail", gaia: "ok" });
  j = await call("gaia");
  await new Promise((r) => setTimeout(r, 50));
  check("Gaia-only request makes no SIMBAD/JPL calls", calls.every((h) => h.includes("esa")), calls.join(","));
  check("unrequested SIMBAD reported as not requested", j.simbad.ok === false && j.simbad.requested === false);
  check("Gaia ok", j.gaia.ok === true);

  mock({ jpl: "hit", simbad: "fail", gaia: "ok" });
  j = await call("gaia,simbad");
  check("SIMBAD failure -> simbad.ok === false (not empty)", j.simbad.ok === false && j.simbad.requested !== false, j.simbad.error);

  await new Promise((r) => setTimeout(r, 100));
  check("no unhandled promise rejections", unhandled === 0, `count=${unhandled}`);
  console.log(fails ? `${fails} FAILED` : "all passed");
  process.exit(fails ? 1 : 0);
})();
