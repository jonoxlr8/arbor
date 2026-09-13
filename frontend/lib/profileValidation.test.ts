import test from "node:test";
import assert from "node:assert/strict";
import { numericError, profileErrors, RISK_CATEGORIES, isRiskCategory, MAX_MONEY, MAX_YEARS } from "./profileValidation";

test("the three supported categories exclude legacy Growth and unknown values", () => {
  assert.deepEqual(RISK_CATEGORIES, ["Conservative", "Balanced", "Aggressive"]);
  for (const risk of RISK_CATEGORIES) assert.equal(isRiskCategory(risk), true);
  for (const risk of ["Growth", "", "Unknown"]) assert.equal(isRiskCategory(risk), false);
});
for (const field of ["current_portfolio_value", "monthly_investment", "goal_target"] as const) {
  test(field + " rejects invalid input before conversion", () => {
    for (const value of ["", " ", "bad", NaN, Infinity, -Infinity, -1, MAX_MONEY + 1]) assert.ok(numericError(field, value));
    assert.equal(numericError(field, MAX_MONEY), null);
  });
}
test("zero portfolio and contribution are valid but a goal must be positive", () => {
  assert.equal(numericError("current_portfolio_value", 0), null);
  assert.equal(numericError("monthly_investment", "0"), null);
  assert.ok(numericError("goal_target", 0));
});
test("horizon is bounded and whole; returns include zero", () => {
  for (const value of ["", 0, -1, 1.5, MAX_YEARS + 1, Infinity]) assert.ok(numericError("investment_horizon", value));
  for (const value of [1, MAX_YEARS]) assert.equal(numericError("investment_horizon", value), null);
  for (const value of [-1, 0, 1]) assert.equal(numericError("annual_return", value), null);
  for (const value of [-1.01, 1.01, NaN]) assert.ok(numericError("annual_return", value));
});
test("validation reports readable field names including legacy correction", () => {
  const errors = profileErrors({ current_portfolio_value: "", monthly_investment: 0, goal_target: 0, investment_horizon: 10, risk_tolerance: "Growth" });
  assert.equal(errors.length, 3);
  assert.match(errors.join(" "), /Current portfolio value.*Goal target.*Risk tolerance/);
});
