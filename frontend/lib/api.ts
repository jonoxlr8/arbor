const API_URL = "http://localhost:8000";

export async function createProfile(data: any) {
  const response = await fetch(
    `${API_URL}/profiles`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to create profile");
  }

  return response.json();
}

export async function askArbor(message: string, plan: any) {
  const response = await fetch("http://localhost:8000/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
  message,
  plan,
})
  });

  return response.json();
}