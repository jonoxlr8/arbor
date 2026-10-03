"use client";
import {useEffect,useState} from "react";
import type {PlanV2} from "@/lib/types/planV2";
import {futureProjection,type FutureProjection} from "@/lib/goalProjectionApi";
import {monthlyMoney} from "@/lib/monthlyPlan";

export default function PortfolioWhatIf({value,userId,active=true,inSheet=false}:{value:PlanV2;userId:string;active?:boolean;inSheet?:boolean}) {
  const [amount,setAmount]=useState(String(value.profile.monthly_investment??""));
  const [date,setDate]=useState(value.profile.goal_date??"");
  const [result,setResult]=useState<FutureProjection|null>(null),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  const [wasActive,setWasActive]=useState(active);
  if(wasActive!==active){setWasActive(active);if(!active){setResult(null);setError("");}}
  const eligible=value.plan.path==="long_term"&&value.plan.plan_basis==="user_selected"&&value.plan.readiness.actionable_contribution_guidance_allowed;
  const valid=/^\d+(?:\.\d{1,2})?$/.test(amount)&&Number(amount)<1e12&&!!date;
  useEffect(()=>{
    if(!active||!eligible||!valid)return;
    let alive=true;
    const timer=setTimeout(()=>{futureProjection(userId,{monthly_contribution_php:Number(amount),target_date:date})
      .then(next=>{if(alive){setResult(next);setError("");}}).catch(()=>{if(alive){setResult(null);setError("We couldn’t calculate this illustration. Check your target date and complete portfolio, then retry.");}});},250);
    return()=>{alive=false;clearTimeout(timer);};
  },[active,eligible,valid,userId,amount,date,retry,value.revision]);
  function reset(){setResult(null);setError("");setAmount(String(value.profile.monthly_investment??""));setDate(value.profile.goal_date??"");setRetry(n=>n+1);}
  return <section className="what-if-page" aria-label="What-if exploration">{!inSheet && <a className="entry-link min-h-11 inline-flex items-center" href="#portfolio">‹ Portfolio</a>}<header><p className="eyebrow plus-eyebrow">Arbor Plus</p><h2>What if your monthly amount changed?</h2><p>Explore a future illustration. Your saved budget, goal and investment records stay unchanged.</p></header>
    {!eligible?<p className="review-notice">What-if is paused for your current path. <a href="#settings/investment" className="entry-link">Review your plan</a></p>:<>
      <div className="goal-form what-if-inputs"><label>Monthly amount to explore (PHP)<input inputMode="decimal" value={amount} onChange={e=>{setResult(null);setError("");setAmount(e.target.value);}}/></label><label>Target date<input type="date" value={date} onChange={e=>{setResult(null);setError("");setDate(e.target.value);}}/></label><button className="entry-secondary min-h-11" onClick={reset}>Reset to saved values</button><p>Saved monthly budget: {value.profile.monthly_investment===null?"Not set":monthlyMoney(String(value.profile.monthly_investment))}. These inputs do not record an investment.</p></div>
      {!valid?<p role="status" className="review-notice">Enter a monthly PHP amount and a future target date to explore.</p>:error?<div role="alert" className="review-notice">{error}<button className="entry-link min-h-11" onClick={()=>{setError("");setRetry(n=>n+1);}}>Retry illustration</button></div>:!result?<p role="status" className="review-notice">Calculating your illustration…</p>:<div className="what-if-result" role="status"><p className="eyebrow">Illustrative future value</p><strong>{monthlyMoney(result.projected_value_php)}</strong><p>By {new Date(`${result.target_date}T00:00:00Z`).toLocaleDateString("en-PH",{month:"long",year:"numeric",timeZone:"UTC"})}</p><details><summary>Assumptions behind this illustration</summary><p>From {monthlyMoney(result.starting_value_php)} in your complete recorded portfolio, with {monthlyMoney(result.monthly_contribution_php)} per month for {result.whole_months} whole end-of-month contributions. Uses your chosen plan’s {Number(result.annual_planning_rate_pct).toFixed(1)}% nominal annual assumption. Values are future PHP, without inflation adjustment. Actual contributions and market outcomes may differ.</p></details></div>}
      <p className="projection-disclosure">A planning illustration, not a forecast or guaranteed result. Arbor does not place trades or move money.</p>
    </>}
  </section>;
}
