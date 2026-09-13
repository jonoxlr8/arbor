const axisNumber = new Intl.NumberFormat("en-US", {
  maximumSignificantDigits: 6,
  useGrouping: false,
});

/** Format raw chart ticks only; never change the tick positions or chart data. */
export function formatAxisTick(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  const [scale, suffix] = magnitude >= 1e12 ? [1e12, "t"] as const
    : magnitude >= 1e9 ? [1e9, "b"] as const
    : magnitude >= 1e6 ? [1e6, "m"] as const
    : magnitude >= 1e3 ? [1e3, "k"] as const
    : [1, ""] as const;
  return `${axisNumber.format(value / scale)}${suffix}`;
}
