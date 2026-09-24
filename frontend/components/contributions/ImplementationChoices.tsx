import { BEGINNER_ROUTES, BITCOIN_PROVIDERS, ROUTES } from "@/lib/contributions";
import type { BitcoinProvider, RouteId } from "@/lib/types/contributions";
import ProviderBrand from "../ProviderBrand";

const descriptions = {
  gcash: "Access supported funds through GFunds.",
  dragonfi: "Access supported BPI funds through DragonFi.",
  gotrade: "Access supported US-listed ETFs.",
};
const choiceClass = (selected: boolean) => `min-h-12 w-full rounded-xl border p-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-emerald-600 ${selected ? "border-forest bg-forest text-white" : "border-slate-300 text-slate-700"}`;

export function ImplementationEducation() {
  return <details className="py-4"><summary className="min-h-11 cursor-pointer font-semibold text-slate-900">Where can I invest?</summary>
    <p className="mt-2 text-sm text-slate-600">These are ways to implement a plan, not changes to its targets. No option is chosen for you.</p>
    <dl className="mt-4 space-y-4">{BEGINNER_ROUTES.map(id => <div key={id}><dt className="font-medium text-slate-900"><ProviderBrand provider={id} name={ROUTES[id]} /></dt><dd className="mt-2 text-sm text-slate-600">{descriptions[id]}</dd></div>)}</dl>
  </details>;
}

export default function ImplementationChoices({ route, bitcoinProvider, hasBitcoinTarget, onRoute, onBitcoin }: {
  route: RouteId | ""; bitcoinProvider: BitcoinProvider | null; hasBitcoinTarget: boolean;
  onRoute: (route: RouteId) => void; onBitcoin: (provider: BitcoinProvider) => void;
}) {
  return <div className="space-y-5">
    <fieldset><legend className="text-sm font-semibold text-slate-900">Where will you invest?</legend>
      <p className="mt-1 text-sm text-slate-600">Choose an option. Your plan targets stay the same.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{BEGINNER_ROUTES.map(id => <button type="button" key={id} aria-pressed={route === id} onClick={() => onRoute(id)} className={choiceClass(route === id)}>
        <ProviderBrand provider={id} name={ROUTES[id]}/><span className="mt-1 block text-xs leading-5">{descriptions[id]}</span>
      </button>)}</div>
    </fieldset>
    <details open={hasBitcoinTarget}><summary className="text-sm font-medium">{hasBitcoinTarget ? "Bitcoin provider" : "Bitcoin options (no current target)"}</summary><fieldset><legend className="sr-only">Bitcoin provider</legend>
      <p className="mt-1 text-sm text-slate-600">{hasBitcoinTarget ? "Choose separately from your other investments." : "Your current target has no Bitcoin. This optional choice does not add Bitcoin to your plan."}</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{(Object.keys(BITCOIN_PROVIDERS) as BitcoinProvider[]).map(id => <button type="button" key={id} aria-pressed={bitcoinProvider === id} onClick={() => onBitcoin(id)} className={choiceClass(bitcoinProvider === id)}><ProviderBrand provider={id} name={BITCOIN_PROVIDERS[id]}/></button>)}</div>
    </fieldset></details>
    <p className="text-xs text-slate-500">Current choices stay in this view only. Nothing is invested, and no provider is selected for you.</p>
  </div>;
}
