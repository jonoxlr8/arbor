"""Authorized daily TOAP NAVPU pages only; no fund-detail/history retrieval."""
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from html.parser import HTMLParser

import httpx

from .models import (FUND_CLASSES, TOAP_FUNDS, TOAP_PAGES, MarketDataError,
                     ReferencePrice, normalized_name, normalized_value, toap_source)


@dataclass
class NAVBatch:
    prices: list[ReferencePrice]
    errors: dict[str, str]


class TOAPRequestGate:
    """One CLI's two page reads respect the source's documented 60s crawl delay."""
    def __init__(self, clock=time.monotonic, sleep=time.sleep):
        self.clock, self.sleep, self.last = clock, sleep, None

    def wait(self):
        if self.last is not None:
            self.sleep(max(0, 60 - (self.clock() - self.last)))
        self.last = self.clock()


class NAVPage(HTMLParser):
    """Read cells only in tables with the expected Fund Name / NAVpu columns."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self.rows = []
        self.headings = []
        self.heading = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.tables.append({"valid": False, "row": None, "cell": None})
        elif self.tables:
            table = self.tables[-1]
            if tag == "tr":
                table["row"], table["cell"] = [], None
            elif tag in ("td", "th") and table["row"] is not None:
                table["cell"] = []
            elif tag == "br" and table["cell"] is not None:
                table["cell"].append(" ")
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.heading = []

    def handle_data(self, data):
        if self.tables and self.tables[-1]["cell"] is not None:
            self.tables[-1]["cell"].append(data)
        if self.heading is not None:
            self.heading.append(data)

    def handle_endtag(self, tag):
        if self.tables:
            table = self.tables[-1]
            if tag in ("td", "th") and table["cell"] is not None:
                table["row"].append(" ".join("".join(table["cell"]).split()))
                table["cell"] = None
            elif tag == "tr" and table["row"] is not None:
                row = table["row"]
                if [normalized_name(c) for c in row[:2]] == ["fund name", "navpu"]:
                    table["valid"] = True
                elif table["valid"]:
                    self.rows.append(row)
                table["row"], table["cell"] = None, None
            elif tag == "table":
                self.tables.pop()
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6") and self.heading is not None:
            self.headings.append(" ".join("".join(self.heading).split()))
            self.heading = None


def effective_date(text):
    # English source dates, independent of the process locale. No fetch-date fallback.
    match = re.fullmatch(r"([A-Za-z]{3}) (\d{1,2}), (\d{4})", text)
    if not match:
        raise ValueError("Invalid source date")
    month, day, year = match.groups()
    months = "jan feb mar apr may jun jul aug sep oct nov dec".split()
    return datetime(int(year), months.index(month.lower()) + 1, int(day), tzinfo=timezone.utc)


def parse_nav_page(html, source, now):
    page = NAVPage()
    page.feed(html)
    page.close()
    dates = set()
    for heading in page.headings:
        match = re.fullmatch(r"Unit Investment Trust Funds - Net Asset Values per unit \(UITF NAVpus\) as of (.+)", heading, re.I)
        if match:
            dates.add(match.group(1))
    page_date = next(iter(dates)) if len(dates) == 1 else None
    prices, errors = [], {}
    for product, name in TOAP_FUNDS.items():
        if toap_source(product) != source:
            continue
        matches = [r for r in page.rows if r and normalized_name(r[0]) == normalized_name(name)]
        if len(matches) != 1:
            errors[product] = "missing_fund" if not matches else "ambiguous_fund"
            continue
        try:
            row = matches[0]
            # Read NAV cell only, never ROI/YTD columns. A malformed row-specific date
            # must fail closed rather than silently falling back to the heading date.
            match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?|[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?)(?:\s*\*?\s*as of\s+(.+))?", row[1], re.I)
            if not match:
                raise ValueError("Invalid NAV cell")
            value, row_date = match.groups()
            as_of = effective_date(row_date or page_date or "")
            prices.append(ReferencePrice(price_key=product,
                value=normalized_value(value.replace(",", "")), as_of=as_of, fetched_at=now,
                currency="PHP", kind="nav", source="toap", unit_class=FUND_CLASSES[product],
                provenance=TOAP_PAGES[source], reference_id=row[0]))
        except (ValueError, ArithmeticError, IndexError):
            errors[product] = "invalid_nav_or_date"
    return NAVBatch(prices, errors)


class TOAP:
    interval = 86400

    def __init__(self, client, source, enabled=True, gate=None):
        if source not in TOAP_PAGES:
            raise ValueError("Unsupported TOAP source")
        self.client, self.source, self.enabled = client, source, enabled
        self.gate = gate or TOAPRequestGate()
        self.keys = tuple(p for p in TOAP_FUNDS if toap_source(p) == source)

    def cache_is_current(self, price, now):
        # Calendar-day cadence avoids skipping alternate runs due to cron jitter.
        philippines = timezone(timedelta(hours=8))
        return price.fetched_at <= now and price.fetched_at.astimezone(philippines).date() == now.astimezone(philippines).date()

    def fetch(self, now, previous=None):
        if not self.enabled:
            raise MarketDataError("disabled_by_config")
        url = TOAP_PAGES[self.source]
        try:
            self.gate.wait()
            # Stream with a hard size limit; no redirects, retries, dynamic URLs or
            # inherited authorization/cookies from the privileged cache client.
            request = httpx.Request("GET", url, headers={
                "User-Agent": "Arbor/1.0 (+https://arbor.ph; daily NAVPU tracking)",
                "Accept": "text/html"}, extensions={"timeout": {k: 10 for k in ("connect", "read", "write", "pool")}})
            response = self.client.send(request, stream=True, auth=None, follow_redirects=False)
            try:
                if response.status_code == 429:
                    raise MarketDataError("rate_limited")
                if response.status_code != 200 or str(response.url) != url:
                    raise MarketDataError("provider_unavailable")
                if response.headers.get("content-type", "").split(";")[0].strip().lower() != "text/html":
                    raise MarketDataError("invalid_response")
                content = bytearray()
                for chunk in response.iter_bytes():
                    content.extend(chunk)
                    if len(content) > 2_000_000:
                        raise MarketDataError("invalid_response")
                html = content.decode("utf-8-sig")
            finally:
                response.close()
            return parse_nav_page(html, self.source, now)
        except (httpx.HTTPError, UnicodeError):
            raise MarketDataError("provider_unavailable_or_invalid") from None
