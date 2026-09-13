import type { Plan } from "@/lib/types/plan";

export function getInsights(plan: Plan) {
  const risk = (plan.profile.risk_level ?? "balanced").toLowerCase();
  const years = plan.profile.investment_horizon;

  if (risk.includes("aggressive")) {
    return {
      strength: `Your ${years}-year projection illustrates a growth-focused model. A longer horizon does not guarantee recovery from losses; short horizons leave less time to manage market declines.`,

      recommendation:
        "Stay invested consistently and avoid reacting to short-term market volatility.",

      outlook:
        "Growth-focused assets can experience substantial losses. The modeled return is an assumption, not a forecast for these assets.",
    };
  }

  if (risk.includes("balanced")) {
    return {
      strength:
        "Your Arbor targets use the Balanced model portfolio; this is not an assessment of your actual holdings.",

      recommendation:
        "Continue investing regularly and rebalance your portfolio only when your allocation changes significantly.",

      outlook:
        "Your strategy is designed to steadily build wealth while managing volatility over the long term.",
    };
  }

  return {
    strength:
      "Your Arbor targets use the Conservative model portfolio; capital losses are still possible.",

    recommendation:
      "Continue investing consistently rather than trying to time the market.",

    outlook:
      "Conservative is a model category, not a guarantee of capital protection or steady returns.",
  };
}
