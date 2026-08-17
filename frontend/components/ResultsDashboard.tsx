import Card from "@/components/Card";
import HeroSection from "@/components/dashboard/HeroSection";
import PortfolioSection from "@/components/dashboard/PortfolioSection";
import ProjectionSection from "@/components/dashboard/ProjectionSection";
import InsightsSection from "@/components/dashboard/InsightsSection";
import ChatSection from "@/components/dashboard/ChatSection";
import HealthSection from "@/components/dashboard/HealthSection";
import WhatIfSection from "@/components/dashboard/WhatIfSection";

type ResultsDashboardProps = {
  plan: any;
};

export default function ResultsDashboard({ plan }: ResultsDashboardProps) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <Card>
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
