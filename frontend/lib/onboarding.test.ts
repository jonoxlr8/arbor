import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Question from "../components/Question";
import ProgressBar from "../components/ProgressBar";
import { planningCurrency } from "./currency";
import { authErrorMessage } from "./authErrorMessage";

const noop = () => {};
const props = { name: "", setName: noop, country: "", setCountry: noop,
  currentPortfolioValue: "", setCurrentPortfolioValue: noop,
  monthlyInvestment: "", setMonthlyInvestment: noop, goalTarget: "", setGoalTarget: noop,
  investmentHorizon: "", setInvestmentHorizon: noop, riskTolerance: "", setRiskTolerance: noop };
test("Name then Country, with exactly one country question in seven steps", () => {
  const screens = Array.from({ length: 7 }, (_, i) => renderToStaticMarkup(createElement(Question, { ...props, step: i + 1 })));
  assert.match(screens[0], /your name/);
  assert.match(screens[1], /Where do you live/);
  assert.equal(screens.filter(html => html.includes("Where do you live")).length, 1);
  for (let step = 1; step <= 7; step++) assert.match(renderToStaticMarkup(createElement(ProgressBar, { step, totalSteps: 7 })), new RegExp(`Step ${step} of 7`));
});
test("Philippines uses PHP and Other gives an explicit beta boundary", () => {
  assert.equal(planningCurrency("Philippines"), "PHP");
  const html = renderToStaticMarkup(createElement(Question, { ...props, step: 2, country: "Other" }));
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /isn’t available in this beta/);
  const source = readFileSync("app/page.tsx", "utf8");
  assert.match(source, /country === "Philippines"/);
  assert.match(source, /setStep\(step \+ 1\)/);
  assert.match(source, /setStep\(step - 1\)/);
  assert.match(source, /planningCurrency\(country\)/);
  assert.doesNotMatch(source, /EntryCountry|visibleSteps/);
});
test("email-send limit is friendly without changing other auth errors", () => {
  for (const error of [new Error("email rate limit exceeded"), {code:"over_email_send_rate_limit"}]) {
    assert.match(authErrorMessage(error), /Too many confirmation emails/);
    assert.doesNotMatch(authErrorMessage(error), /rate limit exceeded/);
  }
  assert.equal(authErrorMessage(new Error("Invalid login credentials")), "Invalid login credentials");
});
test("amount questions lead with the question and do not show premature empty-input errors", () => {
  const html = renderToStaticMarkup(createElement(Question, { ...props, step: 3 }));
  assert.ok(html.indexOf("What is your planning starting value?") < html.indexOf("Planning currency:"));
  assert.doesNotMatch(html, /enter a value/);
  assert.match(renderToStaticMarkup(createElement(Question, { ...props, step: 3, currentPortfolioValue: "-1" })), /enter 0 or more/);
});
