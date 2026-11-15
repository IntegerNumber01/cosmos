// Prepare exactly the independently selected follow-up exposures using the public IBE parser.
// This is explicitly a selected sample, with no claim to be an exhaustive observation inventory.
require('./register-ts.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fetchCutout,unpack}=require('../src/lib/engine/cutout.ts');
const {TT_BY_SLUG}=require('../src/lib/ttTargets.ts');
const {CACHE_SCHEMA,ENGINE_VERSION,RELEASE}=require('../src/lib/engine/releases.ts');
const root=path.resolve(__dirname,'../..');
async function main(){
  for(const [slug,field,followup] of [['gy152','l1688','gy152'],['gpmon','ngc2264','gpmon']]){
    const t=TT_BY_SLUG[slug], input=JSON.parse(fs.readFileSync(path.join(root,`data/raw/discovery/${field}/followup_${followup}.json`),'utf8'));
    const dir=path.join(root,`web/public/cache/${slug}`);fs.mkdirSync(path.join(dir,'frames'),{recursive:true});
    const observations=[],files=[],failures=[];
    // Sequential downloads keep archive load modest and make failures explicit.
    for(const r of input.selected){
      const filename=`${r.obsid}D${r.det}_0.1.bin`,dest=path.join(dir,'frames',filename);
      try{
        let bytes;
        if(fs.existsSync(dest))bytes=fs.readFileSync(dest);
        else{bytes=Buffer.from(await fetchCutout(r.url,t.ra,t.dec,0.1));fs.writeFileSync(dest,bytes);}
        const m=unpack(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)).meta;
        if(m.sourceFits!==r.url||Math.abs(m.target.ra-t.ra)>1e-8||Math.abs(m.target.dec-t.dec)>1e-8)throw Error('Incorrect provenance');
        observations.push({obsid:m.obsid,detector:m.detector,url:m.sourceFits,mjd:m.mjdAvg,date:m.dateAvg,exptime:m.exposure,inside:true,wl:m.target.wl,bw:m.target.bw});
        files.push({file:`frames/${filename}`,source:m.sourceFits,cutout:m.cutoutUrl,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
        console.log(slug,filename,m.target.wl);
      }catch(e){failures.push({obsid:r.obsid,detector:r.det,error:String(e)});console.log('FAILED',slug,r.obsid,String(e));}
    }
    const sample='Selected DR1 follow-up sample at two wavelength windows. This is not a complete exposure inventory. Check the archive for full coverage.';
    const common={target:{ra:t.ra,dec:t.dec},schema:CACHE_SCHEMA,engine:ENGINE_VERSION,release:RELEASE.id,fieldSize:0.1,queried:new Date().toISOString(),sample};
    fs.writeFileSync(path.join(dir,'observations.json'),JSON.stringify({...common,source:'DR1 SIA centre-covering inventory + candidate-local FITS wavelengths',frames:observations.sort((a,b)=>a.mjd-b.mjd)},null,2));
    fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({...common,complete:files.length===input.selected.length,requested:input.selected.length,frames:files,failures},null,2));
    if(failures.length)process.exitCode=1;
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
