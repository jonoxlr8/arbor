import type { Plan } from "./types/plan";

export function healthDependency(plan: Plan) {
  return plan.profile.risk_level || plan.profile.risk_tolerance;
}
export function scenarioKey(plan: Plan) {
  // Explicit fields make identity independent of JSON property order or metadata.
  const projection = plan.projection;
  return JSON.stringify([
    plan.profile.current_portfolio_value, plan.profile.monthly_investment,
    plan.profile.investment_horizon, plan.profile.goal_target, plan.profile.currency,
    projection.starting_value, projection.monthly_contribution,
    projection.investment_period_years, projection.assumed_return,
    projection.required_monthly_investment, projection.projected_value,
    projection.yearly_projection?.map(point => [point.year, point.value]),
  ]);
}
export type RequestState<T> =
  | { status: "loading"; data: null }
  | { status: "ready"; data: T }
  | { status: "error"; data: null; error: string };

export async function boundedRequest<T>(
  work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, timeoutMs = 12000,
): Promise<T> {
  const controller = new AbortController();
  const relay = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", relay, { once: true });
  if (signal?.aborted) relay();
  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(controller.signal.reason);
  controller.signal.addEventListener("abort", onAbort, { once: true });
  if (controller.signal.aborted) onAbort();
  const timer = setTimeout(() => controller.abort(new Error("Request timed out. Please try again.")), timeoutMs);
  try {
    return await Promise.race([Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return work(controller.signal);
    }), aborted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relay);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

// Shared by scenario, health and profile-save requests. Abort alone isn't enough:
// mocks, response parsing, and some transports may still finish after cancellation.
export function createLatestRequest<T>(onState: (state: RequestState<T>) => void, timeoutMs = 12000) {
  let generation = 0;
  let controller: AbortController | undefined;
  function invalidate() {
    generation++;
    controller?.abort();
  }
  return {
    invalidate,
    dispose: invalidate,
    guard() {
      const attempt = generation;
      return () => attempt === generation;
    },
    async run(work: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
      invalidate();
      const attempt = generation;
      const current = new AbortController();
      controller = current;
      onState({ status: "loading", data: null });
      try {
        const data = await boundedRequest(work, current.signal, timeoutMs);
        if (attempt !== generation) return;
        onState({ status: "ready", data });
        return data;
      } catch (error) {
        if (attempt === generation) {
          onState({ status: "error", data: null, error: error instanceof Error ? error.message : "Unable to load this result. Please retry." });
        }
      }
    },
  };
}
