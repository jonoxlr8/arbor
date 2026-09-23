import type { Plan } from "./plan";

export type Strategy = "Conservative" | "Balanced" | "Growth" | "Aggressive";
export type EmergencySavings = "less_than_1_month" | "one_to_two_months" | "three_to_six_months" | "more_than_six_months";
export type HighInterestDebt = "none" | "paying_down" | "difficult_to_manage" | "not_sure";
export type Horizon = "less_than_3_years" | "three_to_five_years" | "five_to_ten_years" | "ten_plus_years";
export type RiskResponse = "sell_all" | "sell_some" | "hold" | "continue_investing" | "invest_more";
export type SavedPreferences = { technology_tilt: number; bitcoin: number };
export type PreferenceApplication = {
  requested_percentage_points: number; effective_percentage_points: number;
  strategy_cap_percentage_points: number | null;
  reasons: ("strategy_cap" | "readiness_restricted" | "short_term_path")[];
};
export type PreferenceResult = {
  technology_tilt: PreferenceApplication; bitcoin: PreferenceApplication;
  effective_target: null | { strategy_engine_version: "2.0"; base_strategy: Strategy;
    allocation: { weights: { role: "global_equity" | "defensive" | "technology_tilt" | "crypto"; percentage_points: number }[] } };
};
export type ProfileV2Input = {
  strategy_engine_version: "2.0"; full_name: string; country: "Philippines"; currency: "PHP";
  emergency_savings: EmergencySavings; high_interest_debt: HighInterestDebt;
  goal_target: number | null; current_portfolio_value: number; monthly_investment: number;
  horizon: Horizon; risk_response: RiskResponse;
  saved_preferences?: SavedPreferences;
  selected_approach?: Strategy | "short_term" | null;
};
type PlanCommon = {
  plan_basis?: "historical_assessment" | "user_selected";
  strategy_engine_version: "2.0";
  inflation_pct: number;
  preference_result?: PreferenceResult;
  selection: {
    risk_response: RiskResponse; horizon: Horizon; requested_strategy: Strategy;
    horizon_maximum_strategy: Strategy | null; selected_strategy: Strategy | null;
    is_short_term: boolean; cap_applied: boolean;
    reason: "short_term_path" | "horizon_capped" | "requested_strategy_retained";
  };
  readiness: {
    readiness: "ready" | "getting_ready" | "foundation_first";
    core_strategy_can_be_shown: boolean; actionable_contribution_guidance_allowed: boolean;
    technology_satellite_readiness_eligible: boolean; bitcoin_satellite_readiness_eligible: boolean;
    message_requirement: "none" | "readiness_caution" | "foundation_first";
  };
};
export type PlanV2 = {
  strategy_engine_version: "2.0"; profile: ProfileV2Input; profile_warning?: string | null;
  plan: PlanCommon & (
    { path: "long_term"; selected_strategy: Strategy; base_allocation: {role: "global_equity" | "defensive"; percentage_points: number}[]; planning_return_pct: number }
    | { path: "short_term"; selected_strategy: null; base_allocation: null; planning_return_pct: null }
  );
};
export type AccountPlan = Plan | PlanV2;
