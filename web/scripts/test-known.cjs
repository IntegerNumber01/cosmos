// Network-free contract tests: malformed replies must not become successful empty searches.
require("./register-ts.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { NextRequest } = require("next/server");
const { GET } = require("../src/app/api/known/route.ts");
const { parseGaiaCsv, parseGaiaTsv, lookupGaia } = require("../src/lib/engine/gaia.ts");
const { catalogueText } = require("../src/lib/engine/catalogue.ts");
const { getKnown } = require("../src/lib/engine/client.ts");
const { smallBodyUrl, parseSmallBodies } = require("../src/lib/engine/smallBodies.ts");

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

const bodyTable = {
  signature:{source:'NASA/JPL Small-Body Identification API',version:'1.1'},n_second_pass:1,
  fields_second:['Object name','Astrometric RA (hh:mm:ss)',`Astrometric Dec (dd mm'ss")`,'Dist. from center RA (")','Dist. from center Dec (")','Dist. from center Norm (")','Visual magnitude (V)','RA rate ("/h)','Dec rate ("/h)'],
  data_second_pass:[['C/2025 R2 (SWAN)','20:56:57.69',`-05 41'20.6"`,'-17.6','-2.37','17.79','11.7T','522.7','146.1']],
};
test('JPL uses a supported geocentric state and validates genuine units, counts, coordinates and failures', () => {
  const u=new URL(smallBodyUrl(314.2453,-5.6884,.02,60975.20497,'sbc'));
  assert.equal(u.searchParams.get('xobs'),'0,0,0,0,0,0');assert(!u.searchParams.has('mpc-code'));
  assert.equal(u.searchParams.get('mag-required'),'false');assert.equal(u.searchParams.get('sb-kind'),'c');
  const highDec=new URL(smallBodyUrl(10,70,.02,61000,'sba'));
  assert(Number(highDec.searchParams.get('fov-ra-hwidth'))>.05);assert.equal(highDec.searchParams.get('vmag-lim'),'21');
  assert.equal(parseSmallBodies(JSON.stringify(bodyTable))[0].ra_rate_arcsec_h,522.7);
  assert.deepEqual(parseSmallBodies(JSON.stringify({signature:bodyTable.signature,warning:'No matching records'})),[]);
  for(const bad of [{hello:1},{...bodyTable,n_second_pass:0},{...bodyTable,signature:{...bodyTable.signature,version:'2.0'}},{...bodyTable,fields_second:bodyTable.fields_second.map(s=>s.replace('"/h','deg/s'))},{...bodyTable,data_second_pass:[bodyTable.data_second_pass[0].map((s,i)=>i===1?'25:00:00':s)]}])
    assert.throws(()=>parseSmallBodies(JSON.stringify(bad)));
});

test('JPL transport/HTML/unsupported responses remain failed checks, never successful empty results', async t => {
  mockFetch(t,async()=>new Response('<html>Gateway error</html>'));
  const response=await GET(new NextRequest('http://local/api/known?ra=314.2453&dec=-5.6884&r=.02&mjd=60975.20497&services=sbc'));
  const body=await response.json();assert.equal(body.small_bodies.ok,false);assert.equal(response.headers.get('cache-control'),'no-store');
});

const cacheFixture = () => ({
  query:{ra:10,dec:20,radius_deg:.1,mjd:61000,services:['gaia','simbad'],epoch_year:2025,time_utc:'2025-11-21T00:00:00Z'},retrieved:'2026-11-15T00:00:00Z',
  gaia:{service:'Gaia DR3',ok:true,rows:[{source_id:'123456789123456789',g:13,pmra:0,pmdec:0,ra_epoch:10,dec_epoch:20,sep_arcsec:0,parallax:10,parallax_error:1},{source_id:'987654321987654321',g:16,pmra:0,pmdec:0,ra_epoch:10.05,dec_epoch:20,sep_arcsec:170,parallax:null,parallax_error:null}]},
  simbad:{service:'SIMBAD',ok:true,rows:[{main_id:'Known source',otype:'Star',otype_label:'Star',ra_epoch:10,dec_epoch:20,sep_arcsec:0}]},
  small_bodies:{service:'JPL',ok:false,error:'not requested'},
});
function cachedFetch(fixture,live,calls) {
  return async url=>{
    calls.push(String(url));
    if(String(url).endsWith('known_index.json')) return Response.json([{file:'identity.json',ra:10,dec:20,r:.1,mjd:61000,services:'gaia,simbad'}]);
    if(String(url).endsWith('identity.json')) return Response.json(fixture);
    if(live) return live(url);
    throw new Error('No network service should be called');
  };
}
test('prepared catalog answers are used before live services and wider fields are filtered to the requested cone', async t=>{
  const calls=[];mockFetch(t,cachedFetch(cacheFixture(),null,calls));
  const answer=await getKnown(10,20,.0028,61000,'gaia,simbad','example');
  assert(answer.gaia.ok&&answer.simbad.ok);assert.equal(answer.gaia.rows.length,1);assert.equal(answer.gaia.rows[0].source_id,'123456789123456789');
  assert(calls.every(u=>u.startsWith('/cache/')));assert.equal(answer.lookupInfo.gaia.delivery,'prepared');assert.equal(answer.query.radius_deg,.0028);
});
test('a partial HTTP 200 catalog failure cannot erase a successful saved service', async t=>{
  const fixture=cacheFixture();fixture.simbad={service:'SIMBAD',ok:false,error:'unavailable'};
  const calls=[];mockFetch(t,cachedFetch(fixture,url=>{
    assert.equal(new URL(url,'http://local').searchParams.get('services'),'simbad');
    return Response.json({...fixture,simbad:{service:'SIMBAD live',ok:false,error:'fetch failed'}});
  },calls));
  const answer=await getKnown(10,20,.0028,61000,'gaia,simbad','example');
  assert(answer.gaia.ok);assert.equal(answer.simbad.ok,false);assert.equal(answer.simbad.error,'fetch failed');
});
test('wrong epoch, uncovered position and forged saved query cannot reuse a catalog answer', async t=>{
  const calls=[];let fixture=cacheFixture();
  mockFetch(t,async url=>cachedFetch(fixture,async()=>{throw new Error('Live unavailable');},calls)(url));
  await assert.rejects(getKnown(10,20,.0028,61000+2/86400,'gaia,simbad','example'),/Live unavailable/);
  await assert.rejects(getKnown(10.2,20,.0028,61000,'gaia,simbad','example'),/Live unavailable/);
  fixture={...fixture,query:{...fixture.query,mjd:62000}};
  await assert.rejects(getKnown(10,20,.0028,61000,'gaia,simbad','example'),/Live unavailable/);
});

test('all featured star catalog checks work locally at every saved observation time', async t=>{
  const fs=require('node:fs'),path=require('node:path'),{TT_TARGETS}=require('../src/lib/ttTargets.ts');
  const root=path.resolve(__dirname,'../public/cache');let calls=0,epochs=0;
  mockFetch(t,async url=>{
    assert.match(String(url),/^\/cache\//,'prepared identity checks must not need an API');calls++;
    const file=path.join(root,String(url).slice('/cache/'.length));
    return fs.existsSync(file)?new Response(fs.readFileSync(file)):new Response('',{status:404});
  });
  for(const target of TT_TARGETS) {
    const p=JSON.parse(fs.readFileSync(path.join(root,target.slug,'prepared.json'),'utf8'));
    const manifest=JSON.parse(fs.readFileSync(path.join(root,target.slug,'identification_manifest.json'),'utf8'));
    for(const entry of manifest.files) {
      const bytes=fs.readFileSync(path.join(root,target.slug,entry.file));
      assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'),entry.sha256,`${target.slug}: stale identity manifest`);
    }
    const {unpack}=require('../src/lib/engine/cutout.ts');
    const native=p.frames.map(f=>{const b=fs.readFileSync(path.join(root,target.slug,`frames/${f.obsid}D${f.detector}_0.1.bin`));return unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)).meta.mjdAvg;});
    for(const mjd of new Set(native)) {
      const dt=(mjd-(51544.5+25.9*365.25))/365.25;
      const ra=target.ra+(target.pm?.[0]??0)*dt/3.6e6/Math.cos(target.dec*Math.PI/180),dec=target.dec+(target.pm?.[1]??0)*dt/3.6e6;
      const answer=await getKnown(ra,dec,.0028,mjd,'gaia,simbad',target.slug);
      assert(answer.gaia.ok&&answer.simbad.ok,target.slug);assert.equal(answer.lookupInfo.gaia.delivery,'prepared');
      assert.equal(answer.lookupInfo.simbad.delivery,'prepared');
      assert(answer.gaia.rows.every(s=>s.sep_arcsec<=.0028*3600));
      if(['barnard','rwaur','rdra','gy152','gpmon'].includes(target.slug)) assert(answer.gaia.rows.length||answer.simbad.rows.length,`${target.slug}: missing positive known-source identity`);
      epochs++;
    }
  }
  assert.equal(epochs,101);assert(calls>=270);
});

