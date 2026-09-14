import SectionHeader from "@/components/dashboard/SectionHeader";
import { getInsights } from "@/lib/insights";
import type { Plan } from "@/lib/types/plan";

type InsightsSectionProps = {
  plan: Plan;
};

export default function InsightsSection({ plan }: InsightsSectionProps) {
  const insights = getInsights(plan);

  return (
    <section className="arbor-feature">
      <SectionHeader
        eyebrow="Insights"
        title="Arbor plan insights"
        description="A closer look at your model plan and projection assumptions."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">Model perspective</h3>

          <p className="mt-2 text-slate-600">{insights.strength}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">Long-term approach</h3>

          <p className="mt-2 text-slate-600">{insights.recommendation}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">Outlook</h3>

          <p className="mt-2 text-slate-600">{insights.outlook}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">Modeled goal check</h3>

          <p className="mt-2 text-slate-600">
            {plan.projection.projected_value >= plan.profile.goal_target
              ? `Based on your current plan, Arbor projects that you could reach your ${new Intl.NumberFormat(
                  "en-US",
                  {
                    style: "currency",
                    currency: plan.profile.currency,
                    maximumFractionDigits: 0,
                  },
                ).format(
                  plan.profile.goal_target,
                )} goal within your ${plan.profile.investment_horizon}-year horizon.`
              : `Your current plan is projected to reach ${new Intl.NumberFormat(
                  "en-US",
                  {
                    style: "currency",
                    currency: plan.profile.currency,
                    maximumFractionDigits: 0,
                  },
                ).format(
                  Math.round(plan.projection.projected_value),
                )}, below your ${new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: plan.profile.currency,
                  maximumFractionDigits: 0,
                }).format(plan.profile.goal_target)} goal.`}
          </p>

          <p className="mt-3 text-sm font-semibold text-slate-900">
            To reach your goal within {plan.profile.investment_horizon} years,
            Arbor estimates you would need to invest{" "}
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: plan.profile.currency,
              maximumFractionDigits: 0,
            }).format(Math.ceil(plan.projection.required_monthly_investment))}{" "}
            per month under the model assumptions. Affordability has not been assessed.
          </p>
        </div>
      </div>

      <div className="mt-10">
        <h3 className="text-xl font-bold text-slate-900">
          Why Arbor chose this strategy
        </h3>

        <p className="mt-4 text-slate-600">{plan.explanation.summary}</p>

        <ul className="mt-6 space-y-3">
          {plan.explanation.reasons.map((reason: string, index: number) => (
            <li key={index} className="flex gap-3">
              <span className="text-emerald-600">✓</span>

              <span className="text-slate-700">{reason}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
