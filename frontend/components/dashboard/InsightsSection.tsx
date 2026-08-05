import SectionHeader from "@/components/dashboard/SectionHeader";
import { getInsights } from "@/lib/insights";

type InsightsSectionProps = {
  plan: any;
};

export default function InsightsSection({ plan }: InsightsSectionProps) {
  const insights = getInsights(plan);

  return (
    <section className="pt-12 pb-16">
      <SectionHeader
        eyebrow="Insights"
        title="Arbor AI Insights"
        description="Personalized observations and recommendations based on your investment profile."
      />

      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">✅ Strength</h3>

          <p className="mt-2 text-slate-600">{insights.strength}</p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">💡 Recommendation</h3>

          <p className="mt-2 text-slate-600">{insights.recommendation}</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">📈 Outlook</h3>

          <p className="mt-2 text-slate-600">{insights.outlook}</p>
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