test('default walkthroughs, highlighted comparison dates and SWAN have genuine local JPL answers at native exposure times', async t=>{
  const fs=require('node:fs'),path=require('node:path'),{TT_TARGETS}=require('../src/lib/ttTargets.ts'),{unpack}=require('../src/lib/engine/cutout.ts');
  const root=path.resolve(__dirname,'../public/cache');let queries=0,cometFound=false;
  mockFetch(t,async url=>{
    assert.match(String(url),/^\/cache\//,'featured JPL checks must not need a live API');
    const file=path.join(root,String(url).slice('/cache/'.length));
    return fs.existsSync(file)?new Response(fs.readFileSync(file)):new Response('',{status:404});
  });
  for(const target of TT_TARGETS) {
    const pre=JSON.parse(fs.readFileSync(path.join(root,target.slug,'motion_analysis.json'),'utf8'));
    const keys=new Set(pre.selections.filter(s=>s.default).map(s=>s.sources.at(-1).file.replace('_0.2.bin','_0.1.bin')));
    for(const key of target.compare??[]) keys.add(`frames/${key}_0.1.bin`);
    if(target.slug==='swan') keys.add(`frames/${target.prefer.obsid}D${target.prefer.detector}_0.1.bin`);
    for(const file of keys) {
      const b=fs.readFileSync(path.join(root,target.slug,file)),meta=unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)).meta;
      for(const kind of ['sbc','sba']) {
        const answer=await getKnown(target.ra,target.dec,.02,meta.mjdAvg,kind,target.slug);
        assert(answer.small_bodies.ok,`${target.slug} ${file} ${kind}`);assert.equal(answer.lookupInfo.small_bodies.delivery,'prepared');
        assert.equal(answer.lookupInfo.small_bodies.query.services.join(','),kind);
        assert.match(answer.lookupInfo.small_bodies.requestUrl,/xobs=0/);
        assert(answer.small_bodies.rows.every(s=>s.sep_arcsec<=72));
        if(target.slug==='swan'&&file.includes(target.prefer.obsid)&&kind==='sbc') {
          assert(answer.small_bodies.rows.some(s=>s.name==='C/2025 R2 (SWAN)'));cometFound=true;
        }
        queries++;
      }
    }
  }
  assert(cometFound);assert(queries>=22);
});
