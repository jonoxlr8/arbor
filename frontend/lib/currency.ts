// Recorded units only: normalization never converts an amount.
export const currencies = ["PHP", "USD", "NZD", "AUD", "EUR", "GBP", "CAD"] as const;
export function normalizeCurrency(value: unknown): string | null {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return currencies.some(currency => currency === code) ? code : null;
}
export function planningCurrency(country: string): string | null {
  return ({ Philippines: "PHP", "New Zealand": "NZD", Australia: "AUD", "United States": "USD" } as Record<string, string>)[country] ?? null;
}
export function normalizeTicker(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}
