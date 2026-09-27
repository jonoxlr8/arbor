"""No test in this module sends a network email."""
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest

from app.reminders.pending import (DeliveryError, ReminderConfig, ReminderError,
                                   ResendTransport, SupabaseReminderGateway,
                                   make_message, run_once)


CONFIG = ReminderConfig("https://fixture.supabase.co", "test-server-only", "test-resend-only",
                        "Arbor <updates@mail.arbor.ph>", "https://arbor.ph")


class FakeGateway:
    def __init__(self, owners=1, email=True, prepare=True):
        self.items = [{"id": str(uuid4()), "claim_token": str(uuid4()),
                       "user_id": str(uuid4())} for _ in range(owners)]
        self.email = email
        self.can_prepare = prepare
        self.finishes = []
        self.fingerprints = []

    def claim(self):
        return self.items.pop(0) if self.items else None

    def account_email(self, _):
        return "qa@example.com" if self.email else None

    def prepare(self, delivery_id, token, fingerprint):
        self.fingerprints.append((delivery_id, token, fingerprint))
        return self.can_prepare

    def finish(self, delivery_id, token, result, message_id=None):
        self.finishes.append((delivery_id, token, result, message_id))
        return True


class CaptureTransport:
    def __init__(self, error=None):
        self.sent = []
        self.error = error

    def send(self, message):
        self.sent.append(message)
        if self.error:
            raise self.error
        return "provider-message-id"


def test_disabled_and_invalid_configuration_fail_closed(monkeypatch):
    monkeypatch.delenv("ARBOR_PRODUCT_EMAIL_ENABLED", raising=False)
    monkeypatch.delenv("SUPABASE_MARKET_DATA_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_PRODUCT_EMAIL_KEY", raising=False)
    assert ReminderConfig.from_environment() is None
    monkeypatch.setenv("ARBOR_PRODUCT_EMAIL_ENABLED", "true")
    with pytest.raises(ReminderError):
        ReminderConfig.from_environment()
    for name, value in {
        "SUPABASE_URL": "https://fixture.supabase.co",
        "SUPABASE_PRODUCT_EMAIL_KEY": "server-only",
        "RESEND_API_KEY": "re_testonly",
        "ARBOR_PRODUCT_EMAIL_FROM": "Arbor <updates@mail.arbor.ph>",
        "ARBOR_APP_URL": "https://not-arbor.ph",
    }.items():
        monkeypatch.setenv(name, value)
    with pytest.raises(ReminderError):
        ReminderConfig.from_environment()
    monkeypatch.setenv("ARBOR_APP_URL", "https://arbor.ph")
    assert ReminderConfig.from_environment() == ReminderConfig(
        "https://fixture.supabase.co", "server-only", "re_testonly",
        "Arbor <updates@mail.arbor.ph>", "https://arbor.ph")
    monkeypatch.setenv("ARBOR_PRODUCT_EMAIL_FROM", "Arbor <updates@unverified.arbor.ph>")
    with pytest.raises(ReminderError):
        ReminderConfig.from_environment()


def test_existing_trusted_operator_key_can_be_reused_without_a_new_credential(monkeypatch):
    monkeypatch.setenv("ARBOR_PRODUCT_EMAIL_ENABLED", "true")
    monkeypatch.setenv("SUPABASE_URL", "https://fixture.supabase.co")
    monkeypatch.delenv("SUPABASE_PRODUCT_EMAIL_KEY", raising=False)
    monkeypatch.setenv("SUPABASE_MARKET_DATA_KEY", "opaque-server-key")
    monkeypatch.setenv("RESEND_API_KEY", "re_testonly")
    monkeypatch.setenv("ARBOR_PRODUCT_EMAIL_FROM", "Arbor <updates@mail.arbor.ph>")
    monkeypatch.setenv("ARBOR_APP_URL", "https://arbor.ph")
    assert ReminderConfig.from_environment().supabase_key == "opaque-server-key"


def test_generic_message_contains_no_financial_or_product_details():
    delivery_id = str(uuid4())
    message = make_message(CONFIG, "qa@example.com", delivery_id)
    assert message.subject == "Finish updating your Arbor portfolio"
    assert message.idempotency_key == f"arbor-pending-recording-reminder/{delivery_id}"
    assert "https://arbor.ph/#home/monthly" in message.text
    assert "If you completed the investment" in message.text
    assert "if" in message.text.lower()
    for forbidden in ("VT", "Bitcoin", "Gotrade", "PDAX", "PHP", "₱", "units purchased",
                      "portfolio value", "goal progress", "invest now"):
        assert forbidden.lower() not in (message.subject + message.text + message.html).lower()
    assert message.fingerprint == make_message(CONFIG, "qa@example.com", delivery_id).fingerprint


