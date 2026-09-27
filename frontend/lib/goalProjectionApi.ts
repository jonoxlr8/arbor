import { getAccessToken } from "./auth";
import { apiBaseUrl } from "./apiConfig";
import { isPlanV2 } from "./planV2";
import type { PlanV2 } from "./types/planV2";

const base = () => apiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV);
async function call(userId: string, path: string, body: unknown, method: "PUT" | "POST") {
  const token = await getAccessToken(userId);
  const response = await fetch(`${base()}${path}`, { method, cache: "no-store", headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"}, body: JSON.stringify(body) });
  if (response.status === 409) throw new Error("Your saved plan or portfolio changed. Reload and try again.");
  if (response.status === 403) throw new Error("This planning tool is available with Arbor Plus.");
  if (!response.ok) throw new Error("We couldn’t complete this request. Please retry.");
  return response.json() as Promise<unknown>;
}
export async function saveGoal(userId: string, goal: {goal_target: number; goal_name: string | null; goal_date: string | null; expected_revision: string}): Promise<PlanV2> {
  const result = await call(userId, "/v2/goal", goal, "PUT");
  if (!isPlanV2(result)) throw new Error("The saved goal response was incomplete.");
  return result;
}
export type FutureProjection = { starting_value_php: string; monthly_contribution_php: string; annual_planning_rate_pct: string; inflation_planning_rate_pct: string; whole_months: number; target_date: string; projected_value_php: string; goal_target_php?: string; difference_to_goal_php?: string; illustrative: true };
export async function futureProjection(userId: string, scenario: {monthly_contribution_php?: number; target_date?: string} = {}): Promise<FutureProjection> {
  const result = await call(userId, "/v2/future-projection", scenario, "POST");
  if (!result || typeof result !== "object") throw new Error("The projection response was incomplete.");
  const p = result as Record<string, unknown>;
  if (!["starting_value_php", "monthly_contribution_php", "annual_planning_rate_pct", "inflation_planning_rate_pct", "target_date", "projected_value_php"].every(key => typeof p[key] === "string") ||
      typeof p.whole_months !== "number" || !Number.isInteger(p.whole_months) || p.whole_months < 1 || p.illustrative !== true) throw new Error("The projection response was incomplete.");
  return result as FutureProjection;
}
