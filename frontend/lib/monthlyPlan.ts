import { getAccessToken } from "./auth";
import { apiBaseUrl } from "./apiConfig";
import { boundedRequest } from "./dashboardConsistency";
import { isPlanV2 } from "./planV2";
import { PLAN_OPTIONS } from "./planImplementation";
import { investmentIdentity } from "./investmentIdentity";
import { formatPhpMoney } from "./contributions";
import type { PortfolioHolding } from "./livePortfolio";
import type { PlanV2 } from "./types/planV2";
import type { MinimumCheck, Sleeve } from "./types/contributions";

export type ImplementationChoices = Partial<Record<Sleeve, string>>;
export type MonthlyRow = {
  sleeve: Sleeve; target_percentage_points: string; current_value: string;
  target_value_after_contribution: string; deficit: string; amount: string;
  product_id: string | null; provider_id: string | null; minimum: MinimumCheck | null;
  status: "ready" | "verify_minimum" | "below_minimum" | "choose_investment" | "no_amount";
};
export type MonthlyPlan = {
  contribution_amount: string; current_portfolio_value: string; source: string; status: string;
  indicative_navs?: {product_id: string; as_of: string; source: "toap"; unit_class: string}[];
  rows: MonthlyRow[];
  provider_groups: {provider_id: string; amount: string; ready_amount: string; verify_minimum_amount: string; waiting_amount: string}[];
  ready_amount: string; recordable_amount: string; verify_minimum_amount: string; waiting_amount: string;
  choose_investment_amount: string; reserve_amount: string; unallocated_amount: string;
};
export type MonthlyPlanInput = {
  contribution_amount: string; confirm_empty?: boolean;
  manual_current?: Record<Sleeve, string> & {currency: "PHP"; owned_product_ids: string[]};
};
export class MonthlyPlanConflictError extends Error {
  constructor() {
    super("Arbor couldn’t calculate this month’s plan. Review your saved plan and portfolio, then retry.");
    this.name = "MonthlyPlanConflictError";
  }
}
export function monthlyPlanConflictCopy(portfolio: {holdings: Pick<PortfolioHolding, "freshness" | "product_id" | "display_name">[]}): string {
  const stale = portfolio.holdings.filter(holding => holding.freshness === "stale");
  if (stale.length) {
    const names = stale.map(holding => investmentIdentity(holding.product_id, holding.display_name).shortName).join(", ");
    return `Arbor can’t calculate this month’s plan because ${names} ${stale.length === 1 ? "has a price" : "have prices"} too old for planning. Check the price date in Portfolio and retry when a newer official price is available. Don’t estimate a replacement value.`;
  }
  const unavailable = portfolio.holdings.filter(holding => holding.freshness === "unavailable");
  if (unavailable.length) {
    const names = unavailable.map(holding => investmentIdentity(holding.product_id, holding.display_name).shortName).join(", ");
    return `Arbor can’t calculate this month’s plan because ${names} ${unavailable.length === 1 ? "has no usable current value" : "have no usable current values"}. Review the holding in Portfolio, then retry when its value is available.`;
  }
  return new MonthlyPlanConflictError().message;
}
const decimal = (v: unknown) => typeof v === "string" && /^\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v));
const statuses = ["ready", "verify_minimum", "below_minimum", "choose_investment", "no_amount"];
/** Display only: the backend's exact planning decimals remain unchanged. */
export function monthlyMoney(value:string):string {
  if(!/^-?\d+(\.\d+)?$/.test(value))throw new Error("Invalid monthly amount");
  return formatPhpMoney(value);
}
export function validMonthlyPlan(value: unknown): value is MonthlyPlan {
  if (!value || typeof value !== "object") return false;
  const p = value as MonthlyPlan;
  return [p.contribution_amount,p.current_portfolio_value,p.ready_amount,p.recordable_amount,p.verify_minimum_amount,p.waiting_amount,p.choose_investment_amount,p.reserve_amount,p.unallocated_amount].every(decimal)
    && (p.indicative_navs === undefined || (Array.isArray(p.indicative_navs) && p.indicative_navs.length <= 6
      && new Set(p.indicative_navs.map(n=>n?.product_id)).size === p.indicative_navs.length
      && p.indicative_navs.every(n=>n && n.source === "toap" && /^\d{4}-\d{2}-\d{2}T/.test(n.as_of) && Number.isFinite(Date.parse(n.as_of))
        && typeof n.unit_class === "string" && n.unit_class.length > 0 && n.unit_class.length <= 60
        && Object.values(PLAN_OPTIONS).flat().some(o=>o.product===n.product_id && ["gcash","dragonfi"].includes(o.provider)))))
    && typeof p.source === "string" && typeof p.status === "string"
    && Array.isArray(p.rows) && p.rows.length <= 4 && p.rows.every(r=>r && typeof r === "object") && new Set(p.rows.map(r=>r.sleeve)).size === p.rows.length
    && p.rows.every(r => r && Object.hasOwn(PLAN_OPTIONS,r.sleeve) && statuses.includes(r.status)
      && [r.target_percentage_points,r.current_value,r.target_value_after_contribution,r.amount].every(decimal)
      && typeof r.deficit === "string" && /^-?\d+(\.\d+)?$/.test(r.deficit)
      && (r.product_id === null ? r.provider_id === null : PLAN_OPTIONS[r.sleeve].some(o=>o.product===r.product_id&&o.provider===r.provider_id))
      && (r.minimum === null || ["ready","verify_minimum","below_minimum"].includes(r.minimum.status)))
    && Array.isArray(p.provider_groups) && p.provider_groups.every(g => g && Object.values(PLAN_OPTIONS).flat().some(o=>o.provider===g.provider_id)
      && [g.amount,g.ready_amount,g.verify_minimum_amount,g.waiting_amount].every(decimal));
}
export function createMonthlyPlanApi(token=getAccessToken, request: typeof fetch=fetch) {
  async function call(userId:string,path:string,method:string,body:unknown,signal?:AbortSignal) {
    return boundedRequest(async active=>{
      const credential=await token(userId);active.throwIfAborted();
      const response=await request(`${apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL,process.env.NODE_ENV)}/v2/${path}`,{
        method,signal:active,cache:"no-store",headers:{Authorization:`Bearer ${credential}`,"Content-Type":"application/json"},body:JSON.stringify(body),
      });
      if(response.status===409)throw path==="monthly-plan" ? new MonthlyPlanConflictError() : new Error("Your plan changed before these choices could be saved. Reload your plan and try again.");
      if(!response.ok)throw new Error(response.status===403 ? "Monthly investing is part of Arbor Plus, with an eligible long-term plan." : response.status===422 ? "Check your amount and choose a supported investment for each part of your plan." : "We couldn’t load or save these choices. Please retry.");
      return response.json();
    },signal);
  }
  return {
    async calculate(userId:string,input:MonthlyPlanInput,signal?:AbortSignal):Promise<MonthlyPlan>{
      const result:unknown=await call(userId,"monthly-plan","POST",{...input,allow_indicative_nav:true},signal);
      if(!validMonthlyPlan(result))throw new Error("Your monthly breakdown could not be confirmed. Please retry.");return result;
    },
    async choose(userId:string,value:PlanV2,choices:ImplementationChoices,signal?:AbortSignal):Promise<PlanV2>{
      const result:unknown=await call(userId,"implementation-choices","PUT",{expected_revision:value.revision,choices},signal);
      if(!isPlanV2(result))throw new Error("Your saved choices could not be confirmed. Reload your plan before continuing.");return result;
    },
  };
}
export const monthlyPlanApi=createMonthlyPlanApi();
