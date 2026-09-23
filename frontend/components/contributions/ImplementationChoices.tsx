import { BEGINNER_ROUTES, BITCOIN_PROVIDERS, ROUTES } from "@/lib/contributions";
import type { BitcoinProvider, RouteId } from "@/lib/types/contributions";

const descriptions = {
  gcash: "Access supported funds through GFunds.",
  dragonfi: "Access supported BPI funds through DragonFi.",
  gotrade: "Access supported US-listed ETFs.",
};
const choiceClass = (selected: boolean) => `min-h-12 w-full rounded-xl border p-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-emerald-600 ${selected ? "border-forest bg-forest text-white" : "border-slate-300 text-slate-700"}`;

export default function ImplementationChoices({ route, bitcoinProvider, hasBitcoinTarget, onRoute, onBitcoin }: {
  route: RouteId | ""; bitcoinProvider: BitcoinProvider | null; hasBitcoinTarget: boolean;
  onRoute: (route: RouteId) => void; onBitcoin: (provider: BitcoinProvider) => void;
}) {
  return <div className="space-y-5">
    <fieldset><legend className="text-sm font-semibold text-slate-900">Where do you want to implement your non-Bitcoin investments?</legend>
      <p className="mt-1 text-sm text-slate-600">Choose an option. Your plan targets stay the same.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{BEGINNER_ROUTES.map(id => <button type="button" key={id} aria-pressed={route === id} onClick={() => onRoute(id)} className={choiceClass(route === id)}>
        <span className="block font-semibold">{ROUTES[id]}</span><span className="mt-1 block text-xs leading-5">{descriptions[id]}</span>
      </button>)}</div>
    </fieldset>
    <fieldset><legend className="text-sm font-semibold text-slate-900">Where do you want to implement Bitcoin?</legend>
      <p className="mt-1 text-sm text-slate-600">{hasBitcoinTarget ? "Choose separately from your other investments." : "Your current target has no Bitcoin. This optional choice does not add Bitcoin to your plan."}</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{(Object.keys(BITCOIN_PROVIDERS) as BitcoinProvider[]).map(id => <button type="button" key={id} aria-pressed={bitcoinProvider === id} onClick={() => onBitcoin(id)} className={choiceClass(bitcoinProvider === id)}>{BITCOIN_PROVIDERS[id]}</button>)}</div>
    </fieldset>
    <p className="text-xs text-slate-500">Current choices stay in this view only. Nothing is invested, and no provider is selected for you.</p>
  </div>;
}
