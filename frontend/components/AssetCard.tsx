import { assetDescriptions } from "@/lib/assetDescriptions";
import { assetReasons } from "@/lib/assetReasons";
import { assetRoles } from "@/lib/assetRoles";

type Asset = {
  ticker: string;
  asset_name: string;
  asset_type: string;
  allocation: number;
};

type AssetCardProps = {
  asset: Asset;
};

export default function AssetCard({ asset }: AssetCardProps) {
  const icon =
    asset.ticker === "BTC" ? "₿" : asset.ticker === "ETH" ? "♦" : "🟢";

  const whyChosen =
    assetReasons[asset.ticker] ??
    "Selected to improve diversification and support your long-term investment strategy.";

  const role = assetRoles[asset.ticker] ?? "Portfolio Component";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{icon}</span>

            <div>
              <h3 className="text-xl font-bold text-slate-900">
                {asset.ticker}
              </h3>

              <p className="text-sm text-slate-500">{asset.asset_name}</p>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {assetDescriptions[asset.ticker] ??
                  "A diversified investment selected for your portfolio."}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-full bg-green-100 px-4 py-2 text-lg font-bold text-green-700">
          {asset.allocation}% of portfolio
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <div className="inline-block rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
          {asset.asset_type}
        </div>

        <div className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
          {role}
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-emerald-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Why Arbor chose this
        </p>

        <p className="mt-2 leading-7 text-slate-700">{whyChosen}</p>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex justify-between text-sm font-medium text-slate-500">
          <span>Portfolio Weight</span>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full ${
              asset.ticker === "BTC" || asset.ticker === "ETH"
                ? "bg-amber-500"
                : "bg-emerald-600"
            }`}
            style={{
              width: `${asset.allocation}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
