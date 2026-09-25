# Investment and provider identities — 3U-G.1

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

## Current assets: owner-supplied originals

The founder supplied nine PNG files and explicitly confirmed use **unchanged**.
All four issuers and six provider identities now use those files from
`frontend/public/brands/supplied/`. GFunds and GCrypto share `gcash.png`.
Vanguard, Coins.ph and PDAX now have supplied artwork, not default monograms.
The originals are byte-for-byte copies, checked by SHA-256 in `manifest.json`.
Next Image generates appropriately sized delivery versions; no logo geometry,
colors or embedded backgrounds were edited. Names remain visible; image-load
failure and unknown identities still have text fallbacks.

This is a source/implementation record, not confirmation of a trademark license.
No permission, endorsement or copyright workaround is asserted. The previous
permission research below remains relevant for owner review before publication.
The supplied Bitcoin PNG has user-provided provenance; the retained older SVG's
separate license is not automatically attributed to this replacement.

## Historical first-party asset investigation (superseded selection)

The founder subsequently requested first-party logo reuse for identification
despite not holding separate provider permissions. Corporate assets below are
**first-party identification artwork, not licensed/approved partnerships**.
Exact downloaded URLs, conversion details and residual permission uncertainty
are recorded in `frontend/public/brands/NOTICE.md`. No legal conclusion about
nominative use is made here. Explicit logo-copy restrictions still use fallbacks.

Arbor's existing approved mark is unchanged. The decorative Home landscape is
an original geometric illustration, not a trademark or a financial chart.

| Identity | Local treatment | Source / outstanding action |
| --- | --- | --- |
| Bitcoin | Locally stored supplied SVG | [Bitcoin Design symbol download](https://bitcoin.design/guide/getting-started/visual-language/); artwork unchanged, credited to Bitcoin Design / bitboy. [Project license](https://bitcoin.design/LICENSE) permits asset images under CC BY 4.0. Attribution appears in Settings → Help & disclosures and the distributed `public/identities/NOTICE.md`. Bitcoin has no central company issuing an “official” logo. |
| Vanguard | VG typographic tile + full Vanguard name | [Vanguard terms](https://investor.vanguard.com/terms-conditions) require permission for logo reproduction. Obtain approved asset/permission before replacing the fallback. |
| ATRAM | Official website icon, local lossless WebP + full fund name | [ATRAM](https://www.atram.com.ph/) links the source storage image in its public HTML. [Agreement](https://openfinance.atram.com.ph/agreements) retains IP ownership; no open license claimed. |
| BPI Wealth | Unchanged BPI official header SVG + full fund name | [BPI official site](https://www.bpi.com.ph/). Identity only; no general reuse grant established. |
| GFunds / GCrypto | Shared official GCash website icon + GFunds / GCrypto text | [GCash terms](https://gcash.com/terms-and-conditions). Product names remain simplified; no merchant acceptance, integration or partnership claim. No separate permission established. |
| Gotrade | Official website app icon + Gotrade | [Gotrade legal](https://www.heygotrade.com/legal/); its service license is not a trademark license. Identification use per founder instruction, not a claim of permission. |
| DragonFi | Official website icon + DragonFi | [DragonFi](https://www.dragonfi.ph/) and [contact](https://www.dragonfi.ph/contact-us). No reuse grant established; media@dragonfi.ph is a published inquiry channel, not contacted. |
| Coins.ph | CP text tile + Coins.ph | [Coins.ph legal](https://www.coins.ph/en-ph/legal) section 11 restricts copying/publishing IP. [Press](https://www.coins.ph/en-ph/press) provides press@coins.ph but no applicable grant; not contacted. |
| PDAX | PDAX text tile + PDAX | [PDAX terms](https://pdax.ph/rule/terms-and-conditions/) restrict use without written consent; obtain approval first. |

These are asset-selection decisions, not legal conclusions about nominative use.
No company logos were copied from image search, guessed, redrawn or hotlinked.
Vanguard, Coins.ph and PDAX were permission-dependent fallbacks in that pass;
the later owner-supplied originals above supersede that asset selection.
Names remain visible even if an image fails; the shared component switches to
its text fallback on image error. Metadata supports accessible names and optional
Light/Dark variants; current marks use neutral containers rather than recoloring.
Future approved replacements only require central metadata/local files.

Catalogue filters All / Funds / ETFs / Bitcoin intersect with both search and
the authenticated API's returned supported products. They do not introduce assets.

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
