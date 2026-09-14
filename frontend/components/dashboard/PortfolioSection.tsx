import PortfolioChart from "@/components/PortfolioChart";
import AssetCard from "@/components/AssetCard";
import SectionHeader from "@/components/dashboard/SectionHeader";
import type { Plan, PortfolioHolding } from "@/lib/types/plan";

type PortfolioSectionProps = {
  plan: Plan;
};

export default function PortfolioSection({ plan }: PortfolioSectionProps) {
  const hasCrypto = plan.portfolio.some(
    (asset: PortfolioHolding) => asset.asset_type === "Crypto",
  );

  return (
    <div className="mt-12">
      <SectionHeader
        eyebrow="Portfolio"
        title="Arbor target portfolio"
        description={`A model portfolio selected using your ${plan.profile.risk_level?.toLowerCase() ?? "balanced"} risk category. Your goals and timeline inform projections, not separate target allocations.`}
      />

      <div className="mt-10">
        <h3 className="text-xl font-semibold text-slate-900">
          Arbor target allocations
        </h3>

        <PortfolioChart portfolio={plan.portfolio} />

        <p className="mt-4 text-sm leading-6 text-slate-600">
          These are educational planning targets, not a record of investments you own
          {hasCrypto
            ? ". The targets include digital assets, which can be highly volatile."
            : "."}
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-600">Arbor does not purchase, custody or execute investments. What If, rebalancing and contribution previews are not orders. Recorded holdings do not automatically change these targets.</p>
      </div>

      <div className="mt-10">
        <h3 className="text-xl font-semibold text-slate-900">
          Investments in your Arbor plan
        </h3>

        <div className="mt-6 grid min-w-0 gap-4 md:grid-cols-2">
          {plan.portfolio.map((asset) => (
            <AssetCard
              key={asset.ticker}
              asset={{
                ...asset,
                asset_type: asset.asset_type ?? "ETF",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
