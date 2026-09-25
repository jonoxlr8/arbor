import { investmentMark, type BrandIdentity } from "@/lib/investmentIdentity";
import ArborIdentityIcon from "./ArborIdentityIcon";

export function IdentityMark({ identity, small = false, decorative = true }: { identity: BrandIdentity; small?: boolean; decorative?: boolean }) {
  return <span role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `Arbor icon for ${identity.name}`} data-identity={identity.tone} data-art="arbor-original" className={`identity-mark${small ? " identity-small" : ""}`}>
    <ArborIdentityIcon glyph={identity.icon}/>
  </span>;
}

export default function InvestmentIdentity({ product }: { product: string; name?: string }) {
  return <IdentityMark identity={investmentMark(product)}/>;
}
