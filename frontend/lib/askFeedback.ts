import { apiBaseUrl } from "./apiConfig";
import { boundedRequest } from "./dashboardConsistency";
import { isFeedbackContext, isFeedbackReason, object, type FeedbackContext, type FeedbackReason } from "./askPresentation";
const base = apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL,process.env.NODE_ENV);
export type FeedbackVote = FeedbackContext & { helpful: boolean; reason: FeedbackReason | null };
const tokenHeaders = async (): Promise<HeadersInit> => {
  const { supabase } = await import("./supabase");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in again to send feedback.");
  return { Authorization: `Bearer ${session.access_token}` };
};
export function createAskFeedbackClient(headers = tokenHeaders, request: typeof fetch = fetch, timeoutMs = 12000) {
  const call = (path: string, method: string, body?: FeedbackVote, signal?: AbortSignal) => boundedRequest(async active => {
    const auth = await headers(); active.throwIfAborted();
    const response = await request(`${base}/ask/feedback/${path}`,{method,headers:{...auth,"Content-Type":"application/json"},...(body ? {body:JSON.stringify({helpful:body.helpful,reason:body.reason,intent:body.intent,answer_version:body.answer_version})}:{}),signal:active,cache:"no-store"});
    if (!response.ok) throw new Error("Feedback could not be saved. Your Ask answer stays available.");
    return response.json() as Promise<unknown>;
  },signal,timeoutMs);
  return {
    access: async (signal?: AbortSignal) => {
      const body = await call("access","GET",undefined,signal);
      if (!object(body) || Object.keys(body).length !== 1 || typeof body.available !== "boolean") throw new Error("Feedback is unavailable.");
      return body.available;
    },
    save: async (id: string, vote: FeedbackVote, signal?: AbortSignal) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || typeof vote.helpful !== "boolean" || (vote.reason !== null && !isFeedbackReason(vote.reason)) || !isFeedbackContext({intent:vote.intent,answer_version:vote.answer_version})) throw new Error("Feedback is unavailable.");
      const body = await call(id,"PUT",vote,signal);
      if (!object(body) || Object.keys(body).length !== 3 || body.saved !== true || body.helpful !== vote.helpful || body.reason !== vote.reason) throw new Error("Feedback could not be confirmed. Please retry.");
      return {helpful:vote.helpful,reason:vote.reason};
    },
  };
}
export const askFeedback = createAskFeedbackClient();
