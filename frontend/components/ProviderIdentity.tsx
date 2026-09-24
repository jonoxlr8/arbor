import { PROVIDERS, providerName } from "@/lib/investmentIdentity";
import { IdentityMark } from "./InvestmentIdentity";

export default function ProviderIdentity({ provider, name }: { provider: string; name?: string }) {
  const identity = PROVIDERS[provider];
  return <span data-provider={provider} className="provider-brand">{identity && <IdentityMark identity={identity} small/>}<span>{providerName(provider, name)}</span></span>;
}
