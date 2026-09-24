import { getAccessToken } from "./auth";
import { apiBaseUrl } from "./apiConfig";
import { boundedRequest } from "./dashboardConsistency";

export type AskUsage = { used: number; remaining: number; allowed: boolean; period: string };
export type Entitlements = {
  tier: "free" | "plus"; status: "trial" | "active" | "expired";
  effective_tier: "free" | "plus"; private_beta: boolean;
  features: string[]; ask_monthly_limit: number | null;
  ask_usage: AskUsage | null; ask_usage_available: boolean;
  availability?: { live_portfolio: boolean };
};
export const FREE_LIMIT_MESSAGE = "You’ve used your Free Ask Arbor questions for this month.";
export function isAskUsage(value: unknown): value is AskUsage {
  if (!value || typeof value !== "object") return false;
  const v = value as AskUsage;
  return Number.isInteger(v.used) && v.used >= 0 && v.used <= 10 && v.remaining === 10-v.used && typeof v.allowed === "boolean" && /^\d{4}-\d{2}-01$/.test(v.period);
}
export function isEntitlements(value: unknown): value is Entitlements {
  if (!value || typeof value !== "object") return false;
  const v = value as Entitlements;
  return ["free", "plus"].includes(v.tier) && ["trial", "active", "expired"].includes(v.status) &&
    ["free", "plus"].includes(v.effective_tier) && typeof v.private_beta === "boolean" &&
    Array.isArray(v.features) && v.features.every(f => typeof f === "string") &&
    (v.ask_monthly_limit === null || v.ask_monthly_limit === 10) &&
    (v.ask_usage === null || isAskUsage(v.ask_usage)) && typeof v.ask_usage_available === "boolean" &&
    (v.availability === undefined || (v.availability !== null && typeof v.availability.live_portfolio === "boolean"));
}
export function createEntitlementReader(token = getAccessToken, request: typeof fetch = fetch) {
  return (userId: string, signal: AbortSignal): Promise<Entitlements> => boundedRequest(async active => {
    const accessToken = await token(userId); active.throwIfAborted();
    const response = await request(`${apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV)}/account/entitlements`, {
      signal: active, cache: "no-store", headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) throw new Error("Your session has expired. Sign in again to continue.");
    if (!response.ok) throw new Error("We couldn’t check your Arbor access. Please retry.");
    const body: unknown = await response.json();
    if (!isEntitlements(body)) throw new Error("We couldn’t check your Arbor access. Please retry.");
    return body;
  }, signal);
}
export const readEntitlements = createEntitlementReader();
