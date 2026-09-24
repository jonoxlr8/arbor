import Image from "next/image";
import { investmentIdentity, ISSUERS, type BrandIdentity } from "@/lib/investmentIdentity";

export function IdentityMark({ identity, small = false }: { identity: BrandIdentity; small?: boolean }) {
  return <span aria-hidden="true" data-identity={identity.tone} className={`identity-mark${small ? " identity-small" : ""}`}>
    {identity.logo ? <Image src={identity.logo} alt="" width={48} height={48} unoptimized /> : <span>{identity.fallback}</span>}
  </span>;
}

export default function InvestmentIdentity({ product, name }: { product: string; name?: string }) {
  const display = investmentIdentity(product, name);
  const identity = ISSUERS[display.issuer] ?? {name:display.fullName, fallback:display.shortName.slice(0,3),tone:"neutral"};
  return <IdentityMark identity={identity}/>;
}
