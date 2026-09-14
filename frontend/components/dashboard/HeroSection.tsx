import RecommendationCard from "@/components/dashboard/RecommendationCard";
import WealthJourneyCard from "@/components/WealthJourneyCard";
import type { Plan } from "@/lib/types/plan";

type HeroSectionProps = {
  plan: Plan;
};

export default function HeroSection({ plan }: HeroSectionProps) {
  const goalTarget = plan.profile?.goal_target ?? 0;
  const currency = plan.profile?.currency ?? "USD";


  return (
    <>
      <RecommendationCard
        riskLevel={plan.profile.risk_level ?? plan.profile.risk_tolerance}
        horizon={plan.profile.investment_horizon}
      />

      <div className="mt-6">
        <WealthJourneyCard
          name={plan.profile.full_name}
          currentValue={plan.profile.current_portfolio_value}
          projectedValue={plan.projection.projected_value}
          years={plan.profile.investment_horizon}
          goalAmount={goalTarget}
          currency={currency}
          requiredMonthlyInvestment={
            plan.projection.required_monthly_investment
          }
          monthlyInvestment={plan.profile.monthly_investment}
        />
      </div>
    </>
  );
}
