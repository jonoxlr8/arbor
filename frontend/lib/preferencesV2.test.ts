import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PreferencesV2 from "../components/PreferencesV2";
import { EMPTY_ANSWERS, onboardingRequest } from "./onboardingV2";
import { isPlanV2 } from "./planV2";
import type { PlanV2, PreferenceApplication, Strategy } from "./types/planV2";

function fixture(strategy: Strategy = "Growth", equity = 65, defensive = 20, tech = 10, btc = 5): PlanV2 {
  const applied = (effective: number, cap: number): PreferenceApplication => ({ requested_percentage_points: 10, effective_percentage_points: effective, strategy_cap_percentage_points: cap, reasons: effective < 10 ? ["strategy_cap"] : [] });
  return { strategy_engine_version: "2.0", profile: { strategy_engine_version: "2.0", full_name: "Alex", country: "Philippines", currency: "PHP", emergency_savings: "three_to_six_months", high_interest_debt: "none", goal_target: null, current_portfolio_value: 0, monthly_investment: 0, horizon: "ten_plus_years", risk_response: "hold", saved_preferences: { technology_tilt: 10, bitcoin: 10 } },
    plan: { strategy_engine_version: "2.0", path: "long_term", selected_strategy: strategy, planning_return_pct: 5, inflation_pct: 3,
      base_allocation: [{ role: "global_equity", percentage_points: 100 - defensive }, { role: "defensive", percentage_points: defensive }],
      selection: { risk_response: "hold", horizon: "ten_plus_years", requested_strategy: strategy, selected_strategy: strategy, horizon_maximum_strategy: "Aggressive", is_short_term: false, cap_applied: false, reason: "requested_strategy_retained" },
      readiness: { readiness: "ready", core_strategy_can_be_shown: true, actionable_contribution_guidance_allowed: true, technology_satellite_readiness_eligible: true, bitcoin_satellite_readiness_eligible: true, message_requirement: "none" },
      preference_result: { technology_tilt: applied(tech, tech), bitcoin: applied(btc, btc), effective_target: { strategy_engine_version: "2.0", base_strategy: strategy, allocation: { weights: [
        { role: "global_equity", percentage_points: equity }, { role: "defensive", percentage_points: defensive }, { role: "technology_tilt", percentage_points: tech }, { role: "crypto", percentage_points: btc },
      ] } } },
    } };
}
const render = (value: PlanV2) => renderToStaticMarkup(createElement(PreferencesV2, { value }));
const answers = { ...EMPTY_ANSWERS, full_name: "Alex", country: "Philippines", emergency_savings: "three_to_six_months", high_interest_debt: "none", horizon: "ten_plus_years", risk_response: "hold", current_portfolio_value: "0", monthly_investment: "0" };

test("new onboarding omits preferences, including stale extra state", () => {
  assert.equal("saved_preferences" in onboardingRequest(answers), false);
  const stale = { ...answers, technology_tilt: "100", bitcoin: "100", saved_preferences: {technology_tilt:100,bitcoin:100} };
  const payload = onboardingRequest(stale);
  assert.equal("saved_preferences" in payload, false);
  assert.equal("technology_tilt" in payload, false);
  assert.equal("bitcoin" in payload, false);
});
test("Growth saved 10/10 displays backend effective 10/5 and cap explanation", () => {
  const value = fixture();
  assert.ok(isPlanV2(value));
  const html = render(value);
  assert.match(html, /65%/); assert.match(html, /5%/); assert.match(html, /10%/);
  assert.match(html, /allows up to 5%/);
  assert.deepEqual(value.profile.saved_preferences, { technology_tilt: 10, bitcoin: 10 });
});
test("Balanced over-cap display uses backend 5/5 target", () => {
  const value = fixture("Balanced", 50, 40, 5, 5);
  assert.ok(isPlanV2(value));
  assert.match(render(value), /50%/);
  assert.equal((render(value).match(/allows up to 5%/g) ?? []).length, 2);
});
for (const foundation of [false, true]) test(`${foundation ? "Foundation First" : "Getting Ready"} retains requests and displays paused allocations`, () => {
  const value = fixture("Aggressive", foundation ? 100 : 90, 0, foundation ? 0 : 10, 0);
  value.plan.readiness = { ...value.plan.readiness, readiness: foundation ? "foundation_first" : "getting_ready", actionable_contribution_guidance_allowed: !foundation, message_requirement: foundation ? "foundation_first" : "readiness_caution" };
  value.plan.preference_result!.bitcoin.reasons = ["readiness_restricted"];
  if (foundation) value.plan.preference_result!.technology_tilt.reasons = ["readiness_restricted"];
  assert.ok(isPlanV2(value));
  assert.match(render(value), /Currently paused by your readiness check/);
  assert.match(render(value), /10%/);
  assert.match(render(value), /0%/);
  if (foundation) assert.match(render(value), /Strategy preview only/);
});
test("short-term keeps requests but never displays effective long-term allocation", () => {
  const value = fixture();
  value.profile.horizon = "less_than_3_years";
  value.plan = { ...value.plan, path: "short_term", selected_strategy: null, planning_return_pct: null, base_allocation: null,
    selection: { ...value.plan.selection, horizon: "less_than_3_years", selected_strategy: null, horizon_maximum_strategy: null, is_short_term: true, cap_applied: false, reason: "short_term_path" } };
  const result = value.plan.preference_result!;
  result.effective_target = null;
  for (const key of ["technology_tilt", "bitcoin"] as const) result[key] = { requested_percentage_points: 10, effective_percentage_points: 0, strategy_cap_percentage_points: null, reasons: ["short_term_path"] };
  assert.ok(isPlanV2(value));
  assert.match(render(value), /No effective long-term target/);
  assert.doesNotMatch(render(value), /Effective target allocation/);
});
test("old v2 response defaults requests to zero without inventing target; saved response round-trips", () => {
  const value = fixture();
  const restored = JSON.parse(JSON.stringify(value));
  assert.ok(isPlanV2(restored)); assert.equal(render(restored), render(value));
  delete value.profile.saved_preferences; delete value.plan.preference_result;
  assert.ok(isPlanV2(value));
  assert.match(render(value), /0%/); assert.match(render(value), /details are unavailable/);
});
test("malformed effective response fails closed", () => {
  const value = fixture();
  value.plan.preference_result!.bitcoin.reasons = ["invented" as never];
  assert.equal(isPlanV2(value), false);
  const other = fixture(); other.plan.preference_result!.effective_target!.allocation.weights[0].percentage_points = 99;
  assert.equal(isPlanV2(other), false);
});
