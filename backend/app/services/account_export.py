"""Read-only export boundary. No caller-controlled owner or persistent quota."""
from contextlib import contextmanager
from threading import Lock, BoundedSemaphore
from time import monotonic
from uuid import UUID
import jwt
from fastapi import HTTPException
from app import auth

SECTIONS = ('profile', 'legacy_holdings', 'portfolio_holdings', 'investment_entries',
            'snapshots', 'history_changes', 'monthly_checkins', 'ask_usage',
            'pending_recordings', 'reminder_metadata', 'export_operational_metadata')


def verified_identity(authorization):
    owner = auth.get_verified_user_id(authorization)
    token = authorization.split(' ', 1)[1]
    try:
        key = auth.jwks_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(token, key.key, algorithms=['ES256'], issuer=auth.JWT_ISSUER,
                            audience='authenticated', options={'require': ['exp', 'iat', 'iss', 'aud', 'sub', 'session_id']},
                            leeway=auth.JWT_CLOCK_SKEW_SECONDS)
        session = str(UUID(claims['session_id']))
        if claims['sub'] != owner:
            raise ValueError()
        return owner, session
    except (jwt.PyJWTError, ValueError, TypeError, KeyError):
        raise HTTPException(401, 'Sign in again to download your data.') from None


class ExportLimits:
    """Bounded, process-local cooldown/concurrency; not a distributed quota."""
    def __init__(self, clock=monotonic):
        self.clock, self.lock = clock, Lock()
        self.active, self.recent = set(), {}
        self.slots = BoundedSemaphore(2)

    @contextmanager
    def acquire(self, owner):
        now = self.clock()
        with self.lock:
            self.recent = {k: v for k, v in self.recent.items() if now-v < 60}
            if owner in self.active or owner in self.recent or len(self.recent) >= 4096:
                raise HTTPException(429, 'Please wait before requesting another export.', headers={'Retry-After': '60'})
            if not self.slots.acquire(blocking=False):
                raise HTTPException(429, 'Exports are busy. Please retry shortly.', headers={'Retry-After': '60'})
            self.active.add(owner)
            self.recent[owner] = now
        try:
            yield
        finally:
            with self.lock:
                self.active.discard(owner)
                self.slots.release()


limits = ExportLimits()


def read_export(authorization):
    # A fresh request-scoped client forwards the already verified user JWT. No new server key.
    try:
        from app.database import supabase_url, supabase_key
        from supabase import create_client, ClientOptions
        client = create_client(supabase_url, supabase_key, options=ClientOptions(postgrest_client_timeout=10))
        client.postgrest.auth(authorization.split(' ', 1)[1])
        return client.rpc('arbor_account_export_current_v1', {}).execute().data
    except Exception as exc:
        message = getattr(exc, 'message', '')
        if message == 'export_busy':
            raise HTTPException(429, 'Exports are busy. Please retry shortly.') from None
        if message == 'export_reauthentication_required':
            raise HTTPException(403, 'Sign out and sign in again, then request your export within 15 minutes.') from None
        if message in ('export_too_large', 'export_oversized_record', 'export_invalid_or_oversized_record'):
            raise HTTPException(413, 'This export exceeds the download limit. Contact support@arbor.ph for help.') from None
        raise HTTPException(503, 'A complete export is temporarily unavailable. Please retry or contact support@arbor.ph.') from None
