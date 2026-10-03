import type { ArborChatResponse } from "./api";
import type { AccountPlan } from "./types/planV2";
import { FREE_LIMIT_MESSAGE } from "./entitlements";
import { createLatestRequest, type RequestState } from "./dashboardConsistency";

export function chatPlanKey(plan: AccountPlan) {
  if ("strategy_engine_version" in plan && plan.strategy_engine_version === "2.0") return JSON.stringify(plan);
  if (!("portfolio" in plan)) return JSON.stringify(plan);
  return JSON.stringify([plan.profile, plan.portfolio, plan.projection]);
}

export function chatPrompts(v2: boolean, livePortfolio = false) {
  return v2 ? [...(livePortfolio ? ["What is my portfolio worth?", "How does my portfolio compare with my plan?"] : ["Explain my investment plan"]), "What does recorded cost mean?", "What's the difference between an ETF and a UITF?", "What should I do next?"]
    : ["Explain my Arbor plan", "What is an ETF?", "What is a UITF?", "What does recorded cost mean?"];
}

export function chatErrorMessage(error: unknown) {
  return typeof error === "string" && [FREE_LIMIT_MESSAGE, "Your session has expired. Sign in again to continue.", "Create your Arbor plan first, then return to Ask Arbor."].includes(error)
    ? error : "We couldn’t explain your plan right now. Please try again.";
}

/** One context per mounted chat. Disposing prevents late replies and errors. */
export function createChatSession(
  request: (message: string, signal: AbortSignal) => Promise<ArborChatResponse>,
  onState: (state: RequestState<ArborChatResponse & { question: string }>) => void,
  timeoutMs = 12000,
) {
  const latest = createLatestRequest(onState, timeoutMs);
  return {
    send: (question: string) => latest.run(async signal => ({ question, ...(await request(question, signal)) })),
    dispose: latest.dispose,
  };
}
