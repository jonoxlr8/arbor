# Investment and provider identities — 3U-E.1

Reviewed September 25, 2026. Display metadata only; no pricing, target, eligibility,
provider-ranking or product-allowlist logic belongs in this layer.

## Contract

`frontend/lib/investmentIdentity.ts` centralizes issuer, asset category, ticker,
full name, short name, unit class and provider display identity. Reusable
`InvestmentIdentity` and `ProviderIdentity` components consume it. The catalogue
renders only products returned by the authenticated API; it never offers every
metadata entry independently of that server list. Search is local to this list.

| Canonical products | Investment identity | Holding provider |
| --- | --- | --- |
| gotrade_vt / gotrade_vgt / gotrade_bnd | Vanguard; VT / VGT / BND | Gotrade |
| gcash_global_equity / gcash_technology / gcash_defensive | ATRAM; exact fund name | GFunds |
| dragonfi_global_equity / dragonfi_technology / dragonfi_defensive | BPI Wealth; exact fund name | DragonFi |
| gcrypto_btc | Bitcoin | GCrypto |
| coins_btc | Bitcoin | Coins.ph |
| pdax_btc | Bitcoin | PDAX |

Canonical IDs are unchanged. `gcash` displays as **GFunds**, `gcrypto` as
**GCrypto**. The catalogue preserves PHP Unit Class / A PHP Unit Class /
A Unit Class for the ATRAM funds and Class P / PHP for the relevant BPI funds.
The BPI Global Equity spelling follows the current backend catalogue
(`BPI Global Equity Fund of Funds`), rather than inventing a different product.

## Asset provenance and permission status

Arbor's existing approved mark is unchanged. The decorative Home landscape is
an original geometric illustration, not a trademark or a financial chart.

| Identity | Local treatment | Source / outstanding action |
| --- | --- | --- |
| Bitcoin | Locally stored supplied SVG | [Bitcoin Design symbol download](https://bitcoin.design/guide/getting-started/visual-language/); artwork unchanged, credited to Bitcoin Design / bitboy. [Project license](https://bitcoin.design/LICENSE) permits asset images under CC BY 4.0. Attribution appears in Settings → Help & disclosures and the distributed `public/identities/NOTICE.md`. Bitcoin has no central company issuing an “official” logo. |
| Vanguard | VG typographic tile + full Vanguard name | [Vanguard terms](https://investor.vanguard.com/terms-conditions) require permission for logo reproduction. Obtain approved asset/permission before replacing the fallback. |
| ATRAM | ATRAM typographic tile + full fund name | [ATRAM](https://www.atram.com.ph/) / [published agreements](https://openfinance.atram.com.ph/agreements) inspected; no reusable logo grant established. Approved asset/usage confirmation needed. |
| BPI Wealth | BPI typographic tile + full fund name | [BPI official site](https://www.bpi.com.ph/); no reusable asset grant established in this review. Approved asset/usage confirmation needed. |
| GFunds / GCrypto | GF / GC text tiles + full provider name | [GCash terms](https://gcash.com/terms-and-conditions); no reusable asset grant established. Do not imply affiliation. |
| Gotrade | GT text tile + Gotrade | [Gotrade legal](https://www.heygotrade.com/legal/); approved asset/usage confirmation needed. |
| DragonFi | DF text tile + DragonFi | [DragonFi agreement](https://www.dragonfi.ph/ostma); approved asset/usage confirmation needed. |
| Coins.ph | CP text tile + Coins.ph | [Coins.ph legal](https://www.coins.ph/fil-ph/legal); approved asset/usage confirmation needed. |
| PDAX | PDAX text tile + PDAX | [PDAX terms](https://pdax.ph/rule/terms-and-conditions/) restrict use without written consent; obtain approval first. |

These are asset-selection decisions, not legal conclusions about nominative use.
No company logos were copied from image search, guessed, redrawn or hotlinked.
The remaining corporate-logo gap is explicit: names are recognizable, but the
fallbacks are not official brand marks. Replace them centrally when approved
local assets become available; financial logic and IDs need not change.

## Data-source attribution

Holding provider identity is never the market-data source. Coinranking,
Marketstack and ExchangeRate-API links remain visible in a discreet Portfolio
footer. Explanations are under “About prices & data”. In particular, the
[ExchangeRate-API Open terms](https://www.exchangerate-api.com/docs/free) require
on-page attribution, so the links are not hidden inside a closed disclosure.

## Allocation palette

Global Equity blue; Technology violet; Defensive teal; Bitcoin gold. The same
tokens support target/current donuts, alignment bars and contribution preview
dots. Names and percentages always accompany color. No additional sleeves or
weights are introduced to make a plan look more colorful. Aggressive's current
canonical single-sleeve allocation therefore remains a single-color target.

## Interaction boundaries

Add Investment is a supported-investment catalogue, not a recommendation list.
Fund current PHP value remains sufficient; units are optional. ETFs require
shares; Bitcoin requires BTC quantity. More details stay secondary. Saving
creates a holding record, never a transaction, order or verified execution.
Provider selection for Bitcoin is explicit through equally styled catalogue
entries. The transaction ledger remains future work; no dead transaction CTA
is exposed.
