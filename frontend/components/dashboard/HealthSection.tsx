import type { ActualPortfolioHealthResponse } from "@/lib/api";

type HealthSectionProps = {
  actualHealth: ActualPortfolioHealthResponse | null;
  error?: string;
  onRetry?: () => void;
};

export default function HealthSection({
  actualHealth,
  error,
  onRetry,
}: HealthSectionProps) {
  const healthLoading = actualHealth === null;

  const health = actualHealth?.available ? actualHealth.health : null;

  const score = health?.score ?? 0;
  const breakdown = health?.breakdown;
  const strengths = health?.strengths ?? [];
  const warnings = health?.warnings ?? [];

  const scorePercentage = Math.min((score / 10) * 100, 100);

  const getScoreLabel = () => {
    if (score >= 9) return "Excellent";
    if (score >= 8) return "Very Good";
    if (score >= 7) return "Good";
    if (score >= 5) return "Fair";
    return "Needs Attention";
  };

  const scoreLabel = getScoreLabel();


  if (error || healthLoading || !health) {
    return <section className="mt-4 border-t border-slate-200 pt-4" aria-live="polite">
      <h3 className="font-semibold">Portfolio Health</h3>
      {error ? <><p role="alert" className="mt-2 text-sm text-red-700">We couldn’t refresh portfolio health. {error}</p><button type="button" onClick={onRetry} className="mt-2 min-h-11 font-semibold text-forest">Retry</button></>
        : <p className="mt-2 text-sm text-slate-600">{healthLoading ? "Analyzing your portfolio…" : actualHealth?.reason}</p>}
      {!healthLoading && !error && <p className="mt-2 text-xs text-slate-500">Requires valid holdings in one currency with positive cost basis. No currency conversion.</p>}
    </section>;
  }
  return <section className="mt-4 border-t border-slate-200 pt-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-semibold text-slate-900">Portfolio Health</h3>
      <p className="text-xl font-semibold text-forest">{score} / 10 <span className="text-sm font-normal text-slate-600">· {scoreLabel}</span></p>
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-500">A limited {actualHealth?.currency} cost-basis check—not a suitability verdict.</p>
    <details className="mt-2">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-forest">What affected this score</summary>
      <p className="text-sm leading-6 text-slate-600">Uses position sizes and assets Arbor recognizes. Unknown assets and underlying fund overlap may not be assessed; this is not a measure of true diversification.</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-600" style={{width: `${scorePercentage}%`}} /></div>
      {breakdown && <dl className="mt-4 divide-y divide-slate-200">
        {[
          ["Diversification", breakdown.diversification], ["Risk alignment", breakdown.risk_alignment],
          ["Growth potential", breakdown.growth_potential], ["Crypto exposure", breakdown.crypto_exposure],
          ["Concentration", breakdown.concentration],
        ].map(([factor, value]) => <div key={factor} className="flex justify-between gap-3 py-3 text-sm"><dt>{factor}</dt><dd>{Number(value).toFixed(1)} / 2</dd></div>)}
      </dl>}
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div><h4 className="font-semibold">What’s working well</h4><ul className="mt-2 space-y-2 text-sm text-slate-600">{strengths.map(item=><li key={item}>{item}</li>)}</ul>{strengths.length === 0 && <p className="mt-2 text-sm text-slate-600">No specific strengths reported.</p>}</div>
        <div><h4 className="font-semibold">Things to consider</h4><ul className="mt-2 space-y-2 text-sm text-slate-600">{warnings.map(item=><li key={item}>{item}</li>)}</ul>{warnings.length === 0 && <p className="mt-2 text-sm text-slate-600">No concerns flagged by this limited check.</p>}</div>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">Continue reviewing your portfolio as your goals, timeline and financial situation change.</p>
    </details>
  </section>;
}
