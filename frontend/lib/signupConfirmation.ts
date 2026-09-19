// The fragment is never sent to Arbor's server. Keep its contents in memory only.
export function signupConfirmationUrl(fragment: string, supabaseUrl: string, returnUrl: string): string | null {
  const prefix = "#confirmation_url=";
  if (!fragment.startsWith(prefix) || fragment.length > 4096) return null;
  try {
    const raw = fragment.slice(prefix.length);
    const url = new URL(raw);
    const project = new URL(supabaseUrl);
    if (url.origin !== project.origin || url.protocol !== "https:" || url.username || url.password ||
        url.pathname !== `${project.pathname.replace(/\/$/, "")}/auth/v1/verify` || url.hash) return null;
    const params = url.searchParams;
    if ([...params.keys()].some(key => !["token", "type", "redirect_to"].includes(key)) ||
        [...params.keys()].some(key => params.getAll(key).length !== 1)) return null;
    if (!/^[a-zA-Z0-9_-]{20,512}$/.test(params.get("token") ?? "") ||
        !["signup", "email"].includes(params.get("type") ?? "")) return null;
    if (params.has("redirect_to") && params.get("redirect_to") !== returnUrl) return null;
    // Pin the post-verification destination to the existing validated site config.
    params.set("redirect_to", returnUrl);
    return url.toString();
  } catch { return null; }
}
