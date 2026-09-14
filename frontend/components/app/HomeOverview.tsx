import type { Plan } from "@/lib/types/plan";
import type { ActualPortfolioHealthResponse } from "@/lib/api";
import { formatPlanningMoney } from "@/lib/format";
import { getInsights } from "@/lib/insights";

type Props = { plan: Plan; actualHealth: ActualPortfolioHealthResponse | null; healthMessage?: string; healthError?: string };

export default function HomeOverview({ plan, actualHealth, healthMessage, healthError }: Props) {
  const { profile, projection } = plan;
  const money = (value: number) => formatPlanningMoney(value, profile.currency);
  const health = !healthMessage && !healthError && actualHealth?.available ? actualHealth.health : null;
  return <div className="space-y-5">
    <section className="rounded-3xl bg-forest p-5 text-white sm:p-8">
      <h2 className="text-sm font-medium text-emerald-100">Projected in {projection.investment_period_years} years</h2>
      <p className="planning-amount mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">{money(projection.projected_value)}</p>
      <p className="mt-3 text-sm text-emerald-50">{projection.projected_value >= profile.goal_target ? "Projected goal reached" : "Projected below your goal"}</p>
      <label htmlFor="home-planning-progress" className="mt-5 block text-xs text-emerald-100">Modeled goal progress</label>
      <meter id="home-planning-progress" min={0} max={profile.goal_target} value={projection.projected_value} className="home-goal-meter mt-2 h-3 w-full" />
      <p className="mt-4 text-xs leading-5 text-emerald-100">Illustrative, not today’s balance. {(projection.assumed_return * 100).toLocaleString()}% assumed annual return; excludes fees, taxes, inflation and currency movements.</p>
      <a href="#plan" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-forest">Explore your plan →</a>
    </section>
    <section className="arbor-panel" aria-label="Your summary">
      <dl className="grid min-w-0 gap-6 sm:grid-cols-2">
        <div><dt className="text-sm text-slate-500">Monthly contribution</dt><dd className="planning-amount mt-2 text-2xl font-semibold">{money(projection.monthly_contribution)} <span className="text-sm font-normal text-slate-500">/ month</span></dd></div>
        <div><dt className="text-sm text-slate-500">Planning goal</dt><dd className="planning-amount mt-2 text-2xl font-semibold">{money(profile.goal_target)}</dd></div>
        <div aria-live="polite"><dt className="text-sm text-slate-500">Actual Portfolio Health</dt><dd className="mt-2">
          {health ? <><span className="text-2xl font-semibold text-forest">{health.score} / 10</span><p className="mt-1 text-xs text-slate-500">A heuristic {actualHealth?.currency} cost-basis check, not suitability.</p></> : <p className="text-sm text-slate-600">{healthMessage ?? (healthError ? "Health couldn’t be refreshed. Open Portfolio to retry." : actualHealth?.reason ?? "Loading your recorded portfolio check…")}</p>}
        </dd></div>
        <div><dt className="text-sm text-slate-500">Strategy / risk category</dt><dd className="mt-2 text-2xl font-semibold">{profile.risk_level ?? profile.risk_tolerance}</dd></div>
      </dl>
      <a href="#portfolio" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-forest">Review recorded holdings →</a>
    </section>
    <section className="px-1">
      <h2 className="text-sm font-semibold text-slate-500">Arbor insight</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">{getInsights(plan).strength}</p>
      <a href="#ask" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-forest">Explore with Arbor →</a>
    </section>
  </div>;
}
