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
    <div>
      <SectionHeader
        title="Arbor target portfolio"
        description="Risk-based model targets. Goals and timeline shape projections, not allocations."
      />

      <div className="mt-4">


        <div className="min-w-0">
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
      <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-forest">Allocation chart and analysis</summary>

        <PortfolioChart portfolio={plan.portfolio} />

      </details>
      <div>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          These are educational planning targets, not a record of investments you own
          {hasCrypto
            ? ". The targets include digital assets, which can be highly volatile."
            : "."}
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-600">Arbor does not purchase, custody or execute investments. What If, rebalancing and contribution previews are not orders. Recorded holdings do not automatically change these targets.</p>
      </div>

    </div>
  );
}
