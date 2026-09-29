"""Historical source contracts use fixed responses; no network or credentials."""
from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from zipfile import ZipFile
import pytest

from app.market_data.history_sources import (
    BSP_ARCHIVE_URL, BSPHistory, CoinrankingHistory, MarketstackHistory,
    parse_bsp_archive, parse_bsp_daily,
)
from app.market_data.models import MarketDataError

NOW = datetime(2026, 9, 29, 12, tzinfo=timezone.utc)


class Responses:
    def __init__(self, pages):
        self.pages = iter(pages)
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return next(self.pages)


def test_marketstack_pages_and_exact_usd_eod_identity():
    rows = [dict(symbol=s, date="2026-09-25T00:00:00+0000", close=v, price_currency="USD")
            for s, v in (("VT", "100.1234"), ("VGT", "200"), ("BND", "80"))]
    pages = [dict(pagination=dict(limit=100, offset=0, count=2, total=3), data=rows[:2]),
             dict(pagination=dict(limit=100, offset=2, count=1, total=3), data=rows[2:])]
    http = Responses(pages)
    result = MarketstackHistory(http, "configured-test-key").fetch(date(2026, 9, 25), date(2026, 9, 25), NOW)
    assert {item.price_key for item in result} == {"gotrade_vt", "gotrade_vgt", "gotrade_bnd"}
    assert result[0].value == Decimal("100.123400000000")
    assert all(item.observed_at.date() == date(2026, 9, 25) for item in result)
    assert [call[1]["params"]["offset"] for call in http.calls] == [0, 2]


@pytest.mark.parametrize("row", [
    dict(symbol="QQQM", date="2026-09-25T00:00:00+0000", close="100", price_currency="USD"),
    dict(symbol="VT", date="2026-09-25T00:00:00+0000", close="100", price_currency="PHP"),
    dict(symbol="VT", date="2026-09-30T00:00:00+0000", close="100", price_currency="USD"),
])
def test_marketstack_rejects_wrong_identity_currency_or_date(row):
    page = dict(pagination=dict(limit=100, offset=0, count=1, total=1), data=[row])
    with pytest.raises(MarketDataError, match="invalid_historical_marketstack_response"):
        MarketstackHistory(Responses([page]), "key").fetch(date(2026, 9, 25), date(2026, 9, 25), NOW)


def test_bsp_exact_matrix_skips_unpublished_days_and_preserves_source_date():
    html = """<table><tr><td></td><td>Date</td><td></td><td>Aug-26</td><td>Sep-26</td><td></td></tr>
      <tr><td></td><td>18</td><td></td><td>61.539</td><td>62.785</td><td></td></tr>
      <tr><td></td><td>19</td><td></td><td></td><td>62.900</td><td></td></tr></table>"""
    values = parse_bsp_daily(html, NOW)
    assert {(item.observed_at.date(), item.value) for item in values} == {
        (date(2026, 8, 18), Decimal("61.539000000000")),
        (date(2026, 9, 18), Decimal("62.785000000000")),
        (date(2026, 9, 19), Decimal("62.900000000000")),
    }
    assert all(item.source == "bsp" and item.currency == "PHP" for item in values)


def bsp_archive_fixture(august_rate="61.539000000000001", year=2026):
    strings = ["Philippine Peso per US Dollar Rate", "Frequency: Daily", str(year),
               "Day", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul",
               "Aug", "Sep", "Oct", "Nov", "Dec", "…"]
    shared = "<sst xmlns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'>" + "".join(
        f"<si><t>{item}</t></si>" for item in strings) + "</sst>"
    header = "".join(f"<c r='{chr(66 + index)}7' t='s'><v>{index + 4}</v></c>"
                     for index in range(12))
    rows = ["<row r='1'><c r='A1' t='s'><v>0</v></c></row>",
            "<row r='2'><c r='A2' t='s'><v>1</v></c></row>",
            "<row r='6'><c r='A6' t='s'><v>2</v></c></row>",
            f"<row r='7'><c r='A7' t='s'><v>3</v></c>{header}</row>"]
    for day in range(1, 32):
        row_number = day + 7
        cells = f"<c r='A{row_number}'><v>{day}</v></c>"
        if day == 18:
            cells += f"<c r='I{row_number}'><v>{august_rate}</v></c>"
        if day == 25:
            cells += f"<c r='J{row_number}'><v>62.756</v></c>"
        if day == 31:
            cells += f"<c r='C{row_number}' t='s'><v>16</v></c>"
        rows.append(f"<row r='{row_number}'>{cells}</row>")
    sheet = "<worksheet xmlns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'>" \
        f"<sheetData>{''.join(rows)}</sheetData></worksheet>"
    output = BytesIO()
    with ZipFile(output, "w") as archive:
        archive.writestr("xl/sharedStrings.xml", shared)
        archive.writestr("xl/worksheets/sheet3.xml", sheet)
    return output.getvalue()


