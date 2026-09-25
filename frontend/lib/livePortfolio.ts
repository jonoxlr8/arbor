import { getAccessToken } from "./auth";
import { apiBaseUrl } from "./apiConfig";
import { boundedRequest } from "./dashboardConsistency";
import type { Sleeve, ContributionMode, ContributionRequest } from "./types/contributions";
import { parseContributionResponse } from "./contributionApi";
import type { PlanV2 } from "./types/planV2";
import { InvalidSessionError } from "./accountRecovery";

const portfolioMessages = {
  portfolio_auth: "Your session has expired. Sign in again to continue.",
  portfolio_entitlement: "Portfolio tracking is available with Arbor Plus. Explore plans in Settings.",
  portfolio_unavailable: "Portfolio tracking is not available right now. Please try again later.",
  portfolio_contract: "We couldn’t load your portfolio correctly. Please refresh and try again.",
  portfolio_network: "We couldn’t reach Arbor. Check your connection and try again.",
  portfolio_server: "Portfolio records are temporarily unavailable. Please retry.",
} as const;
export type PortfolioErrorCode = keyof typeof portfolioMessages;
export class PortfolioError extends Error {
  constructor(readonly code: PortfolioErrorCode) { super(portfolioMessages[code]); this.name = "PortfolioError"; }
}
// Only our bounded errors may supply display copy. Never forward transport/API text.
export function portfolioReadError(error: unknown): PortfolioError {
  if (error instanceof PortfolioError) return new PortfolioError(error.code);
  if (error instanceof InvalidSessionError) return new PortfolioError("portfolio_auth");
  if (error instanceof Error && error.message === "Request timed out. Please try again.") return new PortfolioError("portfolio_network");
  return new PortfolioError("portfolio_server");
}

export type PortfolioProduct = { product_id: string; provider: string; provider_name: string; display_name: string; sleeve: Sleeve; price_kind: "nav" | "reference" };
export type HoldingDraft = { provider: string; product_id: string; units: string | null; cost_basis_php: string | null; manual_value_php?: string | null };
export type PortfolioHolding = PortfolioProduct & HoldingDraft & { id: string; value_php: string | null; freshness: "fresh" | "stale" | "unavailable"; as_of: string | null; updated_at: string;
  valuation_source?: "nav" | "market_reference" | "manual_user" | "unavailable"; manual_value_php?: string | null; manual_value_updated_at?: string | null };
