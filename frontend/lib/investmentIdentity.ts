import type { PortfolioProduct } from "./livePortfolio";

/** Display metadata only. The authenticated API catalog remains the product allowlist. */
export type BrandIdentity = { name: string; fallback: string; tone: string; logo?: string; logoDark?: string; logoAlt?: string };
export const ISSUERS: Record<string, BrandIdentity> = {
  vanguard: { name: "Vanguard", fallback: "VG", tone: "vanguard", logo: "/brands/supplied/issuers/vanguard.png", logoAlt: "Vanguard" },
  atram: { name: "ATRAM", fallback: "ATRAM", tone: "atram", logo: "/brands/supplied/issuers/atram.png", logoAlt: "ATRAM" },
  bpi: { name: "BPI Wealth", fallback: "BPI", tone: "bpi", logo: "/brands/supplied/issuers/bpi.png", logoAlt: "BPI" },
  bitcoin: { name: "Bitcoin", fallback: "₿", tone: "bitcoin", logo: "/brands/supplied/issuers/bitcoin.png", logoAlt: "Bitcoin" },
};
export const PROVIDERS: Record<string, BrandIdentity> = {
  gcash: { name: "GFunds", fallback: "GF", tone: "gfunds", logo: "/brands/supplied/providers/gcash.png", logoAlt: "GCash, home of GFunds" },
  gotrade: { name: "Gotrade", fallback: "GT", tone: "gotrade", logo: "/brands/supplied/providers/gotrade.png", logoAlt: "Gotrade" },
  dragonfi: { name: "DragonFi", fallback: "DF", tone: "dragonfi", logo: "/brands/supplied/providers/dragonfi.png", logoAlt: "DragonFi" },
  gcrypto: { name: "GCrypto", fallback: "GC", tone: "gcrypto", logo: "/brands/supplied/providers/gcash.png", logoAlt: "GCash, home of GCrypto" },
  coins_ph: { name: "Coins.ph", fallback: "CP", tone: "coins", logo: "/brands/supplied/providers/coinsph.png", logoAlt: "Coins.ph" },
  pdax: { name: "PDAX", fallback: "PDAX", tone: "pdax", logo: "/brands/supplied/providers/pdax.png", logoAlt: "PDAX" },
};
export const providerName = (id: string, fallback = id) => PROVIDERS[id]?.name ?? fallback;
/** Display-only compatibility for canonical replies with legacy provider labels. */
export const providerDisplayText = (text: string) => text.replace(/GCash \/ GFunds/g, "GFunds").replace(/GCash \/ GCrypto/g, "GCrypto");
type InvestmentDisplay = { shortName: string; fullName: string; issuer: string; category: "fund" | "etf" | "bitcoin"; description: string; unitClass?: string };
export const INVESTMENTS: Record<string, InvestmentDisplay> = {
  gcash_global_equity: { shortName: "ATRAM Global Equity Opportunity", fullName: "ATRAM Global Equity Opportunity Feeder Fund", issuer: "atram", category: "fund", description: "Global equity exposure", unitClass: "PHP Unit Class" },
  gcash_technology: { shortName: "ATRAM Global Technology", fullName: "ATRAM Global Technology Feeder Fund", issuer: "atram", category: "fund", description: "Technology-focused global exposure", unitClass: "A PHP Unit Class" },
  gcash_defensive: { shortName: "ATRAM Medium Term Peso Bond", fullName: "ATRAM Medium Term Peso Bond Fund", issuer: "atram", category: "fund", description: "Peso fixed income", unitClass: "A Unit Class" },
  dragonfi_global_equity: { shortName: "BPI Global Equity", fullName: "BPI Global Equity Fund of Funds", issuer: "bpi", category: "fund", description: "Global equity exposure", unitClass: "Class P · PHP" },
  dragonfi_technology: { shortName: "BPI World Technology", fullName: "BPI World Technology Feeder Fund", issuer: "bpi", category: "fund", description: "Technology exposure", unitClass: "Class P · PHP" },
  dragonfi_defensive: { shortName: "BPI Premium Bond", fullName: "BPI Premium Bond Fund", issuer: "bpi", category: "fund", description: "Peso fixed-income exposure", unitClass: "PHP" },
  gotrade_vt: { shortName: "VT", fullName: "Vanguard Total World Stock ETF", issuer: "vanguard", category: "etf", description: "Global stocks" },
  gotrade_vgt: { shortName: "VGT", fullName: "Vanguard Information Technology ETF", issuer: "vanguard", category: "etf", description: "US technology stocks" },
  gotrade_bnd: { shortName: "BND", fullName: "Vanguard Total Bond Market ETF", issuer: "vanguard", category: "etf", description: "US investment-grade bonds" },
  ...Object.fromEntries(["gcrypto_btc", "coins_btc", "pdax_btc"].map(id => [id, { shortName: "Bitcoin", fullName: "Bitcoin", issuer: "bitcoin", category: "bitcoin" as const, description: "Bitcoin · BTC" }])),
};
export const investmentIdentity = (id: string, fallback = id): InvestmentDisplay => INVESTMENTS[id] ?? { shortName: fallback, fullName: fallback, issuer: "", category: "fund", description: "" };
export type CatalogueCategory = "all" | "fund" | "etf" | "bitcoin";
export function catalogueGroups(catalog: PortfolioProduct[], query = "", category: CatalogueCategory = "all") {
  const search = query.trim().toLocaleLowerCase();
  return ["gcash", "dragonfi", "gotrade", "bitcoin"].map(group => ({
    id: group, name: group === "bitcoin" ? "Bitcoin" : providerName(group),
    products: catalog.filter(p => INVESTMENTS[p.product_id] && (category === "all" || INVESTMENTS[p.product_id].category === category) &&
      (group === "bitcoin" ? INVESTMENTS[p.product_id]?.category === "bitcoin" : p.provider === group) &&
      `${p.display_name} ${investmentIdentity(p.product_id).shortName} ${investmentIdentity(p.product_id).fullName} ${providerName(p.provider)} ${INVESTMENTS[p.product_id]?.unitClass ?? ""}`.toLocaleLowerCase().includes(search)),
  })).filter(group => group.products.length);
}
