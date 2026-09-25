"use client";
import Image from "next/image";
import { useState } from "react";
import { investmentIdentity, ISSUERS, type BrandIdentity } from "@/lib/investmentIdentity";

export function IdentityMark({ identity, small = false }: { identity: BrandIdentity; small?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const hasLogo = identity.logo && failed !== identity.logo;
  return <span role="img" aria-label={identity.name} data-identity={identity.tone} data-logo={Boolean(hasLogo)} className={`identity-mark${small ? " identity-small" : ""}`}>
    {hasLogo ? <span className={identity.logoDark ? "identity-variants" : "identity-image"}>
      <Image className="identity-light" src={identity.logo!} alt={identity.logoAlt ?? identity.name} width={48} height={48} sizes={small ? "24px" : "48px"} onError={() => setFailed(identity.logo!)} />
      {identity.logoDark && <Image className="identity-dark" src={identity.logoDark} alt="" width={48} height={48} sizes={small ? "24px" : "48px"} onError={() => setFailed(identity.logo!)} />}
    </span> : <span aria-hidden="true">{identity.fallback}</span>}
  </span>;
}

export default function InvestmentIdentity({ product, name }: { product: string; name?: string }) {
  const display = investmentIdentity(product, name);
  const identity = ISSUERS[display.issuer] ?? {name:display.fullName, fallback:display.shortName.slice(0,3),tone:"neutral"};
  return <IdentityMark identity={identity}/>;
}
