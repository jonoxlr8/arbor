export const destinations = [
  { id: "home", label: "Home", mobileLabel: "Home", description: "Your long-term picture, at a glance." },
  { id: "portfolio", label: "Portfolio", mobileLabel: "Portfolio", description: "Your recorded holdings, and how they compare with your Arbor targets." },
  { id: "plan", label: "Plan", mobileLabel: "Plan", description: "Your targets, your goals, and the assumptions behind them." },
  { id: "ask", label: "Ask Arbor", mobileLabel: "Ask", description: "Understand your plan, one question at a time." },
] as const;
export type Destination = typeof destinations[number]["id"] | "settings";

export function destinationFromHash(hash: string): Destination {
  const candidate = hash.replace(/^#/, "");
  return candidate === "settings" || destinations.some(item => item.id === candidate)
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
