type RecommendationCardProps = {
  riskLevel: string;
  horizon: number;
};

export default function RecommendationCard({
  riskLevel,
  horizon,
}: RecommendationCardProps) {
  const strategyMap: Record<string, string> = {
    Conservative: "Stability Strategy",
    Balanced: "Balanced Growth Strategy",
    Aggressive: "Growth Strategy",
  };

  const strategy = strategyMap[riskLevel] || "Balanced Growth Strategy";

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-forest">
          {riskLevel} model portfolio
        </p>

        <h2 className="mt-2 text-xl font-semibold text-slate-900">{strategy}</h2>
      </div>
      <p className="rounded-full bg-sage-soft px-3 py-2 text-xs font-medium text-forest">{horizon}-year planning horizon</p>
    </div>
  );
}
