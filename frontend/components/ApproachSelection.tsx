"use client";
import { useEffect, useRef, useState } from "react";
import { approachRequest, createV2Profile, isAccountPlan } from "@/lib/profileV2Api";
import type { AccountPlan, ProfileV2Input, Strategy } from "@/lib/types/planV2";
import { InvalidSessionError } from "@/lib/accountRecovery";
import ProgressBar from "./ProgressBar";
import { HORIZON_OPTIONS } from "@/lib/onboardingV2";

// Labels for the existing server assessment; no plan or allocation rules here.
const COMFORT: Record<Strategy, string> = { Conservative: "Lower", Balanced: "Moderate", Growth: "Higher", Aggressive: "Higher" };
export function InvestingProfileSummary({input, assessment}: {input: ProfileV2Input; assessment: Options["assessment"]}) {
  return <section aria-label="Your investing profile" className="mb-6 space-y-3 text-sm text-slate-600">
    <h2 className="text-2xl font-semibold text-slate-900">Your investing profile</h2>
    <p>Time horizon: {HORIZON_OPTIONS.find(([code]) => code === input.horizon)?.[1]}</p>
    <p>Your responses indicate {COMFORT[assessment.requested_strategy].toLowerCase()} comfort with market swings.</p>
    <p>Goal amount: {input.goal_target == null ? "Not set yet" : `₱${input.goal_target.toLocaleString("en-PH")}`}</p>
    <p>Planned monthly contribution: ₱{input.monthly_investment.toLocaleString("en-PH")}. This is a planning assumption, not an order.</p>
    <p>This summary is informational. You choose your approach next; no plan has been selected for you.</p>
  </section>;
}

