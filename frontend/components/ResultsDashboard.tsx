"use client";

import { useEffect, useState } from "react";
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
import {
  getMyPortfolioHealth,
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
  const [healthState, setHealthState] =
    useState<RequestState<ActualPortfolioHealthResponse>>({ status: "loading", data: null });
  const [healthRefreshKey, setHealthRefreshKey] = useState(0);
  const riskDependency = healthDependency(plan);

  useEffect(() => {
    const request = createLatestRequest(setHealthState);
    void request.run(signal => getMyPortfolioHealth(signal));
    return () => request.dispose();
  }, [healthRefreshKey, riskDependency]);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <Card>
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
              onHoldingsChanged={() => setHealthRefreshKey((key) => key + 1)}
            />

            <ProjectionSection
              projection={plan.projection}
              currency={plan.profile.currency}
              goalAmount={plan.profile.goal_target}
            />

            <WhatIfSection plan={plan} />

            <HealthSection
              actualHealth={healthState.status === "ready" ? healthState.data : null}
              error={healthState.status === "error" ? healthState.error : undefined}
              onRetry={() => setHealthRefreshKey(key => key + 1)}
            />

            <InsightsSection plan={plan} />

            <ChatSection plan={plan} />
          </div>
        </Card>
      </div>
    </main>
  );
}
