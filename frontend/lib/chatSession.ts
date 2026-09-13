import type { Plan } from "./types/plan";
import { createLatestRequest, type RequestState } from "./dashboardConsistency";

export function chatPlanKey(plan: Plan) {
  return JSON.stringify([plan.profile, plan.portfolio, plan.projection]);
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
