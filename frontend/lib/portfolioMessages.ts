export function getPortfolioHealthMessage(
  risk: string,
  horizon: number
) {
  if (risk === "Aggressive" && horizon >= 10) {
    return (
      "Your long investment horizon allows Arbor to prioritize growth-focused "
      + "assets while giving your portfolio time to recover from market cycles."
    );
  }

  if (risk === "Growth") {
    return (
      "Your portfolio balances innovation-driven growth opportunities with "
      + "diversification to support long-term wealth creation."
    );
  }

  if (risk === "Balanced") {
    return (
      "Your strategy focuses on steady wealth accumulation while managing "
      + "volatility through diversification."
    );
  }

  return (
    "Your portfolio emphasizes stability and capital preservation while "
    + "maintaining exposure to long-term market growth."
  );
}