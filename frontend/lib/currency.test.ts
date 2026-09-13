import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCurrency, planningCurrency } from "./currency";

test("currency normalization retains all supported recorded units", () => {
  for (const code of ["USD", "PHP", "NZD", "AUD", "EUR", "GBP", "CAD"]) {
    assert.equal(normalizeCurrency(` ${code.toLowerCase()} `), code);
  }
  for (const value of [null, undefined, "", " ", "unknown"]) assert.equal(normalizeCurrency(value), null);
});
test("planning defaults are explicit, including Australia, without guessing", () => {
  assert.equal(planningCurrency("Australia"), "AUD");
  assert.equal(planningCurrency("Philippines"), "PHP");
  assert.equal(planningCurrency("New Zealand"), "NZD");
  assert.equal(planningCurrency("United States"), "USD");
  assert.equal(planningCurrency("Other"), null);
});
