"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import AppShell from "./app/AppShell";
import { AppearanceSettings } from "./app/Appearance";
import { subscribeNavigation, navigationSnapshot, serverNavigationSnapshot, sectionSnapshot, type Destination } from "@/lib/appNavigation";
import type { AccountPlan, PlanV2 } from "@/lib/types/planV2";
import { HORIZON_OPTIONS } from "@/lib/onboardingV2";
import PreferencesV2 from "./PreferencesV2";
import LivePortfolio from "./portfolio/LivePortfolio";
import ContributionCard from "./contributions/ContributionCard";
import InvestmentProfileEditor from "./InvestmentProfileEditor";
import ChatSection from "./dashboard/ChatSection";
import NextActionCard from "./NextActionCard";
import { AccountAccessProvider, AccountPlans, PlusFeature, AccessLoading, useAccountAccess } from "./AccountAccess";
import { ImplementationEducation } from "./contributions/ImplementationChoices";
import V2Home from "./app/V2Home";
import { SLEEVE_LABELS } from "@/lib/contributions";

type Props = {
  value: PlanV2; userId?: string; onSignOut: () => void; signingOut: boolean; logoutError: string; onPlanChange?: (plan: AccountPlan) => void;
};
export default function PlanV2View(props: Props) {
  return <AccountAccessProvider key={props.userId} userId={props.userId}><PlanV2Shell {...props} /></AccountAccessProvider>;
}
function PlanV2Shell({ value, userId, onSignOut, signingOut, logoutError, onPlanChange }: Props) {
  const active = useSyncExternalStore(subscribeNavigation, navigationSnapshot, serverNavigationSnapshot);
  const section = useSyncExternalStore(subscribeNavigation, sectionSnapshot, () => "");
  const [chatVisited, setChatVisited] = useState(false);
  if (active === "ask" && !chatVisited) setChatVisited(true);
  const [choosing, setChoosing] = useState(false);
  const [previousDestination, setPreviousDestination] = useState(active);
  useEffect(() => {
    if (!section) return;
    document.getElementById(`section-${section}`)?.scrollIntoView({ block: "start" });
  }, [active, section]);
  if (previousDestination !== active) {
    setPreviousDestination(active);
    setChoosing(false);
  }
  return <AppShell active={active} name={value.profile.full_name} onSignOut={onSignOut} signingOut={signingOut} logoutError={logoutError}>
    {choosing && userId && onPlanChange ? <PlusFeature feature="profile_rebuild" title="Review and rebuild your investment profile" onBack={() => setChoosing(false)}><InvestmentProfileEditor value={value} userId={userId} onCancel={() => setChoosing(false)} onSaved={plan => { onPlanChange(plan); setChoosing(false); }} /></PlusFeature> : <>
      {active === "home" && <V2Home value={value} userId={userId} nextAction={userId && <NextActionCard key={`${userId}:${JSON.stringify(value)}`} userId={userId} onAction={(destination,action)=>{
        window.location.hash = destination === "investment_profile" || destination === "onboarding" ? "settings/investment" : destination === "settings" ? "settings/plus" : destination === "plan" ? "portfolio/plan" : action.key === "monthly_complete" ? "portfolio" : action.key === "review_monthly_contribution" ? "portfolio/contribution" : "portfolio/holdings";
      }}/>}/>}
      {active === "settings" && userId && onPlanChange && <section id="section-investment" className="mb-6" aria-label="Investment profile"><h2 className="text-xl font-semibold">Investment Profile</h2><p className="mt-2 text-sm text-slate-600">Review your answers, compare approaches and preview changes. Your plan stays the same until you confirm.</p><button className="entry-secondary mt-4" onClick={() => setChoosing(true)}>Edit investment profile</button></section>}
      {active !== "home" && active !== "ask" && <V2Destination key={`${active}:${JSON.stringify(value)}`} value={value} active={active} userId={userId} section={section} />}
    </>}
    {chatVisited && <div hidden={active !== "ask" || choosing}><ChatSection key={`${userId}:${JSON.stringify(value)}`} plan={value} /></div>}
  </AppShell>;
}

export function V2Destination({ value, active, userId, section = "" }: { value: PlanV2; active: Destination; userId?: string; section?: string }) {
  const access = useAccountAccess();
  if (active === "ask") return <ChatSection key={userId} plan={value} />;
  if (active === "portfolio" && userId && !access?.value) return <AccessLoading />;
  if (active === "portfolio") return <div className="max-w-3xl space-y-8">
    {userId && access?.value?.availability?.live_portfolio === true && <PlusFeature feature="live_portfolio" title="Live Portfolio"><LivePortfolio value={value} userId={userId} section={section} /></PlusFeature>}
    <V2PlanContent value={value} />
    {value.plan.path === "short_term" || value.plan.plan_basis !== "user_selected" ? <p className="text-sm leading-6 text-slate-600">{value.plan.path === "short_term" ? "Long-term scenarios are paused on your short-term path." : "Your historical plan remains saved. Explicitly choose a standard approach before exploring new contribution scenarios."} <a className="entry-link" href="#settings/investment">Review investment profile</a></p> : userId && access?.value?.availability?.live_portfolio !== true && <ContributionDisclosure key={section} open={section === "contribution"} value={value} userId={userId} />}
    <ImplementationEducation />
  </div>;
  if (active === "settings") return <div className="space-y-6">
    <div id="section-plus"><AccountPlans /></div>
    <AppearanceSettings />
    <section className="arbor-panel">
      <h2 className="text-xl font-semibold text-slate-900">Account details</h2>
      <dl className="mt-4 space-y-3 text-sm text-slate-700">
        <div><dt>Name</dt><dd className="font-semibold">{value.profile.full_name}</dd></div>
        <div><dt>Country</dt><dd className="font-semibold">{value.profile.country}</dd></div>
        <div><dt>Planning currency</dt><dd className="font-semibold">{value.profile.currency}</dd></div>
      </dl>
      <p className="mt-4 text-sm text-slate-600">Use Edit investment profile to review assumptions and preview changes before saving.</p>
    </section>
    <section className="px-1"><h2 className="text-lg font-semibold">Help &amp; disclosures</h2><p className="mt-2 text-sm text-slate-600">Ask Arbor can explain your plan and how existing tools work. You make your own investment decisions; projections are hypothetical.</p><a className="entry-link" href="#ask">Ask about Arbor</a></section>
  </div>;
  return <V2PlanContent value={value} />;
}

