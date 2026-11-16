require('./register-ts.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { analyseMotion, fitAxis } = require('../src/lib/engine/motion.ts');
const { earthAt, parallaxOffset, propagate } = require('../src/lib/engine/astrometry.ts');
const { stackAlongTrack } = require('../src/lib/engine/tracking.ts');
const { decodeFrame, makeGrid } = require('../src/lib/engine/sequence.ts');
const { stackVisit } = require('../src/lib/engine/combine.ts');
const { sky2pix } = require('../src/lib/engine/wcs.ts');
const { TT_BY_SLUG } = require('../src/lib/ttTargets.ts');
const { getCalibrationFrame, getCalibrationStars } = require('../src/lib/engine/client.ts');
const root = path.resolve(__dirname, '../public/cache');
function frame(slug, name) { const b=fs.readFileSync(path.join(root,slug,'frames',name+'_0.2.bin')); return decodeFrame(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)); }
const field = slug => JSON.parse(fs.readFileSync(path.join(root,slug,'calib_stars.json'),'utf8'));

test('every featured exposure and its reference field load for motion with all live services unavailable', async (t) => {
  const original = global.fetch, calls = [];
  global.fetch = async url => {
    calls.push(url);
    assert.match(url, /^\/cache\//, 'featured motion must not need a live service');
    const file = path.join(root, url.slice('/cache/'.length));
    return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('', {status:404});
  };
  t.after(() => { global.fetch = original; });
  let count = 0;
  for (const target of Object.values(TT_BY_SLUG)) {
    const prepared = JSON.parse(fs.readFileSync(path.join(root,target.slug,'prepared.json'),'utf8'));
    const stars = await getCalibrationStars(target.ra,target.dec,61000,target.slug);
    assert(stars.stars.length > 0); assert.equal(stars.mjd,57388.5);
    for (const o of prepared.frames) {
      const bytes = fs.readFileSync(path.join(root,target.slug,'frames',`${o.obsid}D${o.detector}_0.1.bin`));
      const small = decodeFrame(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
      const wide = await getCalibrationFrame(small,target.slug);
      assert.equal(wide.meta.sourceFits,o.url);
      assert.equal(wide.meta.detector,small.meta.detector);
      assert(Math.abs(wide.meta.target.wl-small.meta.target.wl)<1e-10);
      // All overlapping native pixels must be identical to the independent saved IBE cutout.
      const dx = Math.round(wide.meta.wcs.crpix[0]-small.meta.wcs.crpix[0]);
      const dy = Math.round(wide.meta.wcs.crpix[1]-small.meta.wcs.crpix[1]);
      let overlap = 0;
      for (let y=0;y<small.meta.ny;y++) for (let x=0;x<small.meta.nx;x++) {
        const wx=x+dx, wy=y+dy;
        if(wx<0||wy<0||wx>=wide.meta.nx||wy>=wide.meta.ny) continue;
        const a=y*small.meta.nx+x,b=wy*wide.meta.nx+wx;
        assert(Object.is(small.image[a],wide.image[b]),`${target.slug} IMAGE`);
        assert.equal(small.flags[a],wide.flags[b],`${target.slug} FLAGS`);
        assert(Object.is(small.variance[a],wide.variance[b]),`${target.slug} VARIANCE`);
        overlap++;
      }
      assert(overlap>500); count++;
    }
  }
  assert.equal(count,130); assert(calls.length>=138);
});
function epsFrames() { const ref=frame('epsindib','2025W17_4B_0027_3D2'); return fs.readdirSync(path.join(root,'epsindib/frames')).filter(f=>f.endsWith('D2_0.2.bin')).map(f=>frame('epsindib',f.replace('_0.2.bin',''))).filter(f=>Math.abs(f.meta.target.wl-ref.meta.target.wl)<ref.meta.target.bw*.5); }

test('saved motion preflights match current native images, catalogs and all offered selections', () => {
  const { analyseTarget } = require('./preflight-motion.cjs');
  const { createHash } = require('node:crypto');
  let total = 0;
  for (const target of Object.values(TT_BY_SLUG)) {
    const saved = JSON.parse(fs.readFileSync(path.join(root,target.slug,'motion_analysis.json'),'utf8'));
    assert.deepEqual(saved,analyseTarget(target),`${target.slug}: stale preflight`);
    const manifest = JSON.parse(fs.readFileSync(path.join(root,target.slug,'calibration_manifest.json'),'utf8'));
    assert(manifest.complete); assert.equal(manifest.requested,manifest.frames.length);
    for (const entry of [manifest.catalog,...manifest.frames]) {
      const bytes = fs.readFileSync(path.join(root,target.slug,entry.file));
      assert.equal(entry.sha256,createHash('sha256').update(bytes).digest('hex'));
    }
    total += saved.selections.length;
  }
  assert.equal(total,40);
});

test('Earth interpolation agrees with independent off-grid Astropy positions; no extrapolation', () => {
  for(const row of require('./fixtures/earth-barycentric.json').checks) { const xyz=earthAt(row.mjd); assert(xyz); assert(Math.hypot(...xyz.map((x,i)=>x-row.xyz[i]))<0.0007); }
  assert.equal(earthAt(40000),null); assert.equal(earthAt(NaN),null);
  assert.equal(parallaxOffset(0,0,40000,100),null);
  // At RA=0, Dec=0 the east/north parallax is simply -Y and -Z, in parallax units.
  const p=earthAt(61000), d=parallaxOffset(0,0,61000,1000); assert(Math.abs(d[0]+p[1])<1e-10); assert(Math.abs(d[1]+p[2])<1e-10);
});

test('real Epsilon Indi B motion agrees with the independent catalogue and preserves rejected frames', () => {
  const c=field('epsindib'), t=TT_BY_SLUG.epsindib;
  const r=analyseMotion(epsFrames(),{ra:t.ra,dec:t.dec,pm:t.pm,epochYear:2025.9,parallaxMas:t.parallaxMas},c.stars,c.query.epoch_mjd);
  assert(r.ok); assert(r.epochs.length>=3); assert(r.shift>4&&r.shift<5.5); assert(Math.abs(r.shift-4.7)<2*r.shiftError);
  for(const [fit,expected] of [[r.east,3.982],[r.north,-2.4668]]) { assert(fit); assert(Math.abs(fit.rate-expected)<2*fit.error); assert(fit.error>.1); }
  assert(r.controls.length>=3); assert(r.rejected.some(x=>/flagged/.test(x.reason)));
  assert(r.positions.every(p=>p.references.length>=3));
});

test('real positional control stays steady; a two-visit result is never called a rate fit', () => {
  const c=field('rwaur'), t=TT_BY_SLUG.rwaur;
  const frames=['2025W36_1A_0233_2D1','2026W10_2B_0591_3D1'].map(k=>frame('rwaur',k));
  const r=analyseMotion(frames,{ra:t.ra,dec:t.dec},c.stars,c.query.epoch_mjd);
  assert(r.ok); assert(r.shift<2*r.shiftError); assert.equal(r.east,null); assert.equal(r.north,null); assert.equal(r.parallaxMas,null);
});

test('motion refuses missing references and flagged targets; duplicate exposures do not add visits', () => {
  const c=field('epsindib'), t=TT_BY_SLUG.epsindib, frames=epsFrames();
  assert.equal(analyseMotion(frames,t,[],c.query.epoch_mjd).ok,false);
  const f=frame('epsindib','2025W17_4B_0027_3D2'); f.valid.fill(0);
  assert.equal(analyseMotion([f,f],t,c.stars,c.query.epoch_mjd).ok,false);
  const r=analyseMotion([frames[0],frames[0]],{...t,epochYear:2025.9},c.stars,c.query.epoch_mjd); assert.equal(r.ok,false);
});

test('an additional real GP Mon field does not produce a significant positional change', () => {
  const c=field('gpmon'), t=TT_BY_SLUG.gpmon;
  const frames=['2025W40_1A_0132_1D2','2025W46_1A_0377_1D2'].map(k=>frame('gpmon',k));
  const r=analyseMotion(frames,t,c.stars,c.query.epoch_mjd);
  assert(r.ok); assert(r.shift<2*r.shiftError); assert.equal(r.east,null); assert.equal(r.north,null);
});

test('motion errors inflate for a bad straight-line fit and never invent a two-point fit', () => {
  assert.equal(fitAxis([{t:0,value:0,error:.1},{t:1,value:1,error:.1}]),null);
  const a=fitAxis([0,1,2,3].map(t=>({t,value:2*t,error:.1}))), b=fitAxis([0,1,2,3].map(t=>({t,value:2*t+(t===2?2:0),error:.1})));
  assert(a&&b&&b.error>a.error*2);
});

test('tracking a planted mover concentrates its light without modifying inputs or counting duplicates', () => {
  const template=frame('epsindib','2025W17_4B_0027_3D2'), mjd=template.meta.mjdAvg;
  const target={ra:template.meta.target.ra,dec:template.meta.target.dec,pm:[30000,-15000],epochYear:2000+(mjd-51544.5)/365.25};
  const frames=[0,.5,1].map((yr,j)=>{
    const f={...template,meta:{...template.meta,obsid:'synthetic-labelled-'+j,mjdAvg:mjd+yr*365.25},image:new Float32Array(template.image.length),valid:new Uint8Array(template.valid.length).fill(1)};
    const p=propagate(target.ra,target.dec,...target.pm,mjd,f.meta.mjdAvg),[x,y]=sky2pix(f.meta.wcs,...p);
    for(let k=0;k<f.image.length;k++){const i=k%f.meta.nx,l=Math.floor(k/f.meta.nx);f.image[k]=.01*Math.sin(k*1.7)+10*Math.exp(-((i-x)**2+(l-y)**2)/2);}
    return f;
  });
  const before=frames.map(f=>Buffer.from(f.image.buffer).toString('base64')),g=makeGrid(target.ra,target.dec,.1),tracked=stackAlongTrack(frames,g,target),sky=stackVisit(frames,g);
  const peak=im=>{let m=0;for(let j=26;j<33;j++)for(let i=26;i<33;i++)if(Number.isFinite(im[j*g.n+i]))m=Math.max(m,im[j*g.n+i]);return m;};
  assert(peak(tracked.data)>peak(sky.data)*1.3);
  assert.deepEqual(frames.map(f=>Buffer.from(f.image.buffer).toString('base64')),before);
  assert.equal(stackAlongTrack([...frames,frames[0]],g,target).frames,3);
  assert.throws(()=>stackAlongTrack(frames,g,{ra:target.ra,dec:target.dec}),/Specify/);
  // Same image geometry but incompatible spectral WCS: actual sampled wavelengths must be rechecked.
  const mismatch=frames.map((f,i)=>({...f,meta:{...f.meta,crpixW:[f.meta.crpixW[0],f.meta.crpixW[1]+i*100]}}));
  const masked=stackAlongTrack(mismatch,g,target);assert.equal(masked.count[Math.floor(g.n/2)*g.n+Math.floor(g.n/2)],0);
});
