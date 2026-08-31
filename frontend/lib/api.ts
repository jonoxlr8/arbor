import type { Plan } from "@/lib/types/plan";

const API_URL = "http://localhost:8000";

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

export async function createProfile(
  data: CreateProfileRequest,
): Promise<Plan> {
  const response = await fetch(`${API_URL}/profiles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to create profile");
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
  const response = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
