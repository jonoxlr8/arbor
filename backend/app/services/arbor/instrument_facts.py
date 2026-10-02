"""Public-source education reviewed 2026-10-01, separate from execution policy.

These documents are not live account quotes. Retrieval dates are not fee-effective
 dates. Unknown/conflicting charges never become zero or projection deductions.
"""
from dataclasses import dataclass
from types import MappingProxyType


@dataclass(frozen=True)
class Source:
    title: str
    url: str
    document_date: str
    evidence: str = 'reviewed_primary'


@dataclass(frozen=True)
class InstrumentFacts:
    name: str
    share_class: str
    purpose: str
    risks: str
    fee_label: str
    annual_fee_pct: str | None
    fee_status: str
    fee_notes: str
    sources: tuple[Source, ...]
    review_status: str = 'reviewed_with_documented_uncertainties'
    reviewed_on: str = '2026-10-01'


@dataclass(frozen=True)
class ProviderFacts:
    charges: str
    sources: tuple[Source, ...]


GCASH_FEES = Source('GCash GFunds fees', 'https://help.gcash.com/hc/en-us/articles/30841717008025-GFunds-fees', 'Undated')
BPI_ROOT = 'https://www.bpi.com.ph/group/bpiwealth/our-solutions/personal/investment-solutions/funds/'
BPI_PDF = 'https://www.bpi.com.ph/content/dam/bpi-wealth/investment-funds-pdfs/2026/'
LAYERS = 'Underlying-fund charges and other fund expenses can also apply; a verified all-in annual cost is unavailable. Do not add these costs again to a valuation already reflected in NAV/NAVPU.'
FUND_COSTS = 'Other custody, accounting and audit expenses can also apply; a verified all-in annual cost is unavailable. Do not deduct NAV-embedded expenses again from NAV/NAVPU.'

