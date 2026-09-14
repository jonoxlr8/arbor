export function formatMoney(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}
// Planning display only; never use rounded text as a calculation input.
export function formatPlanningMoney(value: number, currency: string) {
  const prefixes: Record<string, string> = { NZD: "NZ$", PHP: "₱", AUD: "A$", USD: "$", CAD: "C$", EUR: "€", GBP: "£" };
  const code = currency.trim().toUpperCase();
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.abs(value));
  return `${value < 0 ? "−" : ""}${prefixes[code] ?? `${code} `}${amount}`;
}
