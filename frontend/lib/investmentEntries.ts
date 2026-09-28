/** Exact display-only unit addition; the database remains authoritative. */
export function manilaInvestmentToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (part: "year" | "month" | "day") => parts.find(p => p.type === part)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function addUnitTexts(left: string, right: string): string {
  const parse = (value: string) => {
    if (!/^\d+(?:\.\d{1,12})?$/.test(value)) throw new Error("Invalid units");
    const [whole, fractional = ""] = value.split(".");
    return `${whole}${fractional.padEnd(12, "0")}`;
  };
  const a = parse(left), b = parse(right), width = Math.max(a.length,b.length);
  const paddedA = a.padStart(width,"0"), paddedB = b.padStart(width,"0");
  let carry = 0, sum = "";
  for (let i = width - 1; i >= 0; i--) {
    const digit = Number(paddedA[i]) + Number(paddedB[i]) + carry;
    sum = String(digit % 10) + sum;
    carry = Math.floor(digit / 10);
  }
  if (carry) sum = String(carry) + sum;
  const whole = sum.slice(0,-12).replace(/^0+(?=\d)/,"") || "0";
  const fraction = sum.slice(-12).replace(/0+$/,"");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Accept common provider display formats without rounding or guessing decimal commas. */
export function normalizeInvestmentNumber(value: string): string {
  const text = value.trim();
  const ungrouped = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text) ? text.replaceAll(",", "") : text;
  return /^\.\d+$/.test(ungrouped) ? `0${ungrouped}` : ungrouped;
}

/** Cost is optional in the ledger, but the entry flow requires an explicit unknown-cost choice. */
export function investmentCostChoiceError(amount: string | null, explicitlyUnknown: boolean): string | null {
  const normalized = amount?.trim() ? normalizeInvestmentNumber(amount) : "";
  if (explicitlyUnknown) return normalized ? "Clear the amount paid or switch to a known amount." : null;
  if (!normalized) return "Enter the amount you paid, or choose “I don't know the amount paid.”";
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(normalized) || !/[1-9]/.test(normalized)) {
    return "Enter a positive PHP amount with up to two decimal places, or choose “I don't know the amount paid.”";
  }
  return null;
}