export const supportsManualValue = (h: { product_id: string }) => ["gcash_global_equity", "gcash_technology", "gcash_defensive", "dragonfi_global_equity", "dragonfi_technology", "dragonfi_defensive"].includes(h.product_id);
export const validManualValue = (v: string) => /^\d{1,16}(?:\.\d{1,2})?$/.test(v) && /[1-9]/.test(v);
export type PortfolioHistory = { day: string; value_php: string; captured_at: string };
export type LivePortfolioData = {
  currency: "PHP"; holdings: PortfolioHolding[]; catalog: PortfolioProduct[]; history: PortfolioHistory[];
  data_sources?: string[];
  known_value_php: string; total_value_php: string | null; complete: boolean; unavailable_count: number; stale_count: number;
  provider_values_php: Record<string, string>; valued_at: string;
  sleeves: { sleeve: Sleeve; known_value_php: string; current_percentage: string | null; target_percentage: number | null; difference_pp: string | null }[];
};
const money = (v: unknown) => typeof v === "string" && /^\d+(?:\.\d+)?$/.test(v);
const decimal = (v: unknown) => typeof v === "string" && /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v);
const roles = ["global_equity", "defensive", "technology_tilt", "crypto"];
const timestamp = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
export const isHistory = (v: unknown): v is PortfolioHistory[] => Array.isArray(v) && v.every(h => h && /^\d{4}-\d{2}-\d{2}$/.test(h.day) && money(h.value_php) && timestamp(h.captured_at));
export function isPortfolio(value: unknown): value is LivePortfolioData {
  if (!value || typeof value !== "object") return false;
  const sources = (value as LivePortfolioData).data_sources;
  if (sources !== undefined && (!Array.isArray(sources) || !sources.every(s => ["marketstack", "coinranking", "exchangerate_api", "toap"].includes(s)))) return false;
  const p = value as LivePortfolioData;
  return p.currency === "PHP" && money(p.known_value_php) && (p.total_value_php === null || money(p.total_value_php)) &&
    typeof p.complete === "boolean" && Number.isInteger(p.unavailable_count) && p.unavailable_count >= 0 && Number.isInteger(p.stale_count) && p.stale_count >= 0 && timestamp(p.valued_at) &&
    !!p.provider_values_php && typeof p.provider_values_php === "object" && Object.values(p.provider_values_php).every(money) &&
    Array.isArray(p.catalog) && p.catalog.every(h => h && typeof h.product_id === "string" && typeof h.provider === "string" && typeof h.provider_name === "string" && typeof h.display_name === "string" && roles.includes(h.sleeve)) &&
    Array.isArray(p.holdings) && p.holdings.every(h => h && typeof h.id === "string" && (decimal(h.units) || h.units === null && supportsManualValue(h) && h.manual_value_php != null) && roles.includes(h.sleeve) && typeof h.display_name === "string" && typeof h.provider_name === "string" &&
      p.catalog.some(c => c.product_id === h.product_id && c.provider === h.provider) && ["fresh", "stale", "unavailable"].includes(h.freshness) &&
      (h.valuation_source === undefined || ["nav", "market_reference", "manual_user", "unavailable"].includes(h.valuation_source)) &&
      (h.manual_value_php == null ? h.manual_value_updated_at == null : supportsManualValue(h) && validManualValue(h.manual_value_php) && timestamp(h.manual_value_updated_at)) &&
      (h.valuation_source !== "manual_user" || supportsManualValue(h) && h.freshness === "fresh" && h.manual_value_php != null && h.as_of === h.manual_value_updated_at) &&
      (h.freshness === "unavailable" ? h.value_php === null : money(h.value_php) && timestamp(h.as_of))) &&
    p.unavailable_count === p.holdings.filter(h => h.value_php === null).length && p.complete === (p.unavailable_count === 0) &&
    p.stale_count === p.holdings.filter(h => h.freshness === "stale").length &&
    isHistory(p.history) &&
    Array.isArray(p.sleeves) && p.sleeves.length === 4 && p.sleeves.every(Boolean) && new Set(p.sleeves.map(s => s.sleeve)).size === 4 &&
    p.sleeves.every(s => s && roles.includes(s.sleeve) && money(s.known_value_php) && (s.current_percentage === null || decimal(s.current_percentage)) &&
      (s.difference_pp === null || decimal(s.difference_pp)) && (s.target_percentage === null || (Number.isInteger(s.target_percentage) && s.target_percentage >= 0 && s.target_percentage <= 100)));
}
export function validHolding(draft: HoldingDraft, catalog: PortfolioProduct[]) {
  const unitsValid = draft.units !== null && /^\d{1,12}(?:\.\d{1,12})?$/.test(draft.units) && /[1-9]/.test(draft.units);
  const manualValid = draft.manual_value_php != null && validManualValue(draft.manual_value_php);
  return catalog.some(p => p.product_id === draft.product_id && p.provider === draft.provider) &&
    (supportsManualValue(draft) ? (draft.units === null || unitsValid) && (draft.manual_value_php == null || manualValid) && (unitsValid || manualValid) : unitsValid && draft.manual_value_php == null) &&
    (draft.cost_basis_php === null || /^\d{1,16}(?:\.\d{1,2})?$/.test(draft.cost_basis_php));
}
export const portfolioValues = (p: LivePortfolioData) => Object.fromEntries(p.sleeves.map(s => [s.sleeve, s.known_value_php])) as Record<Sleeve, string>;
export function scenarioAvailability(plan: PlanV2, portfolio: LivePortfolioData) {
  if (plan.plan.path !== "long_term" || plan.plan.plan_basis !== "user_selected") return "plan_required";
  if (portfolio.holdings.length && (!portfolio.complete || portfolio.stale_count)) return "prices_required";
  return "available";
}
export function freshnessText(h: PortfolioHolding) {
  if (h.freshness === "unavailable" && h.manual_value_updated_at) return `Value needs updating · Last updated by you ${new Date(h.manual_value_updated_at).toLocaleDateString("en-PH", { dateStyle: "medium" })}`;
  if (h.valuation_source === "manual_user" && h.as_of) return `Updated by you ${new Date(h.as_of).toLocaleDateString("en-PH", { dateStyle: "medium" })}`;
  if (!h.as_of || h.freshness === "unavailable") return "Price temporarily unavailable";
  const date = new Date(h.as_of).toLocaleString("en-PH", { dateStyle: "medium", ...(h.price_kind === "nav" ? {} : { timeStyle: "short" as const }) });
  return `${h.freshness === "stale" ? "Cached · " : ""}${h.price_kind === "nav" ? "Latest NAV updated" : h.sleeve === "crypto" ? "Reference price updated" : "Latest available market price updated"}: ${date}`;
}
export function createPortfolioApi(token = getAccessToken, request: typeof fetch = fetch) {
  async function call(userId: string, path = "", method = "GET", body?: unknown, signal?: AbortSignal) {
    return boundedRequest(async active => {
      const accessToken = await token(userId); active.throwIfAborted();
      const response = await request(`${apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV)}/v2/portfolio${path}`, {
        method, signal: active, cache: "no-store", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }).catch(() => { throw new PortfolioError("portfolio_network"); });
      if (response.status === 401) throw new PortfolioError("portfolio_auth");
      if (response.status === 403) throw new PortfolioError("portfolio_entitlement");
      if (response.status === 404) throw new PortfolioError("portfolio_unavailable");
      if (response.status === 409) throw new Error("Review your records and refresh prices. For an existing investment, edit its recorded units instead of adding it again.");
      if ([400, 422].includes(response.status)) throw new Error("Check the supported investment, positive units and PHP amounts (up to 2 decimal places).");
      if (!response.ok) throw new PortfolioError("portfolio_server");
      return response.json().catch(() => { throw new PortfolioError("portfolio_contract"); });
    }, signal);
  }
  return {
    async read(userId: string, signal?: AbortSignal): Promise<LivePortfolioData> {
      try {
        const body: unknown = await call(userId, "", "GET", undefined, signal);
        if (!isPortfolio(body)) throw new PortfolioError("portfolio_contract");
        return body;
      } catch (error) { throw portfolioReadError(error); }
    },
    save: (userId: string, draft: HoldingDraft, id?: string) => call(userId, `/holdings${id ? `/${encodeURIComponent(id)}` : ""}`, id ? "PUT" : "POST", draft),
    remove: (userId: string, id: string) => call(userId, `/holdings/${encodeURIComponent(id)}`, "DELETE"),
    manualValue: (userId: string, id: string, value: string | null) => call(userId, `/holdings/${encodeURIComponent(id)}/manual-value`, "PUT", { manual_value_php: value }),
    async capture(userId: string, signal?: AbortSignal): Promise<{ recorded: boolean; history: PortfolioHistory[] }> {
      const body = await call(userId, "/snapshot", "POST", undefined, signal);
      if (!body || typeof body.recorded !== "boolean" || !isHistory(body.history)) throw new Error("Portfolio history is temporarily unavailable.");
      return body;
    },
    async scenario(userId: string, mode: ContributionMode, input: ContributionRequest, signal?: AbortSignal) {
      const body = await call(userId, `/scenarios/${mode}`, "POST", {
        contribution_amount: input.contribution_amount, route_id: input.context.route_id, bitcoin_provider: input.context.bitcoin_provider,
      }, signal);
      return parseContributionResponse(body, mode, input);
    },
  };
}
export const portfolioApi = createPortfolioApi();
