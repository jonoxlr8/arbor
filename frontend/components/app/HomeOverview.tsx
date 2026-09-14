import type { Plan } from "@/lib/types/plan";
import type { ActualPortfolioHealthResponse } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { getInsights } from "@/lib/insights";

type Props = {
  plan: Plan;
  actualHealth: ActualPortfolioHealthResponse | null;
  healthMessage?: string;
  healthError?: string;
};

export default function HomeOverview({ plan, actualHealth, healthMessage, healthError }: Props) {
  const { profile, projection } = plan;
  const money = (value: number) => `${profile.currency} ${formatMoney(value)}`;
  const health = !healthMessage && !healthError && actualHealth?.available ? actualHealth.health : null;
  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-forest p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-emerald-100">Your projected wealth</h2>
          <span className="rounded-full border border-white/25 px-3 py-1 text-xs text-emerald-50">In {projection.investment_period_years} years</span>
        </div>
        <p className="mt-5 text-4xl font-semibold tracking-tight tabular-nums sm:text-6xl">{money(projection.projected_value)}</p>
        <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-50">A modeled future value, not your balance today. Based on {money(projection.monthly_contribution)} per month with {(projection.assumed_return * 100).toLocaleString()}% assumed annual return.</p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/20 pt-5">
          <p className="text-xs leading-5 text-emerald-100">Illustrative only. Excludes fees, taxes, inflation and currency movements.</p>
          <a href="#plan" className="shrink-0 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-forest">Explore your plan →</a>
        </div>
      </section>
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        <section className="arbor-panel">
          <h2 className="text-sm font-semibold text-slate-500">Your planning goal</h2>
          <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">{money(profile.goal_target)}</p>
          <label htmlFor="home-planning-progress" className="mt-5 block text-xs leading-5 text-slate-500">Planning starting value: {money(profile.current_portfolio_value)}</label>
          <meter id="home-planning-progress" min={0} max={profile.goal_target} value={profile.current_portfolio_value} className="mt-2 h-3 w-full accent-forest" />
          <p className="mt-3 text-sm text-slate-600">{projection.projected_value >= profile.goal_target ? "Your modeled projection reaches this goal." : "Your modeled projection is below this goal."}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">Planning amounts are entered separately from recorded holdings cost basis.</p>
        </section>
        <section className="arbor-panel" aria-live="polite">
          <h2 className="text-sm font-semibold text-slate-500">Actual Portfolio Health</h2>
          {health ? <>
            <p className="mt-3 text-4xl font-semibold tabular-nums text-forest">{health.score}<span className="ml-1 text-lg font-normal text-slate-400">/ 10</span></p>
            <p className="mt-3 text-sm leading-6 text-slate-600">A limited, heuristic check of recorded {actualHealth?.currency} cost basis—not a suitability verdict.</p>
          </> : <p className="mt-4 text-sm leading-6 text-slate-600">{healthMessage ?? (healthError ? "Health couldn’t be refreshed. Open Portfolio to retry." : actualHealth?.reason ?? "Loading your recorded portfolio check…")}</p>}
          <a href="#portfolio" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-forest">Review your portfolio →</a>
        </section>
        <section className="arbor-panel">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold text-slate-500">Arbor target portfolio</h2><span className="rounded-full bg-sage-soft px-3 py-1 text-xs font-medium text-forest">{profile.risk_level ?? profile.risk_tolerance}</span></div>
          <div className="mt-4 flex flex-wrap gap-2">{plan.portfolio.map(asset => <span key={asset.ticker} className="rounded-lg border border-slate-200 bg-background px-3 py-2 text-sm"><span className="font-semibold text-slate-900">{asset.ticker}</span> <span className="tabular-nums text-slate-500">{asset.allocation}%</span></span>)}</div>
          <p className="mt-3 text-xs leading-5 text-slate-500">Planning targets, not a record of what you own.</p>
          <a href="#plan" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-forest">Understand your targets →</a>
        </section>
        <section className="arbor-panel">
          <h2 className="text-sm font-semibold text-slate-500">A little perspective</h2>
          <p className="mt-4 text-sm leading-7 text-slate-700">{getInsights(plan).strength}</p>
          <a href="#ask" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-forest">Ask Arbor about your plan →</a>
        </section>
      </div>
    </div>
  );
}
