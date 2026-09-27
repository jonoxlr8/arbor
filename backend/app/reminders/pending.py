"""One privacy-safe reminder for unfinished provider handoffs.

Only the operator CLI calls this module. Pending state and email delivery never
write holdings, investment entries, monthly records, or portfolio snapshots.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from html import escape
from typing import Protocol
from urllib.parse import urlsplit
from uuid import UUID

import httpx


SUBJECT = "Finish updating your Arbor portfolio"
MESSAGE = (
    "If you completed the investment you started from Arbor, come back and "
    "record the actual units you received so your portfolio stays up to date."
)


class ReminderError(Exception):
    """Sanitized operator-visible failure (never contains credentials or email)."""


class DeliveryError(Exception):
    def __init__(self, *, retryable: bool):
        self.retryable = retryable
        super().__init__("Product email delivery failed")


@dataclass(frozen=True)
class ReminderConfig:
    supabase_url: str
    supabase_key: str
    resend_key: str
    from_address: str
    app_url: str

    @classmethod
    def from_environment(cls) -> ReminderConfig | None:
        if os.getenv("ARBOR_PRODUCT_EMAIL_ENABLED", "false").strip().lower() != "true":
            return None
        # The existing server-only market-data operator key has the same
        # Supabase service-role scope and can be reused without minting a key.
        trusted_key = (os.getenv("SUPABASE_PRODUCT_EMAIL_KEY", "").strip()
                       or os.getenv("SUPABASE_MARKET_DATA_KEY", "").strip())
        names = ("SUPABASE_URL", "RESEND_API_KEY", "ARBOR_PRODUCT_EMAIL_FROM", "ARBOR_APP_URL")
        values = [os.getenv(name, "").strip() for name in names]
        if not all(values):
            raise ReminderError("Product email configuration is incomplete")
        if not trusted_key:
            raise ReminderError("Product email configuration is incomplete")
        config = cls(values[0], trusted_key, *values[1:])
        parsed = urlsplit(config.app_url)
        if (parsed.scheme != "https" or parsed.hostname not in ("arbor.ph", "www.arbor.ph")
                or parsed.username or parsed.password or parsed.port is not None
                or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
            raise ReminderError("Product email return URL is invalid")
        if not re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co/?", config.supabase_url):
            raise ReminderError("Product email database configuration is invalid")
        address = r"[A-Za-z0-9._%+-]+@mail\.arbor\.ph"
        if not (re.fullmatch(address, config.from_address) or
                re.fullmatch(r"[^<>\r\n]+ <" + address + r">", config.from_address)):
            raise ReminderError("Product email sender must be an Arbor address")
        if not re.fullmatch(r"re_[A-Za-z0-9_-]+", config.resend_key):
            raise ReminderError("Product email provider configuration is invalid")
        return config

    @property
    def return_url(self) -> str:
        return self.app_url.rstrip("/") + "/#home/monthly"


@dataclass(frozen=True)
class EmailMessage:
    recipient: str
    sender: str
    subject: str
    text: str
    html: str
    idempotency_key: str

    @property
    def fingerprint(self) -> str:
        payload = {"from": self.sender, "to": [self.recipient], "subject": self.subject,
                   "text": self.text, "html": self.html}
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        return hashlib.sha256(encoded).hexdigest()


def make_message(config: ReminderConfig, recipient: str, delivery_id: str) -> EmailMessage:
    UUID(delivery_id)
    url = config.return_url
    text = f"{MESSAGE}\n\nFinish recording: {url}\n"
    html = (
        '<div style="font-family:Arial,sans-serif;color:#173326;max-width:560px">'
        '<p style="font-size:22px;font-weight:bold;color:#0f5132">Arbor</p>'
        f"<p>{escape(MESSAGE)}</p>"
        f'<p><a href="{escape(url, quote=True)}" style="color:#0f5132">Finish recording</a></p>'
        "<p>If you did not complete an investment elsewhere, there is nothing to record.</p>"
        "</div>"
    )
    return EmailMessage(recipient, config.from_address, SUBJECT, text, html,
                        f"arbor-pending-recording-reminder/{delivery_id}")


class EmailTransport(Protocol):
    def send(self, message: EmailMessage) -> str: ...


class ResendTransport:
    def __init__(self, client: httpx.Client, api_key: str):
        self.client = client
        self.api_key = api_key

    def send(self, message: EmailMessage) -> str:
        try:
            response = self.client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": "Bearer " + self.api_key,
                         "Idempotency-Key": message.idempotency_key},
                json={"from": message.sender, "to": [message.recipient],
                      "subject": message.subject, "text": message.text, "html": message.html},
                timeout=10,
            )
        except httpx.RequestError:
            # Acceptance is unknown. Retry only within the DB's 23-hour window,
            # with this exact key and payload (Resend retains keys for 24 hours).
            raise DeliveryError(retryable=True) from None
        if response.status_code in (200, 201):
            try:
                message_id = response.json()["id"]
                if isinstance(message_id, str) and 1 <= len(message_id) <= 200:
                    return message_id
            except (KeyError, TypeError, ValueError):
                pass
            raise DeliveryError(retryable=True)
        if response.status_code == 409:
            try:
                if response.json().get("name") == "concurrent_idempotent_requests":
                    raise DeliveryError(retryable=True)
            except (ValueError, TypeError, AttributeError):
                pass
        raise DeliveryError(retryable=response.status_code == 429 or response.status_code >= 500)


class ReminderGateway(Protocol):
    def claim(self) -> dict | None: ...
    def account_email(self, user_id: str) -> str | None: ...
    def prepare(self, delivery_id: str, token: str, fingerprint: str) -> bool: ...
    def finish(self, delivery_id: str, token: str, result: str, message_id: str | None = None) -> bool: ...


class SupabaseReminderGateway:
    """A separate trusted client; user HTTP routes never import its key."""

    def __init__(self, url: str, key: str):
        from supabase import create_client
        self.client = create_client(url, key)

    def claim(self) -> dict | None:
        return self.client.rpc("arbor_claim_pending_recording_reminder", {}).execute().data

    def account_email(self, user_id: str) -> str | None:
        result = self.client.auth.admin.get_user_by_id(user_id)
        user = result.user
        if (not user or getattr(user, "is_anonymous", False)
                or not getattr(user, "email_confirmed_at", None)
                or getattr(user, "banned_until", None)
                or getattr(user, "deleted_at", None)):
            return None
        email = getattr(user, "email", None)
        return email if isinstance(email, str) and "@" in email and "\n" not in email else None

    def prepare(self, delivery_id: str, token: str, fingerprint: str) -> bool:
        return self.client.rpc("arbor_prepare_pending_recording_reminder", {
            "p_id": delivery_id, "p_token": token, "p_fingerprint": fingerprint,
        }).execute().data is True

    def finish(self, delivery_id: str, token: str, result: str, message_id: str | None = None) -> bool:
        return self.client.rpc("arbor_finish_pending_recording_reminder", {
            "p_id": delivery_id, "p_token": token, "p_result": result,
            "p_provider_message_id": message_id,
        }).execute().data is True


def run_once(gateway: ReminderGateway, transport: EmailTransport, config: ReminderConfig,
             *, limit: int = 100) -> dict[str, int]:
    counts = {"claimed": 0, "sent": 0, "skipped": 0, "failed": 0}
    for _ in range(limit):
        delivery = gateway.claim()
        if not delivery:
            break
        counts["claimed"] += 1
        delivery_id, token = delivery["id"], delivery["claim_token"]
        try:
            recipient = gateway.account_email(delivery["user_id"])
        except Exception:
            gateway.finish(delivery_id, token, "retry")
            counts["failed"] += 1
            continue
        if not recipient:
            gateway.finish(delivery_id, token, "stop")
            counts["skipped"] += 1
            continue
        message = make_message(config, recipient, delivery_id)
        if not gateway.prepare(delivery_id, token, message.fingerprint):
            counts["skipped"] += 1
            continue
        try:
            message_id = transport.send(message)
        except DeliveryError as exc:
            gateway.finish(delivery_id, token, "retry" if exc.retryable else "stop")
            counts["failed"] += 1
            continue
        if not gateway.finish(delivery_id, token, "sent", message_id):
            raise ReminderError("Reminder delivery could not be confirmed in the database")
        counts["sent"] += 1
    return counts
