import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ContributionCard, { ContributionFeedback } from "../components/contributions/ContributionCard";
import ContributionResultView from "../components/contributions/ContributionResult";
import ImplementationChoices from "../components/contributions/ImplementationChoices";
import { V2Destination } from "../components/PlanV2View";
import { AccountAccessContext } from "../components/AccountAccess";
import type { Entitlements } from "./entitlements";
import { BEGINNER_ROUTES, BITCOIN_PROVIDERS, contributionRequest, createContributionController, decimalText, formatContributionMoney, needsOwnershipReview, needsImplementationChoice, validInput } from "./contributions";
import { createContributionApi, parseContributionResponse } from "./contributionApi";
import type { PlanV2 } from "./types/planV2";
import type { ContributionAllocation, ContributionPlan, ContributionProduct, ContributionRecommendation, ContributionResult, MappedContribution, MinimumCheck } from "./types/contributions";

const readiness: PlanV2["plan"]["readiness"] = { readiness: "ready", core_strategy_can_be_shown: true, actionable_contribution_guidance_allowed: true, technology_satellite_readiness_eligible: true, bitcoin_satellite_readiness_eligible: true, message_requirement: "none" };
export const contributionFixture: PlanV2 = {
  strategy_engine_version: "2.0", profile: { strategy_engine_version: "2.0", full_name: "Test", country: "Philippines", currency: "PHP", emergency_savings: "three_to_six_months", high_interest_debt: "none", goal_target: null, current_portfolio_value: 999999, monthly_investment: 0, horizon: "ten_plus_years", risk_response: "hold" },
  plan: { strategy_engine_version: "2.0", path: "long_term", selected_strategy: "Growth", base_allocation: [{ role: "global_equity", percentage_points: 80 }, { role: "defensive", percentage_points: 20 }], planning_return_pct: 5, inflation_pct: 3, readiness,
    selection: { risk_response: "hold", horizon: "ten_plus_years", requested_strategy: "Growth", horizon_maximum_strategy: "Aggressive", selected_strategy: "Growth", is_short_term: false, cap_applied: false, reason: "requested_strategy_retained" },
    preference_result: { technology_tilt: { requested_percentage_points: 0, effective_percentage_points: 0, strategy_cap_percentage_points: 10, reasons: [] }, bitcoin: { requested_percentage_points: 0, effective_percentage_points: 0, strategy_cap_percentage_points: 5, reasons: [] },
      effective_target: { strategy_engine_version: "2.0", base_strategy: "Growth", allocation: { weights: [{ role: "global_equity", percentage_points: 80 }, { role: "defensive", percentage_points: 20 }] } } } },
};
const values = { global_equity: "5000", defensive: "2000", technology_tilt: "0", crypto: "0" };
const input = () => contributionRequest(contributionFixture, "12000", values, "gcash", [], false);
const product: ContributionProduct = { product_id: "gcash_global_equity", display_name: "ATRAM Global Equity Opportunity Feeder Fund", provider: "ATRAM", platform: "GFunds", sleeve: "global_equity", match_quality: "broad", currency: "PHP", minimum_initial: "1000", minimum_additional: "500", minimum_additional_status: "published", minimum_order: null, minimum_order_quantity: null, minimum_order_currency: null, practical_minimum: null, supports_fractional: null, available_in_ph: true, eligibility_notes: [], last_verified_at: null };
const mapped: MappedContribution = { sleeve: "global_equity", target_percentage_points: 80, product, match_quality: "broad", state: "active", actionable: true, warnings: [] };
const minimum: MinimumCheck = { purchase_type: "initial", kind: "initial", applicable_minimum: "1000", minimum_currency: "PHP", status: "ready", amount_needed_to_minimum: "0", reason: "minimum_met" };
const common = { contribution_amount: "12000", contribution_currency: "PHP", route_id: "gcash" as const, readiness, path: "long_term" as const, state: "active" as const, reason: "greatest_deficit", warnings: ["Check provider eligibility."], current_portfolio_value: "7000", post_contribution_portfolio_value: "19000" };
const row: ContributionAllocation = { implementation: mapped, allocated_amount: "12000", candidate_amount: "12000", minimum, allocation_stage: "deficit_fill", reason: "deficit_fill" };
const plan = (overrides: Partial<ContributionPlan> = {}): ContributionResult => ({ mode: "plan", data: { ...common, status: "invest", allocations: [row], blocked_allocations: [], invested_amount: "12000", verify_minimum_amount: "0", unallocated_amount: "0", reserve_amount: "0", ...overrides } });
const recommendation = (overrides: Partial<ContributionRecommendation> = {}): ContributionResult => ({ mode: "recommendation", data: { ...common, action: "invest", recommended_amount: "12000", selected: mapped, minimum, execution_status: "ready", ...overrides } });
const render = (result: ContributionResult) => renderToStaticMarkup(createElement(ContributionResultView, { result }));

