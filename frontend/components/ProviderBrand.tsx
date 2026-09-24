/** Approved local logos can be added here later. Names never depend on an image. */
export default function ProviderBrand({ provider, name }: { provider: string; name: string }) {
  return <span data-provider={provider} className="inline-flex max-w-full items-center rounded-full border border-current px-3 py-2 text-sm font-medium">{name}</span>;
}
