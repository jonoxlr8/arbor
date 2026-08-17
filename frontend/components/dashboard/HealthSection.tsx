type HealthSectionProps = {
  plan: any;
};

export default function HealthSection({ plan }: HealthSectionProps) {
  const score = plan.health?.score ?? 0;
  const strengths = plan.health?.strengths ?? [];
  const warnings = plan.health?.warnings ?? [];

  const scorePercentage = Math.min((score / 10) * 100, 100);

  const getScoreLabel = () => {
    if (score >= 9) return "Excellent";
    if (score >= 8) return "Very Good";
    if (score >= 7) return "Good";
    if (score >= 5) return "Fair";
    return "Needs Attention";
  };

  const scoreLabel = getScoreLabel();

  return (
    <section className="mt-12">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-600">
              Portfolio Health
            </p>

            <h2 className="mt-2 text-3xl font-bold text-slate-900">
              How healthy is your portfolio?
            </h2>

            <p className="mt-3 max-w-2xl leading-7 text-slate-600">
              Arbor evaluates your portfolio based on diversification, alignment
              with your risk profile, long-term growth potential, and overall
              investment balance.
            </p>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-emerald-50">
              <div className="text-center">
                <p className="text-3xl font-extrabold text-emerald-700">
                  {score}
                </p>

                <p className="text-xs font-medium text-emerald-600">/ 10</p>
              </div>
            </div>

            <div>
              <p className="text-lg font-bold text-slate-900">{scoreLabel}</p>

              <p className="mt-1 text-sm text-slate-500">
                Overall portfolio health
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-medium text-slate-600">Portfolio Health</span>

            <span className="font-semibold text-emerald-700">
              {score.toFixed(1)} / 10
            </span>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all"
              style={{
                width: `${scorePercentage}%`,
              }}
            />
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-emerald-50 p-6">
            <h3 className="font-bold text-slate-900">✅ What's working well</h3>

            <div className="mt-4 space-y-3">
              {strengths.length > 0 ? (
                strengths.map((item: string) => (
                  <div key={item} className="flex gap-3">
                    <span className="text-emerald-600">✓</span>

                    <p className="text-sm leading-6 text-slate-700">{item}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">
                  Your portfolio has several positive characteristics.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-amber-50 p-6">
            <h3 className="font-bold text-slate-900">⚠️ Things to consider</h3>

            <div className="mt-4 space-y-3">
              {warnings.length > 0 ? (
                warnings.map((item: string) => (
                  <div key={item} className="flex gap-3">
                    <span className="text-amber-600">!</span>

                    <p className="text-sm leading-6 text-slate-700">{item}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">
                  Arbor hasn't identified any major portfolio concerns.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-slate-50 p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Arbor's assessment
          </p>

          <p className="mt-2 text-sm leading-6 text-slate-700">
            Your portfolio is currently rated{" "}
            <span className="font-semibold text-emerald-700">
              {scoreLabel.toLowerCase()}
            </span>{" "}
            for your long-term investment strategy. Continue reviewing your
            portfolio as your goals, timeline, and financial situation change.
          </p>
        </div>
      </div>
    </section>
  );
}
