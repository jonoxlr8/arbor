import type { Plan, YearlyProjection } from "./types/plan";
import { createLatestRequest, scenarioKey, type RequestState } from "./dashboardConsistency";
import { MAX_MONEY, numericError } from "./profileValidation";

export type ProjectionInput = { current_value: number; monthly_investment: number; years: number; annual_return: number };
export type ProjectionResult = { projected_value: number; yearly_projection: YearlyProjection[] };
export function scenarioControls(plan: Plan) {
  const required = Math.ceil(plan.projection.required_monthly_investment);
  const current = plan.profile.monthly_investment;
  const presets = [
    { label: "Current", value: current }, { label: "2× Current", value: current * 2 },
    { label: "3× Current", value: current * 3 }, { label: "Goal Target", value: required },
  ].map(option => ({ ...option, disabled: option.value > MAX_MONEY }));
  const max = Math.min(MAX_MONEY, Math.max(5000, ...presets.filter(p => !p.disabled).map(p => p.value)));
  return { required, min: 0, max, presets };
}
export function createProjectionScenario(
  initial: Plan,
  request: (input: ProjectionInput, signal: AbortSignal) => Promise<ProjectionResult>,
  onState: (state: RequestState<ProjectionResult>) => void,
  timeoutMs = 12000,
) {
  let plan = initial;
  let key = scenarioKey(plan);
  const latest = createLatestRequest(onState, timeoutMs);
  function baseline() {
    latest.invalidate();
    onState({ status: "ready", data: plan.projection });
  }
  return {
    select(amount: number) {
      latest.invalidate();
      const error = numericError("monthly_investment", amount);
      if (error) {
        onState({ status: "error", data: null, error });
        return Promise.resolve();
      }
      if (amount === plan.profile.monthly_investment) {
        baseline();
        return Promise.resolve();
      }
      const input = {
        current_value: plan.profile.current_portfolio_value, monthly_investment: amount,
        years: plan.profile.investment_horizon, annual_return: plan.projection.assumed_return,
      };
      return latest.run(signal => request(input, signal));
    },
    updatePlan(next: Plan) {
      if (scenarioKey(next) === key) return false;
      plan = next;
      key = scenarioKey(next);
      baseline();
      return true;
    },
    dispose: latest.dispose,
  };
}
