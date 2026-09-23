"use client";
import {useEffect, useRef, useState} from "react";
import type {PlanV2, Strategy} from "@/lib/types/planV2";
import {ONBOARDING_STEPS, answerError} from "@/lib/onboardingV2";
import {editAnswers, editInputs, EDIT_LABELS, displayAnswer, planChoiceLabel, editSaveLabel, profileEditRequest, type EditPreview, type EditRequest} from "@/lib/profileEditV2";
import {approachRequest, getAccountProfile} from "@/lib/profileV2Api";
import {isPlanV2} from "@/lib/planV2";
import {OnboardingQuestionV2} from "./OnboardingV2";
import {ApproachOptions, validApproaches} from "./ApproachSelection";
import {onboardingEnter} from "@/lib/onboardingKeyboard";

export function ProfileEditReview({preview}: {preview: EditPreview}) {
  const {current,proposed}=preview;
  const changes=ONBOARDING_STEPS.filter(field=>current.profile[field]!==proposed.profile[field]);
  const weights=(value:PlanV2,role:string)=>value.plan.path==="short_term" ? "Not active" : `${value.plan.preference_result?.effective_target?.allocation.weights.find(w=>w.role===role)?.percentage_points ?? 0}%`;
  return <div className="space-y-5">
    <h2 className="text-2xl font-semibold text-slate-900">Review changes</h2>
    <p className="text-sm text-slate-600">Nothing has been saved. Your assessment describes your answers; it does not choose a plan.</p>
    <section><h3 className="font-semibold text-slate-900">Profile changes</h3>
      {changes.length ? <dl className="mt-2 divide-y divide-slate-200">{changes.map(field=><div key={field} className="py-3 text-sm"><dt className="font-medium text-slate-900">{EDIT_LABELS[field]}</dt><dd className="mt-1 break-words text-slate-600">{displayAnswer(field,current.profile[field])} → {displayAnswer(field,proposed.profile[field])}</dd></div>)}</dl> : <p className="mt-2 text-sm text-slate-600">No profile answer changes.</p>}
    </section>
    <section className="space-y-2 text-sm text-slate-600"><h3 className="font-semibold text-slate-900">Informational assessment</h3>
      <p>Volatility comfort: {current.plan.selection.requested_strategy} → {proposed.plan.selection.requested_strategy}</p>
      <p>Readiness: {current.plan.readiness.readiness.replaceAll("_"," ")} → {proposed.plan.readiness.readiness.replaceAll("_"," ")}</p>
      {!proposed.plan.readiness.actionable_contribution_guidance_allowed && <p>Foundation First: contribution allocations are paused. Your plan remains a preview.</p>}
      {proposed.plan.readiness.readiness==="getting_ready" && <p>Your answers flag a financial-foundation consideration. Bitcoin eligibility is paused; saved historical allocations are not rewritten.</p>}
    </section>
    <section className="space-y-2 text-sm text-slate-600"><h3 className="font-semibold text-slate-900">Plan preview</h3>
      <p>{planChoiceLabel(current)} → {planChoiceLabel(proposed)}{current.profile.selected_approach===proposed.profile.selected_approach ? " · No saved plan-choice change" : " · Explicit plan change"}</p>
      <p>Active path: {current.plan.path.replaceAll("_"," ")} → {proposed.plan.path.replaceAll("_"," ")}</p>
      {proposed.plan.dormant_selected_approach && <p>{proposed.plan.dormant_selected_approach} remains saved but dormant. The short-term path has no active long-term allocation. A long-term horizon will restore this choice.</p>}
      {proposed.plan.plan_basis!=="user_selected" && <p>This is a preserved historical plan, not an explicit standard-model selection. Updated assessment answers do not replace its saved allocation. Historical contribution scenarios remain unavailable until you choose a standardized approach.</p>}
      <details><summary className="min-h-11 cursor-pointer py-3 font-medium text-slate-700">Allocation before and after</summary>
        <dl className="divide-y divide-slate-200">{[["global_equity","Global Equity"],["defensive","Defensive"],["technology_tilt","Technology"],["crypto","Bitcoin"]].map(([role,label])=><div key={role} className="flex flex-wrap justify-between gap-2 py-3"><dt>{label}</dt><dd>{weights(current,role)} → {weights(proposed,role)}</dd></div>)}</dl>
      </details>
      <p>Planning return assumption: {current.plan.planning_return_pct==null ? "Not applicable" : `${current.plan.planning_return_pct}%`} → {proposed.plan.planning_return_pct==null ? "Not applicable" : `${proposed.plan.planning_return_pct}%`}</p>
      <p>Inflation assumption: {current.plan.inflation_pct}% → {proposed.plan.inflation_pct}%</p>
      <p>These are hypothetical planning assumptions, not forecasts. No exact duration or projected balance is inferred from a horizon range.</p>
      {proposed.historical_plan && <p>Earlier preference requests and their historical allocation remain saved for reference. They do not modify a newly selected standard model.</p>}
    </section>
  </div>;
}

