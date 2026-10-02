"""Named instrument education; reviewed facts never change execution policy."""
from dataclasses import dataclass
import re

from app.services.implementation.products import PRODUCTS


@dataclass(frozen=True)
class InstrumentQuestion:
    product_ids: tuple[str, ...]
    topic: str
    needs_plan: bool = False
    clarification: str | None = None


SUPPORTED_IDS = (
    'gcash_global_equity', 'gcash_technology', 'gcash_defensive',
    'dragonfi_global_equity', 'dragonfi_technology', 'dragonfi_defensive',
    'gotrade_vt', 'gotrade_vgt', 'gotrade_bnd',
    'gcrypto_btc', 'coins_btc', 'pdax_btc',
)
ALIASES = {
    'gcash_global_equity': ('ATRAM Global Equity Opportunity Feeder Fund', 'ATRAM global equity', 'Global Equity Opportunity Feeder Fund', 'ATRAM Global Equity Opportunity', 'GFunds global equity', 'GCash global equity'),
    'gcash_technology': ('ATRAM Global Technology Feeder Fund', 'ATRAM global technology', 'ATRAM technology', 'GFunds technology', 'GCash technology'),
    'gcash_defensive': ('ATRAM Medium Term Peso Bond Fund', 'ATRAM medium term peso bond', 'GFunds peso bond', 'GCash peso bond'),
    'dragonfi_global_equity': ('BPI Global Equity Fund of Funds', 'BPI Global Equity Fund-of-Funds', 'BPI global equity', 'DragonFi global equity'),
    'dragonfi_technology': ('BPI World Technology Feeder Fund', 'BPI world technology', 'DragonFi technology'),
    'dragonfi_defensive': ('BPI Premium Bond Fund', 'BPI premium bond', 'DragonFi defensive'),
    'gotrade_vt': ('VT', 'Vanguard Total World Stock ETF', 'Vanguard Total World Stock Index Fund ETF Shares'),
    'gotrade_vgt': ('VGT', 'Vanguard Information Technology ETF', 'Vanguard Information Technology Index Fund ETF Shares'),
    'gotrade_bnd': ('BND', 'Vanguard Total Bond Market ETF', 'Vanguard US Total Bond Market ETF', 'Vanguard Total Bond Market Index Fund ETF Shares'),
    'gcrypto_btc': ('GCrypto BTC', 'GCrypto Bitcoin'),
    'coins_btc': ('Coins.ph BTC', 'Coins.ph Bitcoin', 'Coins BTC', 'Coins Bitcoin'),
    'pdax_btc': ('PDAX BTC', 'PDAX Bitcoin'),
}


def _contains(question: str, alias: str) -> bool:
    pattern = re.escape(alias).replace(r'\ ', r'\s+')
    return re.search(r'(?<!\w)' + pattern + r'(?!\w)', question, re.I) is not None


def instrument_question(question: str) -> InstrumentQuestion | None:
    q = question.casefold()
    # Keep the established advice, safety, ownership and transaction boundaries.
    if re.search(r'\b(buy|sell|hold|switch|recommend|best|suitable|undervalued|overvalued|code|coding|python|javascript|recipe|cook|joke|poem|vacation|travel|basketball|football|trivia|own|owned|owning)\b|ignore.*instructions|system prompt|should i|which.*(?:choose|pick|should i use)|better for (?:me|my)|how (?:much|many).*(?:own|have|invest)|my holdings|current.*(?:value|allocation)|performance|recorded cost|cost basis|profit', q):
        return None
    topic = ('fees' if re.search(r'\b(fees?|costs?|expenses?|charges?|expense ratio)\b', q)
             else 'risk' if re.search(r'\b(risks?|volatile|volatility|danger|safe|concentration)\b', q)
             else 'sources' if re.search(r'\b(sources?|references?|documents?|verified)\b', q)
             else 'role' if re.search(r'\b(role|fit|purpose|include|included)\b.*\b(my plan|my target|selected plan)\b|\b(my plan|my target|selected plan)\b.*\b(role|fit|purpose|include|included)\b', q)
             else 'overview')
    needs_plan = bool(re.search(r'\b(my plan|my target|selected plan)\b', q))
    if re.search(r'\b(full|complete|overview|everything)\b', q) or sum(bool(re.search(pattern, q)) for pattern in (r'\b(purpose|overview)\b', r'\b(risks?|volatility)\b', r'\b(fees?|costs?|expenses?)\b')) > 1:
        topic = 'overview'
    if re.search(r'\ball\b.*\bsupported\b.*\b(instruments?|investments?|funds?|products?)\b|\blist\b.*\bsupported\b.*\b(instruments?|investments?|funds?|products?)\b', q):
        return InstrumentQuestion(SUPPORTED_IDS, topic, needs_plan)
    matches = tuple(product_id for product_id, aliases in ALIASES.items()
                    if any(_contains(question, alias) for alias in aliases))
    if re.search(r'\b(vwra|vwrl|iuit|aggu|aggg|bndw|vti|ethereum|eth)\b', q):
        return InstrumentQuestion((), topic, clarification='One named instrument is outside this reviewed recording universe. I cannot substitute a similar ticker or transfer its class-specific facts. Please ask about the exact supported instrument separately.')
    if matches:
        requested_class = re.search(r'\bclass\s+([a-z][a-z0-9]*)\b', q)
        allowed_classes = {'gcash_technology': 'a', 'gcash_defensive': 'a', 'dragonfi_global_equity': 'p', 'dragonfi_technology': 'p'}
        class_mismatch = requested_class and any(allowed_classes.get(p) != requested_class.group(1) for p in matches)
        wrong_class = re.search(r'\b(class\s+[bcdz]|ucits)\b', q)
        php_mismatch = re.search(r'\b(usd|dollar)\b', q) and any(p.startswith(('gcash_', 'dragonfi_')) for p in matches)
        bpi_mismatch = re.search(r'\bclass\s+a\b', q) and any(p in ('dragonfi_global_equity', 'dragonfi_technology') for p in matches)
        if class_mismatch or wrong_class or php_mismatch or bpi_mismatch:
            return InstrumentQuestion((), topic, clarification='The reviewed local fund records cover their specified PHP class; VT, VGT and BND are US-listed ETF shares. I cannot transfer facts or fees to a different share class or UCITS fund. Please name the exact supported class or ticker.')
        return InstrumentQuestion(matches, topic, needs_plan)
    if re.search(r'\b(vwra|vwrl|iuit|aggu|aggg|bndw|vti|ethereum|eth)\b', q):
        return InstrumentQuestion((), topic, clarification='That instrument is outside this reviewed recording-universe explanation. I will not substitute a similarly named fund, ETF class or Bitcoin. Please use the exact supported name or ticker.')
    if re.search(r'\b(atram|bpi|gfunds|dragonfi)\b', q):
        candidates = tuple(p for p in SUPPORTED_IDS if
                           PRODUCTS[p].provider.casefold() in q or PRODUCTS[p].platform.casefold() in q or ('gcash_' in p and 'gfunds' in q))
        names = '; '.join(PRODUCTS[p].display_name for p in candidates)
        return InstrumentQuestion((), topic, clarification='Please name the fund: ' + names + '. Their purposes, risks and charges differ.')
    if re.search(r'\b(bitcoin|btc)\b', q) and topic in ('fees', 'risk', 'sources', 'role'):
        return InstrumentQuestion(('gcrypto_btc', 'coins_btc', 'pdax_btc'), topic, needs_plan)
    return None