test("request uses canonical inputs, not planning starting value or frontend allocations", () => {
  const req = input();
  assert.deepEqual(req.current_portfolio, { ...values, currency: "PHP", owned_product_ids: [] });
  assert.deepEqual(req.context.effective_target_allocation, contributionFixture.plan.preference_result?.effective_target);
  assert.deepEqual(req.context.readiness, readiness);
  assert.deepEqual(req.readiness_inputs, { emergency_savings: "three_to_six_months", high_interest_debt: "none" });
  assert.equal(req.context.ibkr_crypto_eligible, null);
});
for (const value of ["", "-1", "0", "0.00", "NaN", "1,000", "1e3"]) test(`invalid positive amount ${value}`, () => assert.equal(validInput(value, true), false));
test("zero market values allowed; missing targets are not recreated", () => {
  assert.equal(validInput("0"), true);
  assert.throws(() => contributionRequest({ ...contributionFixture, plan: { ...contributionFixture.plan, preference_result: undefined } }, "100", values, "gcash", [], false), /unavailable/);
  assert.throws(() => contributionRequest(contributionFixture, "100", { ...values, crypto: "" }, "gcash", [], false));
});
test("decimal strings formatted exactly without money floats", () => {
  assert.equal(formatContributionMoney("12345678901234567890.123456789", "PHP"), "₱12,345,678,901,234,567,890.123456789");
  assert.equal(formatContributionMoney("0.00002", "BTC"), "BTC 0.00002");
  assert.equal(decimalText("1.2E-7"), "0.00000012");
  assert.equal(decimalText("1E+3"), "1000");
  assert.equal(decimalText("0E-10"), "0");
});

for (const mode of ["plan", "recommendation"] as const) test(`authenticated ${mode} API preserves strings and payload`, async () => {
  let calls = 0;
  const response = mode === "plan" ? plan() : recommendation();
  const api = createContributionApi(async userId => { assert.equal(userId, "A"); return "test-token"; }, async (url, init) => {
    calls++;
    assert.match(String(url), new RegExp(`/contributions/${mode}$`));
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-token");
    assert.equal(init?.method, "POST"); assert.ok(init?.signal);
    assert.deepEqual(JSON.parse(String(init?.body)), input());
    return Response.json(response.data);
  });
  const result = await (mode === "plan" ? api.getContributionPlan : api.getContributionRecommendation)(input(), "A");
  assert.equal(calls, 1); assert.deepEqual(result, response);
  assert.equal(typeof result.data.contribution_amount, "string");
});
for (const status of [400, 401, 422, 500]) test(`safe API error ${status}`, async () => {
  const api = createContributionApi(async () => "token", async () => new Response("private server detail", { status }));
  await assert.rejects(api.getContributionPlan(input(), "A"), error => error instanceof Error && !error.message.includes("private") && (status !== 401 || /sign in again/i.test(error.message)));
});
test("network errors and timeout are bounded and sanitized", async () => {
  const api = createContributionApi(async () => "token", async () => { throw new Error("private stack"); });
  await assert.rejects(api.getContributionPlan(input(), "A"), /Check your connection/);
  const pending = createContributionApi(async () => "token", () => new Promise<Response>(() => {}), 5);
  await assert.rejects(pending.getContributionPlan(input(), "A"), /in time/);
});
test("invalid response and mismatched request identity rejected", () => {
  assert.throws(() => parseContributionResponse({ ...plan().data, allocations: [{}] }, "plan", input()), /incomplete/);
  assert.throws(() => parseContributionResponse({ ...plan().data, contribution_amount: "99" }, "plan", input()), /incomplete/);
  assert.throws(() => parseContributionResponse({ ...plan().data, route_id: "ibkr" }, "plan", input()), /incomplete/);
});

