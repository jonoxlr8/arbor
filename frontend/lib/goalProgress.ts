import type { LivePortfolioData } from "./livePortfolio";

function cents(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{0,2})0*)?$/.exec(value);
  return match ? BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0")) : null;
}

export function goalProgress(target: number | null, portfolio: LivePortfolioData | null) {
  if (target === null || !Number.isFinite(target) || target <= 0 || !portfolio) return null;
  const goal = cents(String(target));
  const known = cents(portfolio.known_value_php);
  if (goal === null || known === null || goal === BigInt(0)) return null;
  const complete = portfolio.complete;
  const tenths = complete ? (known * BigInt(1000) + goal / BigInt(2)) / goal : null;
  return { complete, knownValue: portfolio.known_value_php, target,
    percent: tenths === null ? null : `${tenths / BigInt(10)}.${tenths % BigInt(10)}`,
    barPercent: tenths === null ? 0 : Number(tenths > BigInt(1000) ? BigInt(1000) : tenths) / 10 };
}
