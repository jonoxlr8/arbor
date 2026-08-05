import RecommendationCard from "@/components/dashboard/RecommendationCard";
import WealthJourneyCard from "@/components/WealthJourneyCard";
import SectionHeader from "@/components/dashboard/SectionHeader";

type HeroSectionProps = {
  plan: any;
};

export default function HeroSection({ plan }: HeroSectionProps) {
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
          goalAmount={1000000}
        />
      </div>
    </>
  );
}