test("monthly plan multiple allocations, summary, warnings and product names", () => {
  const second = { ...row, allocated_amount: "2000", implementation: { ...mapped, product: { ...product, product_id: "other", display_name: "Another public fund" } } };
  const html = render(plan({ allocations: [{ ...row, allocated_amount: "10000" }, second] }));
  assert.match(html, /Your contribution preview[\s\S]*₱12,000/); assert.match(html, /Another public fund/);
  assert.match(html, /Minimum check met/); assert.match(html, /Check provider eligibility/);
  assert.match(html, /Broad match/); assert.doesNotMatch(html, /Buy now|Execute|affiliate|compensation|partnership/);
});
for (const mode of ["plan", "recommendation"] as const) {
  test(`${mode} reserve hides products even if server sends preview metadata`, () => {
    const html = render(mode === "plan" ? plan({ status: "reserve", reserve_amount: "12000" }) : recommendation({ action: "reserve" }));
    assert.match(html, /accounts for the full contribution as reserve/); assert.doesNotMatch(html, /ATRAM/);
  });
  test(`${mode} short term is informational`, () => {
    const html = render(mode === "plan" ? plan({ path: "short_term", state: "not_applicable" }) : recommendation({ path: "short_term", state: "not_applicable" }));
    assert.match(html, /does not route/); assert.doesNotMatch(html, /ATRAM/);
  });
  test(`${mode} verify minimum distinct from ready`, () => {
    const uncertain = { ...minimum, status: "verify_minimum" as const, applicable_minimum: "1", minimum_currency: "USD", amount_needed_to_minimum: null };
    const html = render(mode === "plan" ? plan({ allocations: [{ ...row, minimum: uncertain }], invested_amount: "0", verify_minimum_amount: "12000" }) : recommendation({ action: "wait", execution_status: "verify_minimum", minimum: uncertain }));
    assert.match(html, /Check minimum/); assert.match(html, /No currency or price conversion/); assert.doesNotMatch(html, /Ready to invest/);
  });
}
test("below minimum and partial waiting retain available amounts", () => {
  const below = { ...minimum, status: "below_minimum" as const, amount_needed_to_minimum: "500" };
  const html = render(recommendation({ action: "wait", execution_status: "below_minimum", minimum: below }));
  assert.match(html, /Difference to minimum: ₱500/); assert.match(html, /Available: ₱12,000/);
  const partial = render(plan({ status: "partial", invested_amount: "11300", unallocated_amount: "700", blocked_allocations: [{ ...row, allocated_amount: "0", minimum: below }] }));
  assert.match(partial, /₱700 remains unallocated/); assert.match(partial, /Minimums to check/);
});
test("empty results and null product are safe", () => {
  assert.match(render(plan({ allocations: [], invested_amount: "0", unallocated_amount: "12000", status: "wait" })), /₱12,000 remains unallocated/);
  assert.match(render(recommendation({ selected: null, minimum: null, action: "no_action" })), /No eligible target gap/);
});
test("card labels, default monthly mode, feedback and placement", () => {
  const html = renderToStaticMarkup(createElement(ContributionCard, { value: contributionFixture, userId: "A" }));
  assert.match(html, /aria-pressed="true"[^>]*>Across my targets/);
  for (const label of ["Contribution amount", "Hypothetical current values", "Global Equity", "Technology", "Bitcoin", "Defensive", "Product ownership", "Choose an option"]) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /999999|Buy now/);
  const selected: PlanV2 = {...contributionFixture, plan:{...contributionFixture.plan, plan_basis:"user_selected"}};
  const access = { features: ["monthly_contribution_planner", "live_portfolio"], availability: {live_portfolio: true} } as Entitlements;
  const destination = renderToStaticMarkup(createElement(AccountAccessContext.Provider, { value: { value: access, error: "", retry: () => {} } }, createElement(V2Destination, { value: selected, active: "portfolio", userId: "A" })));
  assert.match(destination, /Your investments, together/); assert.match(destination, /Loading your portfolio/);
  const feedback = renderToStaticMarkup(createElement(ContributionFeedback, { loading: true, error: "Please try again" }));
  assert.match(feedback, /role="status"/); assert.match(feedback, /role="alert"/);
});
test("explicit ownership review required for newly returned products", () => {
  assert.equal(needsOwnershipReview(plan(), {}), true);
  assert.equal(needsOwnershipReview(plan(), { gcash_global_equity: false }), false);
  assert.equal(needsOwnershipReview(plan(), { gotrade_vt: true }), true);
  const req = contributionRequest(contributionFixture, "12000", values, "gcash", ["gotrade_vt"], false);
  assert.deepEqual(req.current_portfolio.owned_product_ids, ["gotrade_vt"]);
});
test("ownership never implies product selection, and newly mapped options require a fresh choice", () => {
  assert.equal(needsImplementationChoice(plan(), {}), true);
  assert.equal(needsImplementationChoice(plan(), { gcash_global_equity: false }), true);
  assert.equal(needsImplementationChoice(plan(), { gotrade_vt: true }), true);
  assert.equal(needsImplementationChoice(plan(), { gcash_global_equity: true }), false);
  assert.equal(needsImplementationChoice(recommendation({selected:null}), {}), false);
});
test("scenario result describes mathematics and minimums, not security-level instructions", () => {
  for (const result of [plan(), recommendation(), plan({status:"reserve", reserve_amount:"12000"})]) {
    const html = render(result);
    assert.match(html, /hypothetical target-alignment calculation/);
    assert.match(html, /You make your own investment decisions/);
    assert.doesNotMatch(html, /Ready to invest|You should buy|Arbor recommends|Buy now|Keep this contribution/);
  }
});
test("duplicate submit, changed inputs, mode switch and unmount ignore stale results", async () => {
  const seen: unknown[] = [];
  const controller = createContributionController(state => seen.push(state));
  let resolve!: (result: ContributionResult) => void;
  let calls = 0;
  const first = controller.run(() => { calls++; return new Promise(r => { resolve = r; }); });
  await Promise.resolve();
  await controller.run(async () => { calls++; return recommendation(); });
  assert.equal(calls, 1);
  controller.invalidate(); // amount/route/holdings/mode changes use this same reset.
  await controller.run(async () => recommendation());
  resolve(plan()); await first;
  assert.deepEqual(seen.at(-1), { status: "ready", data: recommendation() });
  const late = controller.run(() => new Promise(r => { resolve = r; }));
  await Promise.resolve(); controller.dispose(); const count = seen.length;
  resolve(plan()); await late; assert.equal(seen.length, count);
});

