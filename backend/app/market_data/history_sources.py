"""Read-only, fixed-host historical source clients; no current-price behavior here."""
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from io import BytesIO
import re
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

from .adapters import BTC_UUID, timestamp
from .models import ETF_SYMBOLS, MarketDataError, normalized_value

BSP_DAILY_URL = "https://www.bsp.gov.ph/statistics/external/day99_data.aspx"
BSP_ARCHIVE_URL = "https://www.bsp.gov.ph/statistics/external/pesodollar.xlsx"
MARKETSTACK_EOD_URL = "https://api.marketstack.com/v2/eod"
COINRANKING_HISTORY_URL = f"https://api.coinranking.com/v2/coin/{BTC_UUID}/price-history"


@dataclass(frozen=True)
class HistoricalObservation:
    price_key: str
    observed_at: datetime
    value: Decimal
    source: str
    currency: str
    provenance: str
    fetched_at: datetime
    kind: str | None = None
    unit_class: str | None = None
    reference_id: str | None = None

    def payload(self):
        return {"price_key": self.price_key, "observed_at": self.observed_at.isoformat(),
                "observation_date": self.observed_at.date().isoformat(), "value": str(self.value),
                "source": self.source, "currency": self.currency,
                "provenance": self.provenance, "fetched_at": self.fetched_at.isoformat(),
                "kind": self.kind, "unit_class": self.unit_class,
                "reference_id": self.reference_id}


class MarketstackHistory:
    """A dated EOD listing; every returned symbol/date must validate independently."""

    def __init__(self, http, key):
        self.http, self.key = http, key

    def fetch(self, start: date, end: date, now: datetime):
        if not self.key or start > end or end > now.date():
            raise MarketDataError("historical_request_invalid")
        offset, total, result = 0, None, {}
        while total is None or offset < total:
            body = self.http.get(MARKETSTACK_EOD_URL, params={"access_key": self.key,
                "symbols": ",".join(ETF_SYMBOLS), "date_from": start.isoformat(),
                "date_to": end.isoformat(), "limit": 100, "offset": offset})
            try:
                pagination, rows = body["pagination"], body["data"]
                if not isinstance(rows, list) or not isinstance(pagination, dict):
                    raise ValueError()
                if pagination["offset"] != offset or pagination["limit"] != 100 or pagination["count"] != len(rows):
                    raise ValueError()
                if not isinstance(pagination["total"], int) or pagination["total"] < 0 or pagination["total"] > 10000:
                    raise ValueError()
                if total is not None and total != pagination["total"]:
                    raise ValueError()
                total = pagination["total"]
                if not rows and offset < total:
                    raise ValueError()
                for row in rows:
                    symbol = row["symbol"]
                    observed_at = timestamp(row["date"])
                    if (symbol not in ETF_SYMBOLS or row.get("price_currency", "USD").upper() != "USD"
                            or not start <= observed_at.date() <= end or observed_at > now):
                        raise ValueError()
                    value = normalized_value(row["close"])
                    identity = (ETF_SYMBOLS[symbol], observed_at)
                    if identity in result and result[identity].value != value:
                        raise ValueError()
                    result[identity] = HistoricalObservation(identity[0], observed_at, value,
                        "marketstack", "USD", MARKETSTACK_EOD_URL, now)
                offset += len(rows)
                if len(rows) == 0 or offset > total:
                    break
            except (KeyError, ValueError, TypeError, AttributeError, ArithmeticError):
                raise MarketDataError("invalid_historical_marketstack_response") from None
        return list(result.values())


