require('./register-ts.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { decodeFrame } = require('../src/lib/engine/sequence.ts');
const { analyseMotion } = require('../src/lib/engine/motion.ts');
const { TT_BY_SLUG } = require('../src/lib/ttTargets.ts');
for (const slug of ['epsindib','rwaur']) {
  const dir = path.resolve(__dirname, `../public/cache/${slug}`);
  const cat = JSON.parse(fs.readFileSync(path.join(dir, 'calib_stars.json')));
  const frames = fs.readdirSync(path.join(dir,'frames')).filter(f=>f.endsWith('_0.2.bin')).map(f=>{
    const b=fs.readFileSync(path.join(dir,'frames',f));return decodeFrame(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
  });
  const t=TT_BY_SLUG[slug];
  const plx={epsindib:270.658032,barnard:546.97594,wise0855:439,rwaur:6.406249}[slug];
  for (const det of [slug==='epsindib'?2:1]) {
    const ref=frames.find(f=>f.meta.obsid===(slug==='epsindib'?'2025W17_4B_0027_3':'2025W36_1A_0233_2')&&f.meta.detector===det);
    const ff=frames.filter(f=>f.meta.detector===det&&Math.abs(f.meta.target.wl-ref.meta.target.wl)<ref.meta.target.bw*0.5);
    const r=analyseMotion(ff,{ra:t.ra,dec:t.dec,pm:t.pm,epochYear:2025.9,parallaxMas:plx,parallaxSource:'Prepared validation catalogue'},cat.stars,cat.query.epoch_mjd);
    console.log(JSON.stringify({slug,det,ok:r.ok,reason:r.reason,epochs:r.epochs?.length,east:r.east,north:r.north,shift:r.shift,error:r.shiftError,controls:r.controls,rejected:r.rejected}));
  }
}
