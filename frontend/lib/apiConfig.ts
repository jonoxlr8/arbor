export function apiBaseUrl(value: string | undefined, environment = "development"): string {
  const configured = value?.trim();
  if (!configured) {
    if (environment === "development" || environment === "test") return "http://localhost:8000";
    throw new Error("NEXT_PUBLIC_API_BASE_URL is required in production.");
  }
  let url: URL;
  if (/[\\\s*?#]/.test(configured)) throw new Error("NEXT_PUBLIC_API_BASE_URL contains unsupported characters.");
  try { url = new URL(configured); }
  catch { throw new Error("NEXT_PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment.");
  }
  const host = url.hostname;
  if (!host.startsWith("[") && (host.length > 253 || !host.replace(/\.$/, "").split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must contain a valid hostname.");
  }
  if (environment !== "development" && environment !== "test" &&
      (url.protocol !== "https:" || host === "localhost" || host.endsWith(".localhost") || host.startsWith("127.") || host === "[::1]")) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must use a non-local HTTPS address in production.");
  }
  return url.toString().replace(/\/+$/, "");
}
