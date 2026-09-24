"""Small environment contract. Set APP_ENV=production on deployed backends."""
import os
import re
from ipaddress import ip_address
from urllib.parse import urlsplit


def live_portfolio_enabled() -> bool:
    """Operational availability, independent of account entitlement. Fail closed."""
    return os.getenv("LIVE_PORTFOLIO_ENABLED") == "true"


def cors_origins(value=None, environment="development"):
    if environment not in ("development", "test", "production"):
        raise ValueError("APP_ENV must be development, test, or production")
    production = environment == "production"
    if value is None:
        if production:
            raise ValueError("CORS_ALLOWED_ORIGINS is required in production")
        return ["http://localhost:3000"]
    result = []
    for entry in value.split(","):
        origin = entry.strip()
        try:
            parsed = urlsplit(origin)
            port = parsed.port
            if (not origin or "*" in origin or any(c.isspace() for c in origin)
                    or parsed.scheme not in ("http", "https") or not parsed.hostname
                    or parsed.username or parsed.password or parsed.path not in ("", "/")
                    or "?" in origin or "#" in origin or "\\" in origin
                    or parsed.netloc.endswith(":")):
                raise ValueError()
            host = parsed.hostname.lower()
            try:
                loopback = ip_address(host).is_loopback
            except ValueError:
                if len(host) > 253 or not all(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in host.rstrip(".").split(".")):
                    raise ValueError()
                loopback = host == "localhost" or host.endswith(".localhost")
            if production and (parsed.scheme != "https" or loopback):
                raise ValueError()
            if ":" in host:
                host = f"[{host}]"
            suffix = f":{port}" if port and (parsed.scheme, port) not in (("http", 80), ("https", 443)) else ""
            normalized = f"{parsed.scheme}://{host}{suffix}"
        except ValueError:
            raise ValueError("CORS_ALLOWED_ORIGINS must contain exact HTTP(S) origins; production requires non-local HTTPS origins") from None
        if normalized not in result:
            result.append(normalized)
    return result


def configured_cors_origins():
    return cors_origins(os.getenv("CORS_ALLOWED_ORIGINS"), os.getenv("APP_ENV", "development"))
