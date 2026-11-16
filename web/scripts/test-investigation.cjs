require('./register-ts.cjs');
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {loadFeaturedMotion}=require('../src/lib/featuredMotion.ts');
const {scoreReasoning,REASONING_QUESTIONS}=require('../src/lib/learningCheck.ts');
const {TRANSFER_CASE,evaluateLabCase}=require('../src/lib/learningLab.ts');
const {decodeFrame}=require('../src/lib/engine/sequence.ts');
const {auditEvidence}=require('../src/lib/evidenceAudit.ts');
const ROOT=path.resolve(__dirname,'../..'), PUB=path.join(ROOT,'web/public');

test('one-click evidence audit reproduces motion, brightening, steady and refused controls from verified native inputs',async()=>{
 const calls=[];
 const read=async file=>{calls.push(file);assert.match(file,/^\/cache\/(epsindib|rwaur|gpmon)\//);return new Response(fs.readFileSync(path.join(PUB,file)));};
 const report=await auditEvidence(new AbortController().signal,read);
 assert.equal(report.cases.length,5);assert(Math.abs(report.cases.find(c=>c.id==='motion').value-4.79)<.02);
 assert(report.cases.find(c=>c.id==='rwaur').value>50);assert(report.cases.find(c=>c.id==='gpmon').value>100);
 assert.match(report.cases.find(c=>c.id==='epsindib').outcome,/No significant/);
 assert.equal(report.cases.find(c=>c.id==='blend').value,null);assert.match(report.cases.find(c=>c.id==='blend').outcome,/Refused/);
 assert.equal(new Set(calls).size,calls.length,'Shared files are verified once');
 assert(report.inputs.filter(i=>i.originalFits).every(i=>i.manifestMatch&&i.date&&Number.isFinite(i.wavelengthMicrons)));
 assert(report.cases.every(c=>c.files.every(file=>report.inputs.some(i=>i.file===file&&i.manifestMatch))));
 assert(report.inputs.some(i=>i.file.endsWith('motion_analysis.json')&&!i.manifestMatch));
 assert(report.limits.some(s=>s.includes('not independent scientific replication')));
});

test('evidence audit refuses a changed science byte, wrong observation identity, incompatible manifest and missing input',async()=>{
 const read=async file=>fs.readFileSync(path.join(PUB,file));
 for(const variant of ['byte','identity','release','unavailable']){
  const fetcher=async file=>{
   const b=Buffer.from(await read(file));
   if(variant==='unavailable'&&file.endsWith('calib_stars.json'))return new Response('',{status:503});
   if(variant==='byte'&&file.endsWith('.bin'))b[b.length-1]^=1;
   if(file.endsWith('calibration_manifest.json')&&['identity','release'].includes(variant)){
    const m=JSON.parse(b);if(variant==='release')m.release='qr3';else for(const f of m.frames)f.source=f.source.replace('level2_','level2_wrong_');
    return Response.json(m);
   }
   return new Response(b);
  };
  await assert.rejects(auditEvidence(new AbortController().signal,fetcher),variant==='byte'?/Checksum mismatch/:variant==='identity'?/identity mismatch/:variant==='release'?/Incompatible/:/unavailable/);
 }
});
test('homepage computes real motion rather than trusting the stored preflight answer; failed data stays failed',async t=>{
 const original=global.fetch;t.after(()=>global.fetch=original);const calls=[];
 global.fetch=async url=>{calls.push(url);assert.match(url,/^\/cache\/epsindib\//);const b=fs.readFileSync(path.join(PUB,url));if(url.endsWith('motion_analysis.json')){const j=JSON.parse(b);for(const s of j.selections)s.result={ok:true,shift:999,shiftError:.0001};return Response.json(j);}return new Response(b);};
 const r=await loadFeaturedMotion(new AbortController().signal);assert.equal(r.result.epochs.length,5);assert(Math.abs(r.result.shift-4.79)<.02);assert(r.result.shiftError>.5);assert(r.frames.length>=5);assert(calls.length>=7);
 global.fetch=async()=>new Response('',{status:503});await assert.rejects(loadFeaturedMotion(new AbortController().signal),/could not be loaded/);
});
test('the new-case exercise agrees with independent GP Mon photometry and preserves its original sources',()=>{
 const c=TRANSFER_CASE,frames=c.keys.map(k=>{const b=fs.readFileSync(path.join(PUB,`cache/${c.slug}/frames/${k}_0.2.bin`));return decodeFrame(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));});
 const field=JSON.parse(fs.readFileSync(path.join(PUB,`cache/${c.slug}/calib_stars.json`),'utf8')),r=evaluateLabCase(c.id,frames,field);
 assert(r.calibration.ok);assert.equal(r.interpretation,'supported');assert(Math.abs(r.calibration.last.dmag-(-2.5*Math.log10(2.299)))<2*Math.hypot(.076,r.calibration.last.dmagErr));assert.equal(r.calibration.nRefs,5);assert(r.comparisonUrl.includes('target=gpmon'));assert(r.frames.every(f=>f.meta.sourceFits.includes('/spherex/dr1/')));
});
test('reasoning feedback refuses incomplete or invalid choices and does not grade free text as correct',()=>{
 const choices=REASONING_QUESTIONS.map(q=>q.correct),response={choices,reason:'A result with its uncertainty and a follow-up.',startedAt:'2026-11-15'};
 assert.equal(scoreReasoning({...response,reason:'   '}),null);assert.equal(scoreReasoning({...response,choices:[...choices,null]}),null);assert.equal(scoreReasoning({...response,choices:[null,...choices.slice(1)]}),null);assert.equal(scoreReasoning({...response,choices:[99,...choices.slice(1)]}),null);
 assert.equal(scoreReasoning(response).correct,4);assert.equal(scoreReasoning({...response,choices:choices.map((v,i)=>i===0?1:v)}).correct,3);assert.match(scoreReasoning(response).note,/human review/);assert.deepEqual(response.choices,choices);
});
test('published benchmark identifies its actual inputs and retains every accepted and refused case',()=>{
 const report=JSON.parse(fs.readFileSync(path.join(PUB,'data/motion-benchmark.json'),'utf8'));
 assert.equal(report.fields.length,8);assert.equal(report.protocol.frozenAgainstCommit,'e55bdd3');
 for(const input of report.inputs){const bytes=fs.readFileSync(path.join(ROOT,input.file));assert.equal(createHash('sha256').update(input.hashMode==='utf8-lf'?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes).digest('hex'),input.sha256,`Stale benchmark input: ${input.file}`);}
 const rows=report.fields.flatMap(f=>f.rows),accepted=rows.filter(r=>r.ok);assert.equal(rows.length,report.summary.selected);assert.equal(accepted.length,report.summary.accepted);assert.equal(rows.filter(r=>!r.ok).length,report.summary.refused);
 assert.equal(accepted.filter(r=>r.correctedResidual<r.rawResidual-1e-6).length,report.summary.improved);assert.equal(accepted.filter(r=>r.correctedResidual>r.rawResidual+1e-6).length,report.summary.worsened);
 assert(rows.filter(r=>!r.ok).every(r=>r.reason&&Array.isArray(r.exclusions)));assert(accepted.every(r=>r.expected.length===2&&r.minReferences>=3&&r.errorScale>0));assert(report.summary.worsened>0,'Do not hide cases the correction makes worse');
});