def test_one_claim_produces_one_generic_email_and_does_not_mutate_pending():
    gateway = FakeGateway()
    transport = CaptureTransport()
    counts = run_once(gateway, transport, CONFIG)
    assert counts == {"claimed": 1, "sent": 1, "skipped": 0, "failed": 0}
    assert len(transport.sent) == 1
    assert gateway.finishes[0][2:] == ("sent", "provider-message-id")


@pytest.mark.parametrize("email,prepare,expected", [
    (False, True, "stop"), (True, False, None),
])
def test_missing_email_or_resolved_before_send_never_calls_transport(email, prepare, expected):
    gateway = FakeGateway(email=email, prepare=prepare)
    transport = CaptureTransport()
    result = run_once(gateway, transport, CONFIG)
    assert result["sent"] == 0
    assert transport.sent == []
    assert (gateway.finishes[0][2] if gateway.finishes else None) == expected


@pytest.mark.parametrize("retryable,outcome", [(True, "retry"), (False, "stop")])
def test_provider_failure_does_not_mark_sent(retryable, outcome):
    gateway = FakeGateway()
    transport = CaptureTransport(DeliveryError(retryable=retryable))
    result = run_once(gateway, transport, CONFIG)
    assert result["failed"] == 1 and result["sent"] == 0
    assert gateway.finishes[0][2] == outcome


def test_ambiguous_retry_reuses_delivery_identity_and_payload():
    delivery = {"id": str(uuid4()), "claim_token": str(uuid4()), "user_id": str(uuid4())}
    first = FakeGateway(owners=0)
    first.items = [delivery]
    attempted = CaptureTransport(DeliveryError(retryable=True))
    run_once(first, attempted, CONFIG)
    second = FakeGateway(owners=0)
    second.items = [{**delivery, "claim_token": str(uuid4())}]
    successful = CaptureTransport()
    run_once(second, successful, CONFIG)
    assert attempted.sent[0].idempotency_key == successful.sent[0].idempotency_key
    assert attempted.sent[0].fingerprint == successful.sent[0].fingerprint


def test_resend_adapter_uses_post_idempotency_and_server_only_key():
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"id": "provider-id"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        message = make_message(CONFIG, "qa@example.com", str(uuid4()))
        assert ResendTransport(client, "test-api-key").send(message) == "provider-id"
    request = requests[0]
    assert request.method == "POST" and str(request.url) == "https://api.resend.com/emails"
    assert request.headers["Authorization"] == "Bearer test-api-key"
    assert request.headers["Idempotency-Key"] == message.idempotency_key
    body = request.content.decode()
    assert '"to":["qa@example.com"]' in body
    assert '"text"' in body and '"html"' in body


@pytest.mark.parametrize("status,error,retryable", [
    (400, "invalid_idempotency_key", False),
    (401, "unauthorized", False),
    (409, "invalid_idempotent_request", False),
    (409, "concurrent_idempotent_requests", True),
    (429, "rate_limit_exceeded", True),
    (500, "internal_server_error", True),
])
def test_resend_errors_are_classified_without_exposing_provider_body(status, error, retryable):
    with httpx.Client(transport=httpx.MockTransport(
            lambda _: httpx.Response(status, json={"name": error, "message": "private"}))) as client:
        with pytest.raises(DeliveryError) as captured:
            ResendTransport(client, "test-key").send(make_message(CONFIG, "qa@example.com", str(uuid4())))
    assert captured.value.retryable is retryable
    assert "private" not in str(captured.value)


def test_network_timeout_is_ambiguous_and_retryable():
    def timeout(request):
        raise httpx.ReadTimeout("private request", request=request)

    with httpx.Client(transport=httpx.MockTransport(timeout)) as client:
        with pytest.raises(DeliveryError) as captured:
            ResendTransport(client, "test-key").send(make_message(CONFIG, "qa@example.com", str(uuid4())))
    assert captured.value.retryable
    assert "private" not in str(captured.value)


@pytest.mark.parametrize("properties,expected", [
    ({"email": "qa@example.com", "email_confirmed_at": "date",
      "is_anonymous": False, "banned_until": None, "deleted_at": None}, "qa@example.com"),
    ({"email": None, "email_confirmed_at": "date"}, None),
    ({"email": "qa@example.com", "email_confirmed_at": None}, None),
    ({"email": "qa@example.com", "email_confirmed_at": "date", "is_anonymous": True}, None),
    ({"email": "qa@example.com", "email_confirmed_at": "date", "banned_until": "date"}, None),
    ({"email": "qa@example.com", "email_confirmed_at": "date", "deleted_at": "date"}, None),
])
def test_current_auth_account_email_is_resolved_server_side(properties, expected):
    gateway = object.__new__(SupabaseReminderGateway)
    admin = SimpleNamespace(get_user_by_id=lambda _: SimpleNamespace(user=SimpleNamespace(**properties)))
    gateway.client = SimpleNamespace(auth=SimpleNamespace(admin=admin))
    assert gateway.account_email(str(uuid4())) == expected
