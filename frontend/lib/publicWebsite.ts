/** Public copy only. Account entitlements and financial calculations live in the app. */
export const publicSections = [
  ["how-it-works", "How it works"], ["features", "Portfolio"],
  ["arbor-plus", "Arbor Plus"], ["learn", "Learn"], ["faq", "FAQ"],
] as const;
export const publicFaqs = [
  ["What is Arbor?", "Arbor helps Filipinos invest simply and for the long term. You choose your approach and provider. Arbor tracks your recorded investments and explains your progress."],
  ["Does Arbor invest my money?", "No. Arbor does not hold your money, place trades or open investment accounts. You invest through your chosen provider. Arbor helps you calculate, track and understand."],
  ["Where do I actually buy investments?", "Ways to invest shows supported products for your chosen plan. Invest with your preferred provider, then return to record what you actually invested. Provider eligibility, fees and availability still apply."],
  ["Which investments does Arbor support?", "The current beta supports Vanguard VT, VGT and BND through Gotrade; selected ATRAM funds through GFunds and BPI funds through DragonFi; and Bitcoin through GCrypto, Coins.ph and PDAX. It supports a curated set of products, rather than everything on those platforms. Provider names do not imply partnerships."],
  ["Can I track investments I already own?", "Yes, for supported products. Record your existing holdings and available cost information. Arbor does not sync brokerage accounts or automatically import transactions. Some historical values or gain calculations may be unavailable when records or reference data are incomplete."],
  ["Is Arbor suitable for beginners in the Philippines?", "Yes. Arbor is Philippines-first, with PHP planning, supported local ways to invest, short Learn lessons and plain-language explanations. You do not need professional finance terminology to get started."],
  ["Does adding money count as an investment gain?", "No. Contributions are part of what you invested, not profit. Arbor separates recorded cost from portfolio value and shows gain/loss for the selected period when the necessary accounting context is complete."],
  ["Does Arbor guarantee returns?", "No. Investments can lose value. Plans and projections help you explore possibilities; they are not guaranteed outcomes or instructions to buy or sell."],
  ["What is Arbor Plus?", "Arbor Plus adds monthly contribution planning, recorded investment progress against your monthly target, Plan Alignment over time, Projection & What If, and deeper portfolio-aware explanations. Factual portfolio tracking and Learn are core Arbor capabilities."],
  ["What is available during the private beta?", "Private-beta members currently receive an Arbor Plus trial. Subscription checkout and public Free access are not active. Get started opens the current account-creation flow; no pricing or billing date has been announced here."],
] as const;
export const publicMetadata = {
  title: "Arbor — Invest with a plan you understand",
  description: "Help Filipinos invest simply and for the long term. Choose your approach, track your portfolio in PHP or USD, and understand your recorded progress. Arbor is a Philippines-first investment companion in private beta.",
};
