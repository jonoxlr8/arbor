import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { destinations, destinationFromHash, subscribeNavigation } from "./appNavigation";
import AppShell from "../components/app/AppShell";
import HomeOverview from "../components/app/HomeOverview";
import ResultsDashboard from "../components/ResultsDashboard";
import ChatSection from "../components/dashboard/ChatSection";
import { AppearanceSettings } from "../components/app/Appearance";
import type { Plan } from "./types/plan";
import type { ActualPortfolioHealthResponse } from "./api";

const plan: Plan = {
  profile: { full_name: "Example Person", country: "Philippines", currency: "PHP", current_portfolio_value: 200, monthly_investment: 10, goal_target: 1000, investment_horizon: 10, risk_tolerance: "Balanced" },
  portfolio: [{ ticker: "VOO", asset_name: "Vanguard", allocation: 100 }],
  projection: { starting_value: 200, monthly_contribution: 10, assumed_return: .08, projected_value: 123456, investment_period_years: 10, required_monthly_investment: 5, yearly_projection: [{ year: 0, value: 200 }, { year: 10, value: 123456 }] },
  explanation: { summary: "Model plan", reasons: ["Example explanation"] },
  health: { score: 9, breakdown: { diversification: 2, risk_alignment: 2, growth_potential: 2, concentration: 2, crypto_exposure: 1 }, strengths: [], warnings: [] },
};
const actual: ActualPortfolioHealthResponse = { basis: "cost_basis", currency: "USD", available: true, health: { ...plan.health!, score: 6 } };

test("four primary destinations and settings have deterministic bookmark identities", () => {
  assert.deepEqual(destinations.map(item => item.id), ["home", "portfolio", "plan", "ask"]);
  for (const id of [...destinations.map(item => item.id), "settings"]) assert.equal(destinationFromHash(`#${id}`), id);
  for (const hash of ["", "#unknown", "#PROFILE", "#%invalid"]) assert.equal(destinationFromHash(hash), "home");
});

test("navigation subscribes to browser hash/back-forward changes and cleans up", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const events = new EventTarget();
  Object.defineProperty(globalThis, "window", { configurable: true, value: events });
  try {
    let calls = 0;
    const unsubscribe = subscribeNavigation(() => { calls++; });
    events.dispatchEvent(new Event("hashchange"));
    assert.equal(calls, 1);
    unsubscribe();
    events.dispatchEvent(new Event("hashchange"));
    assert.equal(calls, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("desktop/mobile navigation share active destination and accessible profile/logout controls", () => {
  for (const active of ["home", "portfolio", "plan", "ask", "settings"] as const) {
    const html = renderToStaticMarkup(createElement(AppShell, { active, name: "Example", onSignOut() {}, signingOut: false, logoutError: "" }, "Content"));
    assert.match(html, /Primary navigation/);
    assert.match(html, /Mobile navigation/);
    assert.match(html, new RegExp(`href="#${active}" aria-current="page"`));
    assert.match(html, /aria-label="Settings"/);
    assert.doesNotMatch(html, /Profile &amp; settings|Profile and settings/);
    assert.match(html, /Sign out/);
    assert.match(html, /safe-area-inset-bottom/);
    assert.match(html, /Skip to content/);
  }
});

test("logout pending/error remains visible and accessible in the shell", () => {
  const html = renderToStaticMarkup(createElement(AppShell, { active: "settings", name: "Example", onSignOut() {}, signingOut: true, logoutError: "Please try again" }, "Profile"));
  assert.match(html, /Signing out/);
  assert.match(html, /disabled=""/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Please try again/);
});

test("Home reads canonical planning values and does not invent ownership or recommended Health", () => {
  const html = renderToStaticMarkup(createElement(HomeOverview, { plan, actualHealth: null }));
  assert.match(html, /₱123,456/);
  assert.match(html, /₱10/);
  assert.match(html, /8% assumed annual return/);
  assert.match(html, /Illustrative, not today’s balance/);
  assert.match(html, /Monthly contribution/);
  assert.match(html, /Planning goal/);
  assert.doesNotMatch(html, /Arbor target portfolio|Vanguard/);
  assert.match(html, /Loading your recorded portfolio check/);
  assert.doesNotMatch(html, /\/ 10/);
  assert.doesNotMatch(html, /Hypothetical contribution allocation|Rebalancing considerations|Add Holding/);
});

test("Home uses actual cost-basis Health only when synchronization permits it", () => {
  const html = renderToStaticMarkup(createElement(HomeOverview, { plan, actualHealth: actual }));
  assert.match(html, />6 \/ 10/);
  assert.match(html, /USD/);
  assert.match(html, /heuristic/);
  for (const message of ["Loading saved holdings", "Holdings failed; Retry"]) {
    const boundary = renderToStaticMarkup(createElement(HomeOverview, { plan, actualHealth: actual, healthMessage: message }));
    assert.match(boundary, new RegExp(message));
    assert.doesNotMatch(boundary, /\/ 10/);
  }
  const empty = renderToStaticMarkup(createElement(HomeOverview, { plan, actualHealth: { basis: "cost_basis", currency: null, available: false, health: null, reason: "No holdings recorded" } }));
  assert.match(empty, /No holdings recorded/);
});

test("app initially gates actual analytics while keeping destination owners mounted", () => {
  const html = renderToStaticMarkup(createElement(ResultsDashboard, { plan, onSignOut() {}, signingOut: false, logoutError: "" }));
  assert.equal((html.match(/hidden="" class="app-destination/g) ?? []).length, 4);
  assert.match(html, /Loading your saved holdings/);
  assert.doesNotMatch(html, /Total recorded cost basis|Portfolio Alignment|Rebalancing considerations/);
  assert.match(html, /Edit Profile/);
  assert.match(html, /Planning starting value/);
});

test("dedicated Ask destination preserves bounded explanation copy and suggested prompts", () => {
  const html = renderToStaticMarkup(createElement(ChatSection, { plan }));
  assert.match(html, /Understand your plan, allocations and projections/);
  assert.match(html, /What are my target allocations/);
  assert.doesNotMatch(html, /rule-based|limited set/);
  assert.match(html, /No live market, tax or trading advice/);
  assert.match(html, /not actual holdings/);
  assert.match(html, /aria-label="Your question about your Arbor plan"/);
});

test("appearance exposes three keyboard-accessible choices with System as default", () => {
  const html = renderToStaticMarkup(createElement(AppearanceSettings));
  assert.match(html, /<legend[^>]*>Appearance/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
  assert.match(html, /checked="" value="system"/);
  assert.match(html, /Saved on this browser only/);
});

test("profile editing is in settings only, not duplicated in Plan", () => {
  const html = renderToStaticMarkup(createElement(ResultsDashboard, { plan, onSignOut() {}, signingOut: false, logoutError: "" }));
  assert.equal((html.match(/>Edit Profile</g) ?? []).length, 1);
  assert.match(html, /Your investment profile/);
  assert.equal((html.match(/class="arbor-feature(?: mt-12)?"/g) ?? []).length, 2);
});
