"use client";
import { useEffect, useRef, useState } from "react";
import { monthlyApi, monthLabel, checkinDate, checkinAmountInput, type MonthlyState } from "@/lib/monthlyCheckin";
import { formatContributionMoney } from "@/lib/contributions";
import type { PlanV2 } from "@/lib/types/planV2";
import { useAccountAccess } from "./AccountAccess";

export function MonthlyCheckin({value,userId,scenarioAmount,onStateChange,onRecordInvestment,recordingPrimary=false}:{value:PlanV2;userId:string;scenarioAmount?:string;onStateChange?:(state:MonthlyState)=>void;onRecordInvestment?:()=>void;recordingPrimary?:boolean}) {
  const access=useAccountAccess();
  const allowed=access?.value?.availability?.monthly_checkin === true && access.value.features.includes("monthly_contribution_planner") && value.plan.path==="long_term" && value.plan.plan_basis==="user_selected" && value.plan.readiness.actionable_contribution_guidance_allowed;
  const plannerAllowed=access?.value?.features.includes("monthly_contribution_planner") && value.plan.path==="long_term" && value.plan.plan_basis==="user_selected" && value.plan.readiness.actionable_contribution_guidance_allowed;
  return (allowed || recordingPrimary&&plannerAllowed) ? <MonthlyActivity key={`${JSON.stringify(value)}:${scenarioAmount ?? "review"}`} userId={userId} scenarioAmount={scenarioAmount} onStateChange={onStateChange} onRecordInvestment={onRecordInvestment} recordingPrimary={recordingPrimary} historyAvailable={allowed}/> : null;
}

export function MonthlySummary({state,onRecord}:{state:MonthlyState;onRecord?:()=>void}) {
  return <div role="status"><h3 className="text-lg font-semibold">{state.current ? `You’re set for ${monthLabel(state.month)}` : `${monthLabel(state.month)} check-in`}</h3>
    {state.current ? <><p className="mt-2">You recorded a {formatContributionMoney(state.current.amount_php,"PHP")} contribution as invested {checkinDate(state.current.completed_at)}.</p><p className="mt-2 text-sm text-slate-600">Your portfolio is tracked separately. No holdings or trades were created by this check-in.</p><div className="contribution-submitted"><strong>Contribution submitted</strong><p>Now record what you actually invested, if you have the provider details.</p>{onRecord ? <button type="button" className="entry-primary" onClick={onRecord}>Record what you actually invested</button> : <a href="#home/monthly" className="entry-primary">Record what you actually invested</a>}<small>Enter the actual units and date. Your planned amount is not recorded as cost.</small></div></> : <p className="mt-2 text-sm text-slate-600">Review your monthly contribution. Submit only after you invest outside Arbor. Calendar months use UTC.</p>}
  </div>;
}

