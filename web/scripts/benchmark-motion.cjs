// Protocol is frozen in docs/motion-benchmark-protocol.json before the first run.
// Reproduce: node scripts/benchmark-motion.cjs [--write]. No network or threshold tuning.
require('./register-ts.cjs');
const fs=require('node:fs'), path=require('node:path'), {createHash}=require('node:crypto');
const {analyseMotion}=require('../src/lib/engine/motion.ts');
const {decodeFrame,measure,median}=require('../src/lib/engine/sequence.ts');
const {sky2pix}=require('../src/lib/engine/wcs.ts');
const {propagate,deltaRA}=require('../src/lib/engine/astrometry.ts');
const ROOT=path.resolve(__dirname,'../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const protocolPath='docs/motion-benchmark-protocol.json';
const readJson=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const finite=(...xs)=>xs.every(Number.isFinite);
const round=x=>Number(x.toFixed(6));
function summarize(rows){
 const accepted=rows.filter(r=>r.ok), med=k=>accepted.length?round(median(accepted.map(r=>r[k]))):null;
 return {selected:rows.length,accepted:accepted.length,refused:rows.length-accepted.length,rawMedianResidual:med('rawResidual'),correctedMedianResidual:med('correctedResidual'),improved:accepted.filter(r=>r.correctedResidual<r.rawResidual-1e-6).length,worsened:accepted.filter(r=>r.correctedResidual>r.rawResidual+1e-6).length,tied:accepted.filter(r=>Math.abs(r.correctedResidual-r.rawResidual)<=1e-6).length,rawOver3:accepted.filter(r=>r.rawResidual>=3*r.errorScale).length,correctedOver3:accepted.filter(r=>r.correctedResidual>=3*r.errorScale).length,rawOver5:accepted.filter(r=>r.rawResidual>=5*r.errorScale).length,correctedOver5:accepted.filter(r=>r.correctedResidual>=5*r.errorScale).length};
}
function runBenchmark(progress=()=>{}){
 const protocol=readJson(path.join(ROOT,protocolPath)), inputs=[];
  const hashFile=file=>{const bytes=fs.readFileSync(path.join(ROOT,file));const mode=/\.(ts|cjs|json)$/.test(file)?'utf8-lf':'bytes';inputs.push({file,hashMode:mode,sha256:sha(mode==='utf8-lf'?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes)});return bytes;};
 hashFile(protocolPath);hashFile('web/scripts/benchmark-motion.cjs');
 for(const file of ['motion.ts','sequence.ts','photometry.ts','astrometry.ts','wcs.ts'])hashFile('web/src/lib/engine/'+file);
 const fields=[];
 for(const slug of protocol.fields){
  const prefix='web/public/cache/'+slug+'/';
  const saved=JSON.parse(hashFile(prefix+'motion_analysis.json')), catalog=JSON.parse(hashFile(prefix+'calib_stars.json'));
  const selection=saved.selections.find(s=>s.default&&s.cadence==='exposures');
  const frames=selection.sources.map(s=>{const b=hashFile(prefix+s.file);return decodeFrame(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}).sort((a,b)=>a.meta.mjdAvg-b.meta.mjdAvg);
  const first=frames[0], [tx,ty]=sky2pix(first.meta.wcs,saved.target.ra,saved.target.dec);
  const candidates=catalog.stars.filter(s=>{
   if(!(s.g>=11&&s.g<=16.5&&!s.variable&&finite(s.pmra,s.pmdec)))return false;
   const p=propagate(s.ra_epoch,s.dec_epoch,s.pmra,s.pmdec,catalog.query.epoch_mjd,first.meta.mjdAvg);if(!p)return false;
   const [x,y]=sky2pix(first.meta.wcs,...p);
   return x>=12&&y>=12&&x<first.meta.nx-12&&y<first.meta.ny-12&&Math.hypot(x-tx,y-ty)>=10;
  }).sort((a,b)=>sha(a.source_id).localeCompare(sha(b.source_id)));
  const rows=[];
  for(const s of candidates.slice(0,protocol.maxPerField)){
   const plx=s.parallax>0&&s.parallax_error>0&&s.parallax/s.parallax_error>=5?s.parallax:0;
   const target={ra:s.ra_epoch,dec:s.dec_epoch,pm:[s.pmra,s.pmdec],epochYear:2000+(catalog.query.epoch_mjd-51544.5)/365.25,parallaxMas:plx,parallaxSource:'Gaia DR3 catalogue'};
   const r=analyseMotion(frames,target,catalog.stars,catalog.query.epoch_mjd);
   if(!r.ok){rows.push({sourceId:s.source_id,g:s.g,ok:false,reason:r.reason,exclusions:[...new Set(r.rejected.map(x=>x.reason))]});continue;}
   const a=r.epochs[0], b=r.epochs.at(-1), truth=[a,b].map(e=>propagate(target.ra,target.dec,...target.pm,catalog.query.epoch_mjd,e.mjd,plx));
   if(truth.some(p=>!p))throw new Error('Unavailable catalogue propagation');
   const expected=[deltaRA(truth[1][0],truth[0][0])*Math.cos(target.dec*Math.PI/180)*3600,(truth[1][1]-truth[0][1])*3600];
   const raw=r.positions.map(p=>{
    const f=frames.find(f=>f.meta.obsid===p.obsid), pred=propagate(target.ra,target.dec,...target.pm,catalog.query.epoch_mjd,f.meta.mjdAvg);
    const m=measure(f,...pred);if(!m.centroid)throw new Error('Accepted measurement lost its centroid');
    return {mjd:p.mjd,east:deltaRA(m.centroid.ra,target.ra)*Math.cos(target.dec*Math.PI/180)*3600,north:(m.centroid.dec-target.dec)*3600};
   });
   const rawVisits=[];
   for(const p of raw){const g=rawVisits.at(-1);if(g&&p.mjd-g[0].mjd<=1)g.push(p);else rawVisits.push([p]);}
   const endpoint=axis=>median(rawVisits.at(-1).map(p=>p[axis]))-median(rawVisits[0].map(p=>p[axis]));
   const rawVector=[endpoint('east'),endpoint('north')], correctedVector=[b.east-a.east,b.north-a.north];
   const residual=v=>Math.hypot(v[0]-expected[0],v[1]-expected[1]);
   rows.push({sourceId:s.source_id,g:s.g,ok:true,visits:r.epochs.length,baselineDays:round(r.baselineDays),expected:expected.map(round),rawVector:rawVector.map(round),correctedVector:correctedVector.map(round),rawResidual:round(residual(rawVector)),correctedResidual:round(residual(correctedVector)),errorScale:round(r.shiftError),minReferences:Math.min(...r.positions.map(p=>p.references.length)),exposures:r.positions.map(p=>p.obsid)});
  }
  fields.push({slug,eligible:candidates.length,summary:summarize(rows),rows});progress(slug,fields.at(-1).summary);
 }
 return {schema:'cosmos-motion-benchmark-v1',protocol,inputs,fields,summary:summarize(fields.flatMap(f=>f.rows))};
}
if(require.main===module){const report=runBenchmark((slug,s)=>console.log(slug,JSON.stringify(s)));console.log('TOTAL',JSON.stringify(report.summary));if(process.argv.includes('--write'))fs.writeFileSync(path.join(ROOT,'web/public/data/motion-benchmark.json'),JSON.stringify(report,null,2)+'\n');}
module.exports={runBenchmark,summarize};
