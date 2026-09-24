export const destinations = [
  { id: "home", label: "Home", mobileLabel: "Home", description: "Your long-term picture, at a glance." },
  { id: "portfolio", label: "Portfolio", mobileLabel: "Portfolio", description: "Your recorded holdings, and how they compare with your Arbor targets." },
  { id: "ask", label: "Ask Arbor", mobileLabel: "Ask Arbor", description: "Understand your plan, one question at a time." },
  { id: "settings", label: "Settings", mobileLabel: "Settings", description: "Your profile, preferences and Arbor access." },
] as const;
export type Destination = typeof destinations[number]["id"];

export function destinationFromHash(hash: string): Destination {
  const candidate = hash.replace(/^#/, "").split("/")[0];
  if (candidate === "plan") return "portfolio"; // Preserve old bookmarks.
  return destinations.some(item => item.id === candidate)
    ? candidate as Destination : "home";
}

// Hash navigation deliberately keeps the authenticated owner and its requests alive.
// No session values or financial information are placed in the URL.
export function subscribeNavigation(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
export function navigationSnapshot() { return destinationFromHash(window.location.hash); }
export function serverNavigationSnapshot(): Destination { return "home"; }
export function sectionSnapshot() { return window.location.hash === "#plan" ? "plan" : window.location.hash.split("/")[1] ?? ""; }
