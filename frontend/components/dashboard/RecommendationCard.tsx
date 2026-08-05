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
    <>
      <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-emerald-700">
        Arbor Recommendation
      </h2>

      <div className="mt-6 rounded-2xl bg-green-50 p-6">
        <p className="text-sm font-medium text-green-700">
          Recommended Strategy
        </p>

        <h3 className="mt-2 text-2xl font-bold text-slate-900">{strategy}</h3>

        <p className="mt-3 text-slate-600">
          Built for a {horizon}-year investment journey focused on long-term
          wealth creation.
        </p>
      </div>
    </>
  );
}
