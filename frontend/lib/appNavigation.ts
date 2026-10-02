export const destinations = [
  { id: "home", label: "Home", mobileLabel: "Home", description: "Your long-term picture, at a glance." },
  { id: "portfolio", label: "Portfolio", mobileLabel: "Portfolio", description: "Your recorded holdings, and how they compare with your Arbor targets." },
  { id: "ask", label: "Ask Arbor", mobileLabel: "Ask Arbor", description: "Understand your plan, one question at a time." },
  { id: "settings", label: "Settings", mobileLabel: "Settings", description: "Your profile, preferences and Arbor access." },
] as const;
export type Destination = typeof destinations[number]["id"];

export function destinationFromHash(hash: string): Destination {
  const candidate = hash.replace(/^#/, "").split("/")[0];
  if (candidate === "plan" || hash === "#portfolio/plan") return "home"; // Preserve old bookmarks.
  return destinations.some(item => item.id === candidate)
    ? candidate as Destination : "home";
}

// Hash navigation deliberately keeps the authenticated owner and its requests alive.
// No session values or financial information are placed in the URL.
export function subscribeNavigation(callback: () => void) {
  const listener = (event: Event) => {
    if ("newURL" in event && "oldURL" in event) {
      const change = event as HashChangeEvent;
      const next = new URL(change.newURL).hash;
      if (next === "#portfolio/insights" || next === "#portfolio/allocation" || next === "#portfolio/ways" || next === "#portfolio/history" || next === "#home/activity" || next === "#home/plan" || next === "#plan" || next === "#portfolio/plan") {
        sheetOpeningHash = new URL(change.oldURL).hash;
        sheetTargetHash = next;
      } else {
        sheetOpeningHash = null;
        sheetTargetHash = null;
      }
    }
    callback();
  };
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
let sheetOpeningHash: string | null = null;
let sheetTargetHash: string | null = null;

export function closePortfolioSheet() {
  const target = window.location.hash;
  const opener = sheetTargetHash === target ? sheetOpeningHash : null;
  if (opener !== null) {
    window.history.back();
    window.setTimeout(() => {
      const launcher = document.querySelector<HTMLElement>(`[href="${target === "#portfolio/allocation" ? "#portfolio/insights" : target === "#plan" || target === "#portfolio/plan" ? "#home/plan" : target}"]`);
      launcher?.focus({ preventScroll: true });
    }, 50);
    return;
  }
  // A direct bookmarked sheet has no in-app opener to return to.
  window.history.replaceState(window.history.state, "", target.startsWith("#home/") || target === "#plan" || target === "#portfolio/plan" ? "#home" : "#portfolio");
  window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL: window.location.href, newURL: window.location.href }));
  window.setTimeout(()=>document.querySelector<HTMLElement>(`[href="${target === "#portfolio/allocation" ? "#portfolio/insights" : target === "#plan" || target === "#portfolio/plan" ? "#home/plan" : target}"]`)?.focus({preventScroll:true}),50);
}
export function navigationSnapshot() { return destinationFromHash(window.location.hash); }
export function serverNavigationSnapshot(): Destination { return "home"; }
export function sectionSnapshot() { return window.location.hash === "#plan" ? "plan" : window.location.hash.split("/")[1] ?? ""; }
