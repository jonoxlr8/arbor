import { getAccessToken } from "./auth";
import { apiBaseUrl } from "./apiConfig";
import { boundedRequest } from "./dashboardConsistency";
import type { Sleeve, ContributionMode, ContributionRequest } from "./types/contributions";
import { parseContributionResponse } from "./contributionApi";
import type { PlanV2 } from "./types/planV2";

export type PortfolioProduct = { product_id: string; provider: string; provider_name: string; display_name: string; sleeve: Sleeve; price_kind: "nav" | "reference" };
export type HoldingDraft = { provider: string; product_id: string; units: string; cost_basis_php: string | null };
export type PortfolioHolding = PortfolioProduct & HoldingDraft & { id: string; value_php: string | null; freshness: "fresh" | "stale" | "unavailable"; as_of: string | null; updated_at: string };
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
  if (sources !== undefined && (!Array.isArray(sources) || !sources.every(s => ["marketstack", "coinranking", "exchangerate_api"].includes(s)))) return false;
  const p = value as LivePortfolioData;
  return p.currency === "PHP" && money(p.known_value_php) && (p.total_value_php === null || money(p.total_value_php)) &&
    typeof p.complete === "boolean" && Number.isInteger(p.unavailable_count) && p.unavailable_count >= 0 && Number.isInteger(p.stale_count) && p.stale_count >= 0 && timestamp(p.valued_at) &&
    !!p.provider_values_php && typeof p.provider_values_php === "object" && Object.values(p.provider_values_php).every(money) &&
    Array.isArray(p.catalog) && p.catalog.every(h => h && typeof h.product_id === "string" && typeof h.provider === "string" && typeof h.provider_name === "string" && typeof h.display_name === "string" && roles.includes(h.sleeve)) &&
    Array.isArray(p.holdings) && p.holdings.every(h => h && typeof h.id === "string" && decimal(h.units) && roles.includes(h.sleeve) && typeof h.display_name === "string" && typeof h.provider_name === "string" &&
      p.catalog.some(c => c.product_id === h.product_id && c.provider === h.provider) && ["fresh", "stale", "unavailable"].includes(h.freshness) &&
      (h.freshness === "unavailable" ? h.value_php === null : money(h.value_php) && timestamp(h.as_of))) &&
    p.unavailable_count === p.holdings.filter(h => h.value_php === null).length && p.complete === (p.unavailable_count === 0) &&
    p.stale_count === p.holdings.filter(h => h.freshness === "stale").length &&
    isHistory(p.history) &&
    Array.isArray(p.sleeves) && p.sleeves.length === 4 && p.sleeves.every(Boolean) && new Set(p.sleeves.map(s => s.sleeve)).size === 4 &&
    p.sleeves.every(s => s && roles.includes(s.sleeve) && money(s.known_value_php) && (s.current_percentage === null || decimal(s.current_percentage)) &&
      (s.difference_pp === null || decimal(s.difference_pp)) && (s.target_percentage === null || (Number.isInteger(s.target_percentage) && s.target_percentage >= 0 && s.target_percentage <= 100)));
}
export function validHolding(draft: HoldingDraft, catalog: PortfolioProduct[]) {
  return catalog.some(p => p.product_id === draft.product_id && p.provider === draft.provider) &&
    /^\d{1,12}(?:\.\d{1,12})?$/.test(draft.units) && /[1-9]/.test(draft.units) &&
    (draft.cost_basis_php === null || /^\d{1,16}(?:\.\d{1,2})?$/.test(draft.cost_basis_php));
}
export const portfolioValues = (p: LivePortfolioData) => Object.fromEntries(p.sleeves.map(s => [s.sleeve, s.known_value_php])) as Record<Sleeve, string>;
export function scenarioAvailability(plan: PlanV2, portfolio: LivePortfolioData) {
  if (plan.plan.path !== "long_term" || plan.plan.plan_basis !== "user_selected") return "plan_required";
  if (portfolio.holdings.length && (!portfolio.complete || portfolio.stale_count)) return "prices_required";
  return "available";
}
export function freshnessText(h: PortfolioHolding) {
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
      });
      if (response.status === 401) throw new Error("Your session has expired. Sign in again to continue.");
      if (response.status === 403) throw new Error("Live Portfolio is part of Arbor Plus. Explore plans in Settings.");
      if (response.status === 409) throw new Error("Review your records and refresh prices. For an existing investment, edit its recorded units instead of adding it again.");
      if ([400, 422].includes(response.status)) throw new Error("Check the supported investment, units and optional PHP cost basis.");
      if (!response.ok) throw new Error("Portfolio records are temporarily unavailable. Please retry.");
      return response.json();
    }, signal);
  }
  return {
    async read(userId: string, signal?: AbortSignal): Promise<LivePortfolioData> {
      const body: unknown = await call(userId, "", "GET", undefined, signal);
      if (!isPortfolio(body)) throw new Error("Your portfolio response is incomplete. Please retry.");
      return body;
    },
    save: (userId: string, draft: HoldingDraft, id?: string) => call(userId, `/holdings${id ? `/${encodeURIComponent(id)}` : ""}`, id ? "PUT" : "POST", draft),
    remove: (userId: string, id: string) => call(userId, `/holdings/${encodeURIComponent(id)}`, "DELETE"),
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
