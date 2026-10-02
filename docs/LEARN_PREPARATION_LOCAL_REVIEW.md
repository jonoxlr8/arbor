# Beginner Learn and disclosure alignment — local review only

Base b95d8df91a1d9ab273eba8977b9fbb8398376c64, the verified published request frontend. No branch/commit/push/publication for this follow-up.

Adds three short Basics lessons in existing Ask → Learn (#ask): Starting to save, Building an emergency fund, Debt before investing. Existing Investing 101 / Build a foundation remains unchanged. Each added lesson has brief explanation and exactly one Next step exercise; no personalized calculation, readiness change, recommendation model or new onboarding. The existing optional Ask button only drafts a question; no auto-send.

Shared Home/Portfolio About prices and data remains native collapsed details with plus/minus affordance, keyboard access, exact five linked credits and existing freshness. Scoped CSS left-aligns summary and content without changing records or fetching.

Sources reviewed October2UTC / October3NZDT2026:
- CFPB savings-plan tool: https://files.consumerfinance.gov/f/documents/cfpb_your-money-your-goals_savings_plan_tool_2018-11_ADA.pdf (small manageable goals and regular saving).
- CFPB emergency guide: https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/ (unexpected-expense reserve, circumstances vary, safe accessible storage).
- Investor.gov Preparedness Checklist: https://www.investor.gov/introduction-investing/general-resources/investor-preparedness-checklist (high-interest debt first, risk awareness).
- CFPB debt-log tool: https://files.consumerfinance.gov/f/documents/cfpb_your-money-your-goals_debt_log_tool_2018-11_ADA.pdf (balances/rates/payments/dates from statements).
General principles only; no US-specific products/tax/benefits imported into Philippine user copy.

Verification:735frontend tests;44browser-safety tests;lint/types/offlineproductionbuild. Actual synthetic browser preview covers320/390/768/1440light/dark: three lesson details/Basics list, keyboard open/back, one Next step each, official sources; Home/Portfolio left alignment, plus/minus native expansion, links and holding cached date. Complete browser result and screenshots accompany bundle. No actual account, hosted writes, vendor API calls or credentials.

## Exact prior audit scope

The previous50-state audit rendered each listed state at390/1440light/dark (200captures). It did not include onboarding steps. Public signup and confirmation views plus an already-saved plan do not establish onboarding completeness. Only representative images received visual inspection;200 automated screenshots are not200 independent visual reviews.

- landing
- login
- signup
- forgot-password
- invalid-reset
- invalid-confirmation
- privacy
- terms
- archived-terms
- investment-disclosures
- account-deletion
- not-found
- confirmation-ready
- confirmation-expired
- recovery-ready
- recovery-expired
- reset-request-synthetic-success
- home-current
- home-exceeded
- home-zero
- home-unset
- home-read-error
- home-missing-amount
- budget-conflict
- budget-current-replaced
- saved-plan
- activity
- portfolio
- portfolio-history
- ways-to-invest
- add-investment
- review-current
- review-past
- review-older-missing
- review-error
- what-if-saved
- what-if-explored
- what-if-error
- settings-free
- settings-trial
- settings-active
- learn
- learn-arbor-detail
- ask-empty
- ask-interrupted
- account-deactivated
- account-deletion_pending
- account-erasing
- terms-required-no-acceptance
- account-reconnect

Unqualified by that audit: all onboarding steps/validation/back/refresh variants; actual hosted signup/inbox/confirmation/recovery completion; owner-authenticated real history and budgets; every provider-continuation/record/edit/void/remove flow and every product/currency; real subscription billing; permanent account-erasure/retention invocation; every settings expansion; all lessons/categories and completed Ask conversations; screen-reader output, contrast measured with accessibility tooling, slow devices/networks, platform browser diversity and exhaustive small-width states. The separate targeted tests cover specified additional cases, not all these flows.

No live publication approval for this local follow-up. Review this exact patch and sample captures before a separate frontend release. No API/schema/cron/memory/admin/analytics/billing work.
