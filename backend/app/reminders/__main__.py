"""Operator-only entry point: python -m app.reminders pending-recordings."""
import argparse
import logging
import sys

import httpx

from .pending import (ReminderConfig, ReminderError, ResendTransport,
                      SupabaseReminderGateway, run_once)


def main() -> int:
    parser = argparse.ArgumentParser(description="Arbor trusted product-email worker")
    parser.add_argument("command", choices=["pending-recordings"])
    parser.parse_args()
    for name in ("httpx", "httpcore", "supabase", "postgrest"):
        logging.getLogger(name).disabled = True
    try:
        config = ReminderConfig.from_environment()
        if config is None:
            print("Product email disabled; no reminders claimed or sent.")
            return 0
        with httpx.Client(trust_env=False) as client:
            gateway = SupabaseReminderGateway(config.supabase_url, config.supabase_key)
            counts = run_once(gateway, ResendTransport(client, config.resend_key), config)
        print("Pending recording reminders: " + ", ".join(
            f"{name}={value}" for name, value in counts.items()))
        return int(counts["failed"] > 0)
    except Exception:
        # SDK/provider exceptions can include request headers. Never print them.
        print("Product email worker failed; check trusted server configuration and logs safely.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
