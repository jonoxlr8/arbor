import { getAccessToken } from "./auth";
import { apiBaseUrl } from "./apiConfig";
import { boundedRequest } from "./dashboardConsistency";

export type InvestmentRequestDraft = { investment_name: string; provider: string; idempotency_key: string };
export type InvestmentRequestReceipt = { id: string; investment_name: string; provider: string; received_at: string; status: "received" | "already_received" };
export const requestText = (value: string) => value.trim().replace(/\s+/g, " ");
export const validRequestText = (value: string, maximum: number) => {
  const text = requestText(value);
  return text.length > 0 && text.length <= maximum && !/[\u0000-\u001f\u007f]/.test(text);
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createInvestmentRequestApi(token = getAccessToken, request: typeof fetch = fetch) {
  return async (userId: string, draft: InvestmentRequestDraft): Promise<InvestmentRequestReceipt> => {
    if (!validRequestText(draft.investment_name, 120) || !validRequestText(draft.provider, 80) || !uuid.test(draft.idempotency_key))
      throw new Error("Enter the investment name and provider.");
    const body = { ...draft, investment_name: requestText(draft.investment_name), provider: requestText(draft.provider) };
    return boundedRequest(async signal => {
      const credential = await token(userId); signal.throwIfAborted();
      const response = await request(`${apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV)}/v2/investment-requests`, {
        method: "POST", cache: "no-store", signal,
        headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(response.status === 429 ? "You’ve sent several requests today. Please try again tomorrow." :
        response.status === 401 || response.status === 403 ? "Sign in to an active account to send a request." :
        response.status === 409 ? "This request changed. Review the names and send it again." :
        "We couldn’t confirm your request. Retry to check; it won’t be counted twice.");
      const result = await response.json() as InvestmentRequestReceipt;
      if (!result || !uuid.test(result.id) || !["received", "already_received"].includes(result.status) ||
          typeof result.investment_name !== "string" || typeof result.provider !== "string" ||
          result.investment_name.toLowerCase() !== body.investment_name.toLowerCase() || result.provider.toLowerCase() !== body.provider.toLowerCase() ||
          typeof result.received_at !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/.test(result.received_at) || !Number.isFinite(Date.parse(result.received_at)))
        throw new Error("We couldn’t confirm your request. Retry to check; it won’t be counted twice.");
      return result;
    });
  };
}
export const submitInvestmentRequest = createInvestmentRequestApi();
