type WealthJourneyCardProps = {
  name: string;
  currentValue: number;
  projectedValue: number;
  years: number;
  goalAmount: number;
};

export default function WealthJourneyCard({
  name,
  currentValue,
  projectedValue,
  years,
  goalAmount,
}: WealthJourneyCardProps) {
  const target = goalAmount;

  const progress = Math.min((currentValue / target) * 100, 100);

  return (
    <div className="rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-8 text-white shadow-xl">
      <p className="text-sm uppercase tracking-widest text-emerald-200">
        Wealth Journey
      </p>

      <h2 className="mt-2 text-3xl font-bold">
        {name}'s path to financial freedom 🌳
      </h2>

      <div className="mt-8">
        <div className="mb-2 flex justify-between">
          <span>Progress to ${goalAmount.toLocaleString()} Goal</span>
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
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        <div>
          <p className="text-sm text-emerald-200">Current Portfolio</p>

          <p className="mt-2 text-3xl font-bold">
            ${currentValue.toLocaleString()}
          </p>
        </div>

        <div>
          <p className="text-sm text-emerald-200">Estimated Future Value</p>

          <p className="mt-2 text-3xl font-bold">
            ${Math.round(projectedValue).toLocaleString()}
          </p>
        </div>

        <div>
          <p className="text-sm text-emerald-200">Investment Horizon</p>

          <p className="mt-2 text-3xl font-bold">{years} yrs</p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl bg-white/10 p-4">
        <p className="text-sm text-emerald-100">
          Based on your current investment plan, Arbor estimates your portfolio
          can grow significantly over time. Increasing contributions can help
          accelerate your journey toward your long-term wealth goal.
        </p>
      </div>
    </div>
  );
}