class _BSPTable(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.row, self.cell = [], None, None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None:
            self.row.append("".join(self.cell).strip())
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def parse_bsp_daily(html: str, now: datetime):
    """Parse only BSP's published daily PHP/USD matrix, not monthly averages."""
    if len(html) > 2_000_000:
        raise MarketDataError("invalid_bsp_response")
    table = _BSPTable()
    table.feed(html)
    headers = [row for row in table.rows if len(row) >= 5 and row[1] == "Date"
               and all(re.fullmatch(r"[A-Z][a-z]{2}-\d{2}", cell) for cell in row[3:-1])]
    if len(headers) != 1:
        raise MarketDataError("invalid_bsp_response")
    header = headers[0]
    months = [datetime.strptime(cell, "%b-%y").date() for cell in header[3:-1]]
    if len(months) < 2 or len(set(months)) != len(months):
        raise MarketDataError("invalid_bsp_response")
    result = {}
    for row in table.rows:
        if len(row) != len(header) or not row[1].isdigit():
            continue
        day_number = int(row[1])
        if not 1 <= day_number <= 31:
            raise MarketDataError("invalid_bsp_response")
        for month, raw in zip(months, row[3:-1], strict=True):
            if not raw:
                continue
            if not re.fullmatch(r"\d{1,3}(?:\.\d{1,12})?", raw):
                raise MarketDataError("invalid_bsp_response")
            try:
                day = date(month.year, month.month, day_number)
                value = normalized_value(raw)
            except (ValueError, ArithmeticError):
                raise MarketDataError("invalid_bsp_response") from None
            if day > now.date() or day in result:
                raise MarketDataError("invalid_bsp_response")
            observed_at = datetime.combine(day, time(), timezone.utc)
            result[day] = HistoricalObservation("usd_php", observed_at, value,
                "bsp", "PHP", BSP_DAILY_URL, now)
    if not result:
        raise MarketDataError("invalid_bsp_response")
    return list(result.values())


def parse_bsp_archive(content: bytes, now: datetime):
    """Read BSP's official daily archive, retaining only actually published dates.

    XLSX numeric cells may serialize a displayed 61.5390 as
    61.539000000000001. The archive formats these rates to at most four
    decimal places; reject a materially different value instead of silently
    rounding an unexpected source schema.
    """
    if len(content) > 1_000_000:
        raise MarketDataError("invalid_bsp_archive")
    namespace = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    try:
        with ZipFile(BytesIO(content)) as archive:
            for name, maximum in (("xl/sharedStrings.xml", 100_000),
                                  ("xl/worksheets/sheet3.xml", 8_000_000)):
                if archive.getinfo(name).file_size > maximum:
                    raise ValueError()
            strings_xml = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            sheet_xml = ElementTree.fromstring(archive.read("xl/worksheets/sheet3.xml"))
        strings = ["".join(text.text or "" for text in item.findall(".//x:t", namespace))
                   for item in strings_xml.findall("x:si", namespace)]

        def cells(row):
            return {re.match(r"[A-Z]+", cell.attrib["r"]).group(): cell
                    for cell in row.findall("x:c", namespace)}

        def value(cell):
            if cell is None:
                return None
            raw = cell.findtext("x:v", namespaces=namespace)
            if raw is None:
                return None
            return strings[int(raw)] if cell.attrib.get("t") == "s" else raw

        rows = {int(row.attrib["r"]): cells(row)
                for row in sheet_xml.findall(".//x:sheetData/x:row", namespace)}
        if (value(rows[1].get("A")) != "Philippine Peso per US Dollar Rate"
                or value(rows[2].get("A")) != "Frequency: Daily"):
            raise ValueError()
        months = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug",
                  "Sep", "Oct", "Nov", "Dec")
        result, years = {}, set()
        for row_number, row in rows.items():
            year_text = value(row.get("A"))
            if not year_text or not re.fullmatch(r"(?:19|20)\d{2}", year_text):
                continue
            year = int(year_text)
            if year in years:
                raise ValueError()
            years.add(year)
            heading = rows[row_number + 1]
            if value(heading.get("A")) != "Day" or any(
                value(heading.get(chr(ord("B") + month_index))) != month
                for month_index, month in enumerate(months)
            ):
                raise ValueError()
            for day_number in range(1, 32):
                daily = rows[row_number + 1 + day_number]
                if value(daily.get("A")) != str(day_number):
                    raise ValueError()
                for month_index in range(1, 13):
                    raw = value(daily.get(chr(ord("A") + month_index)))
                    if raw in (None, "", "..", "...", "…"):
                        continue
                    if not re.fullmatch(r"\d{1,3}(?:\.\d{1,16})?", raw):
                        raise ValueError()
                    day = date(year, month_index, day_number)
                    exact = Decimal(raw)
                    published = exact.quantize(Decimal("0.0001"))
                    if abs(exact - published) > Decimal("0.0000001"):
                        raise ValueError()
                    rate = normalized_value(published)
                    if day in result:
                        raise ValueError()
                    # BSP's Philippine publication day can begin before the
                    # corresponding UTC date. Never import a future UTC day,
                    # but do not reject the entire older archive for it.
                    if day > now.date():
                        continue
                    observed_at = datetime.combine(day, time(), timezone.utc)
                    result[day] = HistoricalObservation("usd_php", observed_at, rate,
                        "bsp", "PHP", BSP_ARCHIVE_URL, now)
        if not result or not years:
            raise ValueError()
        return list(result.values())
    except (BadZipFile, KeyError, IndexError, ValueError, TypeError, AttributeError,
            InvalidOperation, ArithmeticError, ElementTree.ParseError):
        raise MarketDataError("invalid_bsp_archive") from None


class BSPHistory:
    def __init__(self, http):
        self.http = http

    def fetch(self, start: date, end: date, now: datetime):
        if start > end or end > now.date():
            raise MarketDataError("historical_request_invalid")
        # The rolling HTML matrix omits earlier years; BSP's daily archive is
        # the same official series with the full historical range.
        response = self.http.get(BSP_ARCHIVE_URL, timeout=20, follow_redirects=False)
        if response.status_code != 200 or len(response.content) > 1_000_000:
            raise MarketDataError("bsp_unavailable")
        return [item for item in parse_bsp_archive(response.content, now)
                if start <= item.observed_at.date() <= end]


class CoinrankingHistory:
    def __init__(self, http, key):
        self.http, self.key = http, key

    def fetch(self, reference_uuid: str, start: date, end: date, now: datetime):
        if (not self.key or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", reference_uuid)
                or start > end or end > now.date() or (now.date()-start).days > 365):
            raise MarketDataError("historical_request_invalid")
        body = self.http.get(COINRANKING_HISTORY_URL,
            params={"referenceCurrencyUuid": reference_uuid, "timePeriod": "1y"},
            headers={"x-access-token": self.key})
        try:
            if body["status"] != "success" or not isinstance(body["data"]["history"], list):
                raise ValueError()
            # Keep one real, latest at-or-before observation for each UTC day.
            # Sparse vendor history remains sparse; no fabricated daily quotes.
            result = {}
            for row in body["data"]["history"]:
                observed_at = timestamp(row["timestamp"])
                if not start <= observed_at.date() <= end or observed_at > now:
                    continue
                value = normalized_value(row["price"])
                day = observed_at.date()
                if day not in result or observed_at > result[day].observed_at:
                    result[day] = HistoricalObservation("btc_php", observed_at, value,
                        "coinranking", "PHP", COINRANKING_HISTORY_URL, now)
            return list(result.values())
        except (KeyError, ValueError, TypeError, AttributeError, ArithmeticError):
            raise MarketDataError("invalid_historical_coinranking_response") from None
