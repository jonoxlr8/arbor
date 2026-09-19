import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SignupConfirmation from "../app/confirm-signup/SignupConfirmation";
import { signupConfirmationUrl } from "./signupConfirmation";

const project = "https://example.supabase.co";
const site = "https://arbor.ph/";
const token = "a".repeat(64);
const verification = `${project}/auth/v1/verify?token=${token}&type=signup&redirect_to=${encodeURIComponent(site)}`;
test("original ConfirmationURL keeps token and type, with pinned Arbor return", () => {
  const result = signupConfirmationUrl(`#confirmation_url=${verification}`, project, site);
  assert.ok(result);
  const url = new URL(result);
  assert.equal(url.searchParams.get("token"), token);
  assert.equal(url.searchParams.get("redirect_to"), site);
  assert.equal(url.searchParams.get("type"), "signup");
  assert.ok(signupConfirmationUrl(`#confirmation_url=${verification.replace("type=signup", "type=email")}`, project, site));
});
test("rejects malformed links, alternate hosts/actions, duplicates and open redirects", () => {
  for (const value of ["", "#confirmation_url=javascript:alert(1)", "#confirmation_url=bad", ...[
    verification.replace(project, "https://evil.example"),
    verification.replace("/verify", "/logout"),
    verification.replace("type=signup", "type=recovery"),
    verification.replace(token, ""),
    verification.replace(encodeURIComponent(site), encodeURIComponent("https://evil.example/")),
    verification + "&token=another", verification + "#extra",
    verification.replace("https://", "https://user:pass@"),
  ].map(url => `#confirmation_url=${url}`)]) assert.equal(signupConfirmationUrl(value, project, site), null);
});
test("GET/server render has no verification link or token and never auto-redeems", () => {
  const html = renderToStaticMarkup(createElement(SignupConfirmation));
  assert.match(html, /Checking your confirmation link/);
  assert.match(html, /href="\/#login"/);
  assert.doesNotMatch(html, /auth\/v1\/verify|token=|<script/);
  const source = readFileSync("app/confirm-signup/SignupConfirmation.tsx", "utf8");
  assert.match(source, /onClick=\{confirm\}/);
  assert.match(source, /history.replaceState/);
  assert.doesNotMatch(source, /console\.|localStorage|sessionStorage|fetch\(|verifyOtp|from.*lib\/supabase/);
  assert.equal((source.match(/location.assign/g) ?? []).length, 1);
});
