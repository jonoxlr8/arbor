"use client";
import {useEffect,useState} from "react";
import {readNextAction,type NextAction} from "@/lib/nextAction";

export function NextActionContent({action,onAction}:{action:NextAction;onAction:(destination:NextAction["destination"], action:NextAction)=>void}) {
  const explanation = action.key === "monthly_complete" ? "You’ve recorded your contribution. Your portfolio is tracked separately."
    : action.key === "review_monthly_contribution" && action.destination === "portfolio" ? (action.title.endsWith("check-in") ? "Review your monthly contribution and record it after you invest." : "Explore how a contribution fits the plan you chose.")
    : action.explanation.replace(/contribution scenarios?/gi, "monthly contribution").replace(/scenarios/gi, "previews");
  return <section className="next-action-hero" aria-label="What should I do next?" data-action-key={action.key}>
    <svg className="hero-landscape" aria-hidden="true" viewBox="0 0 450 230" preserveAspectRatio="xMaxYMax slice"><circle cx="342" cy="59" r="39" fill="#fff2cf"/><path d="M0 219 111 98 182 148 267 74 450 184V230H0Z" fill="#a8bfd6"/><path d="m101 110 10-12 21 15-17-4-8 8Z" fill="#e4ebf3"/><path d="m243 99 24-25 37 38-31-15-12 6Z" fill="#e8eff4"/><path d="M0 230 169 155 245 176 335 104 450 154V230Z" fill="#6caaa2"/><path d="M91 230 257 160 345 186 450 129V230Z" fill="#388479"/><path d="M185 230 353 184 450 210V230Z" fill="#14594c"/></svg>
    <span className="hero-mark" aria-hidden="true">{action.key === "monthly_complete" ? "✓" : "↗"}</span>
    <p className="eyebrow">Your next step</p>
    <h2 className="mt-2 text-2xl font-semibold text-slate-900">{action.title}</h2>
    <p className="mt-3 text-sm leading-6 text-slate-600">{explanation}</p>
    <button type="button" className="entry-primary mt-4 min-h-11 whitespace-normal" onClick={()=>onAction(action.destination,action)}>{action.button_label}</button>
  </section>;
}
export default function NextActionCard({userId,onAction}:{userId:string;onAction:(destination:NextAction["destination"], action:NextAction)=>void}) {
  const [action,setAction]=useState<NextAction|null>(null),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let month=new Date().toISOString().slice(0,7);
    const refresh=()=>{setAction(null);setError("");setRetry(n=>n+1);};
    const visible=()=>{if(document.visibilityState==="visible")refresh();};
    const timer=setInterval(()=>{const next=new Date().toISOString().slice(0,7);if(next!==month){month=next;refresh();}},60000);
    window.addEventListener("arbor-monthly-changed",refresh);document.addEventListener("visibilitychange",visible);
    return()=>{clearInterval(timer);window.removeEventListener("arbor-monthly-changed",refresh);document.removeEventListener("visibilitychange",visible);};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    readNextAction(userId,controller.signal).then(value=>{if(!controller.signal.aborted)setAction(value);}).catch(error=>{
      if(!controller.signal.aborted)setError(error instanceof Error ? error.message : "Please retry.");
    });
    return()=>controller.abort();
  },[userId,retry]);
  if(action)return <NextActionContent action={action} onAction={onAction}/>;
  return <section className="next-action-hero" aria-label="What should I do next?">
    {error ? <><p role="alert" className="text-sm text-slate-700">{error}</p><button className="entry-secondary mt-3" onClick={()=>{setError("");setRetry(retry+1);}}>Retry</button></> : <div role="status" className="arbor-skeleton"><span className="sr-only">Checking your next step…</span><i/><i/><i/></div>}
  </section>;
}
