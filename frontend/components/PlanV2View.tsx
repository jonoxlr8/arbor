"use client";
import { useState, useSyncExternalStore } from "react";
import AppShell from "./app/AppShell";
import { AppearanceSettings } from "./app/Appearance";
import { subscribeNavigation, navigationSnapshot, serverNavigationSnapshot, type Destination } from "@/lib/appNavigation";
import type { AccountPlan, PlanV2 } from "@/lib/types/planV2";
import { HORIZON_OPTIONS } from "@/lib/onboardingV2";
import PreferencesV2 from "./PreferencesV2";
import ContributionCard from "./contributions/ContributionCard";
import ApproachSelection from "./ApproachSelection";
import ChatSection from "./dashboard/ChatSection";

export default function PlanV2View({ value, userId, onSignOut, signingOut, logoutError, onPlanChange }: {
  value: PlanV2; userId?: string; onSignOut: () => void; signingOut: boolean; logoutError: string; onPlanChange?: (plan: AccountPlan) => void;
}) {
  const active = useSyncExternalStore(subscribeNavigation, navigationSnapshot, serverNavigationSnapshot);
  const [choosing, setChoosing] = useState(false);
  const [previousDestination, setPreviousDestination] = useState(active);
  if (previousDestination !== active) {
    setPreviousDestination(active);
    setChoosing(false);
  }
  return <AppShell active={active} name={value.profile.full_name} onSignOut={onSignOut} signingOut={signingOut} logoutError={logoutError}>
    {choosing && userId && onPlanChange ? <ApproachSelection input={value.profile} userId={userId} existing onBack={() => setChoosing(false)} onComplete={plan => { onPlanChange(plan); setChoosing(false); }} /> : <>
      {(active === "home" || active === "plan") && userId && onPlanChange && <button className="entry-secondary mb-5" onClick={() => setChoosing(true)}>Explore approaches</button>}
      <V2Destination value={value} active={active} userId={userId} />
    </>}
  </AppShell>;
}

export function V2Destination({ value, active, userId }: { value: PlanV2; active: Destination; userId?: string }) {
  if (active === "ask") return <ChatSection key={userId} plan={value} />;
  if (active === "portfolio" && value.plan.plan_basis !== "user_selected") return <section className="arbor-panel"><h2 className="text-xl font-semibold text-slate-900">Choose a plan for your scenarios</h2><p className="mt-3 text-sm text-slate-600">Your existing plan is preserved. Review the standard approaches and explicitly choose one before exploring new contribution scenarios.</p><a className="entry-link mt-4 inline-flex min-h-11 items-center" href="#plan">Explore approaches in Plan</a></section>;
  if (active === "portfolio" && userId) return <div className="space-y-6">
    <ContributionCard key={`${userId}:${JSON.stringify(value)}`} value={value} userId={userId} />
    <section className="arbor-panel"><h2 className="text-lg font-semibold text-slate-900">Recorded portfolio</h2><p className="mt-2 text-sm text-slate-600">Saved holdings and Plan Alignment are not yet connected to this plan. Scenarios use only the market values you enter above.</p></section>
  </div>;
  if (active === "portfolio") return <section className="arbor-panel">
    <h2 className="text-xl font-semibold text-slate-900">Portfolio tools are not available for this plan yet</h2>
    <p className="mt-3 text-sm text-slate-600">Holdings and Plan Alignment are not yet connected to this plan.</p>
    <a href="#plan" className="entry-link mt-4 inline-flex min-h-11 items-center">View your plan</a>
  </section>;
  if (active === "settings") return <div className="space-y-6">
    <AppearanceSettings />
    <section className="arbor-panel">
      <h2 className="text-xl font-semibold text-slate-900">Your profile</h2>
      <dl className="mt-4 space-y-3 text-sm text-slate-700">
        <div><dt>Name</dt><dd className="font-semibold">{value.profile.full_name}</dd></div>
        <div><dt>Country</dt><dd className="font-semibold">{value.profile.country}</dd></div>
        <div><dt>Planning currency</dt><dd className="font-semibold">{value.profile.currency}</dd></div>
      </dl>
      <p className="mt-4 text-sm text-slate-600">Editing this strategy profile is not available yet.</p>
    </section>
  </div>;
  return <V2PlanContent value={value} />;
}

