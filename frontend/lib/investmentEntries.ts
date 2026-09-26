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
