"use client";
import { useEffect, useRef, useState } from "react";
import { monthlyApi, monthLabel, checkinDate, type MonthlyState } from "@/lib/monthlyCheckin";
import { formatContributionMoney } from "@/lib/contributions";
import type { PlanV2 } from "@/lib/types/planV2";
import { useAccountAccess } from "./AccountAccess";

export function MonthlyCheckin({value,userId,scenarioAmount}:{value:PlanV2;userId:string;scenarioAmount?:string}) {
  const access=useAccountAccess();
  const allowed=access?.value?.availability?.monthly_checkin === true && access.value.features.includes("monthly_contribution_planner") && value.plan.path==="long_term" && value.plan.plan_basis==="user_selected" && value.plan.readiness.actionable_contribution_guidance_allowed;
  return allowed ? <MonthlyActivity key={`${JSON.stringify(value)}:${scenarioAmount ?? "review"}`} userId={userId} scenarioAmount={scenarioAmount}/> : null;
}

export function MonthlySummary({state}:{state:MonthlyState}) {
  return <div role="status"><h3 className="text-lg font-semibold">{state.current ? `You’re set for ${monthLabel(state.month)}` : `${monthLabel(state.month)} check-in`}</h3>
    {state.current ? <><p className="mt-2">You recorded a {formatContributionMoney(state.current.amount_php,"PHP")} contribution as invested {checkinDate(state.current.completed_at)}.</p><p className="mt-2 text-sm text-slate-600">Your portfolio is tracked separately. No holdings or trades were created by this check-in.</p></> : <p className="mt-2 text-sm text-slate-600">Review your monthly contribution. Record completion only if you invested outside Arbor. Calendar months use UTC.</p>}
  </div>;
}

function MonthlyActivity({userId,scenarioAmount}:{userId:string;scenarioAmount?:string}) {
  const [state,setState]=useState<MonthlyState|null>(null),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
  const [confirm,setConfirm]=useState<"complete"|"undo"|null>(null),[amount,setAmount]=useState(""),[busy,setBusy]=useState(false);
  const pending=useRef(false),owner=useRef<AbortController|null>(null);
  const confirmation=useRef<HTMLFormElement|null>(null);
  useEffect(()=>{if(confirm)confirmation.current?.querySelector<HTMLElement>("input,button")?.focus();},[confirm]);
  useEffect(()=>{
    let month=new Date().toISOString().slice(0,7);
    const refresh=()=>{if(!pending.current){setConfirm(null);setAttempt(n=>n+1);}};
    const visible=()=>{if(document.visibilityState==="visible")refresh();};
    const timer=setInterval(()=>{const next=new Date().toISOString().slice(0,7);if(next!==month){month=next;refresh();}},60000);
    document.addEventListener("visibilitychange",visible);
    return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();owner.current=controller;
    monthlyApi(userId,controller.signal).then(s=>{if(!controller.signal.aborted)setState(s);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>{controller.abort();owner.current?.abort();};
  },[userId,attempt]);
  async function save(){
    if(!state||!confirm||pending.current)return;
    if(confirm==="complete"&&(!/^\d+(\.\d{1,2})?$/.test(amount)||Number(amount)<=0||Number(amount)>=1e12)){setError("Enter a positive PHP amount with at most two decimal places.");return;}
    pending.current=true;setBusy(true);setError("");
    const controller=new AbortController();owner.current=controller;
    try{const next=await monthlyApi(userId,controller.signal,confirm,{month:state.month,...(confirm==="complete"?{amount_php:amount}:{})});if(!controller.signal.aborted){setState(next);setConfirm(null);window.dispatchEvent(new Event("arbor-monthly-changed"));}}
    catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Please retry.");}
    finally{pending.current=false;if(!controller.signal.aborted)setBusy(false);}
  }
  return <section className="monthly-activity" aria-label="Monthly check-in">
    {state?<><MonthlySummary state={state}/>
      {!confirm && (state.current?<button className="entry-link mt-3 min-h-11" onClick={()=>{setError("");setConfirm("undo");}}>Undo completion</button>:scenarioAmount&&<button className="entry-secondary mt-4 min-h-11" onClick={()=>{setError("");setAmount(scenarioAmount);setConfirm("complete");}}>Mark as invested</button>)}
      {confirm && <form ref={confirmation} className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();void save();}}>
        <p>{confirm==="complete"?"Arbor does not place trades or move money. Confirm only after you invest through your provider.":"Undo this month’s completion? The record will be labeled undone; your holdings will not change."}</p>
        {confirm==="complete"&&<label className="block text-sm font-medium">Amount you invested outside Arbor (PHP)<input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900" aria-describedby={error?"monthly-error":undefined}/></label>}
        <button disabled={busy} className="entry-primary min-h-11 w-full">{busy?"Saving check-in…":confirm==="complete"?"Confirm recorded as invested":"Confirm undo completion"}</button>
        <button type="button" disabled={busy} className="entry-link min-h-11" onClick={()=>setConfirm(null)}>Cancel</button>
      </form>}
      {!!state.history.length&&<details className="mt-4"><summary className="min-h-11 cursor-pointer py-3">Recent check-ins</summary><ul className="space-y-3 text-sm">{state.history.map(row=><li key={row.month}>{monthLabel(row.month)} · {formatContributionMoney(row.amount_php,"PHP")}<span className="block text-slate-600">{row.undone_at?`Completion undone ${checkinDate(row.undone_at)}`:`Recorded as invested ${checkinDate(row.completed_at)}`}</span></li>)}</ul></details>}
      {state.current&&<a href="#home" className="entry-link mt-3 inline-flex min-h-11 items-center">Return Home</a>}
    </>:!error&&<p role="status">Checking this month’s activity…</p>}
    {error&&<div><p id="monthly-error" role="alert" className="mt-3 text-sm">{error}</p><button className="entry-link min-h-11" onClick={()=>{setError("");setAttempt(n=>n+1);}}>Reload check-in</button></div>}
  </section>;
}