function V2PlanContent({ value }: { value: PlanV2 }) {
  const { profile, plan, profile_warning } = value;
  const readiness = plan.readiness;
  const stateLabel = {ready: "Ready", getting_ready: "Getting Ready", foundation_first: "Foundation First"}[readiness.readiness];
  const horizon = HORIZON_OPTIONS.find(([code]) => code === plan.selection.horizon)?.[1];
  return <div className="w-full max-w-2xl space-y-6">
      {profile_warning && <p role="status" className="text-sm text-slate-600">{profile_warning}</p>}
      <div><p className="text-sm text-slate-600">{plan.plan_basis === "user_selected" ? "Your selected plan" : "Your existing plan"}, {profile.full_name}</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-900">{plan.path === "short_term" ? "A short-term path" : `${plan.selected_strategy} strategy${!readiness.actionable_contribution_guidance_allowed ? " preview" : ""}`}</h2>
      </div>
      {plan.plan_basis !== "user_selected" && <p className="text-sm text-slate-600">This saved plan came from an earlier assessment. It has not been changed or recorded as your explicit model choice. Explore approaches to choose a standard plan.</p>}
      <section className="arbor-panel">
        <h2 className="text-lg font-semibold text-slate-900">{stateLabel}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {readiness.message_requirement === "foundation_first" ? "Your answers indicate difficult-to-manage high-interest debt. This plan is a preview; contribution allocations are paused in this tool."
            : readiness.message_requirement === "readiness_caution" ? "Your savings or debt answers flag a financial-foundation consideration. Scenarios do not assess whether an investment is right for you."
            : "Your savings and debt answers meet Arbor’s readiness check."}
        </p>
      </section>
      {plan.path === "short_term" ? <section className="arbor-panel"><p className="text-sm leading-6 text-slate-600">You may need this money in less than 3 years. Arbor’s long-term strategies do not apply to this plan. No long-term allocation, planning return or investment contribution guidance is provided.</p></section>
        : <section className="arbor-panel">
          <h2 className="text-lg font-semibold text-slate-900">Standard model allocation</h2>
          <dl className="mt-4 divide-y divide-slate-200">{plan.base_allocation.map(weight => <div key={weight.role} className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">{weight.role === "global_equity" ? "Global equity" : "Defensive"}</dt><dd className="text-2xl font-semibold text-slate-900">{weight.percentage_points}%</dd></div>)}</dl>
          <p className="mt-4 font-semibold text-slate-900">Planning return: {plan.planning_return_pct.toFixed(1)}%</p>
          <p className="mt-2 text-sm text-slate-600">An annual effective modeling assumption, not a forecast or guarantee. Inflation assumption: {plan.inflation_pct.toFixed(1)}%.</p>
          {plan.selection.cap_applied && <p className="mt-4 text-sm leading-6 text-slate-600">Assessment context: {plan.selection.requested_strategy} volatility comfort; the horizon check for {horizon} returned {plan.selection.selected_strategy}. {plan.plan_basis === "user_selected" ? "This does not override your model choice." : "This was used by the earlier assessment flow."}</p>}
        </section>}
      {plan.plan_basis !== "user_selected" ? <details className="space-y-4"><summary className="min-h-11 cursor-pointer py-3 font-medium text-slate-700">Earlier assessment and preference data</summary><PreferencesV2 value={value} historical /></details> : <p className="text-sm text-slate-600">Your selected target is the standard model above. Any historical Technology or Bitcoin requests remain saved, but are not applied to this model.</p>}
      <p className="text-sm leading-6 text-slate-500">Planning currency: PHP. This is a strategic plan, not a product recommendation or an investment order. Arbor does not purchase or hold investments for you.</p>
    </div>;
}
