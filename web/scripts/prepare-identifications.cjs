// Real catalog answers for every saved field/epoch. No invented identities or successful empty failures.
// node scripts/prepare-identifications.cjs [--stars-only|--bodies-only] [--all-epochs] [slug ...]
// JPL reads are strictly sequential. Existing successful raw answers are reused.
require('./register-ts.cjs');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { lookupGaia } = require('../src/lib/engine/gaia.ts');
const { catalogueText } = require('../src/lib/engine/catalogue.ts');
const { lookupSmallBodies } = require('../src/lib/engine/smallBodies.ts');
const { skySeparation } = require('../src/lib/engine/smallBodies.ts');
const { TT_TARGETS } = require('../src/lib/ttTargets.ts');
const { unpack } = require('../src/lib/engine/cutout.ts');
const { RELEASE, ENGINE_VERSION } = require('../src/lib/engine/releases.ts');
const args = process.argv.slice(2), only = args.filter(a => !a.startsWith('--'));
const root = path.resolve(__dirname, '../..'), out = path.join(root,'web/public/cache');
const json = file => JSON.parse(fs.readFileSync(file,'utf8'));
const write = (file,value) => fs.writeFileSync(file,JSON.stringify(value)+'\n');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function indexEntry(dir,file,q) {
  const dest=path.join(dir,'known_index.json'), old=fs.existsSync(dest)?json(dest):[];
  const entry={file,ra:q.ra,dec:q.dec,r:q.radius_deg,mjd:q.mjd,services:q.services.join(',')};
  write(dest,[...old.filter(e=>e.file!==file),entry]);
}
function rawPath(slug,name) { const dir=path.join(root,'data/raw/identification',slug);fs.mkdirSync(dir,{recursive:true});return path.join(dir,name); }
async function identityField(t) {
  const dest=rawPath(t.slug,'star_field.json');
  if(fs.existsSync(dest)) return json(dest);
  const max=50000, radius=.16;
  const query=`SELECT TOP ${max} source_id, ra, dec, pmra, pmdec, parallax, parallax_error, phot_g_mean_mag, phot_variable_flag FROM gaiadr3.gaia_source WHERE phot_g_mean_mag IS NOT NULL AND 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${t.ra},${t.dec},${radius}))`;
  const gaia=await lookupGaia(query,t.ra,t.dec,radius,AbortSignal.timeout(55000),{maxRows:max,allMagnitudes:true});
  if(gaia.records.length>=max) throw new Error('Gaia field may be truncated');
  let simbad, provider;
  const sq=`SELECT TOP 10000 b.main_id,b.ra,b.dec,b.pmra,b.pmdec,b.otype,o.label AS otype_label FROM basic AS b LEFT JOIN otypedef AS o ON b.otype=o.otype WHERE CONTAINS(POINT('ICRS',b.ra,b.dec),CIRCLE('ICRS',${t.ra},${t.dec},0.2))=1`;
  for(const host of ['simbad.harvard.edu','simbad.cds.unistra.fr']) {
    try {
      const text=await catalogueText(`https://${host}/simbad/sim-tap/sync`,{method:'POST',body:new URLSearchParams({REQUEST:'doQuery',LANG:'ADQL',FORMAT:'json',QUERY:sq})},AbortSignal.timeout(35000),30000);
      const j=JSON.parse(text), keys=j.metadata?.map(m=>m.name);
      if(!Array.isArray(j.data)||!keys||!['main_id','ra','dec','pmra','pmdec','otype'].every(k=>keys.includes(k))||j.data.length>=10000) throw new Error('Invalid/truncated SIMBAD field');
      simbad=j.data.map(row=>Object.fromEntries(keys.map((k,i)=>[k,row[i]])));
      if(simbad.some(r=>!r.main_id||!Number.isFinite(r.ra)||!Number.isFinite(r.dec))) throw new Error('Malformed SIMBAD row');
      provider=host; break;
    } catch(e) { console.log(t.slug,host,e.message); }
  }
  if(!simbad) throw new Error('SIMBAD field unavailable');
  const field={retrieved:new Date().toISOString(),gaia,gaiaQuery:query,simbad,simbadQuery:sq,simbadProvider:provider};
  write(dest,field);return field;
}
function saveIdentity(t,field,epochs) {
  const dir=path.join(out,t.slug);
  for(const mjd of epochs) {
    const yr=2000+(mjd-51544.5)/365.25;
    const propagate=(ra,dec,pmra,pmdec,epoch)=>{const dt=yr-epoch;return [((Number(ra)+(Number(pmra)||0)*dt/3.6e6/Math.cos(Number(dec)*Math.PI/180))%360+360)%360,Number(dec)+(Number(pmdec)||0)*dt/3.6e6];};
    const optional=v=>v===''||v===null?null:Number(v);
    const gaia=field.gaia.records.map(s=>{const [ra_epoch,dec_epoch]=propagate(s.ra,s.dec,s.pmra,s.pmdec,2016);return {source_id:s.source_id,g:Number(s.phot_g_mean_mag),parallax:optional(s.parallax),parallax_error:optional(s.parallax_error),pmra:Number(s.pmra)||0,pmdec:Number(s.pmdec)||0,ra_epoch,dec_epoch,variable:s.phot_variable_flag==='VARIABLE',sep_arcsec:skySeparation(t.ra,t.dec,ra_epoch,dec_epoch)};}).filter(s=>s.sep_arcsec<=360);
    const simbad=field.simbad.map(s=>{const [ra_epoch,dec_epoch]=propagate(s.ra,s.dec,s.pmra,s.pmdec,2000);return {main_id:s.main_id,otype:s.otype,otype_label:s.otype_label??null,pmra:Number(s.pmra)||0,pmdec:Number(s.pmdec)||0,ra_epoch,dec_epoch,sep_arcsec:skySeparation(t.ra,t.dec,ra_epoch,dec_epoch)};}).filter(s=>s.sep_arcsec<=360);
    const query={ra:t.ra,dec:t.dec,radius_deg:.1,mjd,services:['gaia','simbad'],epoch_year:yr,time_utc:new Date((mjd-40587)*86400000).toISOString()};
    const file=`identity_${mjd.toFixed(5)}.json`;
    write(path.join(dir,file),{query,retrieved:field.retrieved,gaia:{ok:true,service:field.gaia.service,rows:gaia},simbad:{ok:true,service:`SIMBAD (${field.simbadProvider}; J2000 positions propagated to epoch)`,rows:simbad},small_bodies:{ok:false,requested:false,service:'NASA/JPL',error:'not requested'},provenance:{raw:`data/raw/identification/${t.slug}/star_field.json`,gaiaEpoch:2016,simbadEpoch:2000,release:RELEASE.id}});
    indexEntry(dir,file,query);
  }
  console.log(t.slug,'identity answers:',epochs.length,'epochs; raw Gaia',field.gaia.records.length,'SIMBAD',field.simbad.length);
}
async function main() {
  const targets=TT_TARGETS.filter(t=>!only.length||only.includes(t.slug)), todo=[];
  for(const t of targets) {
    const dir=path.join(out,t.slug), p=json(path.join(dir,'prepared.json'));
    // SIA inventory mjd is exposure start; identity checks use FITS MJD-AVG, as the viewer does.
    const nativeEpoch=new Map(p.frames.map(o=>{const b=fs.readFileSync(path.join(dir,`frames/${o.obsid}D${o.detector}_0.1.bin`));return [`${o.obsid}D${o.detector}`,unpack(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)).meta.mjdAvg];}));
    const epochs=[...new Set([...nativeEpoch.values()].map(mjd=>Number(mjd.toFixed(5))))].sort((a,b)=>a-b);
    // Remove only this builder's own files at superseded inventory/start timestamps.
    // Keep legacy known_*.json responses and every current native exposure-average epoch.
    for(const name of fs.readdirSync(dir)) {
      const m=/^(?:identity|sbc|sba)_(\d+\.\d+)\.json$/.exec(name);
      if(m&&!epochs.includes(Number(m[1]))) fs.unlinkSync(path.join(dir,name));
    }
    const currentIndex=json(path.join(dir,'known_index.json')).filter(e=>fs.existsSync(path.join(dir,e.file)));
    write(path.join(dir,'known_index.json'),currentIndex);
    if(!args.includes('--bodies-only')) saveIdentity(t,await identityField(t),epochs);
    const pre=json(path.join(dir,'motion_analysis.json')), defaults=new Set(pre.selections.filter(s=>s.default).flatMap(s=>s.sources.slice(-1).map(s=>s.file)));
    const preferred=new Set(p.frames.filter(f=>defaults.has(`frames/${f.obsid}D${f.detector}_0.2.bin`)||t.compare?.includes(`${f.obsid}D${f.detector}`)||t.slug==='swan'&&f.obsid===t.prefer.obsid).map(f=>Number(nativeEpoch.get(`${f.obsid}D${f.detector}`).toFixed(5))));
    for(const mjd of epochs) if(preferred.has(mjd)||args.includes('--all-epochs')) for(const kind of ['sbc','sba']) todo.push({t,dir,mjd,kind,priority:preferred.has(mjd)?0:1});
  }
  let failures=0;
  if(!args.includes('--stars-only')) for(const {t,dir,mjd,kind} of todo.sort((a,b)=>a.priority-b.priority)) {
    const file=`${kind}_${mjd.toFixed(5)}.json`,dest=path.join(dir,file);
    if(fs.existsSync(dest)&&json(dest).small_bodies?.ok) { indexEntry(dir,file,json(dest).query); continue; }
    try {
      // Preparation is outside a serverless route: slow integrations may finish once and be saved.
      const result=await lookupSmallBodies(t.ra,t.dec,.1,mjd,kind,AbortSignal.timeout(180000),120000);
      const query={ra:t.ra,dec:t.dec,radius_deg:.1,mjd,services:[kind],epoch_year:2000+(mjd-51544.5)/365.25,time_utc:new Date((mjd-40587)*86400000).toISOString()};
      const answer={query,retrieved:result.retrieved,gaia:{ok:false,requested:false,service:'Gaia',error:'not requested'},simbad:{ok:false,requested:false,service:'SIMBAD',error:'not requested'},small_bodies:{ok:true,service:'NASA/JPL Small-Body Identification (geocentric; asteroids V <= 21, comets without magnitude restriction)',rows:result.rows},provenance:{requestUrl:result.url,observer:'xobs=0,0,0,0,0,0',release:RELEASE.id}};
      write(dest,answer);indexEntry(dir,file,query);
      console.log(t.slug,kind,mjd,result.rows.length,'objects');
    } catch(e) { failures++;console.error('FAILED',t.slug,kind,mjd,e.message); }
  }
  for(const t of targets) {
    const dir=path.join(out,t.slug), index=json(path.join(dir,'known_index.json'));
    write(path.join(dir,'identification_manifest.json'),{engine:ENGINE_VERSION,release:RELEASE.id,generated:new Date().toISOString(),starCoverage:'All prepared observation times; full selected cone must fit inside saved field',bodyCoverage:args.includes('--all-epochs')?'All prepared times requested':'Default walkthrough times and SWAN comet-date query',files:[...new Set(index.map(e=>e.file))].map(file=>({file,sha256:sha(path.join(dir,file))}))});
  }
  if(failures) throw new Error(`${failures} JPL requests unavailable; only successful answers were saved. Rerun to retry.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