type Option = { strategy: Strategy; allocation: { role: string; percentage_points: number }[]; planning_return_pct: number };
type Options = { assessment: { requested_strategy: Strategy; is_short_term: boolean }; approaches: Option[] };
export function validApproaches(value: unknown): value is Options {
  if (!value || typeof value !== "object") return false;
  const v = value as Options;
  const names = ["Conservative", "Balanced", "Growth", "Aggressive"];
  return !!v.assessment && names.includes(v.assessment.requested_strategy) && typeof v.assessment.is_short_term === "boolean" &&
    Array.isArray(v.approaches) && v.approaches.length === 4 &&
    v.approaches.every(o => o && names.includes(o.strategy) && Number.isFinite(o.planning_return_pct) && Array.isArray(o.allocation) && o.allocation.length === 2 &&
      o.allocation.every(w => w && ["global_equity", "defensive"].includes(w.role) && Number.isInteger(w.percentage_points) && w.percentage_points >= 0 && w.percentage_points <= 100) && new Set(o.allocation.map(w => w.role)).size === 2 && o.allocation.reduce((sum,w)=>sum+w.percentage_points,0) === 100) && new Set(v.approaches.map(o => o.strategy)).size === 4;
}
export function ApproachOptions({ options, selected, onSelect }: {options: Options; selected: string; onSelect: (value: Strategy | "short_term") => void}) {
  return <>
    <h2 className="text-2xl font-semibold text-slate-900">Choose your investment approach</h2>
    <p className="mt-3 text-sm text-slate-600">Your self-assessment indicates {COMFORT[options.assessment.requested_strategy].toLowerCase()} comfort with market swings. This describes your answers, not a plan selection.</p>
    {options.assessment.is_short_term ? <><p className="mt-3 text-sm text-slate-600">For money needed in less than 3 years, this tool offers a short-term planning path without a long-term allocation.</p><button type="button" aria-pressed={selected === "short_term"} onClick={() => onSelect("short_term")} className="entry-secondary mt-4 w-full">Short-term planning</button></>
      : <><p className="mt-3 text-sm text-slate-600">Compare the same standard models available to all long-term users. More equity means more exposure to stock-market fluctuations; defensive assets also carry risk. These are long-term models, not short-term cash plans.</p>
        <div className="mt-4 space-y-3">{options.approaches.map(option => <button type="button" key={option.strategy} aria-pressed={selected === option.strategy} onClick={() => onSelect(option.strategy)} className={`min-h-12 w-full rounded-xl border p-4 text-left ${selected === option.strategy ? "border-forest bg-green-50" : "border-slate-300"}`}>
          <span className="block font-semibold text-slate-900">{option.strategy}</span>
          <span className="mt-2 block text-sm text-slate-600">{option.allocation.map(w => `${w.percentage_points}% ${w.role === "global_equity" ? "global equity" : "defensive"}`).join(" / ")}</span>
          <span className="mt-1 block text-sm text-slate-600">Planning return assumption: {option.planning_return_pct.toFixed(1)}%</span>
        </button>)}</div></>}
    <p className="mt-4 text-sm text-slate-500">You choose the model. Projections are hypothetical; these assumptions are not forecasts. Past performance does not guarantee future results. Each model has fixed targets; Technology and Bitcoin are not added automatically.</p>
  </>;
}
export default function ApproachSelection({input,userId,existing,onComplete,onBack}: {input: ProfileV2Input; userId:string; existing?:boolean; onComplete:(plan:AccountPlan)=>void; onBack:()=>void}) {
  const [options,setOptions]=useState<Options|null>(null), [selected,setSelected]=useState<Strategy|"short_term"|"">("");
  const [error,setError]=useState(""), [busy,setBusy]=useState(false), [retry,setRetry]=useState(0);
  const owner=useRef<AbortController|null>(null);
  useEffect(()=>{ const controller=new AbortController(); owner.current=controller;
    approachRequest("approaches",input,userId,controller.signal).then(value=>{if(!validApproaches(value))throw Error(); if(!controller.signal.aborted)setOptions(value);}).catch(error=>{if(!controller.signal.aborted)setError(error instanceof InvalidSessionError ? "Your session has expired. Return and sign in again." : "We couldn’t load the approaches. Please retry.");});
    return()=>{controller.abort(); owner.current?.abort(); owner.current=null;};
  },[input,userId,retry]);
  const saving=useRef(false);
  async function save(){if(!selected||saving.current)return; saving.current=true;setBusy(true);setError(""); const controller=new AbortController();owner.current=controller;
    try{const payload={...input,selected_approach:selected};const result=existing?await approachRequest("profiles/approach",payload,userId,controller.signal):await createV2Profile(payload,userId,controller.signal);
      if(!isAccountPlan(result))throw Error(); if(!controller.signal.aborted)onComplete(result);
    }catch(error){if(!controller.signal.aborted)setError(error instanceof InvalidSessionError ? "Your session has expired. Return and sign in again." : "We couldn’t confirm your saved selection. Retry or reload your plan; your answers are still here.");}
    finally{saving.current=false;if(!controller.signal.aborted)setBusy(false);}
  }
  return <section className="arbor-panel mx-auto w-full max-w-xl"><button type="button" disabled={busy} onClick={onBack} className="entry-link mb-4 min-h-11">← Back</button>
    {!existing && <ProgressBar step={10} totalSteps={10} />}
    {options?<>{!existing && <InvestingProfileSummary input={input} assessment={options.assessment} />}<ApproachOptions options={options} selected={selected} onSelect={value=>{if(!busy)setSelected(value);}}/></>:!error&&<p role="status">Loading approaches…</p>}
    {error&&<p role="alert" className="mt-4 text-sm text-slate-700">{error}</p>}
    {!options&&error?<button className="entry-primary mt-4" onClick={()=>{setError("");setRetry(retry+1);}}>Retry</button>:<button disabled={!selected||busy} className="entry-primary mt-5 w-full disabled:opacity-50" onClick={()=>void save()}>{busy?"Saving your selection…":"Use this as my plan"}</button>}
  </section>;
}
