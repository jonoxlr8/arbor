import { apiBaseUrl } from "./apiConfig";

export function confirmationRedirect(value: string | undefined, environment = "development") {
  const local = environment === "development" || environment === "test";
  if (!value?.trim() && !local) throw new Error("NEXT_PUBLIC_SITE_URL is required in production.");
  let normalized: string;
  try { normalized = apiBaseUrl(value?.trim() || "http://localhost:3000", environment); }
  catch { throw new Error("NEXT_PUBLIC_SITE_URL must be a valid site origin; production requires non-local HTTPS."); }
  if (new URL(normalized).pathname !== "/") throw new Error("NEXT_PUBLIC_SITE_URL must be an origin without a path.");
  return `${normalized}/`;
}

// Public build-time configuration, never an arbitrary redirect supplied by a visitor.
export const emailRedirectTo = confirmationRedirect(process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV);
