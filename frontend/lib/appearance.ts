export type Appearance = "system" | "light" | "dark";
export const appearanceKey = "arbor-appearance";
// Runs in <head> before body paint. System needs no override: CSS color-scheme
// already follows the OS. No user content is interpolated into this script.
export const appearanceInitScript = `try{var p=localStorage.getItem(${JSON.stringify(appearanceKey)});if(p==='light'||p==='dark')document.documentElement.dataset.theme=p;}catch{}`;
export function parseAppearance(value: string | null): Appearance {
  return value === "light" || value === "dark" ? value : "system";
}
export function resolveAppearance(preference: Appearance, systemDark: boolean) {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

// Only a presentation preference is stored. Storage can be unavailable in private browsing.
export function createAppearanceController(browser: Window, root: HTMLElement) {
  const media = browser.matchMedia("(prefers-color-scheme: dark)");
  let preference: Appearance = "system";
  try { preference = parseAppearance(browser.localStorage.getItem(appearanceKey)); } catch { /* Use system. */ }
  const listeners = new Set<() => void>();
  const apply = () => {
    root.dataset.theme = resolveAppearance(preference, media.matches);
    listeners.forEach(listener => listener());
  };
  const storage = (event: StorageEvent) => {
    if (event.key === appearanceKey || event.key === null) {
      preference = parseAppearance(event.newValue);
      apply();
    }
  };
  media.addEventListener("change", apply);
  browser.addEventListener("storage", storage);
  apply();
  return {
    getSnapshot: () => preference,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set(value: Appearance) {
      preference = value;
      try { browser.localStorage.setItem(appearanceKey, value); } catch { /* Still apply for this visit. */ }
      apply();
    },
    dispose() {
      media.removeEventListener("change", apply);
      browser.removeEventListener("storage", storage);
      listeners.clear();
    },
  };
}
