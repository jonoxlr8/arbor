import type { Plan } from "@/lib/types/plan";
import { getAccessToken } from "./auth";
import { InvalidSessionError, withDeadline } from "./accountRecovery";

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

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Create profile failed:", response.status, errorText);
    throw new Error(
      `Failed to create profile (${response.status}): ${errorText}`,
    );
  }

  return response.json();
}

export type ArborChatResponse = {
  reply: string;
};

export async function askArbor(
  message: string,
  plan: Plan,
): Promise<ArborChatResponse> {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({
      message,
      plan,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to get Arbor response");
  }

  return response.json();
}

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

export async function updateMyProfile(profile: {
  full_name: string;
  country: string;
  goal_target: number;
  investment_horizon: number;
  monthly_investment: number;
  current_portfolio_value: number;
  risk_tolerance: string;
  currency: string;
}) {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/profiles/me`, {
    method: "PUT",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(profile),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Update profile failed:", response.status, errorText);
    throw new Error(
      `Failed to update profile (${response.status}): ${errorText}`,
    );
  }

  return response.json();
}

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

export async function getMyPortfolioHealth(): Promise<ActualPortfolioHealthResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/holdings/health`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      "Get actual portfolio health failed:",
      response.status,
      errorText,
    );
    throw new Error(
      `Failed to get actual portfolio health (${response.status}): ${errorText}`,
    );
  }

  return response.json();
}
