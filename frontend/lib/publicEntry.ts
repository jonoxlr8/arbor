export type EntryScreen = "landing" | "country" | "other-country" | "signup" | "login";

// The country is encoded in the signup destination so refresh/back preserves it.
// This is an entry preference, never an authentication or server eligibility check.
export const entryLinks = {
  landing: "#welcome", country: "#country", "other-country": "#other-country",
  signup: "#signup-ph", login: "#login",
} as const;
export function entryFromHash(hash: string): EntryScreen {
  return (Object.keys(entryLinks) as EntryScreen[]).find(screen => entryLinks[screen] === hash) ?? "landing";
}
export function entrySnapshot() { return entryFromHash(window.location.hash); }
export function serverEntrySnapshot(): EntryScreen { return "landing"; }
