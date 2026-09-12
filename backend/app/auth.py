import os
import ssl
import logging

import certifi
import jwt
from dotenv import load_dotenv
from fastapi import Header, HTTPException
from jwt import PyJWKClient

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")

if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL is not configured")

JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"

# Issuer and API clocks can differ slightly. Keep this allowance small; signature
# and timestamp validation remain enabled (including expiration).
JWT_CLOCK_SKEW_SECONDS = 5
logger = logging.getLogger(__name__)

ssl_context = ssl.create_default_context(cafile=certifi.where())

jwks_client = PyJWKClient(
    JWKS_URL,
    ssl_context=ssl_context,
)


def get_current_user_id(
    authorization: str | None = Header(default=None),
) -> str:
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header",
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid Authorization header",
        )

    token = authorization.split(" ", 1)[1]

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            options={"verify_aud": False},
            leeway=JWT_CLOCK_SKEW_SECONDS,
        )

        user_id = payload.get("sub")

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid token: missing user ID",
            )

        return user_id

    except jwt.PyJWTError as error:
        # Log only the exception category, never the token, claims, or error text.
        logger.warning("Authentication rejected: %s", type(error).__name__)
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
        )
