import type { PlanV2 } from "./types/planV2";
import { SAVINGS_OPTIONS, DEBT_OPTIONS, HORIZON_OPTIONS, RISK_OPTIONS, includesOption } from "./onboardingV2";
import { MAX_MONEY } from "./profileValidation";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const money = (v: unknown): v is number => finite(v) && v >= 0 && v <= MAX_MONEY;
const strategy = (v: unknown) => ["Conservative", "Balanced", "Growth", "Aggressive"].includes(v as string);
const points = (v: unknown): v is number => finite(v) && Number.isInteger(v) && v >= 0 && v <= 100;

function validPreferences(profile: Record<string, unknown>, plan: Record<string, unknown>): boolean {
  const saved = profile.saved_preferences;
  if (saved !== undefined && (!object(saved) || !points(saved.technology_tilt) || !points(saved.bitcoin))) return false;
  const result = plan.preference_result;
  // Pre-3O-F responses remain readable, but no effective target is fabricated.
  if (result === undefined) return saved === undefined || (object(saved) && saved.technology_tilt === 0 && saved.bitcoin === 0);
  if (!object(result)) return false;
  for (const key of ["technology_tilt", "bitcoin"] as const) {
    const item = result[key];
    if (!object(item) || !points(item.requested_percentage_points) || !points(item.effective_percentage_points) ||
        item.requested_percentage_points !== (object(saved) ? saved[key] : 0) ||
        item.effective_percentage_points > item.requested_percentage_points ||
        !(item.strategy_cap_percentage_points === null || points(item.strategy_cap_percentage_points)) ||
        !Array.isArray(item.reasons) || !item.reasons.every(reason => ["strategy_cap", "readiness_restricted", "short_term_path"].includes(reason)) ||
        new Set(item.reasons).size !== item.reasons.length) return false;
  }
  const tech = result.technology_tilt as Record<string, unknown>, btc = result.bitcoin as Record<string, unknown>;
  if (plan.path === "short_term") return result.effective_target === null && tech.effective_percentage_points === 0 && btc.effective_percentage_points === 0;
  const target = result.effective_target;
  if (!object(target) || target.strategy_engine_version !== "2.0" || target.base_strategy !== plan.selected_strategy || !object(target.allocation)) return false;
  const weights = target.allocation.weights;
  if (!Array.isArray(weights) || weights.length !== 4 || !weights.every(w => object(w) && ["global_equity", "defensive", "technology_tilt", "crypto"].includes(w.role as string) && points(w.percentage_points)) ||
      new Set(weights.map(w => w.role)).size !== 4 || weights.reduce((total, w) => total + w.percentage_points, 0) !== 100) return false;
  // Response consistency only; no frontend strategy caps or allocation generation.
  return weights.find(w => w.role === "technology_tilt").percentage_points === tech.effective_percentage_points &&
    weights.find(w => w.role === "crypto").percentage_points === btc.effective_percentage_points;
}
export function isPlanV2(value: unknown): value is PlanV2 {
  if (!object(value) || value.strategy_engine_version !== "2.0" || !object(value.profile) || !object(value.plan)) return false;
  const p = value.profile, plan = value.plan;
  if (!validPreferences(p, plan)) return false;
  if (p.strategy_engine_version !== "2.0" || typeof p.full_name !== "string" || !p.full_name.trim() || p.full_name.length > 120 || p.country !== "Philippines" || p.currency !== "PHP" ||
      !money(p.current_portfolio_value) || !money(p.monthly_investment) ||
      !(p.goal_target === null || (money(p.goal_target) && p.goal_target > 0)) ||
      !includesOption(SAVINGS_OPTIONS, p.emergency_savings) || !includesOption(DEBT_OPTIONS, p.high_interest_debt) ||
      !includesOption(HORIZON_OPTIONS, p.horizon) || !includesOption(RISK_OPTIONS, p.risk_response)) return false;
  if (plan.strategy_engine_version !== "2.0" || !finite(plan.inflation_pct) || plan.inflation_pct < 0 ||
      !object(plan.selection) || !object(plan.readiness)) return false;
  const s = plan.selection, r = plan.readiness;
  if (s.horizon !== p.horizon || s.risk_response !== p.risk_response || !strategy(s.requested_strategy) ||
      typeof s.cap_applied !== "boolean" || typeof s.is_short_term !== "boolean" ||
      !["ready", "getting_ready", "foundation_first"].includes(r.readiness as string) ||
      !["none", "readiness_caution", "foundation_first"].includes(r.message_requirement as string) ||
      !["core_strategy_can_be_shown", "actionable_contribution_guidance_allowed", "technology_satellite_readiness_eligible", "bitcoin_satellite_readiness_eligible"].every(k => typeof r[k] === "boolean")) return false;
  if (value.profile_warning != null && typeof value.profile_warning !== "string") return false;
  if (plan.path === "short_term") return plan.selected_strategy === null && plan.base_allocation === null && plan.planning_return_pct === null &&
    s.is_short_term && !s.cap_applied && s.selected_strategy === null && s.horizon_maximum_strategy === null && s.reason === "short_term_path";
  return plan.path === "long_term" && !s.is_short_term && strategy(plan.selected_strategy) && s.selected_strategy === plan.selected_strategy &&
    strategy(s.horizon_maximum_strategy) && ["horizon_capped", "requested_strategy_retained"].includes(s.reason as string) &&
    finite(plan.planning_return_pct) && plan.planning_return_pct >= 0 && plan.planning_return_pct <= 100 &&
    Array.isArray(plan.base_allocation) && plan.base_allocation.length === 2 &&
    plan.base_allocation.every(w => object(w) && ["global_equity", "defensive"].includes(w.role as string) && finite(w.percentage_points) && Number.isInteger(w.percentage_points) && w.percentage_points >= 0) &&
    new Set(plan.base_allocation.map(w => w.role)).size === 2 && plan.base_allocation.reduce((total, w) => total + w.percentage_points, 0) === 100;
}
