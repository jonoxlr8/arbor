export type ShareBasis = "before_split" | "after_split";
export const VGT_SPLIT_DAY = "2026-04-21";
export const needsShareBasis = (product: string, day?: string | null) => product === "gotrade_vgt" && (!day || day < VGT_SPLIT_DAY);
export const shareBasisLabel = (basis?: ShareBasis | null) => basis === "before_split" ? "Original shares before the split" : basis === "after_split" ? "Already-adjusted shares after the split" : "Share count basis not confirmed";
// Exact decimal arithmetic for the review screen only. Database owns valuation.
export function currentVgtShares(units: string, basis: ShareBasis): string {
  if (basis === "after_split") return units;
  const match = /^(\d+)(?:\.(\d{1,12}))?$/.exec(units);
  if (!match) throw new Error("Invalid shares");
  const fraction = match[2] ?? "";
  const scale = BigInt(10) ** BigInt(fraction.length);
  const value = (BigInt(match[1]) * scale + BigInt(fraction || "0")) * BigInt(8);
  const tail = (value % scale).toString().padStart(fraction.length, "0").replace(/0+$/, "");
  return `${value / scale}${tail ? `.${tail}` : ""}`;
}