function ContributionDisclosure({ value, userId, open }: { value: PlanV2; userId: string; open: boolean }) {
  const [expanded, setExpanded] = useState(open);
  return <section id="section-contribution"><button className="entry-primary" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>Review this month’s contribution</button>{expanded && <div className="mt-5"><PlusFeature feature="monthly_contribution_planner" title="Monthly Contribution Planner"><ContributionCard value={value} userId={userId} /></PlusFeature></div>}</section>;
}

export function V2PlanContent({ value }: { value: PlanV2 }) {
  const { plan, profile_warning } = value;
  const readiness = plan.readiness;
  const stateLabel = {ready: "Ready", getting_ready: "Getting Ready", foundation_first: "Foundation First"}[readiness.readiness];
  const horizon = HORIZON_OPTIONS.find(([code]) => code === plan.selection.horizon)?.[1];
  return <div id="section-plan" className="w-full max-w-2xl space-y-6">
      {profile_warning && <p role="status" className="text-sm text-slate-600">{profile_warning}</p>}
      <div><p className="text-sm text-slate-600">{plan.plan_basis === "user_selected" ? "Your plan" : "Your historical plan"}</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-900">{plan.path === "short_term" ? "A short-term path" : `${plan.selected_strategy}${!readiness.actionable_contribution_guidance_allowed ? " · preview" : ""}`}</h2>
      </div>
      {plan.plan_basis !== "user_selected" && <p className="text-sm text-slate-600">This saved plan came from an earlier assessment. It has not been changed or recorded as your explicit model choice. Explore approaches to choose a standard plan.</p>}
      {plan.dormant_selected_approach && <p className="text-sm text-slate-600">Your {plan.dormant_selected_approach} choice remains saved but dormant. A long-term horizon restores it; no long-term allocation is active now.</p>}
      {plan.historical_allocation_preserved && <p className="text-sm text-slate-600">Your historical allocation is preserved separately from the updated assessment and readiness. Readiness restrictions still apply.</p>}
      <section className="arbor-panel">
        <h2 className="text-lg font-semibold text-slate-900">{stateLabel}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {readiness.message_requirement === "foundation_first" ? "Your answers indicate difficult-to-manage high-interest debt. This plan is a preview; contribution allocations are paused in this tool."
            : readiness.message_requirement === "readiness_caution" ? "Your savings or debt answers flag a financial-foundation consideration. Scenarios do not assess whether an investment is right for you."
            : "Your savings and debt answers meet Arbor’s readiness check."}
        </p>
      </section>
      {plan.path === "short_term" ? <section className="arbor-panel"><p className="text-sm leading-6 text-slate-600">The short-term path is active. No long-term allocation, planning return or investment contribution guidance is provided. Review your profile and compare approaches if your planning horizon changes.</p></section>
        : <section className="arbor-panel">
          <h2 className="text-lg font-semibold text-slate-900">Your model targets</h2>
          <dl className="mt-4 divide-y divide-slate-200">{(plan.plan_basis !== "user_selected" ? plan.preference_result?.effective_target?.allocation.weights ?? plan.base_allocation : plan.base_allocation).map(weight => <div key={weight.role} className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">{SLEEVE_LABELS[weight.role]}</dt><dd className="text-2xl font-semibold text-slate-900">{weight.percentage_points}%</dd></div>)}</dl>
          <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 font-medium">Planning assumptions</summary><p className="mt-4 font-semibold text-slate-900">Planning return: {plan.planning_return_pct.toFixed(1)}%</p>
          <p className="mt-2 text-sm text-slate-600">An annual effective modeling assumption, not a forecast or guarantee. Inflation assumption: {plan.inflation_pct.toFixed(1)}%.</p>
          {plan.selection.cap_applied && <p className="mt-4 text-sm leading-6 text-slate-600">Assessment context: {plan.selection.requested_strategy} volatility comfort; the horizon check for {horizon} returned {plan.selection.selected_strategy}. {plan.plan_basis === "user_selected" || plan.historical_allocation_preserved ? "This does not override your saved plan." : "This was used by the earlier assessment flow."}</p>}
          </details>
        </section>}
      {plan.plan_basis !== "user_selected" ? <details className="space-y-4"><summary className="min-h-11 cursor-pointer py-3 font-medium text-slate-700">Earlier assessment and preference data</summary><PreferencesV2 value={value} historical /></details> : plan.path === "long_term" && <p className="text-sm text-slate-600">Your selected target is the standard model above. Any historical Technology or Bitcoin requests remain saved, but are not applied to this model.</p>}
      {value.historical_plan && plan.plan_basis === "user_selected" && <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-slate-700">Preserved historical allocation</summary><PreferencesV2 value={{...value,plan:value.historical_plan}} historical /></details>}
      <p className="text-sm leading-6 text-slate-500">Planning currency: PHP. This is a strategic plan, not a product recommendation or an investment order. Arbor does not purchase or hold investments for you.</p>
    </div>;
}
