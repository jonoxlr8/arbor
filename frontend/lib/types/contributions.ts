import type { PlanV2, PreferenceResult } from "./planV2";

export type Sleeve = "global_equity" | "defensive" | "technology_tilt" | "crypto";
export type RouteId = "gcash" | "dragonfi" | "gotrade" | "ibkr";
export type ContributionMode = "plan" | "recommendation";
export type ContributionRequest = {
  contribution_amount: string; contribution_currency: string;
  current_portfolio: Record<Sleeve, string> & { currency: string; owned_product_ids: string[] };
  context: { route_id: RouteId; path: "long_term" | "short_term";
    effective_target_allocation: PreferenceResult["effective_target"];
    readiness: PlanV2["plan"]["readiness"]; ibkr_crypto_eligible: boolean | null };
  readiness_inputs: Pick<PlanV2["profile"], "emergency_savings" | "high_interest_debt">;
};
export type ContributionProduct = {
  product_id: string; display_name: string; provider: string; platform: string; sleeve: Sleeve;
  match_quality: "direct" | "broad" | "unavailable"; currency: string | null;
  minimum_initial: string | null; minimum_additional: string | null;
  minimum_additional_status: "published" | "verify_in_app" | "unknown";
  minimum_order: string | null; minimum_order_quantity: string | null;
  minimum_order_currency: string | null; practical_minimum: string | null;
  supports_fractional: boolean | null; available_in_ph: boolean | null;
  eligibility_notes: string[]; last_verified_at: string | null;
};
export type ExecutionStatus = "ready" | "below_minimum" | "verify_minimum" | "preview" | "not_applicable";
export type MinimumCheck = {
  purchase_type: "initial" | "additional"; kind: "initial" | "additional" | "order" | "quantity" | "unknown";
  applicable_minimum: string | null; minimum_currency: string | null;
  status: "ready" | "below_minimum" | "verify_minimum"; amount_needed_to_minimum: string | null; reason: string;
};
export type MappedContribution = {
  sleeve: Sleeve; target_percentage_points: number; product: ContributionProduct;
  match_quality: ContributionProduct["match_quality"]; state: "active" | "preview" | "not_applicable";
  actionable: boolean; warnings: string[];
};
export type ContributionAllocation = {
  implementation: MappedContribution; candidate_amount: string; allocated_amount: string;
  minimum: MinimumCheck; allocation_stage: "deficit_fill" | "residual"; reason: string;
};
type Common = {
  contribution_amount: string; contribution_currency: string; route_id: RouteId;
  readiness: PlanV2["plan"]["readiness"]; path: "long_term" | "short_term";
  state: "active" | "preview" | "not_applicable"; reason: string; warnings: string[];
  current_portfolio_value: string; post_contribution_portfolio_value: string;
};
export type ContributionPlan = Common & {
  status: "invest" | "partial" | "reserve" | "wait" | "no_action";
  allocations: ContributionAllocation[]; blocked_allocations: ContributionAllocation[];
  invested_amount: string; verify_minimum_amount: string; unallocated_amount: string; reserve_amount: string;
};
export type ContributionRecommendation = Common & {
  action: "invest" | "reserve" | "wait" | "no_action"; recommended_amount: string;
  selected: MappedContribution | null; execution_status: ExecutionStatus; minimum: MinimumCheck | null;
};
export type ContributionResult = { mode: "plan"; data: ContributionPlan } | { mode: "recommendation"; data: ContributionRecommendation };
