import PortfolioChart from "@/components/PortfolioChart";
import AssetCard from "@/components/AssetCard";
import SectionHeader from "@/components/dashboard/SectionHeader";

type PortfolioSectionProps = {
  plan: any;
};

export default function PortfolioSection({ plan }: PortfolioSectionProps) {
  return (
    <div className="mt-12">
      <SectionHeader
        eyebrow="Portfolio"
        title="Your Portfolio"
        description="A globally diversified investment portfolio tailored to your goals, risk tolerance, and investment horizon."
      />

      <div className="mt-10">
        <h3 className="text-xl font-semibold text-slate-900">
          Portfolio Allocation
        </h3>

        <PortfolioChart portfolio={plan.portfolio} />
      </div>

      <div className="mt-10">
        <h3 className="text-xl font-semibold text-slate-900">
          Arbor's Recommended Holdings
        </h3>

        <div className="mt-6 space-y-4">
          {plan.portfolio.map((asset: any) => (
            <AssetCard key={asset.ticker} asset={asset} />
          ))}
        </div>
      </div>
    </div>
  );
}
