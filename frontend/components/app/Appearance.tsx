"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createAppearanceController, type Appearance } from "@/lib/appearance";

const Context = createContext<{ preference: Appearance; set: (value: Appearance) => void }>({ preference: "system", set: () => {} });

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ preference: Appearance; set: (value: Appearance) => void }>({ preference: "system", set: () => {} });
  useEffect(() => {
    const controller = createAppearanceController(window, document.documentElement);
    const sync = () => setState({ preference: controller.getSnapshot(), set: controller.set });
    const unsubscribe = controller.subscribe(sync);
    // Synchronize from an external browser preference, not application data.
    sync();
    return () => { unsubscribe(); controller.dispose(); };
  }, []);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function AppearanceSettings() {
  const { preference, set } = useContext(Context);
  return <section className="arbor-panel">
    <fieldset>
      <legend className="text-lg font-semibold text-slate-900">Appearance</legend>
      <p className="mt-2 text-sm text-slate-500">Choose your look. System follows your device. Saved on this browser only.</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {(["system", "light", "dark"] as const).map(value => <label key={value} className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 py-3 text-sm font-medium ${preference === value ? "border-emerald-600 bg-sage-soft text-forest" : "border-slate-200 text-slate-600"}`}>
          <input type="radio" name="appearance" value={value} checked={preference === value} onChange={() => set(value)} className="accent-forest" />
          {value[0].toUpperCase() + value.slice(1)}
        </label>)}
      </div>
    </fieldset>
  </section>;
}

export function AppearanceSelect() {
  const { preference, set } = useContext(Context);
  return <label className="inline-flex min-h-11 items-center gap-3 text-xs text-slate-500">
    Appearance
    <select aria-label="Appearance" value={preference} onChange={event => set(event.target.value as Appearance)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
      <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
    </select>
  </label>;
}
