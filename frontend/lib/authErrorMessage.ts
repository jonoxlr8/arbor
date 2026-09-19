export function authErrorMessage(error: unknown): string {
  const details = error as { code?: string; message?: string } | null;
  if (details?.code === "email_not_confirmed") return "Please confirm your email before logging in. You can request another confirmation email below.";
  if (details?.code === "over_request_rate_limit") return "Too many requests. Please wait a little and try again.";
  if (details?.code === "unexpected_failure" || details?.message?.includes("Error sending confirmation email")) return "We couldn’t send the confirmation email. Please try again later.";
  if (details?.code === "over_email_send_rate_limit" ||
      details?.message?.toLowerCase().includes("email rate limit exceeded")) {
    return "Too many confirmation emails have been requested. Please wait a little and try again.";
  }
  return details?.message || "Something went wrong. Please try again.";
}
