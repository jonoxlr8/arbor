import type { PortfolioHolding } from "@/lib/types/plan";

export function getPortfolioAnalysis(portfolio: PortfolioHolding[]) {
  const tickers = portfolio.map((asset) => asset.ticker);

  if (tickers.includes("SMH") && tickers.includes("BTC")) {
    return (
      "Your portfolio has a strong growth focus with exposure to " +
      "technology innovation, semiconductors, and digital assets. " +
      "This approach targets long-term wealth creation but may " +
      "experience higher short-term volatility."
    );
  }

  if (tickers.includes("SMH")) {
    return (
      "Your portfolio has increased exposure to technology and " +
      "semiconductor companies positioned for long-term innovation."
    );
  }

  return (
    "Your portfolio is diversified across multiple investments " +
    "designed to support your long-term financial goals."
  );
}
