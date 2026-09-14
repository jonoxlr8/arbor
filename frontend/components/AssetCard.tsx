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
  const whyChosen =
    assetReasons[asset.ticker] ??
    "Included in the selected model portfolio. Arbor has limited explanatory information for this asset.";

  const role = assetRoles[asset.ticker] ?? "Portfolio Component";

  return <div className="min-w-0 border-t border-slate-200 py-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="font-semibold">{asset.ticker}</h3><p className="text-sm text-slate-500">{asset.asset_name}</p><p className="mt-1 text-xs text-forest">{role}</p></div>
      <p className="shrink-0 text-xl font-semibold">{asset.allocation}% <span className="text-xs font-normal text-slate-500">target</span></p>
    </div>
    <details className="mt-1">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-forest">Why included</summary>
      <p className="text-xs text-slate-500">{asset.asset_type}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{assetDescriptions[asset.ticker] ?? "An asset in your Arbor target portfolio."}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{whyChosen}</p>
    </details>
  </div>;
}
