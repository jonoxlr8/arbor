import type { Plan } from "@/lib/types/plan";
import { getAccessToken } from "./auth";
import { InvalidSessionError, withDeadline } from "./accountRecovery";
import { boundedRequest } from "./dashboardConsistency";
import { FIELD_LABELS } from "./profileValidation";
import type { ProjectionInput, ProjectionResult } from "./projectionScenario";

const API_BASE_URL = "http://localhost:8000";

export type CreateProfileRequest = {
  full_name: string;
  country: string;
  goal_target: number;
  investment_horizon: number;
  risk_tolerance: string;
  currency: string;
  monthly_investment: number;
  current_portfolio_value: number;
};

async function checkedJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (response.ok) return body;
  if (response.status === 503) throw new Error("Your Arbor plan is temporarily unavailable. Please try again later.");
  if (typeof body === "object" && body !== null && "detail" in body && Array.isArray(body.detail)) {
    const messages = body.detail.map((item: { loc?: string[]; msg?: string }) => {
      const field = item.loc?.at(-1) ?? "Input";
      return `${FIELD_LABELS[field] ?? field}: ${item.msg ?? "invalid value"}`;
    });
    throw new Error(messages.join("\n"));
  }
  throw new Error(`Request failed (${response.status}). Please try again.`);
}

export function createProfileWriter(headers = getAuthHeaders, request: typeof fetch = fetch, timeoutMs = 12000) {
  return (profile: CreateProfileRequest, signal?: AbortSignal): Promise<Plan> =>
    boundedRequest(async activeSignal => {
      const authHeaders = await headers();
      activeSignal.throwIfAborted();
      const body = await checkedJson(await request(`${API_BASE_URL}/profiles/me`, {
        method: "PUT", headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(profile), signal: activeSignal,
      }));
      if (!isPlan(body)) throw new Error("The updated plan was incomplete. Please retry.");
      const projection = body.projection;
      if (Object.entries(profile).some(([field, value]) => body.profile[field as keyof typeof body.profile] !== value) ||
          projection.starting_value !== profile.current_portfolio_value ||
          projection.monthly_contribution !== profile.monthly_investment ||
          projection.investment_period_years !== profile.investment_horizon ||
          projection.required_monthly_investment < 0 ||
          projection.yearly_projection.length !== profile.investment_horizon + 1 ||
          !projection.yearly_projection.every((point, year) => point.year === year) ||
          projection.yearly_projection.at(-1)?.value !== projection.projected_value) {
        throw new Error("The updated plan did not match your saved profile. Please retry.");
      }
      return body;
    }, signal, timeoutMs);
}

export function createProjectionReader(request: typeof fetch = fetch, timeoutMs = 12000) {
  return (input: ProjectionInput, signal?: AbortSignal): Promise<ProjectionResult> =>
    boundedRequest(async activeSignal => {
      const body = await checkedJson(await request(`${API_BASE_URL}/projection`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input), signal: activeSignal,
      }));
      if (typeof body !== "object" || body === null ||
          !("projected_value" in body) || typeof body.projected_value !== "number" || !Number.isFinite(body.projected_value) ||
          !("yearly_projection" in body) || !Array.isArray(body.yearly_projection) ||
          body.yearly_projection.length !== input.years + 1 ||
          !body.yearly_projection.every((point, year) => point && point.year === year && typeof point.value === "number" && Number.isFinite(point.value))) {
        throw new Error("The projection response was incomplete. Please retry.");
      }
      return body as ProjectionResult;
    }, signal, timeoutMs);
}
export const getProjection = createProjectionReader();

async function getAuthHeaders(): Promise<HeadersInit> {
  const { supabase } = await import("./supabase");
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("You must be signed in.");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function createProfile(
  data: CreateProfileRequest,
): Promise<Plan> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/profiles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(data),
  });

  const body = await checkedJson(response);
  if (!isPlan(body)) throw new Error("The new plan was incomplete. Please retry.");
  return body;
}

export type ArborChatResponse = {
  reply: string;
};

export function createChatReader(headers = getAuthHeaders, request: typeof fetch = fetch, timeoutMs = 12000) {
  return (message: string, signal?: AbortSignal): Promise<ArborChatResponse> => boundedRequest(async activeSignal => {
    if (!message.trim() || message.length > 1000) throw new Error("Please enter a question of at most 1,000 characters.");
    const authHeaders = await headers();
    activeSignal.throwIfAborted();
    const response = await request(`${API_BASE_URL}/chat`, {
      method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ message }), signal: activeSignal,
    });
    if (!response.ok) throw new Error("We couldn’t explain your plan right now. Please retry.");
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("reply" in body) || typeof body.reply !== "string" || !body.reply.trim() || body.reply.length > 12000) {
      throw new Error("The explanation was incomplete. Please retry.");
    }
    return { reply: body.reply };
  }, signal, timeoutMs);
}
export const askArbor = createChatReader();

export class ProfileApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Validate the dashboard contract before treating a successful response as a plan.
export function isPlan(value: unknown): value is Plan {
  const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
  const number = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const strings = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === "string");
  if (!object(value) || !object(value.profile) || !object(value.projection) || !object(value.explanation)) return false;
  const p = value.profile, projection = value.projection;
  if (!["full_name", "country", "currency", "risk_tolerance"].every(k => typeof p[k] === "string") ||
      !["goal_target", "investment_horizon", "monthly_investment", "current_portfolio_value"].every(k => number(p[k]))) return false;
  if (!Array.isArray(value.portfolio) || !value.portfolio.every(h => object(h) && typeof h.ticker === "string" && typeof h.asset_name === "string" && number(h.allocation))) return false;
  if (!["starting_value", "projected_value", "investment_period_years", "assumed_return", "monthly_contribution", "required_monthly_investment"].every(k => number(projection[k])) ||
      !Array.isArray(projection.yearly_projection) || !projection.yearly_projection.every(y => object(y) && number(y.year) && number(y.value))) return false;
  if (typeof value.explanation.summary !== "string" || !strings(value.explanation.reasons)) return false;
  if (value.health !== undefined) {
    const h = value.health;
    if (!object(h) || !number(h.score) || !strings(h.strengths) || !strings(h.warnings) || !object(h.breakdown)) return false;
    const breakdown = h.breakdown;
    if (!["diversification", "risk_alignment", "growth_potential", "crypto_exposure", "concentration"].every(k => number(breakdown[k]))) return false;
  }
  return true;
}

