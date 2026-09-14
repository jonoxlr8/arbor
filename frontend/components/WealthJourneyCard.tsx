type WealthJourneyCardProps = {
  name: string;
  currentValue: number;
  projectedValue: number;
  years: number;
  goalAmount: number;
  currency: string;
  requiredMonthlyInvestment: number;
  monthlyInvestment: number;
};

export default function WealthJourneyCard({
  name,
  currentValue,
  projectedValue,
  years,
  goalAmount,
  currency,
  requiredMonthlyInvestment,
  monthlyInvestment,
}: WealthJourneyCardProps) {

  const target = goalAmount;

  const progress =
    target > 0 ? Math.min((currentValue / target) * 100, 100) : 0;

  const projectedProgress =
    target > 0 ? Math.min((projectedValue / target) * 100, 100) : 0;

  const projectedGap = Math.max(target - projectedValue, 0);

  const monthlyContributionGap = Math.max(
    requiredMonthlyInvestment - monthlyInvestment,
    0,
  );

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);

  return (
    <div className="arbor-panel text-slate-900">
      <p className="text-sm uppercase tracking-widest text-slate-500">
        Wealth Journey
      </p>

      <h2 className="mt-2 text-3xl font-bold">
        {name}&apos;s long-term plan
      </h2>

      <div className="mt-8">
        <div className="mb-2 flex justify-between">
          <span>Planning starting progress</span>
          <span>{progress.toFixed(1)}%</span>
        </div>

        <div className="h-4 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-forest"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

        <div className="mt-5 mb-2 flex justify-between">
          <span>Modeled goal progress</span>
          <span>{projectedProgress.toFixed(1)}%</span>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-leaf"
            style={{
              width: `${projectedProgress}%`,
            }}
          />
        </div>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-sm text-slate-500">Planning starting value</p>
          <p className="text-xs text-slate-600">Entered separately for projections; not synchronized with recorded holdings cost basis.</p>

          <p className="mt-2 text-3xl font-bold">
            {formatCurrency(currentValue)}
          </p>
        </div>

        <div>
          <p className="text-sm text-slate-500">Projected future value</p>

          <p className="mt-2 text-3xl font-bold">
            {formatCurrency(Math.round(projectedValue))}
          </p>
        </div>

        <div>
          <p className="text-sm text-slate-500">Investment Horizon</p>

          <p className="mt-2 text-3xl font-bold">{years} yrs</p>
        </div>

        <div>
          <p className="text-sm text-slate-500">
            Modeled monthly contribution
          </p>

          <p className="mt-2 text-3xl font-bold">
            {formatCurrency(Math.ceil(requiredMonthlyInvestment))}
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl bg-background p-4">
        <p className="text-sm text-slate-600">
          Based on your current investment plan, Arbor projects your portfolio
          could reach {formatCurrency(Math.round(projectedValue))} in {years}{" "}
          years.
        </p>

        <p className="mt-3 text-sm font-semibold text-slate-900">
          {projectedValue >= target
            ? `You're projected to reach your ${formatCurrency(target)} goal.`
            : `You're projected to be ${formatCurrency(Math.round(projectedGap))} below your ${formatCurrency(target)} goal.`}
        </p>

        <p className="mt-3 text-sm text-slate-600">
          Your planned contribution is{" "}
          {formatCurrency(Math.round(monthlyInvestment))} per month.
        </p>

        {monthlyContributionGap > 0 && (
          <p className="mt-2 text-sm font-semibold text-slate-900">
            To reach your goal on this timeline, Arbor estimates you would need
            to invest an additional{" "}
            {formatCurrency(Math.round(monthlyContributionGap))} per month.
          </p>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Projections are based on an assumed 8% annual return. Actual
          investment returns will vary.
        </p>
      </div>
    </div>
  );
}
