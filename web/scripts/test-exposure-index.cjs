require('./register-ts.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const inventory=require('../public/data/exposure-index.json');
const {indexObservations}=require('../src/lib/engine/exposureIndex.ts');
const {parseCsv}=require('../src/lib/engine/observations.ts');
const {mirrorUrl}=require('../src/lib/engine/cloudCutout.ts');
const {tanDeproject}=require('../src/lib/engine/wcs.ts');
const {NextRequest}=require('next/server');
const {GET}=require('../src/app/api/observations/route.ts');
const {getObservations}=require('../src/lib/engine/client.ts');

test('partial spatial inventory retains original NASA rows and normalized source checksums',()=>{
 const original=new Map();
 for(const source of inventory.sources){
  const text=fs.readFileSync(path.join(__dirname,'../..',source.file),'utf8').replace(/\r\n/g,'\n');
  assert.equal(createHash('sha256').update(text).digest('hex'),source.sha256);
  const rows=parseCsv(text);assert.equal(rows.length,source.originalRows);
  for(const r of rows)if(r.dataproduct_subtype==='science')original.set(r.access_url,r);
 }
 assert.equal(new Set(inventory.rows.map(r=>r[2])).size,inventory.rows.length);assert(inventory.rows.length>3000);
 for(const r of inventory.rows){const nasa=original.get(r[2]);assert(nasa);assert.equal(r[0],nasa.obs_id);assert.equal(r[3],Number(nasa.t_min));assert.equal(r[1],Number(nasa.energy_bandpassname.slice(-1)));assert.deepEqual(r[7],nasa.s_region.split(/\s+/).slice(2,10).map(Number));assert.match(mirrorUrl(r[2]),/^https:\/\/nasa-irsa-spherex\./);}
 assert.match(inventory.scope,/Partial inventory/);
});

test('full detector footprints support a coordinate outside the prepared target cutouts',()=>{
 const result=indexObservations(331.8,-56.7);assert(result.length>100);
 assert(result.every(r=>r.inside&&Number.isFinite(r.wl)&&r.estX>=30&&r.estY>=30));
 assert.equal(indexObservations(266.71577,-30.44494).length,0,'Uncovered coordinates must not acquire another field');
});

test('spatial prefilter handles the RA seam and poles and refuses opposite-side projections',()=>{
 for(const [ra,dec] of [[359.9,0],[20,89.5],[180,-89.5]]){
  const polygon=[[-1,-1],[1,-1],[1,1],[-1,1]].flatMap(([x,y])=>tanDeproject(x,y,ra,dec));
  const row=['fixture',2,inventory.rows[0][2],60000,113,ra,dec,polygon];
  assert.equal(indexObservations(ra,dec,[row]).length,1);
  const nearby=tanDeproject(.2,.2,ra,dec);assert.equal(indexObservations(...nearby,[row]).length,1);
  assert.equal(indexObservations((ra+180)%360,-dec,[row]).length,0);
  assert.equal(indexObservations(...tanDeproject(5,0,ra,dec),[row]).length,0);
 }
});

test('archive failure uses explicit partial coverage; refresh and uncovered searches still fail',async t=>{
 const original=global.fetch;t.after(()=>global.fetch=original);
 global.fetch=async()=>new Response('Archive down',{status:502});
 const response=await GET(new NextRequest('http://localhost/api/observations?ra=331.8&dec=-56.7&size=.1'));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const data=await response.json();assert.equal(data.inventoryFallback,true);assert.match(data.sample,/partial saved NASA/);assert(!data.queried);assert(data.frames.length>100);
 assert.equal((await GET(new NextRequest('http://localhost/api/observations?ra=331.8&dec=-56.7&refresh=1'))).status,502);
 assert.equal((await GET(new NextRequest('http://localhost/api/observations?ra=266.71577&dec=-30.44494'))).status,502);
 // A valid empty live response remains an empty live response, even inside indexed coverage.
 global.fetch=async()=>new Response('dataproduct_subtype,access_url,obs_id,energy_bandpassname,s_region,s_ra,s_dec,t_min,t_exptime\n');
 const live=await (await GET(new NextRequest('http://localhost/api/observations?ra=331.8&dec=-56.7'))).json();
 assert.equal(live.frames.length,0);assert(!live.inventoryFallback);assert(live.queried);
});

test('browser data layer preserves the partial-inventory label and explicit refresh request',async t=>{
 const original=global.fetch;t.after(()=>global.fetch=original);const calls=[];
 global.fetch=async url=>{calls.push(url);return Response.json({inventoryFallback:true,sample:'Partial saved inventory',frames:[]});};
 const response=await getObservations(331.8,-56.7);assert.equal(response.source,'cache');assert.equal(response.sample,'Partial saved inventory');
 await getObservations(331.8,-56.7,undefined,true,.1,true);assert.match(calls[1],/refresh=1/);
});
