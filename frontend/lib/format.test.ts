import test from "node:test";
import assert from "node:assert/strict";
import { formatPlanningMoney } from "./format";

test("planning amounts use full whole numbers and unambiguous currency prefixes", () => {
  assert.equal(formatPlanningMoney(732080, "NZD"), "NZ$732,080");
  assert.equal(formatPlanningMoney(1700, "NZD"), "NZ$1,700");
  assert.equal(formatPlanningMoney(1000000, "NZD"), "NZ$1,000,000");
  for (const [currency, prefix] of Object.entries({ PHP: "₱", AUD: "A$", USD: "$", CAD: "C$", EUR: "€", GBP: "£" })) {
    assert.equal(formatPlanningMoney(1234567.89, currency), `${prefix}1,234,568`);
  }
});
test("planning formatting handles zero, negatives, normalized and unknown currencies without conversion", () => {
  assert.equal(formatPlanningMoney(0, "PHP"), "₱0");
  assert.equal(formatPlanningMoney(-1234.2, " nzd "), "−NZ$1,234");
  assert.equal(formatPlanningMoney(1234, "JPY"), "JPY 1,234");
  const original = 1234.567;
  formatPlanningMoney(original, "USD");
  assert.equal(original, 1234.567);
});