INSTRUMENTS = MappingProxyType({
    'atram_equity': InstrumentFacts(
        'ATRAM Global Equity Opportunity Feeder Fund', 'PHP Unit Class',
        'Primarily invests in Allianz Thematica, an actively managed global thematic equity strategy across developed and emerging markets. It is not a broad-market index equivalent.',
        'Equity, theme and sector concentration, emerging-market and smaller-company exposure, foreign exchange, liquidity, counterparty and derivatives risks. Diversification does not prevent losses.',
        'Annual trust fee', None, 'conflicting',
        'GCash lists 1.20% p.a.; the exact PHP-class TOAP listing shows 1.50% p.a. The current applicable rate is unconfirmed, not zero. ' + LAYERS,
        (Source('ATRAM equity KIIDS', 'https://file.seedbox.ph/ATRAM_GLOBAL_EQUITY_OPPORTUNITY_FEEDER_FUND_KIIDS.pdf', '2026-05-29'),
         Source('TOAP exact PHP class', 'https://www.uitf.com.ph/daily_navpu_details.php?fund_id=420', 'Undated'), GCASH_FEES)),
    'atram_technology': InstrumentFacts(
        'ATRAM Global Technology Feeder Fund', 'A PHP Unit Class',
        'Primarily invests in Fidelity Funds Global Technology Fund, covering companies worldwide that develop or benefit from technology, beyond a narrow information-technology sector definition.',
        'Technology concentration, equity, foreign and emerging-market, liquidity, counterparty and currency risks. The KIIDS explicitly describes unhedged foreign currencies. Holdings may overlap with global equity funds.',
        'Annual trust fee', None, 'conflicting',
        'GCash lists 1.15% p.a.; the exact A PHP-class TOAP listing shows 1.50% p.a. The current applicable rate is unconfirmed, not zero. ' + LAYERS,
        (Source('ATRAM technology KIIDS', 'https://file.seedbox.ph/ATRAM%20GLOBAL%20TECHNOLOGY%20FEEDER%20FUND%20KIIDS.pdf', '2026-05-29'),
         Source('TOAP exact A PHP class', 'https://uitf.com.ph/daily_navpu_details.php?bank_id=31&fund_id=327', 'Undated'), GCASH_FEES)),
    'atram_bond': InstrumentFacts(
        'ATRAM Medium Term Peso Bond Fund', 'A Unit Class, PHP',
        'Actively seeks income and capital appreciation primarily through Philippine government bonds; investment-grade Philippine corporate debt is also permitted.',
        'Interest-rate, credit/default, liquidity, reinvestment and counterparty risks. The issuer labels its risk Moderate; principal is not guaranteed.',
        'Annual trust fee', '1.00', 'corroborated', FUND_COSTS,
        (Source('ATRAM bond KIIDS (current document despite older filename)', 'https://file.seedbox.ph/ATRAM_Total_Return_Peso_Bond_Fund_KIIDS_Sept_2020.pdf', '2026-05-29'),
         Source('TOAP exact A PHP class', 'https://uitf.com.ph/daily_navpu_details.php?bank_id=31&fund_id=240', 'Undated'), GCASH_FEES)),
    'bpi_equity': InstrumentFacts(
        'BPI Global Equity Fund-of-Funds', 'Class P, PHP',
        'Actively invests in multiple global equity funds across developed and emerging markets. The reviewed PHP Class P is distinct from USD Class A and BPI Global Sustainable Equity.',
        'Equity, currency and liquidity risks; no principal guarantee. The Class P document explicitly describes unhedged foreign exchange exposure.',
        'Annual trust fee', '1.50', 'published', 'Trust fee is embedded in NAV; no early-redemption penalty is published. ' + LAYERS,
        (Source('BPI Global Equity official fund page', BPI_ROOT+'global-equity-fund-of-funds', 'Class P introduced 2026-06-01'),
         Source('BPI Global Equity KIIDS', BPI_PDF+'bpi-global-equity-fund-of-funds/BPI%20Global%20Equity%20Fund-of-Funds%20USD%20and%20PHP%20-%20August%202026_2.pdf', '2026-08-28'))),
    'bpi_technology': InstrumentFacts(
        'BPI World Technology Feeder Fund', 'Class P, PHP',
        'Provides global technology exposure through BlackRock World Technology Fund. BlackRock D2 USD identifies the target fund, not the investor\'s PHP Class P.',
        'Technology concentration, equity, country, liquidity and foreign exchange risks. A PHP denomination does not eliminate currency risk; Class P hedging status is unconfirmed.',
        'Annual trust fee', '1.50', 'published', 'No early-redemption penalty is published. ' + LAYERS,
        (Source('BPI World Technology official fund page', BPI_ROOT+'world-technology-feeder-fund', 'Undated'),
         Source('BPI World Technology reviewed KIIDS', BPI_PDF+'bpi-world-technology-feeder-fund-/BPI%20World%20Technology%20Feeder%20Fund%20July%202026%20-%20New%20Template_2.pdf', 'Cover 2026-07-31; footer 2026-06-30 differs; August link unavailable'))),
    'bpi_bond': InstrumentFacts(
        'BPI Premium Bond Fund', 'PHP; no invented Class P designation',
        'Actively seeks income and capital appreciation from peso Philippine government and corporate debt. Current benchmark: BPI Philippine Government Bond 1–5 Year Index.',
        'Interest-rate, default, liquidity and related-party conflict risks; no capital guarantee. Current issuer classification is Moderately Aggressive; older provider descriptions can differ.',
        'Annual trust fee', '1.50', 'published', 'Trust fee is embedded in NAV; no early-redemption penalty is published. ' + FUND_COSTS,
        (Source('BPI Premium Bond official fund page', BPI_ROOT+'premium-bond-fund', 'Undated'),
         Source('BPI Premium Bond KIIDS', BPI_PDF+'bpi-premium-bond-fund/BPI%20Premium%20Bond%20Fund%20-%20August%202026v2.pdf', '2026-08-28'))),
    'vt': InstrumentFacts(
        'VT — Vanguard Total World Stock Index Fund ETF Shares', 'US-listed ETF shares',
        'Tracks the FTSE Global All Cap Index: developed and emerging-market equities, including US and non-US large, mid and small companies.',
        'Equity, foreign/emerging-market, currency, company-size and tracking risks; trading spreads and premiums/discounts to NAV can occur.',
        'Annual fund expense ratio', '0.06', 'published', 'Fund expenses are reflected in NAV. Brokerage, currency conversion and trading spreads are separate; do not deduct the expense ratio again from an observed NAV.',
        (Source('Vanguard VT prospectus', 'https://www.vanguard.com/pub/Pdf/sp3141.pdf', '2026-02-27'),)),
    'vgt': InstrumentFacts(
        'VGT — Vanguard Information Technology Index Fund ETF Shares', 'US-listed ETF shares',
        'Tracks US information-technology companies, including software, hardware and semiconductors across company sizes. It is a sector fund, not the entire global technology economy.',
        'Concentrated technology and issuer exposure, obsolescence, competition, regulation, equity and ETF trading risks. A separate technology fund can overlap with global equity holdings.',
        'Annual fund expense ratio', '0.09', 'published', 'Fund expenses are reflected in NAV. Brokerage, currency conversion and trading spreads are separate; no second NAV deduction.',
        (Source('Vanguard VGT prospectus and supplement', 'https://www.vanguard.com/pub/Pdf/sp958.pdf', '2025-12-19; supplement 2026-06-30'),)),
    'bnd': InstrumentFacts(
        'BND — Vanguard Total Bond Market Index Fund ETF Shares', 'US-listed ETF shares',
        'Provides taxable investment-grade USD bond exposure including government, corporate, mortgage and asset-backed debt.',
        'Interest-rate, income, default, liquidity, prepayment/extension and tracking risks, plus ETF spreads. It is not cash or a guaranteed principal product; PHP investors also face currency exposure.',
        'Annual fund expense ratio', '0.03', 'published', 'Fund expenses are reflected in NAV. Brokerage, currency conversion and spreads are separate; no second NAV deduction.',
        (Source('Vanguard BND prospectus', 'https://www.vanguard.com/pub/Pdf/sp928.pdf', '2026-04-28'),)),
    'btc': InstrumentFacts(
        'Bitcoin (BTC)', 'Digital asset; no fund share class',
        'The digital asset of the decentralized Bitcoin network. Changing provider changes quotes, costs and custody, not the underlying asset. Holding BTC through several providers does not diversify into different assets.',
        'Sharp volatility and loss, provider custody/security/solvency and withdrawal risks. Self-custody adds private-key and backup risks. Transfers can be irreversible; scams and confirmation delays matter. GCrypto uses PDAX: those channels do not imply independent custody diversification.',
        'Fund expense ratio', None, 'not_applicable', 'A fund expense ratio does not apply to BTC; this does not mean zero trading, spread, custody, funding or withdrawal costs.',
        (Source('Bitcoin official FAQ', 'https://bitcoin.org/en/faq', 'Undated'),
         Source('Bitcoin risks and precautions', 'https://bitcoin.org/en/you-need-to-know', 'Undated'))),
})

