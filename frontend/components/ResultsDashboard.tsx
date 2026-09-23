"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import AppShell from "@/components/app/AppShell";
import HomeOverview from "@/components/app/HomeOverview";
import { AppearanceSettings } from "@/components/app/Appearance";
import { subscribeNavigation, navigationSnapshot, serverNavigationSnapshot } from "@/lib/appNavigation";
import HeroSection, { GoalProgress } from "@/components/dashboard/HeroSection";
import PortfolioSection from "@/components/dashboard/PortfolioSection";
import ProjectionSection from "@/components/dashboard/ProjectionSection";
import InsightsSection from "@/components/dashboard/InsightsSection";
import ChatSection from "@/components/dashboard/ChatSection";
import HealthSection from "@/components/dashboard/HealthSection";
import WhatIfSection from "@/components/dashboard/WhatIfSection";
import EditProfileForm from "@/components/EditProfileForm";
import { AccountAccessProvider, AccountPlans, PlusFeature } from "./AccountAccess";
import type { Plan } from "@/lib/types/plan";
import { createLatestRequest, healthDependency, scenarioKey, type RequestState } from "@/lib/dashboardConsistency";
import HoldingsSection from "@/components/dashboard/HoldingsSection";
import { createHoldingsRecovery, holdingsHealthKey, initialHoldingsState, type HoldingsState } from "@/lib/holdingsRecovery";
import {
  getMyPortfolioHealth,
  getMyHoldings,
  type ActualPortfolioHealthResponse,
} from "@/lib/api";

type ResultsDashboardProps = {
  userId?: string;
  plan: Plan;
  onSignOut: () => void;
  signingOut: boolean;
  logoutError: string;
};

export default function ResultsDashboard(props: ResultsDashboardProps) {
  return <AccountAccessProvider key={props.userId} userId={props.userId}><LegacyDashboard {...props} /></AccountAccessProvider>;
}

function LegacyDashboard({
  plan: initialPlan,
  onSignOut, signingOut, logoutError,
}: ResultsDashboardProps) {
  const active = useSyncExternalStore(subscribeNavigation, navigationSnapshot, serverNavigationSnapshot);
  const [saveNotice, setSaveNotice] = useState("");
  const [plan, setPlan] = useState(initialPlan);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [holdingsState, setHoldingsState] = useState<HoldingsState>(initialHoldingsState);
  const holdingsRecovery = useRef<ReturnType<typeof createHoldingsRecovery> | null>(null);
  const [healthResult, setHealthResult] = useState<{ key: string; state: RequestState<ActualPortfolioHealthResponse> } | null>(null);
  const [healthRefreshKey, setHealthRefreshKey] = useState(0);
  const riskDependency = healthDependency(plan);
  const healthKey = holdingsHealthKey(holdingsState, riskDependency);
  const healthState = healthKey !== null && healthResult?.key === `${healthKey}:${healthRefreshKey}` ? healthResult.state : null;

  useEffect(() => {
    const recovery = createHoldingsRecovery(getMyHoldings, setHoldingsState);
    holdingsRecovery.current = recovery;
    void recovery.load();
    return () => { recovery.dispose(); holdingsRecovery.current = null; };
  }, []);

  useEffect(() => {
    if (healthKey === null) return;
    const key = `${healthKey}:${healthRefreshKey}`;
    const request = createLatestRequest<ActualPortfolioHealthResponse>(state => setHealthResult({ key, state }));
    void request.run(signal => getMyPortfolioHealth(signal));
    return () => request.dispose();
  }, [healthRefreshKey, healthKey]);

  const healthMessage = healthKey === null
    ? holdingsState.status === "error"
      ? "Health is unavailable until saved holdings are reloaded. Open Portfolio and choose Retry."
      : "Health will update after your saved holdings finish loading."
    : undefined;

  return (
    <AppShell active={active} name={plan.profile.full_name} onSignOut={onSignOut} signingOut={signingOut} logoutError={logoutError}>
      {plan.profile_warning && <p role="alert" className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{plan.profile_warning} <a href="#settings" onClick={() => setEditing(true)} className="underline">Review profile</a></p>}

      {/* Keep these destinations mounted: navigation must not discard drafts,
          cancel active portfolio synchronization, or recreate request owners. */}
      <div hidden={active !== "home"} className="app-destination">
        <HomeOverview plan={plan} actualHealth={healthState?.status === "ready" ? healthState.data : null} healthMessage={healthMessage} healthError={healthState?.status === "error" ? healthState.error : undefined} />
      </div>

      <div hidden={active !== "portfolio"} className="app-destination">
        <HoldingsSection
          plan={plan}
          holdingsState={holdingsState}
          healthSummary={healthMessage ? (
          <section className="arbor-panel mt-6 text-sm text-slate-600" aria-live="polite">
            <h2 className="font-semibold text-slate-900">Actual Portfolio Health</h2>
            <p className="mt-2">{healthMessage}</p>
          </section>
        ) : <HealthSection
          actualHealth={healthState?.status === "ready" ? healthState.data : null}
          error={healthState?.status === "error" ? healthState.error : undefined}
          onRetry={() => setHealthRefreshKey(key => key + 1)}
        />}
          onRetry={() => { void holdingsRecovery.current?.load(); }}
          onMutate={work => holdingsRecovery.current?.mutate(work) ?? Promise.resolve(false)}
        />

      </div>

      <div hidden={active !== "plan"} className="app-destination space-y-6">
        <HeroSection plan={plan} />
        <PortfolioSection plan={plan} />
        <ProjectionSection projection={plan.projection} currency={plan.profile.currency} goalAmount={plan.profile.goal_target} />
        <GoalProgress plan={plan} />
        <WhatIfSection plan={plan} />
        <InsightsSection plan={plan} />
      </div>

      <div hidden={active !== "ask"} className="app-destination">
        <ChatSection plan={plan} />
      </div>

      <div hidden={active !== "settings"} className="app-destination space-y-6">
        <AccountPlans />
        <AppearanceSettings />
        <section className="arbor-panel">
          <h2 className="text-xl font-semibold text-slate-900">Your investment profile</h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <div><dt className="text-xs font-medium text-slate-500">Name</dt><dd className="mt-1 text-sm font-semibold">{plan.profile.full_name}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">Country</dt><dd className="mt-1 text-sm font-semibold">{plan.profile.country}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">Planning currency</dt><dd className="mt-1 text-sm font-semibold">{plan.profile.currency}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">Risk category</dt><dd className="mt-1 text-sm font-semibold">{plan.profile.risk_tolerance}</dd></div>
          </dl>
          <p className="mt-5 text-sm leading-6 text-slate-500">Your planning starting value powers projections. Recorded holdings keep their own currency and cost basis; the two are not automatically synchronized.</p>
          <button type="button" disabled={saving} onClick={() => { setEditing(!editing); setSaveNotice(""); }} className="mt-5 rounded-xl bg-forest px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{editing ? "Close editor" : "Edit Profile"}</button>
          {saveNotice && <p role="status" className="mt-4 text-sm text-forest">{saveNotice}</p>}
        </section>
        {editing && <PlusFeature feature="profile_rebuild" title="Review and rebuild your investment profile"><EditProfileForm
          key={scenarioKey(plan) + plan.profile.risk_tolerance}
          plan={plan}
          onSavingChange={setSaving}
          onUpdated={updatedPlan => { setPlan(updatedPlan); setEditing(false); setSaveNotice("Profile saved. Your plan and projections are up to date."); }}
          onCancel={() => setEditing(false)}
        /></PlusFeature>}
      </div>
    </AppShell>
  );
}
