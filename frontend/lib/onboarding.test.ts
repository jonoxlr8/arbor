import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingQuestionV2 } from "../components/OnboardingV2";
import ProgressBar from "../components/ProgressBar";
import { ONBOARDING_STEPS, EMPTY_ANSWERS, onboardingRequest, answerError, SAVINGS_OPTIONS, DEBT_OPTIONS, HORIZON_OPTIONS, RISK_OPTIONS } from "./onboardingV2";
import { authErrorMessage } from "./authErrorMessage";

test("v2 asks Name then Country exactly once and has nine truthful progress steps", () => {
  assert.deepEqual(ONBOARDING_STEPS, ["full_name", "country", "emergency_savings", "high_interest_debt", "goal_target", "current_portfolio_value", "monthly_investment", "horizon", "risk_response"]);
  const screens = ONBOARDING_STEPS.map(field => renderToStaticMarkup(createElement(OnboardingQuestionV2, {field, value:"", onChange:() => {}})));
  assert.match(screens[0], /your name/);
  assert.match(screens[1], /Where do you live/);
  assert.equal(screens.filter(html => html.includes("Where do you live")).length, 1);
  for (let step = 1; step <= 9; step++) assert.match(renderToStaticMarkup(createElement(ProgressBar, {step, totalSteps:9})), new RegExp(`Step ${step} of 9`));
});
test("Philippines establishes PHP; Other stays blocked", () => {
  const answers = {...EMPTY_ANSWERS, full_name:" A ", country:"Philippines", current_portfolio_value:"0", monthly_investment:"0", emergency_savings:"less_than_1_month", high_interest_debt:"not_sure", horizon:"less_than_3_years", risk_response:"sell_all"};
  const input = onboardingRequest(answers);
  assert.equal(input.currency, "PHP");
  assert.equal(input.country, "Philippines");
  assert.equal(input.full_name, "A");
  assert.equal(input.goal_target, null);
  assert.equal(input.current_portfolio_value, 0);
  assert.equal(input.monthly_investment, 0);
  assert.throws(() => onboardingRequest({...answers, country:"Other"}), /Philippines first/);
  assert.match(renderToStaticMarkup(createElement(OnboardingQuestionV2, {field:"country", value:"Other", onChange:() => {}})), /More countries are coming/);
});
test("v2 question choices match backend enums without a frontend strategy mapping", () => {
  assert.deepEqual(SAVINGS_OPTIONS.map(([v]) => v), ["less_than_1_month","one_to_two_months","three_to_six_months","more_than_six_months"]);
  assert.deepEqual(DEBT_OPTIONS.map(([v]) => v), ["none","paying_down","difficult_to_manage","not_sure"]);
  assert.deepEqual(HORIZON_OPTIONS.map(([v]) => v), ["less_than_3_years","three_to_five_years","five_to_ten_years","ten_plus_years"]);
  assert.deepEqual(RISK_OPTIONS.map(([v]) => v), ["sell_all","sell_some","hold","continue_investing","invest_more"]);
});
test("numeric blank, negative and nonfinite values fail; zero amounts and optional goal remain valid", () => {
  for (const field of ["current_portfolio_value", "monthly_investment"] as const) {
    assert.equal(answerError(field, "0"), null);
    for (const value of ["", " ", "-1", "NaN", "Infinity", "1000000000001"]) assert.ok(answerError(field, value));
  }
  assert.equal(answerError("goal_target", ""), null);
  assert.ok(answerError("goal_target", "0"));
  assert.ok(answerError("risk_response", "unknown"));
});
test("email-send limit remains friendly", () => {
  for (const error of [new Error("email rate limit exceeded"), {code:"over_email_send_rate_limit"}]) assert.match(authErrorMessage(error), /Too many confirmation emails/);
  assert.equal(authErrorMessage(new Error("Invalid login credentials")), "Invalid login credentials");
});