export default function InvestmentProfileEditor({value,userId,onCancel,onSaved}: {value:PlanV2;userId:string;onCancel:()=>void;onSaved:(value:PlanV2)=>void}) {
  const [answers,setAnswers]=useState(()=>editAnswers(value.profile));
  const [field,setField]=useState<typeof ONBOARDING_STEPS[number]|null>(null);
  const [preview,setPreview]=useState<EditPreview|null>(null);
  const [payload,setPayload]=useState<EditRequest|null>(null);
  const [options,setOptions]=useState<Parameters<typeof ApproachOptions>[0]["options"]|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const owner=useRef<AbortController|null>(null), pending=useRef(false);
  useEffect(()=>()=>owner.current?.abort(),[]);
  async function work(action:(signal:AbortSignal)=>Promise<void>) {
    if(pending.current)return;
    pending.current=true;setBusy(true);setError("");
    const controller=new AbortController();owner.current=controller;
    try {await action(controller.signal);}
    catch(error){if(!controller.signal.aborted)setError(error instanceof Error ? error.message : "Please retry.");}
    finally{pending.current=false;if(!controller.signal.aborted)setBusy(false);}
  }
  async function review(proposed:Strategy|"short_term"|null=null) {
    await work(async signal=>{
      if(!value.revision)throw new Error("Reload your saved profile before editing.");
      const request:EditRequest={inputs:editInputs(answers),proposed_approach:proposed,expected_revision:value.revision};
      const result=await profileEditRequest(false,request,userId,signal) as EditPreview;
      if(!signal.aborted){setPreview(result);setPayload(request);setOptions(null);}
    });
  }
  async function compare() {
    await work(async signal=>{
      const result=await approachRequest("approaches",editInputs(answers),userId,signal);
      if(!validApproaches(result))throw new Error("We couldn’t load the approaches. Please retry.");
      if(!signal.aborted)setOptions(result);
    });
  }
  async function save() {
    if(!payload||!preview)return;
    await work(async signal=>{const result=await profileEditRequest(true,payload,userId,signal);if(!signal.aborted&&isPlanV2(result))onSaved(result);});
  }
  return <section className="arbor-panel mx-auto w-full max-w-2xl" aria-label="Investment profile editor">
    <button type="button" disabled={busy} className="entry-link mb-4 min-h-11" onClick={onCancel}>Cancel editing</button>
    {!preview ? <>
      <h2 className="text-2xl font-semibold text-slate-900">Review your investment profile</h2>
      <p className="mt-3 text-sm text-slate-600">Your current plan remains {planChoiceLabel(value)} unless you choose another approach. A short-term horizon pauses long-term allocations without deleting your saved choice.</p>
      {field ? <form className="mt-6" onSubmit={e=>{e.preventDefault();if(!answerError(field,answers[field]))setField(null);}} onKeyDown={e=>{
        const target=e.target as HTMLElement;
        onboardingEnter({key:e.key,repeat:e.repeat,isComposing:e.nativeEvent.isComposing,tagName:target.tagName,choice:target.hasAttribute("data-onboarding-choice"),contentEditable:target.isContentEditable,preventDefault:()=>e.preventDefault()},()=>{if(!answerError(field,answers[field]))e.currentTarget.requestSubmit();});
      }}><OnboardingQuestionV2 field={field} value={answers[field]} onChange={text=>{setAnswers(previous=>({...previous,[field]:text}));setError("");}} />
        <button disabled={!!answerError(field,answers[field])} className="entry-primary mt-5 w-full disabled:opacity-50">Done editing this answer</button>
      </form> : <><div className="mt-5 divide-y divide-slate-200">{ONBOARDING_STEPS.map(key=><button type="button" key={key} disabled={busy} onClick={()=>setField(key)} className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 py-3 text-left text-sm"><span className="font-medium text-slate-900">{EDIT_LABELS[key]}</span><span className="text-slate-600">{displayAnswer(key,answers[key])} <span aria-hidden="true">›</span></span></button>)}</div>
        <button type="button" disabled={busy} className="entry-primary mt-5 w-full disabled:opacity-50" onClick={()=>void review()}>Preview changes</button></>}
    </> : <>
      <ProfileEditReview preview={preview}/>
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={busy} className="entry-secondary" onClick={()=>{setPreview(null);setPayload(null);setOptions(null);}}>Edit answers</button>
        <button type="button" disabled={busy} className="entry-secondary" onClick={()=>void review()}>Keep {planChoiceLabel(value)}</button>
        <button type="button" disabled={busy} className="entry-secondary" onClick={()=>void compare()}>Compare approaches</button></div>
      {options && <div className="mt-6"><ApproachOptions options={options} selected={payload?.proposed_approach??""} onSelect={choice=>{if(!busy)void review(choice);}} /></div>}
      {!options && <button type="button" disabled={busy} className="entry-primary mt-6 w-full whitespace-normal disabled:opacity-50" onClick={()=>void save()}>{editSaveLabel(preview)}</button>}
    </>}
    {busy && <p role="status" className="mt-4 text-sm text-slate-600">Checking your changes…</p>}
    {error && <div className="mt-4"><p role="alert" className="text-sm text-slate-700">{error}</p><button type="button" disabled={busy} className="entry-link min-h-11" onClick={()=>void work(async signal=>{const saved=await getAccountProfile(userId,undefined,signal);if(saved&&isPlanV2(saved)&&!signal.aborted)onSaved(saved);})}>Reload saved profile (discard edits)</button></div>}
  </section>;
}