PROVIDERS = MappingProxyType({
    'gfunds': ProviderFacts('GCash publishes no fund buy/sell transaction fee. Fund trust fees are reflected in NAVPU; this does not mean all costs are zero. Check current fund and account terms.', (GCASH_FEES,)),
    'dragonfi': ProviderFacts('An official indexed help article states no fund sales, redemption or provider investment fee. Its former URL is now unavailable; this evidence is indexed-only, not a confirmed current account quote. It does not establish funding, FX, withdrawal, stock or PERA costs.',
        (Source('DragonFi fund fees (indexed evidence; former page unavailable)', 'https://help.dragonfi.ph/hc/en-us/articles/59523909721497-What-Fees-Do-I-Pay-on-a-Fund', '2026-06-30 indexed', 'indexed_only'),)),
    'gotrade': ProviderFacts('Gotrade Global V17 lists trading fees of 0.15–0.30%, minimum USD 0.10; FX of 0.3–1% varies by country and is not a verified Philippines account quote. Local-currency withdrawal is USD 5 where available; USD withdrawal USD 50. Funding-method web/PDF terms conflict: verify in app. Pass-through charges can apply. Do not use separate Gotrade Indonesia terms or assume commission-free trading.',
        (Source('Gotrade Global fee page', 'https://www.heygotrade.com/en/fee/', 'Undated'), Source('Gotrade Global V17 fee schedule', 'https://www.heygotrade.com/legal/gotrade-fees.pdf', '2026-03'))),
    'gcrypto': ProviderFacts('GCrypto is a custodial GCash interface powered by PDAX. Buy/sell quotes include service/platform charges; a fixed percentage is unconfirmed. Free top-up/withdrawal claims do not establish free crypto sending or trading. Confirm executable quotes and network fees.',
        (Source('GCash GCrypto overview', 'https://help.gcash.com/hc/en-us/articles/47624429776025-What-is-GCrypto', 'Undated'), Source('GCrypto fees', 'https://help.gcash.com/hc/en-us/articles/22747167650201-GCrypto-fees', 'Undated'))),
    'coins': ProviderFacts('Coins Convert has no separate trading fee but a variable spread. The reviewed Spot Tier 0 table lists maker 0.10% and taker 0.15%; Convert and Spot are different services. Withdrawal/cash-out charges are separate; exact BTC withdrawal cost is unconfirmed. Custodial BTC is not a PDIC-insured bank deposit.',
        (Source('Coins fees', 'https://www.coins.ph/en-ph/fees', 'Undated'), Source('Coins Spot and Convert fees', 'https://support.coins.ph/hc/en-us/articles/41637276262553-Trading-Fees-for-Spot-Trade-and-Convert', '2025-10-21'), Source('Coins legal terms', 'https://www.coins.ph/en-ph/legal', '2026-04-16'))),
    'pdax': ProviderFacts('PDAX controls custodial private keys and permits pooled/third-party custody. Chart reference prices can differ from executable quotes. Current numeric trading and withdrawal charges are unconfirmed: verify the quote and current fee schedule in app.',
        (Source('PDAX user agreement', 'https://pdax.ph/user-agreement', '2025-10-17'), Source('PDAX chart versus trading quote', 'https://support.pdax.ph/support/solutions/articles/1060000152412-why-does-the-price-on-the-chart-differ-from-the-trading-screen-', 'Undated'))),
})

# Twelve recording choices, ten underlying instruments. No IBKR substitution.
PRODUCT_FACTS = MappingProxyType({
    'gcash_global_equity': ('atram_equity', 'gfunds'),
    'gcash_technology': ('atram_technology', 'gfunds'),
    'gcash_defensive': ('atram_bond', 'gfunds'),
    'dragonfi_global_equity': ('bpi_equity', 'dragonfi'),
    'dragonfi_technology': ('bpi_technology', 'dragonfi'),
    'dragonfi_defensive': ('bpi_bond', 'dragonfi'),
    'gotrade_vt': ('vt', 'gotrade'), 'gotrade_vgt': ('vgt', 'gotrade'), 'gotrade_bnd': ('bnd', 'gotrade'),
    'gcrypto_btc': ('btc', 'gcrypto'), 'coins_btc': ('btc', 'coins'), 'pdax_btc': ('btc', 'pdax'),
})
