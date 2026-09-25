"use client";
import { useState } from "react";
import type { PortfolioProduct } from "@/lib/livePortfolio";
import { catalogueGroups, investmentIdentity, providerName, type CatalogueCategory } from "@/lib/investmentIdentity";
import InvestmentIdentity from "../InvestmentIdentity";
import ProviderIdentity from "../ProviderIdentity";

export default function InvestmentCatalogue({ catalog, onSelect }: { catalog: PortfolioProduct[]; onSelect: (product: PortfolioProduct) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CatalogueCategory>("all");
  const groups = catalogueGroups(catalog, query, category);
  return <div className="investment-catalogue">
    <p className="catalogue-intro">Add an investment you already own.</p>
    <label className="catalogue-search"><span aria-hidden="true">⌕</span><span className="sr-only">Search investments</span><input type="search" placeholder="Search investments" value={query} onChange={e => setQuery(e.target.value)}/></label>
    <div className="catalogue-categories" role="group" aria-label="Investment categories">
      {([["all", "All"], ["fund", "Funds"], ["etf", "ETFs"], ["bitcoin", "Bitcoin"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}
    </div>
    {groups.map(group => <section key={group.id} aria-label={group.name}><h3>{group.name}</h3><div className="catalogue-list">{group.products.map(product => {
      const identity = investmentIdentity(product.product_id, product.display_name);
      return <button type="button" className="catalogue-row" key={product.product_id} data-product={product.product_id} onClick={() => onSelect(product)} aria-label={`Add ${identity.shortName} · ${providerName(product.provider,product.provider_name)}`}>
        <InvestmentIdentity product={product.product_id}/><span className="catalogue-copy"><strong>{identity.category === "etf" ? identity.shortName : identity.fullName}</strong>
          <small>{identity.category === "etf" ? identity.fullName : identity.description}</small>
          {identity.unitClass && <small>{identity.unitClass}</small>}<ProviderIdentity provider={product.provider} name={product.provider_name}/></span><span className="row-chevron" aria-hidden="true">›</span>
      </button>;
    })}</div></section>)}
    {!groups.length && <p role="status" className="catalogue-empty">No supported investments match. Try a fund, ticker or provider name.</p>}
  </div>;
}
