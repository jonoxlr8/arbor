import { getAccessToken } from "./auth";
import { InvalidSessionError } from "./accountRecovery";
import { apiBaseUrl } from "./apiConfig";
import { boundedRequest } from "./dashboardConsistency";
import { decimalText, SLEEVE_LABELS } from "./contributions";
import type { ContributionMode, ContributionRequest, ContributionResult } from "./types/contributions";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === "string");
const oneOf = (v: unknown, values: string[]) => typeof v === "string" && values.includes(v);
const nullableString = (v: unknown) => v === null || typeof v === "string";
function money(v: unknown) { try { return typeof v === "string" && !!decimalText(v); } catch { return false; } }
const nullableMoney = (v: unknown) => v === null || money(v);
function minimum(v: unknown) {
  return object(v) && oneOf(v.purchase_type, ["initial", "additional"]) && oneOf(v.status, ["ready", "below_minimum", "verify_minimum"])
    && oneOf(v.kind, ["initial", "additional", "order", "quantity", "unknown"]) && typeof v.reason === "string"
    && nullableMoney(v.applicable_minimum) && nullableMoney(v.amount_needed_to_minimum) && nullableString(v.minimum_currency);
}
function mapped(v: unknown) {
  if (!object(v) || !object(v.product)) return false;
  const p = v.product;
  return typeof v.sleeve === "string" && Object.hasOwn(SLEEVE_LABELS, v.sleeve) && p.sleeve === v.sleeve
    && typeof v.target_percentage_points === "number" && Number.isInteger(v.target_percentage_points) && v.target_percentage_points > 0 && v.target_percentage_points <= 100
    && ["product_id", "display_name", "provider", "platform"].every(k => typeof p[k] === "string" && (p[k] as string).length > 0)
    && oneOf(p.match_quality, ["direct", "broad", "unavailable"]) && v.match_quality === p.match_quality
    && nullableString(p.currency) && strings(p.eligibility_notes) && nullableString(p.last_verified_at)
    && ["minimum_initial", "minimum_additional", "minimum_order", "minimum_order_quantity", "practical_minimum"].every(k => nullableMoney(p[k]))
    && nullableString(p.minimum_order_currency) && oneOf(p.minimum_additional_status, ["published", "verify_in_app", "unknown"])
    && ["supports_fractional", "available_in_ph"].every(k => p[k] === null || typeof p[k] === "boolean")
    && typeof v.actionable === "boolean" && oneOf(v.state, ["active", "preview", "not_applicable"]) && strings(v.warnings);
}
function allocation(v: unknown) {
  return object(v) && mapped(v.implementation) && money(v.allocated_amount) && money(v.candidate_amount)
    && minimum(v.minimum) && oneOf(v.allocation_stage, ["deficit_fill", "residual"]) && typeof v.reason === "string";
}
export function parseContributionResponse(body: unknown, mode: ContributionMode, input: ContributionRequest): ContributionResult {
  const common = object(body) && money(body.contribution_amount) && body.contribution_currency === input.contribution_currency
    && decimalText(body.contribution_amount as string) === decimalText(input.contribution_amount)
    && body.route_id === input.context.route_id && body.path === input.context.path && object(body.readiness)
    && Object.entries(input.context.readiness).every(([key, value]) => body.readiness && object(body.readiness) && body.readiness[key] === value)
    && oneOf(body.state, ["active", "preview", "not_applicable"]) && strings(body.warnings) && typeof body.reason === "string"
    && money(body.current_portfolio_value) && money(body.post_contribution_portfolio_value);
  const valid = common && (mode === "plan"
    ? oneOf(body.status, ["invest", "partial", "reserve", "wait", "no_action"])
      && ["invested_amount", "verify_minimum_amount", "unallocated_amount", "reserve_amount"].every(k => money(body[k]))
      && Array.isArray(body.allocations) && body.allocations.every(allocation) && Array.isArray(body.blocked_allocations) && body.blocked_allocations.every(allocation)
    : oneOf(body.action, ["invest", "reserve", "wait", "no_action"]) && money(body.recommended_amount)
      && oneOf(body.execution_status, ["ready", "below_minimum", "verify_minimum", "preview", "not_applicable"])
      && (body.selected === null || mapped(body.selected)) && (body.minimum === null || minimum(body.minimum)));
  if (!valid) throw new ContributionApiError("Arbor returned an incomplete result. Please try again.");
  return { mode, data: body } as ContributionResult;
}
export class ContributionApiError extends Error {}
export function createContributionApi(token = getAccessToken, request: typeof fetch = fetch, timeoutMs = 12000) {
  const base = apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV);
  async function call(mode: ContributionMode, input: ContributionRequest, userId: string, signal?: AbortSignal): Promise<ContributionResult> {
    try {
      return await boundedRequest(async activeSignal => {
        const accessToken = await token(userId);
        activeSignal.throwIfAborted();
        const response = await request(`${base}/contributions/${mode}`, {
          method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(input), signal: activeSignal,
        });
        if (response.status === 401) throw new InvalidSessionError("Your session has expired. Please sign in again.");
        if ([400, 422].includes(response.status)) throw new ContributionApiError("Check the contribution amount, portfolio values and ownership details.");
        if (!response.ok) throw new ContributionApiError("Arbor couldn’t calculate your plan right now. Please try again.");
        return parseContributionResponse(await response.json(), mode, input);
      }, signal, timeoutMs);
    } catch (error) {
      if (error instanceof InvalidSessionError || error instanceof ContributionApiError) throw error;
      throw new ContributionApiError("Arbor couldn’t calculate your plan in time. Check your connection and try again.");
    }
  }
  return {
    getContributionPlan: (input: ContributionRequest, userId: string, signal?: AbortSignal) => call("plan", input, userId, signal),
    getContributionRecommendation: (input: ContributionRequest, userId: string, signal?: AbortSignal) => call("recommendation", input, userId, signal),
  };
}
export const { getContributionPlan, getContributionRecommendation } = createContributionApi();
