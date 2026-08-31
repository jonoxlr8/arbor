import type { Plan } from "@/lib/types/plan";

export function getInsights(plan: Plan) {
  const risk = (plan.profile.risk_level ?? "balanced").toLowerCase();
  const years = plan.profile.investment_horizon;

  if (risk.includes("aggressive")) {
    return {
      strength: `Your ${years}-year investment horizon gives your portfolio plenty of time to recover from market downturns and benefit from long-term growth.`,

      recommendation:
        "Stay invested consistently and avoid reacting to short-term market volatility.",

      outlook:
        "Historically, investors with long investment horizons have been rewarded for remaining invested through market cycles.",
    };
  }

  if (risk.includes("balanced")) {
    return {
      strength:
        "Your portfolio balances long-term growth with diversification to help reduce unnecessary risk.",

      recommendation:
        "Continue investing regularly and rebalance your portfolio only when your allocation changes significantly.",

      outlook:
        "Your strategy is designed to steadily build wealth while managing volatility over the long term.",
    };
  }

  return {
    strength:
      "Your portfolio prioritizes stability while still participating in long-term market growth.",

    recommendation:
      "Continue investing consistently rather than trying to time the market.",

    outlook:
      "A conservative portfolio can produce steady long-term returns with lower volatility.",
  };
}