def test_bsp_archive_preserves_published_precision_and_skips_unpublished_days():
    content = bsp_archive_fixture()
    values = parse_bsp_archive(content, NOW)
    assert {(item.observed_at.date(), item.value) for item in values} == {
        (date(2026, 8, 18), Decimal("61.539000000000")),
        (date(2026, 9, 25), Decimal("62.756000000000")),
    }
    assert all(item.source == "bsp" and item.provenance == BSP_ARCHIVE_URL for item in values)
    http = Responses([SimpleNamespace(status_code=200, content=content)])
    result = BSPHistory(http).fetch(date(2026, 8, 18), date(2026, 8, 18), NOW)
    assert len(result) == 1
    assert http.calls[0][0] == BSP_ARCHIVE_URL


def test_bsp_archive_rejects_unrecognized_or_materially_imprecise_rate():
    content = bsp_archive_fixture("61.5395")
    assert len(parse_bsp_archive(content, NOW)) == 2  # Four-decimal published rate.
    with pytest.raises(MarketDataError, match="invalid_bsp_archive"):
        parse_bsp_archive(bsp_archive_fixture("61.53959"), NOW)


def test_bsp_archive_supports_years_older_than_rolling_daily_page():
    content = bsp_archive_fixture(year=2024)
    result = BSPHistory(Responses([SimpleNamespace(status_code=200, content=content)])).fetch(
        date(2024, 8, 18), date(2024, 8, 18), NOW)
    assert len(result) == 1
    assert result[0].observed_at.date() == date(2024, 8, 18)


def test_bsp_archive_ignores_a_philippine_publication_day_ahead_of_utc():
    result = parse_bsp_archive(bsp_archive_fixture(),
                               datetime(2026, 9, 24, 23, tzinfo=timezone.utc))
    assert [item.observed_at.date() for item in result] == [date(2026, 8, 18)]


def test_bsp_rejects_malformed_or_duplicate_rate():
    html = """<table><tr><td></td><td>Date</td><td></td><td>Aug-26</td><td>Sep-26</td><td></td></tr>
      <tr><td></td><td>18</td><td></td><td>61.5</td><td>bad</td><td></td></tr></table>"""
    with pytest.raises(MarketDataError, match="invalid_bsp_response"):
        parse_bsp_daily(html, NOW)


def test_coinranking_keeps_real_same_day_latest_and_rejects_future():
    points = [{"timestamp": 1790377200, "price": "5000000"},
              {"timestamp": 1790413200, "price": "5100000"},
              {"timestamp": 1790760000, "price": "5300000"}]
    http = Responses([{"status": "success", "data": {"history": points}}])
    result = CoinrankingHistory(http, "key").fetch("php-uuid", date(2026, 9, 25), date(2026, 9, 29), NOW)
    assert all(item.observed_at <= NOW for item in result)
    assert all(item.source == "coinranking" for item in result)
    assert http.calls[0][1]["params"]["timePeriod"] == "1y"


def test_coinranking_future_nearest_is_never_used_as_prior_day_value():
    future = {"timestamp": int(datetime(2026, 9, 26, 0, 1, tzinfo=timezone.utc).timestamp()),
              "price": "5000000"}
    result = CoinrankingHistory(Responses([{"status": "success", "data": {"history": [future]}}]),
                                "key").fetch("php-uuid", date(2026, 9, 25), date(2026, 9, 25), NOW)
    assert result == []


def test_coinranking_refuses_dates_outside_supported_year():
    with pytest.raises(MarketDataError, match="historical_request_invalid"):
        CoinrankingHistory(Responses([]), "key").fetch(
            "php-uuid", date(2025, 8, 1), date(2026, 9, 25), NOW)
