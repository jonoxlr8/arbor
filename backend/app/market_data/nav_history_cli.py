"""One-time NAV-only operator import into local or hosted shared source storage.

The source's historical filter is CAPTCHA-gated. This command accepts only a
human-authorized NAV-only export, not arbitrary historical page scraping.
"""
import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit

import httpx

from .cache import SharedCache
from .models import MarketDataError
from .nav_history import TOAP_HISTORY_DETAILS, parse_nav_only_export

LOCAL_PG = {"PGHOST": "127.0.0.1", "PGPORT": "55444",
            "PGDATABASE": "arbor_nav_test", "PGUSER": "arbor_test"}
EXPECTED_COUNTS = {
    "gcash_global_equity": 1907,
    "gcash_technology": 2769,
    "gcash_defensive": 3626,
    "dragonfi_global_equity": 120,
    "dragonfi_technology": 120,
    "dragonfi_defensive": 7093,
}


def sql_literal(value: object) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def insert_sql(observations) -> str:
    values = []
    for item in observations:
        fields = (item.price_key, item.observed_at.isoformat(), item.observed_at.date().isoformat(),
                  item.value, item.source, item.currency, item.provenance,
                  item.fetched_at.isoformat(), item.kind, item.unit_class, item.reference_id)
        values.append("(" + ",".join(sql_literal(field) for field in fields) + ")")
    return ("insert into public.arbor_historical_market_observations "
            "(price_key,observed_at,observation_date,value,source,currency,provenance,"
            "fetched_at,kind,unit_class,reference_id) values " + ",".join(values) +
            " on conflict (price_key,observed_at) do update set "
            "value=excluded.value,fetched_at=excluded.fetched_at;\n")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Validate or import six exact TOAP NAV-only exports")
    parser.add_argument("directory", type=Path, help="Directory with exactly six product_id.csv files")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--validate-only", action="store_true", help="Validate all six exports without a write")
    action.add_argument("--write-local", action="store_true", help="Explicit disposable-database write opt-in")
    action.add_argument("--write-hosted", action="store_true", help="Explicit hosted shared-cache write opt-in")
    parser.add_argument("--project-ref", help="Required exact Supabase project reference for hosted import")
    args = parser.parse_args(argv)
    if not (args.validate_only or args.write_local or args.write_hosted):
        print("Choose validation or one explicit import destination.", file=sys.stderr)
        return 2
    if (args.write_local and (os.getenv("ARBOR_LOCAL_NAV_IMPORT") != "1"
            or any(os.getenv(key) != value for key, value in LOCAL_PG.items()))):
        print("Local NAV import requires explicit disposable-database opt-in.", file=sys.stderr)
        return 2
    if args.write_hosted:
        url = os.getenv("SUPABASE_URL", "")
        host = urlsplit(url).hostname
        if (os.getenv("ARBOR_HOSTED_NAV_IMPORT") != "1" or not args.project_ref
                or host != f"{args.project_ref}.supabase.co"):
            print("Hosted NAV import requires explicit project-matched opt-in.", file=sys.stderr)
            return 2
    try:
        directory = args.directory.resolve(strict=True)
        expected = {f"{product}.csv" for product in TOAP_HISTORY_DETAILS}
        if not directory.is_dir() or {file.name for file in directory.iterdir()} != expected:
            raise MarketDataError("historical_nav_export_set_invalid")
        now = datetime.now(timezone.utc)
        observations = []
        summary = []
        for product in TOAP_HISTORY_DETAILS:
            path = directory / f"{product}.csv"
            if not path.is_file() or path.is_symlink() or path.stat().st_size > 1_000_000:
                raise MarketDataError("historical_nav_export_set_invalid")
            items = parse_nav_only_export(path.read_text(encoding="utf-8-sig"), product, now)
            if not args.write_local and len(items) != EXPECTED_COUNTS[product]:
                raise MarketDataError("historical_nav_export_count_unexpected")
            observations.extend(items)
            summary.append((product, len(items), items[0].observed_at.date(), items[-1].observed_at.date()))
        if args.write_local:
            # One transaction: any same-date conflicting NAV rolls back the entire local import.
            statements = "begin;\n" + "".join(insert_sql(observations[start:start + 500])
                                             for start in range(0, len(observations), 500)) + "commit;\n"
            result = subprocess.run(
                ["/opt/homebrew/opt/postgresql@17/bin/psql", "-w", "-X", "-q", "-v", "ON_ERROR_STOP=1",
                 "-h", LOCAL_PG["PGHOST"], "-p", LOCAL_PG["PGPORT"], "-U", LOCAL_PG["PGUSER"],
                 "-d", LOCAL_PG["PGDATABASE"]], input=statements, text=True,
                capture_output=True, timeout=120, check=False)
            if result.returncode != 0:
                raise MarketDataError("historical_nav_local_import_failed")
        elif args.write_hosted:
            with httpx.Client(timeout=20, follow_redirects=False) as client:
                cache = SharedCache(client, os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_MARKET_DATA_KEY"))
                cache.write_history(observations)
        for product, count, first, last in summary:
            print(f"{product}: {count} source NAV observations, {first} to {last}")
        print(f"Total: {len(observations)} exact-class NAV observations"
              + (" validated without a write." if args.validate_only else " submitted to shared source storage."))
        return 0
    except (MarketDataError, OSError, UnicodeError, subprocess.TimeoutExpired, httpx.HTTPError):
        print("NAV-only import failed. Check the six exact exports and operator destination;"
              " no owner financial records were changed.",
              file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
