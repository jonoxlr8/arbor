"use client";
import { useSyncExternalStore } from "react";
import AppShell from "./app/AppShell";
import { AppearanceSettings } from "./app/Appearance";
import { subscribeNavigation, navigationSnapshot, serverNavigationSnapshot, type Destination } from "@/lib/appNavigation";
import type { PlanV2 } from "@/lib/types/planV2";
import { HORIZON_OPTIONS } from "@/lib/onboardingV2";
import PreferencesV2 from "./PreferencesV2";
import ContributionCard from "./contributions/ContributionCard";

export default function PlanV2View({ value, userId, onSignOut, signingOut, logoutError }: {
  value: PlanV2; userId?: string; onSignOut: () => void; signingOut: boolean; logoutError: string;
}) {
  const active = useSyncExternalStore(subscribeNavigation, navigationSnapshot, serverNavigationSnapshot);
  return <AppShell active={active} name={value.profile.full_name} onSignOut={onSignOut} signingOut={signingOut} logoutError={logoutError}>
    <V2Destination value={value} active={active} userId={userId} />
  </AppShell>;
}

export function V2Destination({ value, active, userId }: { value: PlanV2; active: Destination; userId?: string }) {
  if (active === "portfolio" && userId) return <div className="space-y-6">
    <ContributionCard key={`${userId}:${JSON.stringify(value)}`} value={value} userId={userId} />
    <section className="arbor-panel"><h2 className="text-lg font-semibold text-slate-900">Recorded portfolio</h2><p className="mt-2 text-sm text-slate-600">Saved holdings, alignment and Portfolio Health are not yet connected to this strategy. The contribution tool uses only the market values you enter above.</p></section>
  </div>;
  if (active === "portfolio" || active === "ask") return <section className="arbor-panel">
    <h2 className="text-xl font-semibold text-slate-900">{active === "portfolio" ? "Portfolio tools" : "Plan conversations"} are not available for this plan yet</h2>
    <p className="mt-3 text-sm text-slate-600">{active === "portfolio" ? "Holdings, alignment and Portfolio Health are not yet connected to your new strategy plan." : "Ask Arbor does not yet support your new strategy plan."}</p>
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
      <div><p className="text-sm text-slate-600">Your Arbor plan, {profile.full_name}</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-900">{plan.path === "short_term" ? "A short-term path" : `${plan.selected_strategy} strategy${!readiness.actionable_contribution_guidance_allowed ? " preview" : ""}`}</h2>
      </div>
      <section className="arbor-panel">
        <h2 className="text-lg font-semibold text-slate-900">{stateLabel}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {readiness.message_requirement === "foundation_first" ? "Focus on making high-interest debt more manageable first. Your underlying strategy is a preview; actionable investment contributions are paused."
            : readiness.message_requirement === "readiness_caution" ? "Keep building your emergency savings and managing debt alongside your plan. Bitcoin preferences are unavailable at this readiness stage in beta."
            : "Your savings and debt answers meet Arbor’s readiness check."}
        </p>
        {plan.path === "long_term" && readiness.actionable_contribution_guidance_allowed && readiness.message_requirement === "readiness_caution" && <p className="mt-2 text-sm text-slate-600">Core investing can continue with this readiness caution.</p>}
      </section>
      {plan.path === "short_term" ? <section className="arbor-panel"><p className="text-sm leading-6 text-slate-600">You may need this money in less than 3 years. Arbor’s long-term strategies do not apply to this plan. No long-term allocation, planning return or investment contribution guidance is provided.</p></section>
        : <section className="arbor-panel">
          <h2 className="text-lg font-semibold text-slate-900">Base strategy allocation</h2>
          <dl className="mt-4 divide-y divide-slate-200">{plan.base_allocation.map(weight => <div key={weight.role} className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">{weight.role === "global_equity" ? "Global equity" : "Defensive"}</dt><dd className="text-2xl font-semibold text-slate-900">{weight.percentage_points}%</dd></div>)}</dl>
          <p className="mt-4 font-semibold text-slate-900">Planning return: {plan.planning_return_pct.toFixed(1)}%</p>
          <p className="mt-2 text-sm text-slate-600">An annual effective modeling assumption, not a forecast or guarantee. Inflation assumption: {plan.inflation_pct.toFixed(1)}%.</p>
          {plan.selection.cap_applied && <p className="mt-4 text-sm leading-6 text-slate-600">Your market response suggests {plan.selection.requested_strategy}, but your {horizon} horizon limits the plan to {plan.selected_strategy}.</p>}
        </section>}
      <PreferencesV2 value={value} />
      <p className="text-sm leading-6 text-slate-500">Planning currency: PHP. This is a strategic plan, not a product recommendation or an investment order. Arbor does not purchase or hold investments for you.</p>
    </div>;
}
