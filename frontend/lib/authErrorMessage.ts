export function authErrorMessage(error: unknown): string {
  const details = error as { code?: string; message?: string } | null;
  if (details?.code === "over_email_send_rate_limit" ||
      details?.message?.toLowerCase().includes("email rate limit exceeded")) {
    return "Too many confirmation emails have been requested. Please wait a little and try again.";
  }
  return details?.message || "Something went wrong. Please try again.";
}
