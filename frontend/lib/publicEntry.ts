export type EntryScreen = "landing" | "signup" | "login";

// Public navigation survives refresh; country belongs to onboarding.
export const entryLinks = {
  landing: "#welcome", signup: "#signup", login: "#login",
} as const;
export function entryFromHash(hash: string): EntryScreen {
  if (confirmationLinkFailed(hash)) return "login";
  return (Object.keys(entryLinks) as EntryScreen[]).find(screen => entryLinks[screen] === hash) ?? "landing";
}
export function confirmationLinkFailed(hash: string): boolean {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.has("error") || params.has("error_code");
}
export function confirmationFailureSnapshot() { return confirmationLinkFailed(window.location.hash); }
export function entrySnapshot() { return entryFromHash(window.location.hash); }
export function serverEntrySnapshot(): EntryScreen { return "landing"; }
