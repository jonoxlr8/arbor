"""Explicit operator-only history import. Never run on app startup or cron."""
import argparse
from datetime import date, datetime, timedelta, timezone
import logging
import os
import sys
import httpx
from dotenv import load_dotenv

from .adapters import VendorHTTP
from .cache import SharedCache
from .history_sources import BSPHistory, CoinrankingHistory, MarketstackHistory
from .models import MarketDataError


def main():
    parser = argparse.ArgumentParser(description="Import verified shared historical observations")
    parser.add_argument("--from-day", required=True, type=date.fromisoformat)
    parser.add_argument("--to-day", required=True, type=date.fromisoformat)
    parser.add_argument("--write", action="store_true", help="Explicit shared-cache write opt-in")
    args = parser.parse_args()
    load_dotenv()
    for name in ("httpx", "httpcore"):
        logging.getLogger(name).disabled = True
    if (not args.write or os.getenv("ARBOR_HISTORICAL_CACHE_WRITE_ENABLED", "").lower() != "true"):
        print("Historical cache write requires both --write and the operator opt-in.", file=sys.stderr)
        return 2
    try:
        now = datetime.now(timezone.utc)
        with httpx.Client(timeout=20, follow_redirects=False) as client:
            vendor = VendorHTTP(client)
            market = MarketstackHistory(vendor, os.getenv("MARKETSTACK_API_KEY"))
            etfs = market.fetch(args.from_day, args.to_day, now)
            bsp = BSPHistory(client).fetch(args.from_day, args.to_day, now)
            btc_start = max(args.from_day, now.date() - timedelta(days=365))
            btc = []
            if btc_start <= args.to_day:
                currencies = vendor.get("https://api.coinranking.com/v2/reference-currencies",
                    params={"search": "PHP", "types[]": "fiat", "limit": 100},
                    headers={"x-access-token": os.getenv("COINRANKING_API_KEY", "")})
                matches = [item for item in currencies["data"]["currencies"]
                           if item.get("symbol") == "PHP" and item.get("type") == "fiat"]
                if currencies["status"] != "success" or len(matches) != 1:
                    raise MarketDataError("coinranking_php_identity_unavailable")
                btc = CoinrankingHistory(vendor, os.getenv("COINRANKING_API_KEY")).fetch(
                    matches[0]["uuid"], btc_start, args.to_day, now)
            observations = etfs + bsp + btc
            cache = SharedCache(client, os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_MARKET_DATA_KEY"))
            cache.write_history(observations)
            print(f"Historical observations cached: ETF {len(etfs)}, BSP {len(bsp)}, BTC {len(btc)}."
                  " Missing dates remain unavailable; no owner history or snapshots changed.")
            return 0
    except (MarketDataError, KeyError, TypeError, ValueError, httpx.HTTPError):
        print("Historical import failed; inspect source access, schema and operator configuration."
              " No owner history was modified.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
