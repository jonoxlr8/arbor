import PortfolioChart from "@/components/PortfolioChart";
import AssetCard from "@/components/AssetCard";
import SectionHeader from "@/components/dashboard/SectionHeader";

type PortfolioSectionProps = {
  plan: any;
};

export default function PortfolioSection({ plan }: PortfolioSectionProps) {
  const hasCrypto = plan.portfolio.some(
    (asset: any) => asset.asset_type === "Crypto",
  );

  return (
    <div className="mt-12">
      <SectionHeader
        eyebrow="Portfolio"
        title="Your Portfolio"
        description={`A globally diversified portfolio built for your ${plan.profile.risk_level?.toLowerCase() ?? "balanced"} investment strategy and ${plan.profile.investment_horizon}-year horizon.`}
      />

      <div className="mt-10">
        <h3 className="text-xl font-semibold text-slate-900">
          How Your Money Is Allocated
        </h3>

        <PortfolioChart portfolio={plan.portfolio} />

        <p className="mt-4 text-sm leading-6 text-slate-600">
          Your portfolio combines diversified investments designed to balance
          long-term growth with risk management
          {hasCrypto
            ? " and includes a measured allocation to digital assets."
            : "."}
        </p>
      </div>

      <div className="mt-10">
        <h3 className="text-xl font-semibold text-slate-900">
          Your Recommended Holdings
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
