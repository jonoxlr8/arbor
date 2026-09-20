import { numericError } from "./profileValidation";
import type { ProfileV2Input } from "./types/planV2";

// Input labels only. Strategy/readiness mapping and allocations live in backend.
export const SAVINGS_OPTIONS = [
  ["less_than_1_month", "Less than 1 month"], ["one_to_two_months", "1–2 months"],
  ["three_to_six_months", "3–6 months"], ["more_than_six_months", "More than 6 months"],
] as const;
export const DEBT_OPTIONS = [
  ["none", "None"], ["paying_down", "I’m paying it down"],
  ["difficult_to_manage", "It’s difficult to manage"], ["not_sure", "I’m not sure"],
] as const;
export const HORIZON_OPTIONS = [
  ["less_than_3_years", "Less than 3 years"], ["three_to_five_years", "3–5 years"],
  ["five_to_ten_years", "5–10 years"], ["ten_plus_years", "10+ years"],
] as const;
export const RISK_OPTIONS = [
  ["sell_all", "Sell all"], ["sell_some", "Sell some"], ["hold", "Hold"],
  ["continue_investing", "Keep investing"], ["invest_more", "Invest more"],
] as const;
export const ONBOARDING_STEPS = ["full_name", "country", "emergency_savings", "high_interest_debt", "goal_target", "current_portfolio_value", "monthly_investment", "horizon", "risk_response"] as const;
export type Answers = Record<typeof ONBOARDING_STEPS[number], string>;
export const EMPTY_ANSWERS: Answers = {
  full_name: "", country: "", emergency_savings: "", high_interest_debt: "", goal_target: "",
  current_portfolio_value: "", monthly_investment: "", horizon: "", risk_response: "",
};
export const includesOption = (options: readonly (readonly [string, string])[], value: unknown) => options.some(([code]) => code === value);
export function answerError(field: keyof Answers, value: string): string | null {
  switch (field) {
    case "full_name": return value.trim().length > 0 && value.trim().length <= 120 ? null : "Enter your name (up to 120 characters).";
    case "country": return value === "Philippines" ? null : "Arbor is launching in the Philippines first. More countries are coming.";
    case "goal_target": return value.trim() === "" ? null : numericError(field, value);
    case "current_portfolio_value": case "monthly_investment": return numericError(field, value);
    default: {
      const options = { emergency_savings: SAVINGS_OPTIONS, high_interest_debt: DEBT_OPTIONS, horizon: HORIZON_OPTIONS, risk_response: RISK_OPTIONS };
      return includesOption(options[field], value) ? null : "Choose an answer to continue.";
    }
  }
}
export function onboardingRequest(answers: Answers): ProfileV2Input {
  for (const field of ONBOARDING_STEPS) {
    const error = answerError(field, answers[field]);
    if (error) throw new Error(error);
  }
  return {
    ...answers, strategy_engine_version: "2.0", full_name: answers.full_name.trim(), country: "Philippines", currency: "PHP",
    goal_target: answers.goal_target.trim() === "" ? null : Number(answers.goal_target),
    current_portfolio_value: Number(answers.current_portfolio_value), monthly_investment: Number(answers.monthly_investment),
  } as ProfileV2Input;
}
