// Build a partial spatial inventory from original NASA SIA2 responses already in the repo.
// It indexes full detector footprints, not the small cutouts. No network, synthetic rows or completeness claim.
require('./register-ts.cjs');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {parseCsv}=require('../src/lib/engine/observations.ts');
const ROOT=path.resolve(__dirname,'../..');
const files=[...['barnard','wise0855','epsindib','rwaur','rdra'].map(s=>`data/raw/validation/${s}/sia2.csv`),...['ic348','l1688','ngc1333','ngc2264','orion_l1641','serpens'].map(s=>`data/raw/discovery/${s}/sia2.csv`),'data/raw/timetravel/swan_field_sia2.csv'];
const byUrl=new Map(),sources=[];
for(const file of files){
 const text=fs.readFileSync(path.join(ROOT,file),'utf8').replace(/\r\n/g,'\n');
 const rows=parseCsv(text),required=['dataproduct_subtype','access_url','obs_id','energy_bandpassname','s_region','s_ra','s_dec','t_min','t_exptime'];
 if(!rows.length||required.some(k=>!(k in rows[0])))throw new Error(`Invalid NASA inventory: ${file}`);
 let accepted=0;
 for(const r of rows){
  if(r.dataproduct_subtype!=='science'||!/^https:\/\/irsa\.ipac\.caltech\.edu\/ibe\/data\/spherex\/dr1\/level2\/\d{4}W\d{2}_[A-Z0-9]+\/l2b-[a-z0-9-]+\/[1-6]\/level2_[A-Za-z0-9_-]+\.fits$/.test(r.access_url))continue;
  const det=Number(r.energy_bandpassname.slice(-1)),poly=r.s_region.trim().split(/\s+/);
  if(poly[0].toUpperCase()!=='POLYGON'||poly[1].toUpperCase()!=='ICRS'||![10,12].includes(poly.length)||poly.length===12&&(Number(poly[2])!==Number(poly[10])||Number(poly[3])!==Number(poly[11])))throw new Error(`Unsupported footprint in ${file}`);
  const values=[Number(r.t_min),Number(r.t_exptime),Number(r.s_ra),Number(r.s_dec),...poly.slice(2,10).map(Number)];
  if(!values.every(Number.isFinite)||det<1||det>6||values[2]<0||values[2]>=360||Math.abs(values[3])>90)throw new Error(`Invalid metadata in ${file}`);
  const row=[r.obs_id,det,r.access_url,...values.slice(0,4),values.slice(4)];
  const previous=byUrl.get(r.access_url);if(previous&&JSON.stringify(previous)!==JSON.stringify(row))throw new Error(`Conflicting exposure metadata: ${r.access_url}`);
  byUrl.set(r.access_url,row);accepted++;
 }
 sources.push({file,sha256:createHash('sha256').update(text).digest('hex'),hashMode:'utf8-lf',originalRows:rows.length,scienceRows:accepted});
}
const rows=[...byUrl.values()].sort((a,b)=>a[3]-b[3]||a[1]-b[1]||a[0].localeCompare(b[0]));
const report={schema:'cosmos-partial-exposure-index-v1',release:'dr1',provider:'NASA/IPAC IRSA SIA2',scope:'Full detector footprints from saved target and discovery-field queries. Partial inventory only; absence from this index does not establish no observations.',columns:['obsid','detector','originalFits','mjdStart','exptime','centerRa','centerDec','polygonRaDec'],sources,rows};
fs.writeFileSync(path.join(ROOT,'web/public/data/exposure-index.json'),JSON.stringify(report)+'\n');
console.log(`${rows.length} distinct DR1 detector footprints from ${sources.length} original NASA inventories`);
