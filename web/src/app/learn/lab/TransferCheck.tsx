"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadLabCase, type LabResult } from "@/lib/learningLab";
import { REASONING_QUESTIONS, scoreReasoning, type ReasoningResponse } from "@/lib/learningCheck";
import TargetCloseup from "@/components/timetravel/TargetCloseup";
import { makeGrid, reproject, skyLevel } from "@/lib/engine/sequence";

export default function TransferCheck() {
  const [open,setOpen] = useState(false), [data,setData] = useState<LabResult|null>(null), [error,setError]=useState("");
  const [response,setResponse] = useState<ReasoningResponse|null>(null), [status,setStatus]=useState("");
  const [attempt,setAttempt] = useState(0);
  const [ready,setReady] = useState(false);
  useEffect(()=>setReady(true),[]);
  useEffect(()=>{
    if(!open) return;
    const c=new AbortController(); setError("");
    loadLabCase("gpmon",c.signal).then(setData).catch(e=>{if(!c.signal.aborted)setError(String(e.message??e));});
    return ()=>c.abort();
  },[open,attempt]);
  const start=()=>{setOpen(true);setResponse({choices:REASONING_QUESTIONS.map(()=>null),reason:"",startedAt:new Date().toISOString()});};
  const score=response?scoreReasoning(response):null, submitted=!!response?.submittedAt;
  const display=useMemo(()=>{
    if(!data)return null;
    const grid=makeGrid(...data.positions[0],.04),grids=data.frames.map(f=>reproject(f,grid,skyLevel(f).level));
    const values=grids.flatMap(g=>Array.from(g).filter(Number.isFinite)).sort((a,b)=>a-b);
    return {grid,grids,lo:Math.min(0,values[Math.floor(values.length*.02)]??0),hi:Math.max(1,values[Math.floor(values.length*.99)]??1)};
  },[data]);
  const download=(format:"json"|"text"="json")=>{
    if(!data||!response||!submitted) return;
    const report={schema:"cosmos-reasoning-check-v1",exportedAt:new Date().toISOString(),response,score,questions:REASONING_QUESTIONS,measurement:{calibration:data.calibration,sourceFits:data.frames.map(f=>f.meta.sourceFits),dates:data.frames.map(f=>f.meta.dateAvg),wavelengths:data.measurements.map(m=>m.wl),comparisonUrl:new URL(data.comparisonUrl,location.origin).href},facilitatorReview:["Does the reason use the measured change and its uncertainty?","Does it distinguish a measurement from a prediction?","Does it name an alternative explanation or a failed check?","Does it propose an independent observation?"],limits:"A formative activity on a selected real-data example. The score covers closed choices only. No independent learner study or educational gain is established. Answers are downloaded locally, not sent to a server."};
    const text=["COSMOS — MY EVIDENCE HANDOFF","GP Mon · real SPHEREx DR1 observations",`Dates: ${report.measurement.dates.join(" → ")}`,data.calibration.ok?`Brightness difference: +${data.calibration.changePct.toFixed(1)}% ± ${data.calibration.changePctErr.toFixed(1)}%; ${data.calibration.nRefs} reference stars.`:"Measurement refused.","","MY INITIAL DECISIONS",...REASONING_QUESTIONS.flatMap((q,i)=>[`${i+1}. ${q.prompt}`,`My answer: ${q.options[response.choices[i]!]}`,`Check: ${score!.items[i].correct?"agrees":"revisit"}. ${q.explanation}`,""]),"MY EXPLANATION",response.reason,"","QUESTIONS FOR A HUMAN REVIEWER",...report.facilitatorReview.map(q=>`- ${q}`),"","REOPEN THE INVESTIGATION",report.measurement.comparisonUrl,"","ORIGINAL OBSERVATIONS",...report.measurement.sourceFits,"","WHAT THIS RECORD SHOWS",report.limits].join("\n");
    const url=URL.createObjectURL(new Blob([format==="text"?text:JSON.stringify(report,null,2)],{type:format==="text"?"text/plain;charset=utf-8":"application/json"}));const a=document.createElement("a");a.href=url;a.download=`cosmos-reasoning-check.${format==="text"?"txt":"json"}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus("Your reasoning record and original-data links were downloaded.");
  };
  return <section aria-label="Apply your reasoning" id="reasoning-check" className="mt-6 scroll-mt-24 rounded-2xl border border-line bg-surface p-5 sm:p-6">
    <div className="label">A new case · try before reading the answers</div><h2 className="font-display mt-2 text-[27px] font-semibold">Can you make the case yourself?</h2>
    <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted">Apply the same checks to GP Mon, a different known star system. Keep your initial choices and explain what a reviewer should believe. This is practice, with a transparent answer key.</p>
    {!open?<button type="button" disabled={!ready} className="btn btn-primary mt-4" onClick={start}>Try the new investigation</button>:<>
      {!data&&!error&&<p role="status" className="mt-4">Calculating a new real-image pair…</p>}
      {error&&<div role="alert" className="mt-4"><p>{error}</p><button type="button" className="btn mt-2" onClick={()=>setAttempt(n=>n+1)}>Retry GP Mon</button></div>}
      {data&&response&&<>
        <section className="my-5 rounded-xl bg-surface-2 p-4" aria-label="New-case measurements"><p className="font-semibold">GP Mon · {data.frames[0].meta.dateAvg.slice(0,10)} → {data.frames[1].meta.dateAvg.slice(0,10)}</p>
          {data.calibration.ok?<><p className="mt-2 text-[24px] font-semibold">+{data.calibration.changePct.toFixed(0)}% ± {data.calibration.changePctErr.toFixed(0)}%</p><p className="mt-1 text-[13px] text-muted">Brightness difference at {data.measurements[0].wl.toFixed(3)} / {data.measurements[1].wl.toFixed(3)} µm, checked against {data.calibration.nRefs} reference stars. An unresolved star system; the physical cause is not established.</p></>:<p role="alert">The current checks refuse this measurement: {data.calibration.reason}. The prepared exercise is unavailable; no answer is scored.</p>}
        </section>
        {display&&<details className="mb-5 text-[13px]"><summary className="cursor-pointer font-semibold">Inspect the two original images before deciding</summary><TargetCloseup frames={data.frames} grids={display.grids} grid={display.grid} pair={[0,1]} ra={data.positions[0][0]} dec={data.positions[0][1]} lo={display.lo} hi={display.hi}/><Link href={data.comparisonUrl} className="link mt-3 inline-block">Check this source in the full tools →</Link></details>}
        {data.calibration.ok&&data.interpretation!=="supported"&&<p role="alert">This pair no longer meets the activity&apos;s supported-change screen. Inspect the full tools; the exercise is not scored.</p>}
        {data.calibration.ok&&data.interpretation==="supported"&&<><fieldset disabled={submitted} className="space-y-5">{REASONING_QUESTIONS.map((q,i)=><fieldset key={q.id}><legend className="text-[14px] font-semibold">{i+1}. {q.prompt}</legend>{q.options.map((o,j)=><label key={o} className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 text-[13px]"><input type="radio" name={`transfer-${q.id}`} checked={response.choices[i]===j} onChange={()=>setResponse(r=>r&&({...r,choices:r.choices.map((v,k)=>k===i?j:v)}))}/>{o}</label>)}</fieldset>)}<label className="block text-[14px] font-semibold">Write your evidence handoff: result, uncertainty, one limit and the next check.<textarea rows={4} maxLength={3000} value={response.reason} onChange={e=>setResponse(r=>r&&({...r,reason:e.target.value}))} className="field mt-2 block w-full p-3 font-normal" /></label></fieldset>
          {!submitted?<><button type="button" className="btn btn-primary mt-4" disabled={!score} onClick={()=>setResponse(r=>r&&({...r,submittedAt:new Date().toISOString()}))}>Check my reasoning</button><p className="mt-2 text-[12px] text-muted">Answer all four questions and write a reason first. Your answers are locked when you reveal the key.</p></>:<div role="region" aria-label="Reasoning feedback" className="mt-5 rounded-xl border border-line p-4" aria-live="polite"><h3 className="text-[18px] font-semibold">{score!.correct} of {score!.total} choices agree with the checks</h3><p className="mt-2 text-[13px] text-muted">This score checks your choices. A person should review your written reasoning; the app does not grade it or claim a learning gain.</p><ol className="mt-4 space-y-3">{REASONING_QUESTIONS.map((q,i)=><li key={q.id} className="text-[13px]"><strong>{score!.items[i].correct?"Agrees":"Revisit"} · {i+1}</strong><p className="mt-1 leading-relaxed text-muted">{q.explanation}</p></li>)}</ol><div className="mt-4 flex flex-wrap gap-2"><button type="button" className="btn btn-primary" onClick={()=>download("text")}>Download readable reasoning</button><button type="button" className="btn" onClick={()=>download("json")}>Download my reasoning record</button></div><Link className="link mt-3 inline-block text-[13px]" href={data.comparisonUrl}>Inspect GP Mon in the full tools →</Link>{status&&<p role="status" className="mt-3 text-[13px]">{status}</p>}</div>}
        </>}
      </>}
    </>}
  </section>;
}
