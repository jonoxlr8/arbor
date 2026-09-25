"use client";
import { useState } from "react";
import type { PlanV2 } from "@/lib/types/planV2";
import type { Sleeve } from "@/lib/types/contributions";
import { implementationGroups, planTargets, providerDestination } from "@/lib/planImplementation";
import { investmentIdentity, providerName } from "@/lib/investmentIdentity";
import { SLEEVE_LABELS } from "@/lib/contributions";
import InvestmentIdentity from "../InvestmentIdentity";
import ProviderIdentity from "../ProviderIdentity";
import { sleeveColors } from "../AssetIdentity";
import Allocation from "./Allocation";
import ImplementationPicker from "./ImplementationPicker";

export function TrackingAvailability({ plus }: { plus: boolean }) {
  return <div className="tracking-availability">
    <span className="tracking-symbol" aria-hidden="true">◷</span>
    <div><strong>{plus ? "Your portfolio, ready for its next chapter" : "Portfolio tracking with Arbor Plus"}</strong>
      <p>{plus ? "Tracking is included in Plus and will be available once it’s released. Your saved plan remains available." : "See recorded holdings, value history and comparisons with your targets. Your plan and ways to invest stay available on Free."}</p></div>
    {!plus && <a className="entry-link" href="#settings/plus">Explore Arbor Plus <span aria-hidden="true">↗</span></a>}
  </div>;
}

export default function PlanImplementation({ value, onRecord, intro = true, userId, onPlanChange }: { value: PlanV2; onRecord?: () => void; intro?: boolean; userId?: string; onPlanChange?: (value: PlanV2) => void }) {
  const [choosing,setChoosing]=useState<Sleeve|null>(null);
  const groups = implementationGroups(value);
  if (!groups.length) return null; // Foundation/short-term guidance remains upstream.
  return <section className="plan-implementation" aria-label="Ways to invest your plan">
    {intro && <div className="implementation-plan">
      <div><p className="eyebrow">{value.plan.plan_basis === "user_selected" ? "Chosen by you" : "Your saved approach"}</p>
        <h2>Your {value.plan.selected_strategy} plan</h2>
        <p>{value.plan.plan_basis === "user_selected" ? "The targets you chose. The way you put them into practice is yours, too." : "Your historical targets stay unchanged. These are ways to understand them, not a new plan."}</p>
        <a className="entry-link" href="#portfolio/plan">Plan details <span aria-hidden="true">↗</span></a>
      </div><Allocation weights={planTargets(value)} />
    </div>}
    <header className="ways-heading"><div><h2>Ways to invest</h2><p>Explore options for each part of your plan.</p></div><span>Choose your provider</span></header>
    {value.plan.readiness.readiness === "getting_ready" && <p className="implementation-caution">Your readiness check flags a financial-foundation consideration. Review your saved plan before exploring a contribution.</p>}
    {groups.map(group => <section className="implementation-sleeve" key={group.role} data-sleeve={group.role}>
      <header><h3><span className="allocation-dot" style={{ background: sleeveColors[group.role] }}/>{SLEEVE_LABELS[group.role]}</h3><span>{group.percentage_points}% target</span></header>
      {userId&&onPlanChange&&value.plan.plan_basis==="user_selected"&&<div className="implementation-saved-choice"><p>{value.profile.implementation_choices?.[group.role]?<>Your choice: <strong>{investmentIdentity(value.profile.implementation_choices[group.role]!).shortName}</strong></>:"No investment chosen yet"}</p><button className="entry-link" onClick={()=>setChoosing(group.role)}>{value.profile.implementation_choices?.[group.role]?"Change":"Choose investment"}</button></div>}
      <ul className="implementation-options">{group.options.map(option => {
        const identity = investmentIdentity(option.product);
        const href = providerDestination(option.provider);
        return <li className="implementation-option" key={option.product} data-product={option.product}>
          <InvestmentIdentity product={option.product}/>
          <div className="implementation-identity"><strong>{identity.category === "etf" ? identity.shortName : identity.fullName}</strong>
            <p>{identity.category === "etf" ? identity.fullName : identity.description}{identity.unitClass && <span> · {identity.unitClass}</span>}</p>
            <ProviderIdentity provider={option.provider}/>
          </div>
          {href && <a className="provider-open" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${providerName(option.provider)} (opens in a new tab)`}>Open {providerName(option.provider)} <span aria-hidden="true">↗</span></a>}
        </li>;
      })}</ul>
    </section>)}
    <p className="implementation-footnote">Options are listed by provider name, not ranked. Funds and ETFs differ in holdings, fees and structure. Check availability and terms with your provider.</p>
    <div className="record-return"><div><h3>{onRecord ? "Already invested?" : "Your choices. Your provider."}</h3><p>You invest through your provider. Arbor does not place trades or move money.</p>{onRecord && <small>Come back to record what you own—not a broker transaction.</small>}</div>
      {onRecord && <button type="button" className="entry-primary" onClick={onRecord}>+ Record investment</button>}
    </div>
    {choosing&&userId&&onPlanChange&&<ImplementationPicker value={value} userId={userId} sleeve={choosing} onClose={()=>setChoosing(null)} onSaved={onPlanChange}/>}
  </section>;
}
