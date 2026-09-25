import type { AccountPlan } from "./types/planV2";
import { FREE_LIMIT_MESSAGE, type AskUsage } from "./entitlements";
import { createLatestRequest, type RequestState } from "./dashboardConsistency";

export function chatPlanKey(plan: AccountPlan) {
  if ("strategy_engine_version" in plan && plan.strategy_engine_version === "2.0") return JSON.stringify(plan);
  if (!("portfolio" in plan)) return JSON.stringify(plan);
  return JSON.stringify([plan.profile, plan.portfolio, plan.projection]);
}

export function chatPrompts(v2: boolean, livePortfolio = false) {
  return v2 ? ["Explain my investment plan", ...(livePortfolio ? ["What is my current portfolio worth?", "How does my portfolio compare with my targets?"] : ["Why does my plan include Global Equity?", "How does the contribution planner work?"]), "What should I do next?"]
    : ["Explain my Arbor plan", "What are my target allocations?", "What are my projection assumptions?", "Does my projection reach my goal?"];
}

export function chatErrorMessage(error: unknown) {
  return typeof error === "string" && [FREE_LIMIT_MESSAGE, "Your session has expired. Sign in again to continue.", "Create your Arbor plan first, then return to Ask Arbor."].includes(error)
    ? error : "We couldn’t explain your plan right now. Please try again.";
}

/** One context per mounted chat. Disposing prevents late replies and errors. */
export function createChatSession(
  request: (message: string, signal: AbortSignal) => Promise<{ reply: string; ask_usage?: AskUsage }>,
  onState: (state: RequestState<{ question: string; reply: string; ask_usage?: AskUsage }>) => void,
  timeoutMs = 12000,
) {
  const latest = createLatestRequest(onState, timeoutMs);
  return {
    send: (question: string) => latest.run(async signal => ({ question, ...(await request(question, signal)) })),
    dispose: latest.dispose,
  };
}
