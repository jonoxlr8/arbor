import RecommendationCard from "@/components/dashboard/RecommendationCard";
import WealthJourneyCard from "@/components/WealthJourneyCard";
import SectionHeader from "@/components/dashboard/SectionHeader";

type HeroSectionProps = {
  plan: any;
};

export default function HeroSection({ plan }: HeroSectionProps) {
  const goalTarget = plan.profile?.goal_target ?? 0;
  const currency = plan.profile?.currency ?? "USD";

  console.log("Hero goal_target:", goalTarget);
  console.log("Hero currency:", currency);

  return (
    <>
      <SectionHeader
        eyebrow="Your Investment Plan"
        title={`${plan.profile.full_name}'s Wealth Strategy`}
        description="A personalized long-term investment strategy designed around your goals, timeline, and risk profile."
      />

      <RecommendationCard
        riskLevel={plan.profile.risk_level}
        horizon={plan.profile.investment_horizon}
      />

      <div className="mt-8 mb-16">
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
