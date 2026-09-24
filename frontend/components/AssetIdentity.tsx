import type { CSSProperties } from "react";
import InvestmentIdentity from "./InvestmentIdentity";
import { INVESTMENTS } from "@/lib/investmentIdentity";

export const sleeveColors: Record<string, string> = { global_equity: "var(--asset-blue)", defensive: "var(--asset-teal)", technology_tilt: "var(--asset-violet)", crypto: "var(--asset-gold)" };
export function assetMonogram(id: string) {
  if (id.startsWith("gotrade_")) return id.slice(8).toUpperCase();
  if (id.includes("bitcoin") || id.includes("btc")) return "₿";
  if (id.includes("technology")) return "T";
  if (id.includes("defensive")) return "B";
  return "G";
}
/** Arbor-made category/ticker marks, not corporate logos or endorsements. */
export default function AssetIdentity({ product, sleeve }: { product: string; sleeve: string }) {
  if (INVESTMENTS[product]) return <InvestmentIdentity product={product}/>;
  return <span aria-hidden="true" className="asset-identity" style={{ "--identity": sleeveColors[sleeve] ?? "var(--asset-blue)" } as CSSProperties}>{assetMonogram(product)}</span>;
}
