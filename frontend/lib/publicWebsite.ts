/** Public release copy, not entitlement or feature-availability authority.
 * Checked against the hosted disposable-account contract: monthly check-ins are
 * available; Live Portfolio remains disabled. Local product previews are labeled.
 */
export const publicSections = [
  ['how-it-works', 'How it works'], ['product-portfolio', 'Portfolio'],
  ['ask-arbor', 'Ask Arbor'], ['pricing', 'Pricing'], ['faq', 'FAQ'],
] as const;

export const publicFaqs = [
  ['What is Arbor?', 'Arbor is an AI investment companion for long-term investors. You choose your approach and providers. Arbor helps calculate your targets, explain contribution amounts and keep perspective. The product preview shows optional Technology and Bitcoin choices and portfolio tracking being prepared for beta.'],
  ['Does Arbor invest my money?', 'No. Arbor does not hold money, connect to your payment accounts or place trades. Your investments stay with your chosen provider. Any investing happens outside Arbor.'],
  ['Does Arbor choose investments for me?', 'No. You compare standardized approaches and explicitly choose your plan. The upcoming customization step lets you keep the complete core plan or explicitly add 5% or 10% Technology or Bitcoin. Neither is added automatically. Your providers and investment decisions remain yours.'],
  ['Where do I actually invest?', 'Explore Ways to invest from your chosen plan, follow an official provider link and invest outside Arbor. When tracking is released, come back to record what you own. Arbor does not rank providers or open accounts for you. Provider fees, eligibility and availability still apply.'],
  ['Can Arbor track my existing investments?', 'Live Portfolio is built but is not enabled in the current public beta. The preview shows manually recorded supported holdings, PHP reference values and comparisons with chosen targets. For supported funds, you can record the current peso value from your provider app. It is not a verified transaction record.'],
  ['Which providers does Arbor support?', 'Supported implementation examples include GFunds, Gotrade, DragonFi, GCrypto, Coins.ph and PDAX. The Portfolio preview covers selected ATRAM and BPI funds, Vanguard VT/VGT/BND ETFs and Bitcoin—not every product on each platform. Names identify investments and providers, not partnerships or endorsements.'],
  ['Does Arbor connect to my broker?', 'No. Arbor does not currently sync brokerage accounts or import transactions. Portfolio tracking, when enabled, uses holdings or fund values you enter. It does not require your broker password.'],
  ['What is Ask Arbor?', 'Ask Arbor explains your saved plan, contribution calculations and your next step in Arbor in plain language. When Portfolio tracking is enabled, it can also explain recorded holdings. It is not a general-purpose trading adviser, and AI explanations can be mistaken.'],
  ['What is the difference between Free and Plus?', 'Free includes your selected plan, targets, Ways to invest, official provider links and basic planning. Optional plan customization is also part of Free in the product preview. Limited Ask Arbor is planned at 10 questions per month when public quota support launches. Plus adds full Ask Arbor access, contribution planning, monthly check-ins and profile editing; holdings, portfolio history and Plan Alignment remain previews. During private beta, all authenticated beta users receive Plus free, without a credit card or billing date. Planned launch pricing is ₱399/month or ₱3,990/year; there is no checkout today.'],
  ['Is Arbor available outside the Philippines?', 'Arbor is Philippines-first. The current V2 planning experience uses PHP and supported Philippine implementation options. Arbor is not yet a full multi-country planning or tracking product.'],
] as const;

export const publicMetadata = {
  title: 'Arbor — Invest with clarity. An AI investment companion.',
  description: 'Choose your plan and providers with Arbor, the Philippines-first AI investment companion. Understand monthly contributions and explore the portfolio-tracking preview.',
};
