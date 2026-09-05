"use client";

import { useState } from "react";
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

type ResultsDashboardProps = {
  plan: Plan;
  name?: string;
};

export default function ResultsDashboard({
  plan: initialPlan,
}: ResultsDashboardProps) {
  const [plan, setPlan] = useState(initialPlan);
  const [editing, setEditing] = useState(false);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <Card>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {editing ? "Close Editor" : "Edit Profile"}
            </button>
          </div>

          {editing && (
            <div className="mt-6">
              <EditProfileForm
                plan={plan}
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

            <ProjectionSection
              projection={plan.projection}
              currency={plan.profile.currency}
              goalAmount={plan.profile.goal_target}
            />

            <WhatIfSection plan={plan} />

            <HealthSection plan={plan} />

            <InsightsSection plan={plan} />

            <ChatSection plan={plan} />
          </div>
        </Card>
      </div>
    </main>
  );
}