export function createProfileReader(
  token = getAccessToken,
  request: typeof fetch = fetch,
  timeoutMs = 12000,
) {
  return async (userId: string, knownAccessToken?: string): Promise<Plan | null> => {
    const controller = new AbortController();
    try {
      return await withDeadline((async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          // Use the exact sign-in/event token for the first request. Only a 401
          // replaces it via the existing single refresh; startup still uses storage.
          const accessToken = attempt === 0 && knownAccessToken
            ? knownAccessToken
            : await token(userId, attempt === 1);
          controller.signal.throwIfAborted();
          const response = await request(`${API_BASE_URL}/profiles/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
          });
          if (response.status === 401) {
            if (attempt === 0) continue;
            throw new InvalidSessionError("Your session has ended. Please sign in again.");
          }
          let body: unknown;
          try {
            body = await response.json();
          } catch {
            throw new ProfileApiError(response.status, `Profile request returned an unreadable response (${response.status}).`);
          }
          if (response.status === 404 && typeof body === "object" && body !== null &&
              "detail" in body && body.detail === "Profile not found") return null;
          if (!response.ok) throw new ProfileApiError(response.status, `Profile request failed (${response.status}).`);
          if (!isPlan(body)) throw new Error("The profile response was incomplete. Please retry.");
          return body;
        }
        throw new InvalidSessionError();
      })(), timeoutMs);
    } finally {
      controller.abort();
    }
  };
}

export const getMyProfile = createProfileReader();

export const updateMyProfile = createProfileWriter();

export type Holding = {
  id: number;
  created_at: string;
  ticker: string;
  asset_name: string;
  asset_type: string;
  quantity: number;
  average_cost: number;
  currency: string;
};

export async function getMyHoldings(): Promise<Holding[]> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/holdings`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Get holdings failed:", response.status, errorText);
    throw new Error(
      `Failed to get holdings (${response.status}): ${errorText}`,
    );
  }

  const data = await response.json();

  return data.holdings;
}

export async function createHolding(holding: {
  ticker: string;
  asset_name: string;
  asset_type: string;
  quantity: number;
  average_cost: number;
  currency: string;
}): Promise<Holding> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/holdings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(holding),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Create holding failed:", response.status, errorText);
    throw new Error(
      `Failed to create holding (${response.status}): ${errorText}`,
    );
  }

  const data = await response.json();

  return data.holding;
}

export async function updateHolding(
  holdingId: number,
  holding: {
    ticker: string;
    asset_name: string;
    asset_type: string;
    quantity: number;
    average_cost: number;
    currency: string;
  },
): Promise<Holding> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/holdings/${holdingId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(holding),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Update holding failed:", response.status, errorText);
    throw new Error(
      `Failed to update holding (${response.status}): ${errorText}`,
    );
  }

  const data = await response.json();

  return data.holding;
}

export async function deleteHolding(holdingId: number): Promise<void> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/holdings/${holdingId}`, {
    method: "DELETE",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Delete holding failed:", response.status, errorText);
    throw new Error(
      `Failed to delete holding (${response.status}): ${errorText}`,
    );
  }
}

export type ActualPortfolioHealthResponse = {
  basis: "cost_basis";
  currency: string | null;
  available: boolean;
  reason?: string;
  health: Plan["health"] | null;
};

export function createHealthReader(headers = getAuthHeaders, request: typeof fetch = fetch, timeoutMs = 12000) {
  return (signal?: AbortSignal): Promise<ActualPortfolioHealthResponse> =>
    boundedRequest(async activeSignal => {
      const authHeaders = await headers();
      activeSignal.throwIfAborted();
      const body = await checkedJson(await request(`${API_BASE_URL}/holdings/health`, {
        method: "GET", headers: authHeaders, signal: activeSignal,
      }));
      if (!body || typeof body !== "object" || !("available" in body) || typeof body.available !== "boolean" ||
          !("health" in body) || !("basis" in body) || body.basis !== "cost_basis") {
        throw new Error("The health response was incomplete. Please retry.");
      }
      if (body.available) {
        const health = body.health as Plan["health"];
        const scores = health?.breakdown;
        if (!health || typeof health.score !== "number" || !Number.isFinite(health.score) ||
            !Array.isArray(health.strengths) || !health.strengths.every(s => typeof s === "string") ||
            !Array.isArray(health.warnings) || !health.warnings.every(s => typeof s === "string") ||
            !scores || !["diversification", "risk_alignment", "growth_potential", "crypto_exposure", "concentration"]
              .every(key => typeof scores[key as keyof typeof scores] === "number" && Number.isFinite(scores[key as keyof typeof scores]))) {
          throw new Error("The health response was incomplete. Please retry.");
        }
      } else if (body.health !== null || !("reason" in body) || typeof body.reason !== "string") {
        throw new Error("The health response was incomplete. Please retry.");
      }
      return body as ActualPortfolioHealthResponse;
    }, signal, timeoutMs);
}
export const getMyPortfolioHealth = createHealthReader();
