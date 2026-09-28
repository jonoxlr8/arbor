import test from "node:test";
import assert from "node:assert/strict";
import { addUnitTexts, investmentAmountPaidError, manilaInvestmentToday, normalizeInvestmentNumber } from "./investmentEntries";

test("investment today uses Manila rather than the previous UTC date", () => {
  assert.equal(manilaInvestmentToday(new Date("2026-09-26T16:05:00Z")), "2026-09-27");
  assert.equal(manilaInvestmentToday(new Date("2026-09-26T15:55:00Z")), "2026-09-26");
});

test("exact unit preview, without floating-point drift", () => {
  assert.equal(addUnitTexts("2.40000", "0.52314"), "2.92314");
  assert.equal(addUnitTexts("10", "10"), "20");
  assert.equal(addUnitTexts("0.000000000001", "0.000000000001"), "0.000000000002");
  assert.throws(() => addUnitTexts("1.0000000000001", "1"));
});

test("provider decimal formats normalize without rounding or guessing ambiguous commas", () => {
  for (const [input, expected] of [[" 6,500.00 ", "6500.00"], [".5", "0.5"], ["1,234,567.12", "1234567.12"], ["1,23", "1,23"], ["1e3", "1e3"], ["0.000000000001", "0.000000000001"]]) assert.equal(normalizeInvestmentNumber(input), expected);
});

test("new dated investments require an actual positive PHP amount", () => {
  assert.match(investmentAmountPaidError(null)!, /actual PHP amount paid/);
  assert.equal(investmentAmountPaidError(" 6,500 "), null);
  assert.equal(investmentAmountPaidError("6500.50"), null);
  for (const invalid of ["", "0", "-1", "1,23", "6500.501", "1e3"]) assert.match(investmentAmountPaidError(invalid)!, /PHP amount/);
});
