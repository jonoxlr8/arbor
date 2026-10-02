"use client";
import AccountPrivacy from "./account/AccountPrivacy";
import ChangePassword from "./ChangePassword";
import { useEffect, useState, useSyncExternalStore } from "react";
import AppShell from "./app/AppShell";
import { AppearanceSettings } from "./app/Appearance";
import { subscribeNavigation, navigationSnapshot, serverNavigationSnapshot, sectionSnapshot, type Destination } from "@/lib/appNavigation";
import type { AccountPlan, PlanV2 } from "@/lib/types/planV2";
import { HORIZON_OPTIONS } from "@/lib/onboardingV2";
import PreferencesV2 from "./PreferencesV2";
import LivePortfolio from "./portfolio/LivePortfolio";
import MonthlyInvesting from "./contributions/MonthlyInvesting";
import MonthlyPendingRecording from "./contributions/MonthlyPendingRecording";
import InvestmentProfileEditor from "./InvestmentProfileEditor";
import ChatSection from "./dashboard/ChatSection";
import { AccountAccessProvider, AccountPlans, PlusFeature, AccessLoading, useAccountAccess, accountPlanLabel } from "./AccountAccess";
import PlanImplementation, { TrackingAvailability } from "./portfolio/PlanImplementation";
import { planTargets } from "@/lib/planImplementation";
import V2Home from "./app/V2Home";
import Allocation from "./portfolio/Allocation";
import SettingsIcon from "./app/SettingsIcon";
import PortfolioWhatIf from "./portfolio/PortfolioWhatIf";
import PortfolioPlanningTools from "./portfolio/PortfolioPlanningTools";

type Props = {
  value: PlanV2; userId?: string; onSignOut: () => void; signingOut: boolean; logoutError: string; onPlanChange?: (plan: AccountPlan) => void;
};
export default function PlanV2View(props: Props) {
  return <AccountAccessProvider key={props.userId} userId={props.userId}><PlanV2Shell {...props} /></AccountAccessProvider>;
}
function PlanV2Shell({ value, userId, onSignOut, signingOut, logoutError, onPlanChange }: Props) {
  const active = useSyncExternalStore(subscribeNavigation, navigationSnapshot, serverNavigationSnapshot);
  const section = useSyncExternalStore(subscribeNavigation, sectionSnapshot, () => "");
  const [reviewMonth,setReviewMonth]=useState<string>();
  const [chatVisited, setChatVisited] = useState(false);
  if (active === "ask" && !chatVisited) setChatVisited(true);
  const [choosing, setChoosing] = useState(false);
  const [editMode,setEditMode]=useState<"profile"|"plan">("profile");
  const [previousDestination, setPreviousDestination] = useState(active);
  useEffect(() => {
    if (!section) return;
    document.getElementById(`section-${section}`)?.scrollIntoView({ block: "start" });
  }, [active, section]);
  if (previousDestination !== active) {
    setPreviousDestination(active);
    setChoosing(false);
  }
  return <AppShell active={active} pageTitle={(active === "home" && section === "monthly") || (active === "portfolio" && section === "contribution") ? "Investment breakdown" : active === "portfolio" && section === "what-if" ? "What-if" : undefined} name={value.profile.full_name} onSignOut={onSignOut} signingOut={signingOut} logoutError={logoutError}>
    {choosing && userId && onPlanChange ? <PlusFeature feature="profile_rebuild" title="Review and rebuild your investment profile" onBack={() => setChoosing(false)}><InvestmentProfileEditor value={value} userId={userId} initialMode={editMode} onCancel={() => setChoosing(false)} onSaved={plan => { onPlanChange(plan); setChoosing(false); }} /></PlusFeature> : <>
      {((active === "home" && section === "monthly") || (active === "portfolio" && section === "contribution")) && userId && onPlanChange ? <div className="monthly-page"><MonthlyPendingRecording userId={userId}/><PlusFeature feature="monthly_contribution_planner" title="Investment breakdown"><MonthlyInvesting value={value} userId={userId} onPlanChange={onPlanChange} backHref={active==="home"?"#home":"#portfolio"}/></PlusFeature></div> : active === "home" && (section === "plan" ? <><a href="#home" className="entry-link min-h-11 inline-flex items-center">‹ Home</a><V2PlanContent value={value}/></> : <V2Home value={value} userId={userId} section={section} onPlanChange={onPlanChange}/>)}
      {active === "settings" && userId && onPlanChange && <section id="section-investment" className="settings-list" aria-label="Account and plan settings">
        <p className="settings-group-label">Account</p>
        <div className="settings-account-header"><span aria-hidden="true">{value.profile.full_name.trim().slice(0,1)}</span><div><strong>{value.profile.full_name}</strong><small>Your Arbor account</small></div></div>
        <details><summary><SettingsIcon kind="account"/><span>Account details</span></summary><dl className="mt-4 space-y-3 text-sm text-slate-700"><div><dt>Name</dt><dd className="font-semibold">{value.profile.full_name}</dd></div><div><dt>Country</dt><dd className="font-semibold">{value.profile.country}</dd></div><div><dt>Planning currency</dt><dd className="font-semibold">{value.profile.currency}</dd></div></dl></details>
        <p className="settings-group-label">Plan</p>
        <a className="settings-row" href="#home/plan"><SettingsIcon kind="plan"/><span>Your plan<small className="block mt-1">{value.plan.path === "short_term" ? "Short-term path" : value.plan.selected_strategy}</small></span><span aria-hidden="true">›</span></a>
        <a className="settings-row" href="#home"><SettingsIcon kind="plan"/><span>Your goal<small className="block mt-1">View or edit your primary goal</small></span><span aria-hidden="true">›</span></a>
        <button className="settings-row" aria-label="Edit investment profile" onClick={() => {setEditMode("profile");setChoosing(true);}}><SettingsIcon kind="plan"/><span>Investment profile<small className="block mt-1">Review or change your answers · Arbor Plus</small></span><span aria-hidden="true">›</span></button>
        <button className="settings-row" onClick={()=>{setEditMode("plan");setChoosing(true);}}><SettingsIcon kind="plan"/><span>Change plan<small className="block mt-1">Changes targets, not investments · Arbor Plus</small></span><span aria-hidden="true">›</span></button>
        <a className="settings-row" href="#portfolio/ways"><SettingsIcon kind="plan"/><span>Your investment choices<small className="block mt-1">Ways to invest your plan</small></span><span aria-hidden="true">›</span></a>
      </section>}
      {active !== "home" && active !== "ask" && !(active==="portfolio"&&section==="contribution") && <V2Destination key={`${active}:${JSON.stringify(value)}`} value={value} active={active} userId={userId} section={section} onPlanChange={onPlanChange} reviewMonth={reviewMonth} onReviewMonthChange={setReviewMonth}/>}
    </>}
    {chatVisited && <div hidden={active !== "ask" || choosing}><ChatSection key={`${userId}:${JSON.stringify(value)}`} plan={value} /></div>}
  </AppShell>;
}

