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
  console.log("WealthJourney currency:", currency);

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
    <div className="rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-8 text-white shadow-xl">
      <p className="text-sm uppercase tracking-widest text-emerald-200">
        Wealth Journey
      </p>

      <h2 className="mt-2 text-3xl font-bold">
        {name}&apos;s path to financial freedom 🌳
      </h2>

      <div className="mt-8">
        <div className="mb-2 flex justify-between">
          <span>Current Progress</span>
          <span>{progress.toFixed(1)}%</span>
        </div>

        <div className="h-4 overflow-hidden rounded-full bg-emerald-400/30">
          <div
            className="h-full rounded-full bg-white"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

        <div className="mt-5 mb-2 flex justify-between">
          <span>Projected Progress</span>
          <span>{projectedProgress.toFixed(1)}%</span>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-emerald-400/30">
          <div
            className="h-full rounded-full bg-emerald-200"
            style={{
              width: `${projectedProgress}%`,
            }}
          />
        </div>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-sm text-emerald-200">Current Portfolio</p>

          <p className="mt-2 text-3xl font-bold">
            {formatCurrency(currentValue)}
          </p>
        </div>

        <div>
          <p className="text-sm text-emerald-200">Estimated Future Value</p>

          <p className="mt-2 text-3xl font-bold">
            {formatCurrency(Math.round(projectedValue))}
          </p>
        </div>

        <div>
          <p className="text-sm text-emerald-200">Investment Horizon</p>

          <p className="mt-2 text-3xl font-bold">{years} yrs</p>
        </div>

        <div>
          <p className="text-sm text-emerald-200">
            Required Monthly Investment
          </p>

          <p className="mt-2 text-3xl font-bold">
            {formatCurrency(Math.round(requiredMonthlyInvestment))}
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl bg-white/10 p-4">
        <p className="text-sm text-emerald-100">
          Based on your current investment plan, Arbor projects your portfolio
          could reach {formatCurrency(Math.round(projectedValue))} in {years}{" "}
          years.
        </p>

        <p className="mt-3 text-sm font-semibold text-white">
          {projectedValue >= target
            ? `You're projected to reach your ${formatCurrency(target)} goal. 🌳`
            : `You're projected to be ${formatCurrency(Math.round(projectedGap))} below your ${formatCurrency(target)} goal.`}
        </p>

        <p className="mt-3 text-sm text-emerald-100">
          You&apos;re currently investing{" "}
          {formatCurrency(Math.round(monthlyInvestment))} per month.
        </p>

        {monthlyContributionGap > 0 && (
          <p className="mt-2 text-sm font-semibold text-white">
            To reach your goal on this timeline, Arbor estimates you would need
            to invest an additional{" "}
            {formatCurrency(Math.round(monthlyContributionGap))} per month.
          </p>
        )}

        <p className="mt-3 text-xs text-emerald-200">
          Projections are based on an assumed 8% annual return. Actual
          investment returns will vary.
        </p>
      </div>
    </div>
  );
}
