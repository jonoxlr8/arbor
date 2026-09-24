"use client";
import {useEffect,useState} from "react";
import {readNextAction,type NextAction} from "@/lib/nextAction";

export function NextActionContent({action,onAction}:{action:NextAction;onAction:(destination:NextAction["destination"], action:NextAction)=>void}) {
  return <section className="arbor-panel mb-5" aria-label="What should I do next?" data-action-key={action.key}>
    <p className="text-sm font-medium text-slate-600">What should I do next?</p>
    <h2 className="mt-2 text-xl font-semibold text-slate-900">{action.title}</h2>
    <p className="mt-3 text-sm leading-6 text-slate-600">{action.explanation}</p>
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
  return <section className="arbor-panel mb-5" aria-label="What should I do next?">
    {error ? <><p role="alert" className="text-sm text-slate-700">{error}</p><button className="entry-secondary mt-3" onClick={()=>{setError("");setRetry(retry+1);}}>Retry</button></> : <p role="status" className="text-sm text-slate-600">Checking your next step…</p>}
  </section>;
}
