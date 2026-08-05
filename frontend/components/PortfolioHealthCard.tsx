import { getPortfolioHealthMessage } from "@/lib/portfolioMessages";

type PortfolioHealthCardProps = {
  risk: string;
  horizon: number;
};

export default function PortfolioHealthCard({
  risk,
  horizon,
}: PortfolioHealthCardProps) {
  const healthRating =
    risk === "Aggressive" && horizon >= 10
      ? "Excellent"
      : risk === "Growth"
        ? "Very Good"
        : risk === "Balanced"
          ? "Good"
          : "Stable";

  const stars =
    healthRating === "Excellent"
      ? "★★★★★"
      : healthRating === "Very Good"
        ? "★★★★☆"
        : healthRating === "Good"
          ? "★★★★☆"
          : "★★★☆☆";

  const healthMessage = getPortfolioHealthMessage(risk, horizon);

  return (
    <div className="mt-10 rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-8 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🌳</span>

        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Portfolio Health
          </h2>

          <p className="text-slate-600">{healthRating}</p>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-3xl text-emerald-600">{stars}</div>

        <p className="mt-3 text-slate-700">{healthMessage}</p>
      </div>

      <div className="mt-6 space-y-3 text-slate-700">
        <div>✅ Diversified across multiple asset classes</div>
        <div>✅ Built for long-term growth</div>
        <div>✅ Matches your investment profile</div>
        <div>✅ Simple enough to stay invested</div>
      </div>
    </div>
  );
}
