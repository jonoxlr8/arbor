"use client";

import { useEffect, useRef, useState } from "react";
import Card from "@/components/Card";
import HeroSection from "@/components/dashboard/HeroSection";
import PortfolioSection from "@/components/dashboard/PortfolioSection";
import ProjectionSection from "@/components/dashboard/ProjectionSection";
import InsightsSection from "@/components/dashboard/InsightsSection";
import ChatSection from "@/components/dashboard/ChatSection";
import HealthSection from "@/components/dashboard/HealthSection";
import WhatIfSection from "@/components/dashboard/WhatIfSection";
import EditProfileForm from "@/components/EditProfileForm";
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
  plan: Plan;
  name?: string;
};

export default function ResultsDashboard({
  plan: initialPlan,
}: ResultsDashboardProps) {
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

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <Card compactOnMobile>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditing(!editing)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {editing ? "Close Editor" : "Edit Profile"}
            </button>
          </div>
          {plan.profile_warning && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-900">{plan.profile_warning}</p>}

          {editing && (
            <div className="mt-6">
              <EditProfileForm
                key={scenarioKey(plan) + plan.profile.risk_tolerance}
                plan={plan}
                onSavingChange={setSaving}
                onUpdated={(updatedPlan) => {
                  setPlan(updatedPlan);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            </div>
          )}

          <HeroSection plan={plan} />

          <div className="mt-8">
            <PortfolioSection plan={plan} />

            <HoldingsSection
              plan={plan}
              holdingsState={holdingsState}
              onRetry={() => { void holdingsRecovery.current?.load(); }}
              onMutate={work => holdingsRecovery.current?.mutate(work) ?? Promise.resolve(false)}
            />

            <ProjectionSection
              projection={plan.projection}
              currency={plan.profile.currency}
              goalAmount={plan.profile.goal_target}
            />

            <WhatIfSection plan={plan} />

            {healthKey === null ? (
              <section className="mt-8 rounded-xl bg-slate-50 p-4 text-sm text-slate-600" aria-live="polite">
                <h2 className="font-semibold text-slate-900">Portfolio Health</h2>
                <p className="mt-2">{holdingsState.status === "error" ? "Health is unavailable until saved holdings are reloaded. Use Retry in My Portfolio." : "Health will update after your saved holdings finish loading."}</p>
              </section>
            ) : <HealthSection
              actualHealth={healthState?.status === "ready" ? healthState.data : null}
              error={healthState?.status === "error" ? healthState.error : undefined}
              onRetry={() => setHealthRefreshKey(key => key + 1)}
            />}

            <InsightsSection plan={plan} />

            <ChatSection plan={plan} />
          </div>
        </Card>
      </div>
    </main>
  );
}
