// Product limits mirrored by backend/app/schemas/validation.py.
// Large enough for PHP goals; bounded to keep calculations finite and practical.
export const MAX_MONEY = 1_000_000_000_000;
export const MAX_YEARS = 100;
export const MIN_RETURN = -1;
export const MAX_RETURN = 1;
export const RISK_CATEGORIES = ["Conservative", "Balanced", "Aggressive"] as const;
export type RiskCategory = typeof RISK_CATEGORIES[number];
export type NumericField = "current_portfolio_value" | "monthly_investment" | "goal_target" | "investment_horizon" | "annual_return";
export const FIELD_LABELS: Record<string, string> = {
  current_portfolio_value: "Current portfolio value", current_value: "Current portfolio value",
  monthly_investment: "Monthly contribution", goal_target: "Goal target",
  investment_horizon: "Investment horizon", years: "Investment horizon",
  annual_return: "Expected return", risk_tolerance: "Risk tolerance",
};
export function numericError(field: NumericField, raw: string | number): string | null {
  const label = FIELD_LABELS[field];
  if (typeof raw === "string" && !raw.trim()) return `${label}: enter a value.`;
  const value = Number(raw);
  if (!Number.isFinite(value)) return `${label}: enter a finite number.`;
  if (field === "investment_horizon") {
    return Number.isInteger(value) && value >= 1 && value <= MAX_YEARS ? null :
      `${label}: enter a whole number from 1 to ${MAX_YEARS}.`;
  }
  if (field === "annual_return") {
    return value >= MIN_RETURN && value <= MAX_RETURN ? null : `${label}: use −100% to +100%.`;
  }
  if (value > MAX_MONEY || value < 0 || (field === "goal_target" && value === 0)) {
    return `${label}: enter ${field === "goal_target" ? "more than 0" : "0 or more"}, up to ${MAX_MONEY.toLocaleString("en-US")}.`;
  }
  return null;
}
export function isRiskCategory(value: string): value is RiskCategory {
  return RISK_CATEGORIES.some(category => category === value);
}
export function profileErrors(values: Record<Exclude<NumericField, "annual_return">, string | number> & { risk_tolerance: string }) {
  const errors: string[] = [];
  for (const field of ["current_portfolio_value", "monthly_investment", "goal_target", "investment_horizon"] as const) {
    const error = numericError(field, values[field]);
    if (error) errors.push(error);
  }
  if (!isRiskCategory(values.risk_tolerance)) errors.push("Risk tolerance: choose Conservative, Balanced, or Aggressive.");
  return errors;
}
