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

// Keep each sheet's opener on its history entry, including nested sheets.
export function isSheetHash(hash: string) {
  return ["#portfolio/insights","#portfolio/allocation","#portfolio/ways","#portfolio/history","#portfolio/what-if","#portfolio/contribution","#home/monthly","#home/activity","#home/plan","#settings/plan","#settings/goal","#plan","#portfolio/plan"].includes(hash);
}
export function sheetFallbackHash(hash: string) {
  return hash.startsWith("#settings/") ? "#settings" : hash.startsWith("#home/") || hash === "#plan" || hash === "#portfolio/plan" ? "#home" : "#portfolio";
}
export function subscribeNavigation(callback: () => void) {
  const listener = (event: Event) => {
    if ("newURL" in event && "oldURL" in event) {
      const change = event as HashChangeEvent;
      const next = new URL(change.newURL).hash;
      if (isSheetHash(next) && window.history.state?.arborSheet?.target !== next) {
        window.history.replaceState({...window.history.state,arborSheet:{target:next,opener:new URL(change.oldURL).hash}}, "");
      }
    }
    callback();
  };
  window.addEventListener("hashchange",listener);
  return () => window.removeEventListener("hashchange",listener);
}
export function closePortfolioSheet() {
  const target = window.location.hash;
  const saved = window.history.state?.arborSheet;
  const launcherHash = target === "#portfolio/allocation" ? "#portfolio/insights" : target === "#plan" || target === "#portfolio/plan" ? "#home/plan" : target;
  const focusLauncher = () => document.querySelector<HTMLElement>(`[href="${launcherHash}"]`)?.focus({preventScroll:true});
  if (saved?.target === target && typeof saved.opener === "string") {
    window.history.back();window.setTimeout(focusLauncher,50);return;
  }
  const oldURL = window.location.href;
  window.history.replaceState({...window.history.state,arborSheet:null}, "",sheetFallbackHash(target));
  window.dispatchEvent(new HashChangeEvent("hashchange",{oldURL,newURL:window.location.href}));
  window.setTimeout(focusLauncher,50);
}
export function navigationSnapshot() { return destinationFromHash(window.location.hash); }
export function serverNavigationSnapshot(): Destination { return "home"; }
export function sectionSnapshot() { return window.location.hash === "#plan" ? "plan" : window.location.hash.split("/")[1] ?? ""; }
