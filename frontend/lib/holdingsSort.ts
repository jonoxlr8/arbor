import type { PortfolioHolding } from "./livePortfolio";
import { investmentIdentity } from "./investmentIdentity";
export const HOLDINGS_SORT_OPTIONS = [
  ["highest_value","Highest value"], ["lowest_value","Lowest value"],
  ["highest_gain","Highest gain %"], ["lowest_gain","Lowest gain %"], ["name","Name A–Z"],
] as const;
export type HoldingsSort = typeof HOLDINGS_SORT_OPTIONS[number][0];
export const isHoldingsSort = (value: string): value is HoldingsSort => HOLDINGS_SORT_OPTIONS.some(([key])=>key===value);
// Compare existing decimal strings exactly. No binary rounding or metric recomputation.
function decimal(value: string | null | undefined) {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole,fraction=""] = value.replace(/^-/,"").split(".");
  const integer = whole.replace(/^0+(?=\d)/,"");
  const fractional = fraction.replace(/0+$/,"");
  return {integer,fractional,negative:value.startsWith("-") && (integer!=="0" || !!fractional)};
}
function compare(a: NonNullable<ReturnType<typeof decimal>>, b: NonNullable<ReturnType<typeof decimal>>) {
  if (a.negative!==b.negative) return a.negative?-1:1;
  const length=Math.max(a.fractional.length,b.fractional.length);
  const magnitude=a.integer.length-b.integer.length || (a.integer>b.integer?1:a.integer<b.integer?-1:0) ||
    (a.fractional.padEnd(length,"0")>b.fractional.padEnd(length,"0")?1:a.fractional.padEnd(length,"0")<b.fractional.padEnd(length,"0")?-1:0);
  return a.negative?-magnitude:magnitude;
}
const name = (h: PortfolioHolding) => investmentIdentity(h.product_id,h.display_name).fullName;
const tie = (a: PortfolioHolding,b: PortfolioHolding) => name(a).localeCompare(name(b),"en",{sensitivity:"base"}) ||
  a.provider.localeCompare(b.provider,"en") || a.product_id.localeCompare(b.product_id,"en") || a.id.localeCompare(b.id,"en");
export function sortedHoldings(holdings: readonly PortfolioHolding[], option: HoldingsSort): PortfolioHolding[] {
  const gain = option==="highest_gain" || option==="lowest_gain";
  return holdings.map((holding,index)=>({holding,index,metric:gain ?
    holding.value_php!==null && holding.cost_basis_php!=null && holding.recorded_gain_php!=null ? decimal(holding.recorded_gain_percentage) : null : decimal(holding.value_php)}))
    .sort((a,b)=>{
      if (option==="name") return tie(a.holding,b.holding) || a.index-b.index;
      if (!a.metric || !b.metric) return a.metric?-1:b.metric?1:a.index-b.index;
      const direction=option==="lowest_value" || option==="lowest_gain"?1:-1;
      return direction*compare(a.metric,b.metric) || tie(a.holding,b.holding) || a.index-b.index;
    }).map(row=>row.holding);
}
