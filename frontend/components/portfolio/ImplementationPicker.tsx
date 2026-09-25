"use client";
import { useEffect, useRef, useState } from "react";
import type { PlanV2 } from "@/lib/types/planV2";
import type { Sleeve } from "@/lib/types/contributions";
import { PLAN_OPTIONS } from "@/lib/planImplementation";
import { investmentIdentity, providerName } from "@/lib/investmentIdentity";
import { monthlyPlanApi } from "@/lib/monthlyPlan";
import { SLEEVE_LABELS } from "@/lib/contributions";
import InvestmentIdentity from "../InvestmentIdentity";
import ProviderIdentity from "../ProviderIdentity";
import Sheet from "../ui/Sheet";

export default function ImplementationPicker({value,userId,sleeve,onSaved,onClose}:{value:PlanV2;userId:string;sleeve:Sleeve;onSaved:(plan:PlanV2)=>void;onClose:()=>void}) {
  const [selected,setSelected]=useState(value.profile.implementation_choices?.[sleeve]??"");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  async function save(){
    if(request.current||!selected)return;
    const controller=new AbortController();request.current=controller;setBusy(true);setError("");
    try {
      const existing=value.profile.implementation_choices??{};
      const plan=await monthlyPlanApi.choose(userId,value,{...existing,[sleeve]:selected},controller.signal);
      if(!controller.signal.aborted){onSaved(plan);onClose();}
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Please retry.");}
    finally {request.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  return <Sheet title={`Choose ${SLEEVE_LABELS[sleeve]}`} onClose={onClose} busy={busy}>
    <p className="text-sm text-slate-600">Choose how you want to invest this part of your plan. Your targets will not change.</p>
    <div className="implementation-picker" role="radiogroup" aria-label={`${SLEEVE_LABELS[sleeve]} investment`}>
      {PLAN_OPTIONS[sleeve].map(option=><label key={option.product} className="implementation-pick">
        <input type="radio" name="implementation" value={option.product} checked={selected===option.product} disabled={busy} onChange={()=>setSelected(option.product)}/>
        <InvestmentIdentity product={option.product}/><span><strong>{investmentIdentity(option.product).shortName}</strong><ProviderIdentity provider={option.provider}/><small>{investmentIdentity(option.product).unitClass}</small></span>
      </label>)}
    </div>
    <p className="form-footnote">Options are not ranked. Check costs, availability and terms with your provider.</p>
    {error&&<p role="alert" className="my-3 text-sm">{error}</p>}
    <button className="entry-primary w-full" disabled={!selected||busy} onClick={()=>void save()}>{busy?"Saving choice…":selected?`Use ${investmentIdentity(selected).shortName} · ${providerName(PLAN_OPTIONS[sleeve].find(o=>o.product===selected)?.provider??"")}`:"Save my choice"}</button>
  </Sheet>;
}