function MonthlyActivity({userId,scenarioAmount,onStateChange,onRecordInvestment,recordingPrimary=false,historyAvailable=true}:{userId:string;scenarioAmount?:string;onStateChange?:(state:MonthlyState)=>void;onRecordInvestment?:()=>void;recordingPrimary?:boolean;historyAvailable?:boolean}) {
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
    if(!historyAvailable)return;
    const controller=new AbortController();owner.current=controller;
    monthlyApi(userId,controller.signal).then(s=>{if(!controller.signal.aborted){setState(s);onStateChange?.(s);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>{controller.abort();owner.current?.abort();};
  },[userId,attempt,onStateChange,historyAvailable]);
  async function save(){
    if(!state||!confirm||pending.current)return;
    if(confirm==="complete"&&(!/^\d+(\.\d{1,2})?$/.test(amount)||Number(amount)<=0||Number(amount)>=1e12)){setError("Enter a positive PHP amount with at most two decimal places.");return;}
    pending.current=true;setBusy(true);setError("");
    const controller=new AbortController();owner.current=controller;
    try{const next=await monthlyApi(userId,controller.signal,confirm,{month:state.month,...(confirm==="complete"?{amount_php:amount}:{})});if(!controller.signal.aborted){setState(next);onStateChange?.(next);setConfirm(null);window.dispatchEvent(new Event("arbor-monthly-changed"));}}
    catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Please retry.");}
    finally{pending.current=false;if(!controller.signal.aborted)setBusy(false);}
  }
  const confirmationForm=confirm && <form ref={confirmation} className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();void save();}}>
    <p>{confirm==="complete"?"Arbor does not place trades or move money. Confirm only after you invest through your provider.":"Undo this month’s completion? The record will be labeled undone; your holdings will not change."}</p>
    {confirm==="complete"&&<label className="block text-sm font-medium">Amount you invested outside Arbor (PHP)<input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900" aria-describedby={error?"monthly-error":undefined}/></label>}
    <button disabled={busy} className="entry-primary min-h-11 w-full">{busy?"Submitting…":confirm==="complete"?"Confirm contribution submitted":"Confirm undo completion"}</button>
    <button type="button" disabled={busy} className="entry-link min-h-11" onClick={()=>setConfirm(null)}>Cancel</button>
  </form>;
  const undoButton=state?.current&&!confirm&&<button className="entry-link mt-3 min-h-11" onClick={()=>{setError("");setConfirm("undo");}}>Undo completion</button>;
  return <section className="monthly-activity" aria-label={recordingPrimary?"Record an actual investment":"Monthly check-in"}>
    {recordingPrimary&&<><h3 className="text-lg font-semibold">Record your investment</h3><p className="mt-2 text-sm text-slate-600">After investing through your provider, enter the actual units and total PHP paid. Your planned split is not a purchase record.</p>
      {scenarioAmount&&<button type="button" className="entry-primary mt-4 min-h-11" disabled={!onRecordInvestment} onClick={onRecordInvestment}>Record investment</button>}
      {!onRecordInvestment&&<p role="status" className="mt-2 text-sm">Investment tracking is unavailable right now.</p>}
    </>}
    {state?<>
      {!recordingPrimary&&<><MonthlySummary state={state} onRecord={()=>document.getElementById("monthly-record-investment")?.scrollIntoView({block:"start",behavior:"smooth"})}/>
        {undoButton}
        {!confirm&&!state.current&&scenarioAmount&&<button className="entry-primary mt-4 min-h-11" onClick={()=>{setError("");const prefill=checkinAmountInput(scenarioAmount);setAmount(prefill);if(!prefill)setError("Enter the PHP amount you actually invested, with at most two decimal places.");setConfirm("complete");}}>Submit monthly contribution</button>}
        {confirmationForm}
      </>}
      {(state.history.length>0||recordingPrimary&&state.current)&&<details className="mt-4"><summary className="min-h-11 cursor-pointer py-3">Recent check-ins</summary>
        {recordingPrimary&&<p className="text-sm text-slate-600">Separate completion notes from earlier check-ins, using UTC months. They do not create purchases or track new investment saves.</p>}
        <ul className="space-y-3 text-sm">{state.history.map(row=><li key={row.month}>{monthLabel(row.month)} · {formatContributionMoney(row.amount_php,"PHP")}<span className="block text-slate-600">{row.undone_at?`Completion undone ${checkinDate(row.undone_at)}`:`Recorded as invested ${checkinDate(row.completed_at)}`}</span></li>)}</ul>
        {recordingPrimary&&<>{undoButton}{confirmationForm}</>}
      </details>}
      {!recordingPrimary&&state.current&&<a href="#home" className="entry-link mt-3 inline-flex min-h-11 items-center">Return Home</a>}
    </>:!error&&historyAvailable&&<p role="status">Checking {recordingPrimary?"previous check-in notes":"this month’s activity"}…</p>}
    {error&&<div><p id="monthly-error" role="alert" className="mt-3 text-sm">{recordingPrimary?"Previous check-in notes are unavailable. Actual investment recording stays separate.":error}</p><button className="entry-link min-h-11" onClick={()=>{setError("");setAttempt(n=>n+1);}}>{recordingPrimary?"Reload check-in history":"Reload check-in"}</button></div>}
  </section>;
}
