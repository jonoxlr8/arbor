import type { AccountPlan } from "./types/planV2";
import { createLatestRequest, type RequestState } from "./dashboardConsistency";

export function chatPlanKey(plan: AccountPlan) {
  if ("strategy_engine_version" in plan && plan.strategy_engine_version === "2.0") return JSON.stringify(plan);
  if (!("portfolio" in plan)) return JSON.stringify(plan);
  return JSON.stringify([plan.profile, plan.portfolio, plan.projection]);
}

export function chatPrompts(v2: boolean) {
  return v2 ? ["Explain my investment plan", "Why does my plan include Global Equity?", "Explain my projection", "How does the contribution planner work?"]
    : ["Explain my Arbor plan", "What are my target allocations?", "What are my projection assumptions?", "Does my projection reach my goal?"];
}

export function chatErrorMessage(error: unknown) {
  return typeof error === "string" && ["Your session has expired. Sign in again to continue.", "Create your Arbor plan first, then return to Ask Arbor."].includes(error)
    ? error : "We couldn’t explain your plan right now. Please try again.";
}

/** One context per mounted chat. Disposing prevents late replies and errors. */
export function createChatSession(
  request: (message: string, signal: AbortSignal) => Promise<{ reply: string }>,
  onState: (state: RequestState<{ question: string; reply: string }>) => void,
  timeoutMs = 12000,
) {
  const latest = createLatestRequest(onState, timeoutMs);
  return {
    send: (question: string) => latest.run(async signal => ({ question, ...(await request(question, signal)) })),
    dispose: latest.dispose,
  };
}
