import GrowthChart from "@/components/GrowthChart";
import SectionHeader from "@/components/dashboard/SectionHeader";
import { getProjectionMessage } from "@/lib/projectionMessages";
import type { Projection } from "@/lib/types/plan";

type ProjectionSectionProps = {
  projection: Projection;
  currency: string;
  goalAmount: number;
};

export default function ProjectionSection({
  projection,
  currency,
  goalAmount,
}: ProjectionSectionProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  const totalInvested =
    projection.starting_value +
    projection.monthly_contribution * projection.investment_period_years * 12;

  const investmentGrowth = projection.projected_value - totalInvested;

  const projectionMessage = getProjectionMessage(
    projection.projected_value,
    goalAmount,
  );

  return (
    <div className="mt-12">
      <SectionHeader
        eyebrow="Projection"
        title="Your Wealth Projection"
        description="Based on your current investment plan and long-term assumptions."
      />

      <div className="mt-8 rounded-3xl bg-gradient-to-br from-emerald-600 to-green-500 p-8 sm:p-10 text-white">
        <p className="text-sm uppercase tracking-widest opacity-80">
          Projected Portfolio Value
        </p>

        <h3 className="mt-3 break-words text-4xl font-extrabold sm:text-5xl lg:text-6xl">
          {formatCurrency(projection.projected_value)}
        </h3>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/10 p-5 text-center backdrop-blur-sm">
            <p className="text-3xl font-bold">
              {projection.investment_period_years}
            </p>

            <p className="text-xs uppercase tracking-wide opacity-80">Years</p>
          </div>

          <div className="rounded-2xl bg-white/10 p-5 text-center backdrop-blur-sm">
            <p className="text-3xl font-bold">
              {formatCurrency(projection.monthly_contribution)}
            </p>

            <p className="text-xs uppercase tracking-wide opacity-80">
              Monthly
            </p>
          </div>

          <div className="rounded-2xl bg-white/10 p-5 text-center backdrop-blur-sm">
            <p className="text-3xl font-bold">
              {(projection.assumed_return * 100).toFixed(0)}%
            </p>

            <p className="text-xs uppercase tracking-wide opacity-80">Return</p>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-bold text-slate-900">
          Your Money Breakdown
        </h3>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-slate-500">Total Invested</p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatCurrency(totalInvested)}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Market Growth</p>

            <p className="mt-2 text-2xl font-bold text-emerald-600">
              +{formatCurrency(investmentGrowth)}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Future Value</p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatCurrency(projection.projected_value)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <GrowthChart
          projection={projection}
          goalAmount={goalAmount}
          currency={currency}
        />

        <div className="mt-6 rounded-2xl bg-emerald-50 p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Arbor Projection Insight
          </p>

          <p className="mt-2 leading-7 text-slate-700">{projectionMessage}</p>
        </div>
      </div>

      <p className="mt-6 mb-6 text-sm text-slate-500">
        Projections are estimates based on historical assumptions and are not
        guaranteed.
      </p>
    </div>
  );
}
