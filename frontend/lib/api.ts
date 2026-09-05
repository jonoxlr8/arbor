import type { Plan } from "@/lib/types/plan";
import { supabase } from "@/lib/supabase";

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

export async function getMyProfile() {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/profiles/me`, {
    method: "GET",
    headers,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Get profile failed:", response.status, errorText);
    throw new Error(
      `Failed to get profile (${response.status}): ${errorText}`,
    );
  }

  return response.json();
}

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
