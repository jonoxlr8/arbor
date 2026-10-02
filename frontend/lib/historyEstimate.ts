import type { PortfolioHistory } from "./livePortfolio";

/** Observation dates are provenance, never replacement raw market rows. */
export function historicalEstimateSources(point: PortfolioHistory): string[] {
  if (point.origin !== "reconstructed") return [];
  return [...new Set((point.source_dates ?? [])
    .filter(source => ["marketstack", "bsp"].includes(source.source) && source.observation_date < point.day)
    .map(source => `${source.price_key === "usd_php" ? "FX" : source.price_key.replace(/^gotrade_/, "").toUpperCase()} · ${source.observation_date}`))];
}
