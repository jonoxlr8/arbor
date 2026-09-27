import { getAccessToken } from "./auth";
import { apiBaseUrl } from "./apiConfig";
import { boundedRequest } from "./dashboardConsistency";

export type PendingRecording = { id: string; product_id: string; provider: string; source: "monthly";
  status: "pending" | "recorded" | "dismissed"; started_at: string; resolved_at: string | null };

function validItem(value: unknown): value is PendingRecording {
  if (!value || typeof value !== "object") return false;
  const item = value as PendingRecording;
  return /^[0-9a-f-]{36}$/i.test(item.id) && typeof item.product_id === "string" && typeof item.provider === "string" &&
    item.source === "monthly" && ["pending", "recorded", "dismissed"].includes(item.status) &&
    Number.isFinite(Date.parse(item.started_at)) && (item.resolved_at === null || Number.isFinite(Date.parse(item.resolved_at)));
}

export function createPendingApi(token = getAccessToken, request: typeof fetch = fetch) {
  async function call(userId: string, path: string, method: "GET" | "POST", body?: object, signal?: AbortSignal): Promise<unknown> {
    return boundedRequest(async active => {
      const credential = await token(userId); active.throwIfAborted();
      const response = await request(`${apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV)}/v2/pending-recordings${path}`, {
        method, signal: active, cache: "no-store",
        headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new Error(response.status === 409 ? "This unfinished recording changed. Reload and try again." :
        "We couldn’t update your unfinished recording. Please retry.");
      return response.json();
    }, signal);
  }
  return {
    async list(userId: string, signal?: AbortSignal): Promise<PendingRecording[]> {
      const result = await call(userId, "", "GET", undefined, signal) as { items?: unknown };
      if (!result || !Array.isArray(result.items) || result.items.length > 20 || !result.items.every(validItem) ||
          result.items.some(item => item.status !== "pending")) throw new Error("Unfinished recordings could not be verified. Please retry.");
      return result.items;
    },
    async start(userId: string, productId: string, provider: string): Promise<PendingRecording> {
      const result = await call(userId, "", "POST", { product_id: productId, provider });
      if (!validItem(result) || result.status !== "pending" || result.product_id !== productId || result.provider !== provider)
        throw new Error("Unfinished recording could not be verified. Please retry.");
      return result;
    },
    async resolve(userId: string, id: string, resolution: "recorded" | "dismissed"): Promise<PendingRecording> {
      const result = await call(userId, `/${encodeURIComponent(id)}/resolve`, "POST", { resolution });
      if (!validItem(result) || result.status !== resolution || result.id !== id)
        throw new Error("Unfinished recording could not be verified. Please retry.");
      return result;
    },
  };
}
export const pendingApi = createPendingApi();
export function pendingChanged() { if (typeof window !== "undefined") window.dispatchEvent(new Event("arbor-pending-changed")); }
