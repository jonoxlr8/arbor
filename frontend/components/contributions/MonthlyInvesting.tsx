"use client";
import { useEffect, useRef, useState } from "react";
import type { PlanV2 } from "@/lib/types/planV2";
import type { Sleeve } from "@/lib/types/contributions";
import { monthlyPlanApi, monthlyMoney, type MonthlyPlan, type MonthlyPlanInput } from "@/lib/monthlyPlan";
import { SLEEVE_LABELS } from "@/lib/contributions";
import { investmentIdentity, providerName } from "@/lib/investmentIdentity";
import { providerDestination } from "@/lib/planImplementation";
import { useAccountAccess } from "../AccountAccess";
import { MonthlyCheckin } from "../MonthlyCheckin";
import InvestmentIdentity from "../InvestmentIdentity";
import ProviderIdentity from "../ProviderIdentity";
import ImplementationPicker from "../portfolio/ImplementationPicker";
import { sleeveColors } from "../AssetIdentity";

const money=monthlyMoney;
const emptyValues={global_equity:"0",defensive:"0",technology_tilt:"0",crypto:"0"};
export default function MonthlyInvesting({value,userId,onPlanChange}:{value:PlanV2;userId:string;onPlanChange:(value:PlanV2)=>void}) {
  const access=useAccountAccess();
  const tracking=access?.value?.availability?.live_portfolio===true && access.value.features.includes("live_portfolio");
  const [amount,setAmount]=useState(String(value.profile.monthly_investment||""));
  const [inputMode,setInputMode]=useState<""|"empty"|"manual">("");
  const [manual,setManual]=useState({...emptyValues});
  const [result,setResult]=useState<MonthlyPlan|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [choosing,setChoosing]=useState<Sleeve|null>(null);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  function invalidate(){request.current?.abort();request.current=null;setResult(null);setBusy(false);setError("");}
  async function calculate(){
    if(request.current)return;
    if(!/^\d+(\.\d{1,2})?$/.test(amount)||Number(amount)<=0){setError("Enter a positive PHP contribution with up to two decimal places.");return;}
    if(!tracking&&!inputMode){setError("Tell Arbor whether you have existing investments before calculating.");return;}
    const controller=new AbortController();request.current=controller;setBusy(true);setError("");
    const input:MonthlyPlanInput={contribution_amount:amount,...(!tracking?(inputMode==="empty"?{confirm_empty:true}:{manual_current:{...manual,currency:"PHP",owned_product_ids:[]}}):{})};
    try{const next=await monthlyPlanApi.calculate(userId,input,controller.signal);if(!controller.signal.aborted)setResult(next);}
    catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Please retry.");}
    finally{if(request.current===controller)request.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  if(value.plan.path!=="long_term"||value.plan.plan_basis!=="user_selected"||!value.plan.readiness.actionable_contribution_guidance_allowed)return <section className="monthly-investing"><a className="entry-link monthly-back" href="#home">‹ Home</a><h2>{!value.plan.readiness.actionable_contribution_guidance_allowed?"Foundation First":value.plan.path==="short_term"?"Your short-term path":"Choose your plan first"}</h2><p className="mt-4 text-sm text-slate-600">Monthly investing is paused for your current path. Your saved plan stays unchanged.</p><a className="entry-link mt-4 inline-flex" href="#settings/investment">Review investment profile</a></section>;
  return <section className="monthly-investing" aria-label="Invest this month">
    <a className="entry-link monthly-back" href="#home">‹ Home</a>
    <header><p className="eyebrow">Your monthly check-in</p><h2>Invest this month</h2><p>Based on the plan and investments you chose.</p></header>
    <form className="monthly-amount-form" onSubmit={e=>{e.preventDefault();void calculate();}}>
      <label>Planned contribution<span className="monthly-amount-input"><span aria-hidden="true">₱</span><input aria-label="Contribution amount (PHP)" inputMode="decimal" required value={amount} onChange={e=>{invalidate();setAmount(e.target.value);}} aria-describedby={error?"monthly-plan-error":undefined}/></span></label>
      {!tracking&&<fieldset className="monthly-current"><legend>Your current investments</legend><p>Use current values, not purchase costs. Your planning starting amount is separate.</p>
        <label><input type="radio" name="monthly-current" checked={inputMode==="empty"} onChange={()=>{invalidate();setInputMode("empty");}}/> I have no investments yet</label>
        <label><input type="radio" name="monthly-current" checked={inputMode==="manual"} onChange={()=>{invalidate();setInputMode("manual");}}/> Enter my current values</label>
        {inputMode==="manual"&&<><div className="monthly-current-grid">{(Object.keys(manual) as Sleeve[]).map(sleeve=><label key={sleeve}>{SLEEVE_LABELS[sleeve]}<input aria-label={`${SLEEVE_LABELS[sleeve]} current value (PHP)`} inputMode="decimal" required value={manual[sleeve]} onChange={e=>{invalidate();setManual({...manual,[sleeve]:e.target.value});}}/></label>)}</div><p>Minimum checks use first-purchase amounts here. Confirm repeat-purchase requirements with your provider.</p></>}
      </fieldset>}
      {tracking&&<p className="monthly-source-note">Your recorded portfolio supplies current values automatically.</p>}
      <button className="entry-primary" disabled={busy}>{busy?"Calculating…":"Review contribution"}</button>
    </form>
    {error&&<p id="monthly-plan-error" role="alert" className="monthly-error">{error}</p>}
    {result&&<section className="monthly-breakdown" aria-label="Monthly investment breakdown">
      <header><h3>Your contribution breakdown</h3><span>{money(result.contribution_amount)}</span></header>
      <p className="monthly-result-note">{result.source.includes("empty")?"No investments recorded yet. This starts from the targets you chose.":"Calculated from your current values and the gaps to your chosen targets."}</p>
      <div className="monthly-rows">{result.rows.map(row=><article key={row.sleeve} className="monthly-row" data-sleeve={row.sleeve} data-status={row.status}>
        {row.product_id?<InvestmentIdentity product={row.product_id}/>:<span className="monthly-sleeve-symbol" style={{color:sleeveColors[row.sleeve]}} aria-hidden="true">◌</span>}
        <div className="monthly-row-copy"><span className="monthly-sleeve-label"><i style={{background:sleeveColors[row.sleeve]}}/>{SLEEVE_LABELS[row.sleeve]}</span><h4>{row.product_id?investmentIdentity(row.product_id).shortName:"Choose an investment"}</h4>
          {row.provider_id&&<ProviderIdentity provider={row.provider_id}/>}<button className="entry-link" onClick={()=>setChoosing(row.sleeve)}>{row.product_id?"Change investment":"Choose where to invest"}</button>
        </div><strong className="monthly-row-amount">{money(row.amount)}</strong>
        <div className="monthly-row-detail">
          {row.status==="below_minimum"?<div className="monthly-minimum"><strong>Not enough to invest yet</strong><p>Minimum needed: {row.minimum?.applicable_minimum&&row.minimum.minimum_currency==="PHP"?money(row.minimum.applicable_minimum):"Check with your provider"}. Keep this {money(row.amount)} for a future contribution.</p><small>This is a planning amount you retain. Arbor does not hold or carry it forward automatically.</small></div>
            :row.status==="verify_minimum"?<p>Check the minimum with {providerName(row.provider_id??"")} before investing. Arbor has not verified a PHP minimum for this purchase.</p>
            :row.status==="choose_investment"?<p>This amount remains assigned to {SLEEVE_LABELS[row.sleeve]}. You choose the investment and provider.</p>
            :row.status==="no_amount"?<p>No new amount is assigned here in this breakdown.</p>:<p className="minimum-met">✓ Minimum met</p>}
          <details><summary>How this amount was calculated</summary><dl><div><dt>Current value</dt><dd>{money(row.current_value)}</dd></div><div><dt>Your target</dt><dd>{row.target_percentage_points}%</dd></div><div><dt>Target after contribution</dt><dd>{money(row.target_value_after_contribution)}</dd></div><div><dt>Gap before assigning this contribution</dt><dd>{money(row.deficit)}</dd></div></dl><p>The same target-gap calculation applies whichever investment you choose. Existing holdings are not sold or changed.</p></details>
        </div>
      </article>)}</div>
      <section className="monthly-reconciliation" aria-label="Full contribution accounting"><h3>Every peso accounted for</h3><dl>
        <div><dt>Minimum met</dt><dd>{money(result.ready_amount)}</dd></div><div><dt>Verify minimum with provider</dt><dd>{money(result.verify_minimum_amount)}</dd></div><div><dt>Waiting for a minimum</dt><dd>{money(result.waiting_amount)}</dd></div><div><dt>Choose an investment</dt><dd>{money(result.choose_investment_amount)}</dd></div><div><dt>Reserve</dt><dd>{money(result.reserve_amount)}</dd></div><div><dt>Unassigned</dt><dd>{money(result.unallocated_amount)}</dd></div><div className="monthly-total"><dt>Total planned</dt><dd>{money(result.contribution_amount)}</dd></div>
      </dl></section>
      {!!result.provider_groups.length&&<section className="monthly-providers"><h3>Through your providers</h3>{result.provider_groups.map(group=><div className="monthly-provider" key={group.provider_id}><ProviderIdentity provider={group.provider_id}/><dl>{result.rows.filter(row=>row.provider_id===group.provider_id).map(row=><div key={row.sleeve}><dt>{investmentIdentity(row.product_id??"").shortName}</dt><dd>{money(row.amount)}{row.status==="below_minimum"&&<small>Waiting</small>}{row.status==="verify_minimum"&&<small>Verify minimum</small>}</dd></div>)}<div className="monthly-provider-total"><dt>Total assigned</dt><dd>{money(group.amount)}</dd></div></dl>{providerDestination(group.provider_id)&&<a className="provider-open" href={providerDestination(group.provider_id)!} target="_blank" rel="noopener noreferrer">Open {providerName(group.provider_id)} ↗</a>}</div>)}</section>}
      <div className="monthly-handoff"><p>You invest through your providers. Arbor does not place trades or move money.</p><small>After submitting your contribution, update your holdings with what you actually received.</small></div>
    </section>}
    <MonthlyCheckin value={value} userId={userId} scenarioAmount={result?.recordable_amount&&Number(result.recordable_amount)>0?result.recordable_amount:undefined}/>
    {choosing&&<ImplementationPicker value={value} userId={userId} sleeve={choosing} onClose={()=>setChoosing(null)} onSaved={plan=>{invalidate();onPlanChange(plan);void calculate();}}/>}
  </section>;
}
