"use client";
import {useEffect,useState} from "react";
import {portfolioApi} from "@/lib/livePortfolio";
import {isAlignmentHistory,type AlignmentHistory} from "@/lib/alignmentHistory";
const names:Record<string,string>={global_equity:"Global equity",defensive:"Defensive",technology_tilt:"Technology",crypto:"Bitcoin"};
export default function AlignmentOverTime({userId}:{userId:string}) {
 const [data,setData]=useState<AlignmentHistory|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{const c=new AbortController();portfolioApi.alignmentHistory(userId,c.signal).then(d=>{
  if(!isAlignmentHistory(d))throw new Error("Invalid comparison");if(!c.signal.aborted){setData(d);setError(false);}
 }).catch(()=>{if(!c.signal.aborted)setError(true);});return()=>c.abort();},[userId,retry]);
 return <section className="alignment-over-time mt-8 text-sm text-slate-600" aria-label="Plan alignment over time">
  <h3 className="text-lg font-semibold text-slate-900">Plan alignment over time</h3>
  {error?<p role="status" className="mt-2">Comparison unavailable. <button className="entry-link min-h-11" onClick={()=>{setError(false);setData(null);setRetry(v=>v+1);}}>Refresh comparison</button></p>:!data?<p className="mt-2" role="status">Loading recorded comparison…</p>:<>
   <AlignmentGapComparison data={data}/>
   <details className="mt-2"><summary className="min-h-11 cursor-pointer">How this comparison works</summary>
    {data.current&&data.previous&&<p className="mt-2">{data.previous.date}: {data.previous.gap_pp} percentage points away · {data.current.date}: {data.current.gap_pp} percentage points away. A smaller gap means closer to the chosen targets.</p>}
    {!!data.drivers.length&&<ul className="mt-2">{data.drivers.map(d=><li key={d.sleeve}>{names[d.sleeve]} gap: {Math.abs(Number(d.change_pp)).toFixed(2)} percentage points {Number(d.change_pp)>0?"smaller":"larger"}.</li>)}</ul>}
    <p className="mt-2">{data.detail}</p><p className="mt-2">Based on recorded observations, using the Philippine calendar. This is a comparison, not an instruction to trade.</p>
   </details>
  </>}
 </section>;
}

export function AlignmentGapComparison({data}:{data:AlignmentHistory}) {
 if(data.status === "unavailable" || !data.previous || !data.current) return <p className="mt-2 font-semibold text-slate-900">{data.message}</p>;
 return <><p className="alignment-gap-subtitle">Gap from your plan · lower is better</p>
  <div className="alignment-gap-comparison" aria-label="Allocation gap comparison">
   {[{label:"Last month",point:data.previous},{label:"Now",point:data.current}].map(({label,point})=>{
    const gap=Number(point.gap_pp), number=Number.isInteger(gap)?String(gap):point.gap_pp;
    return <div className="alignment-gap-observation" key={label}>
     <div className="alignment-gap-heading"><div><strong>{label}</strong><time dateTime={point.date}>{point.date}</time></div><strong className={`alignment-gap-number${gap===0?" alignment-gap-zero":""}`}>{number} <span>pp<span className="sr-only"> (percentage points)</span></span></strong></div>
     <div className="alignment-gap-track" aria-hidden="true"><span className="alignment-gap-fill" style={{width:`${gap}%`}}/>{gap===0&&<span className="alignment-gap-zero-marker"/>}</div>
    </div>;
   })}
   <div className="alignment-gap-scale"><span>0 pp · at your targets</span><span>100 pp</span></div>
  </div><p className="alignment-gap-takeaway">{data.message}</p></>;
}
