/** Public release copy, not entitlement or feature-availability authority.
 * Live Portfolio and monthly check-ins passed activation validation. These words
 * describe private beta; canonical entitlements still control authenticated access.
 */
export const publicSections = [
  ['how-it-works', 'How it works'], ['product-portfolio', 'Portfolio'],
  ['ask-arbor', 'Ask Arbor'], ['pricing', 'Pricing'], ['faq', 'FAQ'],
] as const;

export const publicFaqs = [
  ['What is Arbor?', 'Arbor is an AI investment companion for long-term investors. You choose your approach and providers. Arbor helps calculate your targets, track your recorded investments, explain contribution amounts and keep perspective.'],
  ['Does Arbor invest my money?', 'No. Arbor does not hold money, connect to your payment accounts or place trades. Your investments stay with your chosen provider. Any investing happens outside Arbor.'],
  ['Does Arbor choose investments for me?', 'No. You compare standardized approaches and explicitly choose your plan. Keep the complete core plan or explicitly add 5% or 10% Technology or Bitcoin. Neither is added automatically. Your providers and investment decisions remain yours.'],
  ['Where do I actually invest?', 'Explore Ways to invest from your chosen plan, follow an official provider link and invest outside Arbor. With Arbor Plus, come back to record what you own. Arbor does not rank providers or open accounts for you. Provider fees, eligibility and availability still apply.'],
  ['Can Arbor track my existing investments?', 'Yes. Arbor Plus in private beta tracks supported holdings that you record, with PHP reference values and comparisons with your chosen targets. For supported funds, enter units or the current peso value from your provider app. Arbor does not import or verify transactions.'],
  ['Which providers does Arbor support?', 'Supported implementation examples include GFunds, Gotrade, DragonFi, GCrypto, Coins.ph and PDAX. Portfolio covers selected ATRAM and BPI funds, Vanguard VT/VGT/BND ETFs and Bitcoin—not every product on each platform. Names identify investments and providers, not partnerships or endorsements.'],
  ['Does Arbor connect to my broker?', 'No. Arbor does not currently sync brokerage accounts or import transactions. Portfolio tracking uses holdings or fund values you enter. It does not require your broker password.'],
  ['What is Ask Arbor?', 'Ask Arbor explains your saved plan, contribution calculations and your next step in Arbor in plain language. With Arbor Plus, it can also explain recorded holdings. It is not a general-purpose trading adviser, and AI explanations can be mistaken.'],
  ['What is the difference between Free and Plus?', 'Free includes your selected plan, optional customization, targets, Ways to invest, official provider links and basic planning. Limited Ask Arbor is planned at 10 questions per month when public quota support launches. Plus adds full Ask Arbor access, contribution planning, monthly check-ins, profile editing, holdings, portfolio history and Plan Alignment. During private beta, all authenticated beta users receive Plus free, without a credit card or billing date. Planned launch pricing is ₱399/month or ₱3,990/year; there is no checkout today.'],
  ['Is Arbor available outside the Philippines?', 'Arbor is Philippines-first. The current V2 planning experience uses PHP and supported Philippine implementation options. Arbor is not yet a full multi-country planning or tracking product.'],
] as const;

export const publicMetadata = {
  title: 'Arbor — Invest with clarity. An AI investment companion.',
  description: 'Choose your plan and track recorded investments with Arbor, the Philippines-first AI investment companion. Understand your portfolio and monthly contributions.',
};