def explain_instruments(match: InstrumentQuestion, *, context=None, brief: bool = False) -> str:
    """Render static facts and, when requested, an authenticated canonical plan role."""
    from .instrument_facts import INSTRUMENTS, PROVIDERS, PRODUCT_FACTS
    from app.services.strategy_v2 import AssetRole

    if match.clarification:
        return match.clarification
    labels = {'global_equity': 'Global Equity', 'technology_tilt': 'Technology',
              'defensive': 'Defensive', 'crypto': 'Bitcoin'}
    sections = []
    for product_id in match.product_ids:
        product = PRODUCTS[product_id]
        instrument_id, provider_id = PRODUCT_FACTS[product_id]
        facts, provider = INSTRUMENTS[instrument_id], PROVIDERS[provider_id]
        title = f'{product.display_name}: {labels[product.sleeve]} catalog sleeve — {facts.name}; {facts.share_class}; through {product.platform}.'
        lines = [title]
        if match.topic in ('overview', 'role'):
            lines.append('Purpose: ' + (facts.purpose.split('. ')[0] + '.' if brief else facts.purpose))
        if match.topic in ('overview', 'risk'):
            lines.append('Risks: ' + facts.risks)
        if match.topic in ('overview', 'fees'):
            fee = (f'{facts.annual_fee_pct}% p.a. ({facts.fee_status})' if facts.annual_fee_pct is not None
                   else 'Not applicable' if facts.fee_status == 'not_applicable'
                   else 'Unconfirmed — published sources conflict')
            lines.append(f'{facts.fee_label}: {fee}. {facts.fee_notes}')
            lines.append(f'{product.platform} costs: {provider.charges}')
        if context is not None:
            role = AssetRole(product.sleeve)
            weight = context.target.weight(role) if context.target else None
            choice = context.implementation_choices.get(role)
            if weight is None:
                lines.append('Your saved plan: short-term path; no active long-term sleeve target. No active choice or ownership is inferred.')
            else:
                lines.append(f'Your saved plan: {labels[product.sleeve]} has an actual saved target of {weight}%. This is a plan target, not evidence that you own this investment.')
                if weight == 0:
                    lines.append('This sleeve is not included in your active target allocation; a dormant choice does not activate it.')
                elif choice == product_id:
                    lines.append(f'You explicitly selected {product.display_name} as the implementation for this sleeve. That selection is not a recorded purchase or holding.')
                elif choice:
                    chosen = PRODUCTS.get(choice)
                    lines.append('Your saved implementation for this sleeve is ' + (chosen.display_name if chosen else 'a different product') + '; this named investment is not that saved choice.')
                else:
                    lines.append('No implementation product choice is saved in your plan yet for this sleeve. You choose in Portfolio → Ways to invest; Arbor does not rank providers.')
        elif match.needs_plan:
            lines.append('Create or restore your Arbor plan to explain its saved target and chosen implementation. I will not invent a plan role or ownership.')
        sources = tuple(dict.fromkeys(facts.sources + provider.sources))
        lines.append('Sources: ' + '; '.join(f'[{s.title}]({s.url}) (document: {s.document_date}; evidence: {s.evidence})' for s in sources))
        lines.append(f'Reviewed {facts.reviewed_on}; document dates above differ from retrieval dates. Confirm current class, charges and account quote in official materials.')
        sections.append('\n'.join(lines))
    if len(match.product_ids) > 1 and all(p.endswith('_btc') for p in match.product_ids):
        sections.insert(0, 'These three choices hold the same Bitcoin asset; provider and custody differences do not create asset diversification.')
    return '\n\n'.join(sections) + '\n\nThese are educational facts, not a suitability assessment or an instruction to trade. They do not change Arbor\'s execution minimums, saved targets or return/accounting calculations.'
