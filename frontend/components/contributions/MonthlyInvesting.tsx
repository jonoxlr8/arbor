"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanV2 } from "@/lib/types/planV2";
import type { Sleeve } from "@/lib/types/contributions";
import { monthlyPlanApi, monthlyMoney, monthlyPlanConflictCopy, MonthlyPlanConflictError, type MonthlyPlan, type MonthlyPlanInput } from "@/lib/monthlyPlan";
import { portfolioApi } from "@/lib/livePortfolio";
import { SLEEVE_LABELS } from "@/lib/contributions";
import { investmentIdentity } from "@/lib/investmentIdentity";
import { useAccountAccess } from "../AccountAccess";
import { MonthlyCheckin } from "../MonthlyCheckin";
import { MonthlyInvestmentFollowup } from "./MonthlyInvestmentFollowup";
import InvestmentIdentity from "../InvestmentIdentity";
import ProviderIdentity from "../ProviderIdentity";
import ImplementationPicker from "../portfolio/ImplementationPicker";
import { sleeveColors } from "../AssetIdentity";
import ProviderContinue from "./ProviderContinue";
import MonthlyMinimumNotice from "./MonthlyMinimumNotice";

const money=monthlyMoney;
const emptyValues={global_equity:"0",defensive:"0",technology_tilt:"0",crypto:"0"};
export default function MonthlyInvesting({value,userId,onPlanChange,backHref="#portfolio",active=true,inSheet=false}:{value:PlanV2;userId:string;onPlanChange:(value:PlanV2)=>void;backHref?:"#home"|"#portfolio";active?:boolean;inSheet?:boolean}) {
  const access=useAccountAccess();
  const tracking=access?.value?.availability?.live_portfolio===true && access.value.features.includes("live_portfolio");
  const [amount,setAmount]=useState(String(value.profile.monthly_investment ?? ""));
  const [inputMode,setInputMode]=useState<""|"empty"|"manual">("");
  const [manual,setManual]=useState({...emptyValues});
  const [result,setResult]=useState<MonthlyPlan|null>(null);
  const [recording,setRecording]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [reviewPortfolio,setReviewPortfolio]=useState(false);
  const [choosing,setChoosing]=useState<Sleeve|null>(null);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  const invalidate=useCallback(()=>{request.current?.abort();request.current=null;setResult(null);setRecording(false);setBusy(false);setError("");setReviewPortfolio(false);},[]);
  const [wasActive,setWasActive]=useState(active);
  if(wasActive!==active){setWasActive(active);if(!active){setResult(null);setRecording(false);setChoosing(null);setBusy(false);setError("");setReviewPortfolio(false);}}
  useEffect(()=>{if(!active){request.current?.abort();request.current=null;}},[active]);
  useEffect(()=>{const changed=()=>invalidate();window.addEventListener("arbor-investment-recorded",changed);return()=>window.removeEventListener("arbor-investment-recorded",changed);},[invalidate]);
  async function calculate(){
    if(request.current)return;
    if(!/^\d+(\.\d{1,2})?$/.test(amount)||Number(amount)<=0){setError("Enter a positive PHP contribution with up to two decimal places.");return;}
    if(!tracking&&!inputMode){setError("Tell Arbor whether you have existing investments before calculating.");return;}
    const controller=new AbortController();request.current=controller;setResult(null);setBusy(true);setError("");setReviewPortfolio(false);
    const input:MonthlyPlanInput={contribution_amount:amount,...(!tracking?(inputMode==="empty"?{confirm_empty:true}:{manual_current:{...manual,currency:"PHP",owned_product_ids:[]}}):{})};
    try{const next=await monthlyPlanApi.calculate(userId,input,controller.signal);if(!controller.signal.aborted)setResult(next);}
    catch(e){
      if(controller.signal.aborted)return;
      if(e instanceof MonthlyPlanConflictError){
        let message=e.message;
        if(tracking)try{message=monthlyPlanConflictCopy(await portfolioApi.read(userId,controller.signal));}catch{/* Keep the safe plan/portfolio message if this read fails. */}
        if(!controller.signal.aborted){setError(message);setReviewPortfolio(tracking);}
      }else setError(e instanceof Error?e.message:"Please retry.");
    }
    finally{if(request.current===controller)request.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  if(value.plan.path!=="long_term"||value.plan.plan_basis!=="user_selected"||!value.plan.readiness.actionable_contribution_guidance_allowed)return <section className="monthly-investing">{!inSheet && <a className="entry-link monthly-back" href={backHref}>‹ {backHref==="#home"?"Home":"Portfolio"}</a>}<h2>{!value.plan.readiness.actionable_contribution_guidance_allowed?"Foundation First":value.plan.path==="short_term"?"Your short-term path":"Choose your plan first"}</h2><p className="mt-4 text-sm text-slate-600">Monthly investing is paused for your current path. Your saved plan stays unchanged.</p><a className="entry-link mt-4 inline-flex" href="#settings/investment">Review investment profile</a></section>;
  return <section className="monthly-investing" aria-label="Invest this month">
    {!inSheet && <a className="entry-link monthly-back" href={backHref}>‹ {backHref==="#home"?"Home":"Portfolio"}</a>}
    <header><p className="eyebrow plus-eyebrow">Arbor Plus</p><h2>Plan your next investment</h2><p>Choose an amount. See how it fits the targets and investments you chose.</p></header>
    <form className="monthly-amount-form" onSubmit={e=>{e.preventDefault();void calculate();}}>
      <label>Amount to split<span className="monthly-amount-input"><span aria-hidden="true">₱</span><input aria-label="Amount to split (PHP)" inputMode="decimal" required value={amount} onChange={e=>{invalidate();setAmount(e.target.value);}} aria-describedby={error?"monthly-plan-error":undefined}/></span></label>
      {!tracking&&<fieldset className="monthly-current"><legend>Your current investments</legend><p>Use current values, not purchase costs. Your planning starting amount is separate.</p>
        <label><input type="radio" name="monthly-current" checked={inputMode==="empty"} onChange={()=>{invalidate();setInputMode("empty");}}/> I have no investments yet</label>
        <label><input type="radio" name="monthly-current" checked={inputMode==="manual"} onChange={()=>{invalidate();setInputMode("manual");}}/> Enter my current values</label>
        {inputMode==="manual"&&<><div className="monthly-current-grid">{(Object.keys(manual) as Sleeve[]).map(sleeve=><label key={sleeve}>{SLEEVE_LABELS[sleeve]}<input aria-label={`${SLEEVE_LABELS[sleeve]} current value (PHP)`} inputMode="decimal" required value={manual[sleeve]} onChange={e=>{invalidate();setManual({...manual,[sleeve]:e.target.value});}}/></label>)}</div><p>Minimum checks use first-purchase amounts here. Confirm repeat-purchase requirements with your provider.</p></>}
      </fieldset>}
      <p className="monthly-source-note">Saved monthly budget: {value.profile.monthly_investment===null?"Not set":money(String(value.profile.monthly_investment))}. Changing the amount here does not change your budget or record an investment.</p>
      {tracking&&<p className="monthly-source-note">Uses your recorded holdings and available reference values.</p>}
      <button className="entry-primary" disabled={busy}>{busy?"Calculating…":"See investment breakdown"}</button>
    </form>
    {error&&<div id="monthly-plan-error" role="alert" className="monthly-error"><p>{error}</p>{reviewPortfolio&&<a className="entry-link inline-flex min-h-11 items-center" href="#portfolio/holdings">Review holdings in Portfolio →</a>}</div>}
    {result&&<section className="monthly-breakdown" aria-label="Monthly investment breakdown">
      <header><h3>Your estimated split</h3><span>{money(result.contribution_amount)}</span></header>
      {!!result.indicative_navs?.length && <div className="monthly-result-note" role="note"><strong>Indicative estimate</strong><p>Uses the latest NAVs available to Arbor from TOAP, dated {Array.from(new Set(result.indicative_navs.map(nav=>nav.as_of.slice(0,10)))).sort().join(" · ")}. Actual purchase prices and units may differ.</p><details><summary>NAV dates used</summary><ul>{result.indicative_navs.map(nav=><li key={nav.product_id}>{investmentIdentity(nav.product_id,nav.product_id).shortName} · {nav.unit_class} · {nav.as_of.slice(0,10)} · TOAP</li>)}</ul></details></div>}
      <p className="monthly-result-note">{result.source.includes("empty")?"No investments recorded yet. This starts from the targets you chose.":"Calculated from recorded values and the gaps to your chosen targets. Your budget is not divided by fixed percentages."}</p>
      <div className="monthly-rows">{result.rows.map(row=><article key={row.sleeve} className="monthly-row" data-sleeve={row.sleeve} data-status={row.status}>
        {row.product_id?<InvestmentIdentity product={row.product_id}/>:<span className="monthly-sleeve-symbol" style={{color:sleeveColors[row.sleeve]}} aria-hidden="true">◌</span>}
        <div className="monthly-row-copy"><span className="monthly-sleeve-label"><i style={{background:sleeveColors[row.sleeve]}}/>{SLEEVE_LABELS[row.sleeve]}</span><h4>{row.product_id?investmentIdentity(row.product_id).shortName:"Choose an investment"}</h4>
          {row.provider_id&&<ProviderIdentity provider={row.provider_id}/>}<button className="entry-link" onClick={()=>setChoosing(row.sleeve)}>{row.product_id?"Change investment":"Choose where to invest"}</button>
        </div><strong className="monthly-row-amount">{money(row.amount)}</strong>
        <div className="monthly-row-detail">
          <MonthlyMinimumNotice row={row}/>
          <details><summary>How this amount was calculated</summary><dl><div><dt>Current value</dt><dd>{money(row.current_value)}</dd></div><div><dt>Your target</dt><dd>{row.target_percentage_points}%</dd></div><div><dt>Target after contribution</dt><dd>{money(row.target_value_after_contribution)}</dd></div><div><dt>Gap before assigning this contribution</dt><dd>{money(row.deficit)}</dd></div></dl><p>The same target-gap calculation applies whichever investment you choose. Existing holdings are not sold or changed.</p></details>
        </div>
      </article>)}</div>
      <section className="monthly-reconciliation" aria-label="Full contribution accounting"><h3>Every peso accounted for</h3><dl>
        <div><dt>Minimum met</dt><dd>{money(result.ready_amount)}</dd></div><div><dt>Verify minimum with provider</dt><dd>{money(result.verify_minimum_amount)}</dd></div><div><dt>Waiting for a minimum</dt><dd>{money(result.waiting_amount)}</dd></div><div><dt>Choose an investment</dt><dd>{money(result.choose_investment_amount)}</dd></div><div><dt>Reserve</dt><dd>{money(result.reserve_amount)}</dd></div><div><dt>Unassigned</dt><dd>{money(result.unallocated_amount)}</dd></div><div className="monthly-total"><dt>Total planned</dt><dd>{money(result.contribution_amount)}</dd></div>
      </dl></section>
      {!!result.provider_groups.length&&<section className="monthly-providers"><h3>Next: open your provider</h3>{result.provider_groups.map(group=><div className="monthly-provider" key={group.provider_id}><ProviderIdentity provider={group.provider_id}/><dl>{result.rows.filter(row=>row.provider_id===group.provider_id).map(row=><div key={row.sleeve}><dt>{row.product_id&&<InvestmentIdentity product={row.product_id}/>}<span>{investmentIdentity(row.product_id??"").shortName}</span></dt><dd>{money(row.amount)}{row.status==="below_minimum"&&<small>Waiting</small>}{row.status==="verify_minimum"&&<small>Verify minimum</small>}</dd></div>)}<div className="monthly-provider-total"><dt>Total assigned</dt><dd>{money(group.amount)}</dd></div></dl>{result.rows.filter(row=>row.provider_id===group.provider_id && row.product_id && (row.status==="ready"||row.status==="verify_minimum") && Number(row.amount)>0).map(row=><ProviderContinue key={row.sleeve} userId={userId} productId={row.product_id!} provider={group.provider_id}/>)}</div>)}</section>}
      <div className="monthly-handoff"><p>Review the investment and actual price in your provider app before deciding. Arbor does not place trades or move money.</p><small>After investing through your provider, record the actual units and PHP amount you paid. Planned PHP amounts never become investment cost automatically.</small></div>
    </section>}
    <MonthlyCheckin value={value} userId={userId} scenarioAmount={result?.recordable_amount&&Number(result.recordable_amount)>0?result.recordable_amount:undefined} recordingPrimary onRecordInvestment={tracking?()=>setRecording(true):undefined}/>
    {tracking && active && <MonthlyInvestmentFollowup userId={userId} plan={result} completed={false} recording={recording} onRecordingClose={()=>setRecording(false)}/>}
    {active&&choosing&&<ImplementationPicker value={value} userId={userId} sleeve={choosing} onClose={()=>setChoosing(null)} onSaved={plan=>{invalidate();onPlanChange(plan);void calculate();}}/>}
  </section>;
}
