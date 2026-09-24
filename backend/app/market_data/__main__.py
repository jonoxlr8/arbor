"""Operator commands only; no HTTP/admin endpoint and no automatic startup work."""
import argparse
import logging
import os
import sys
from decimal import DecimalException
import httpx
from dotenv import load_dotenv
from .models import FUND_CLASSES, MarketDataError, manual_nav
from .adapters import VendorHTTP, Marketstack, ExchangeRate, Coinranking
from .cache import SharedCache
from .refresh import refresh, nav_automation_status


def main():
    parser = argparse.ArgumentParser(description="Arbor shared reference cache (server operator only)")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("refresh", help="Refresh stale shared sources once; no scheduler")
    nav = commands.add_parser("set-nav", help="Record a verified official PHP NAV; never fetch a website")
    nav.add_argument("product_id", choices=FUND_CLASSES)
    nav.add_argument("value")
    nav.add_argument("effective_date")
    nav.add_argument("source", help="Official HTTPS page, without query parameters")
    nav.add_argument("--unit-class", required=True)
    args = parser.parse_args()
    load_dotenv()
    # Provider keys can occur in URLs (Marketstack). Disable HTTP library logging.
    for name in ("httpx", "httpcore"):
        logging.getLogger(name).disabled = True
    if args.command == "refresh":
        for source, status in nav_automation_status().items():
            print(f"{source}: {status}")
    try:
        record = manual_nav(args.product_id, args.value, args.effective_date, args.source, args.unit_class) if args.command == "set-nav" else None
        with httpx.Client() as client:
            cache = SharedCache(client, os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_MARKET_DATA_KEY"))
            if record:
                existing = cache.read([record.price_key]).get(record.price_key)
                if existing and existing.as_of > record.as_of:
                    raise MarketDataError("older_nav_rejected")
                cache.write([record])
                print("NAV cache updated; holdings and plans unchanged.")
                return 0
            http = VendorHTTP(client)
            results = refresh(cache, [Marketstack(http, os.getenv("MARKETSTACK_API_KEY")),
                ExchangeRate(http), Coinranking(http, os.getenv("COINRANKING_API_KEY"))])
            for source, status in results.items():
                print(f"{source}: {status}")
            return int(any(v not in ("cached", "cooldown", "updated", "older_data_ignored") for v in results.values()))
    except (MarketDataError, ValueError, TypeError, DecimalException):
        print("Reference-data operation failed. Check server configuration, migration and verified input; existing cache retained.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
