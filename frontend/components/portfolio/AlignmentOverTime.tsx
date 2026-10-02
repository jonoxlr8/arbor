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
 return <section className="mt-8 text-sm text-slate-600" aria-label="Plan alignment over time">
  <h3 className="text-lg font-semibold text-slate-900">Plan alignment over time</h3>
  {error?<p role="status" className="mt-2">Comparison unavailable. <button className="entry-link min-h-11" onClick={()=>{setError(false);setData(null);setRetry(v=>v+1);}}>Refresh comparison</button></p>:!data?<p className="mt-2" role="status">Loading recorded comparison…</p>:<>
   <p className="mt-2 font-semibold text-slate-900">{data.message}</p>
   <details className="mt-2"><summary className="min-h-11 cursor-pointer">How this comparison works</summary>
    {data.current&&data.previous&&<p className="mt-2">{data.previous.date}: {data.previous.gap_pp} percentage points away · {data.current.date}: {data.current.gap_pp} percentage points away. A smaller gap means closer to the chosen targets.</p>}
    {!!data.drivers.length&&<ul className="mt-2">{data.drivers.map(d=><li key={d.sleeve}>{names[d.sleeve]} gap: {Math.abs(Number(d.change_pp)).toFixed(2)} percentage points {Number(d.change_pp)>0?"smaller":"larger"}.</li>)}</ul>}
    <p className="mt-2">{data.detail}</p><p className="mt-2">Based on recorded observations, using the Philippine calendar. This is a comparison, not an instruction to trade.</p>
   </details>
  </>}
 </section>;
}