test("beginner implementation choices are neutral, independent and unselected", () => {
  const html = renderToStaticMarkup(createElement(ImplementationChoices, {route:"", bitcoinProvider:null, hasBitcoinTarget:false, onRoute:()=>{}, onBitcoin:()=>{}}));
  for (const label of ["GFunds", "DragonFi", "Gotrade", "GCrypto", "Coins.ph", "PDAX"]) assert.ok(html.includes(label));
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 6);
  assert.doesNotMatch(html, /Interactive Brokers|IBKR|recommended|best for you|aria-pressed="true"/);
  assert.match(html, /does not add Bitcoin/);
  assert.match(html, /stay in this view only/);
  assert.match(html, /min-h-12/);
});

test("selected cards reflect only explicit choices", () => {
  const html = renderToStaticMarkup(createElement(ImplementationChoices, {route:"gotrade", bitcoinProvider:"gcrypto", hasBitcoinTarget:true, onRoute:()=>{}, onBitcoin:()=>{}}));
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 2);
  assert.match(html, /bg-forest text-white/);
});

test("every provider combination preserves selected plan and canonical target including Bitcoin", () => {
  const value = structuredClone(contributionFixture);
  value.plan.plan_basis = "user_selected";
  // Future/historical target contract; this test does not create a new model.
  value.plan.preference_result!.effective_target!.allocation.weights = [
    {role:"global_equity", percentage_points:70}, {role:"defensive", percentage_points:20}, {role:"crypto", percentage_points:10}];
  const before = structuredClone(value);
  for (const route of BEGINNER_ROUTES) for (const provider of Object.keys(BITCOIN_PROVIDERS) as (keyof typeof BITCOIN_PROVIDERS)[]) {
    const req = contributionRequest(value, "1000", values, route, [], false, provider);
    assert.equal(req.context.bitcoin_provider, provider);
    assert.equal(req.context.selection_mode, "explicit");
    assert.deepEqual(req.context.effective_target_allocation, before.plan.preference_result!.effective_target);
    assert.deepEqual(req.context.readiness, before.plan.readiness);
    assert.deepEqual(value, before);
  }
  assert.throws(()=>contributionRequest(value, "1000", values, "gcash", [], false), /Choose a Bitcoin provider/);
  assert.equal(input().context.bitcoin_provider, null);
});