export function V2Destination({ value, active, userId, section = "", onPlanChange, reviewMonth, onReviewMonthChange }: { value: PlanV2; active: Destination; userId?: string; section?: string; onPlanChange?: (value:PlanV2)=>void;reviewMonth?:string;onReviewMonthChange?:(month:string)=>void }) {
  const access = useAccountAccess();
  if (active === "ask") return <ChatSection key={userId} plan={value} />;
  if (active === "portfolio" && userId && !access?.value) return <AccessLoading />;
  const tracking = access?.value?.availability?.live_portfolio === true && access.value.features.includes("live_portfolio");
  if(active==="portfolio"&&section==="what-if"&&userId)return <PlusFeature feature="future_projection" title="What-if exploration"><PortfolioWhatIf value={value} userId={userId}/></PlusFeature>;
  if (active === "portfolio") return <div className="space-y-5">
    {tracking && userId ? <LivePortfolio key={section === "add" ? "add" : "portfolio"} value={value} userId={userId} section={section} onPlanChange={onPlanChange} reviewMonth={reviewMonth} onReviewMonthChange={onReviewMonthChange}/> : <>
      <PlanImplementation value={value} userId={userId} onPlanChange={onPlanChange}/>
      <TrackingAvailability/>
      <PortfolioPlanningTools/>
    </>}
    {value.plan.path === "short_term" || value.plan.plan_basis !== "user_selected" ? <p className="text-sm leading-6 text-slate-600">{value.plan.path === "short_term" ? "Long-term monthly investing is paused on your short-term path." : "Your historical plan remains saved. Explicitly choose an approach before exploring monthly investing."} <a className="entry-link" href="#settings/investment">Review investment profile</a></p> : null}
  </div>;
  if (active === "settings") return <div className="settings-list">
    <p className="settings-group-label">Subscription</p>
    <details id="section-plus" open={section === "plus"}><summary><SettingsIcon kind="plus"/><span>{access?.value?accountPlanLabel(access.value):"Your Arbor access"}<small className="block mt-1">{access?.value?.effective_tier==="plus"&&access.value.status==="trial" ? access.value.private_beta?"Private beta · No card or billing date":"Trial access" : access?.value?.effective_tier === "free" ? "Your current plan · Compare access" : "Active access · Your current plan"}</small></span></summary><AccountPlans /></details>
    <p className="settings-group-label">Appearance</p>
    <AppearanceSettings />
    <p className="settings-group-label">Security</p>
    {userId && <details><summary><SettingsIcon kind="account"/><span>Change password<small className="block mt-1">Account &amp; security</small></span></summary><ChangePassword userId={userId}/></details>}
    <p className="settings-group-label">About and data</p>
    {userId && <AccountPrivacy key={userId} userId={userId}/> }
    <details><summary><SettingsIcon kind="help"/><span>Help &amp; disclosures</span></summary><p className="mt-2 text-sm text-slate-600">Ask Arbor can explain your plan and how existing tools work. You make your own investment decisions; projections are hypothetical. Arbor does not execute trades or hold your money.</p><a className="entry-link" href="#ask">Ask about Arbor →</a><p className="mt-3 text-xs text-slate-500">Arbor’s category and provider icons are original graphics. Investment and provider names are shown for identification only and do not imply affiliation, sponsorship or endorsement.</p></details>
  </div>;
  return <V2PlanContent value={value} />;
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
      <details className="border-b border-slate-200"><summary className="text-sm">Financial readiness · {stateLabel}</summary>
        <h2 className="text-lg font-semibold text-slate-900">{stateLabel}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {readiness.message_requirement === "foundation_first" ? "Your answers indicate difficult-to-manage high-interest debt. This plan is a preview; contribution allocations are paused in this tool."
            : readiness.message_requirement === "readiness_caution" ? "Your savings or debt answers flag a financial-foundation consideration. Scenarios do not assess whether an investment is right for you."
            : "Your savings and debt answers meet Arbor’s readiness check."}
        </p>
      </details>
      {plan.path === "short_term" ? <section className="arbor-panel"><p className="text-sm leading-6 text-slate-600">The short-term path is active. No long-term allocation, planning return or investment contribution guidance is provided. Review your profile and compare approaches if your planning horizon changes.</p></section>
        : <section className="arbor-panel">
          <h2 className="text-lg font-semibold text-slate-900">Your model targets</h2>
          <Allocation weights={planTargets(value)}/>
          <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 font-medium">Planning assumptions</summary><p className="mt-4 font-semibold text-slate-900">Planning return: {plan.planning_return_pct.toFixed(1)}%</p>
          <p className="mt-2 text-sm text-slate-600">An annual effective modeling assumption, not a forecast or guarantee. Inflation assumption: {plan.inflation_pct.toFixed(1)}%.</p>
          {plan.selection.cap_applied && <p className="mt-4 text-sm leading-6 text-slate-600">Assessment context: {plan.selection.requested_strategy} volatility comfort; the horizon check for {horizon} returned {plan.selection.selected_strategy}. {plan.plan_basis === "user_selected" || plan.historical_allocation_preserved ? "This does not override your saved plan." : "This was used by the earlier assessment flow."}</p>}
          </details>
        </section>}
      {plan.plan_basis !== "user_selected" ? <details className="space-y-4"><summary className="min-h-11 cursor-pointer py-3 font-medium text-slate-700">Earlier assessment and preference data</summary><PreferencesV2 value={value} historical /></details> : plan.path === "long_term" && <p className="text-sm text-slate-600">{plan.customization && (plan.customization.technology_tilt || plan.customization.bitcoin) ? "You chose the optional exposure shown in these targets. Your original core approach remains unchanged." : "You chose this core approach. Technology and Bitcoin are optional, not required."}</p>}
      {value.historical_plan && plan.plan_basis === "user_selected" && <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-slate-700">Preserved historical allocation</summary><PreferencesV2 value={{...value,plan:value.historical_plan}} historical /></details>}
      <p className="text-sm leading-6 text-slate-500">Planning currency: PHP. This is a strategic plan, not a product recommendation or an investment order. Arbor does not purchase or hold investments for you.</p>
    </div>;
}
