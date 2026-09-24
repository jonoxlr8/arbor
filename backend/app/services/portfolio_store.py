"""Normal JWT/RLS persistence; no service-role access in the application reader."""
from datetime import datetime, timezone
from functools import wraps

from fastapi import HTTPException
from postgrest.exceptions import APIError
from httpx import TransportError
from app.database import get_authenticated_client
from app.services.live_portfolio import Holding, HoldingInput


def storage_errors(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except APIError as exc:
            if exc.code == "23505":
                raise HTTPException(409, "This investment is already recorded. Edit its units instead.") from None
            raise HTTPException(503, "Portfolio records are temporarily unavailable. Please retry.") from None
        except (TransportError, ValueError, TypeError):
            raise HTTPException(503, "Portfolio records are temporarily unavailable. Please retry.") from None
    return wrapped


class PortfolioStore:
    def __init__(self, user_id, authorization):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "Sign in to view your portfolio.")
        self.owner = user_id
        self.client = get_authenticated_client(authorization.split(" ", 1)[1])

    @storage_errors
    def holdings(self):
        rows = self.client.table("arbor_portfolio_holding_values").select("*").eq("user_id", self.owner).order("created_at").execute().data
        return [Holding.model_validate({k: v for k, v in row.items() if k != "user_id"}) for row in rows]

    @storage_errors
    def save(self, value: HoldingInput, holding_id=None):
        payload = value.model_dump(mode="json")
        if holding_id is None:
            # user_id is the DB's auth.uid() default, not a client override.
            self.client.table("arbor_portfolio_holdings").insert(payload, returning="minimal").execute()
        else:
            found = next((h for h in self.holdings() if str(h.id) == str(holding_id)), None)
            if not found:
                raise HTTPException(404, "Holding not found.")
            if (found.provider, found.product_id) != (value.provider, value.product_id):
                raise HTTPException(422, "Edit units or remove the record before changing investment.")
            self.client.table("arbor_portfolio_holdings").update({"units": payload["units"],
                "cost_basis_php": payload["cost_basis_php"], "updated_at": datetime.now(timezone.utc).isoformat()}, returning="minimal").eq("user_id", self.owner).eq("id", str(holding_id)).execute()

    @storage_errors
    def delete(self, holding_id):
        if not any(str(h.id) == str(holding_id) for h in self.holdings()):
            raise HTTPException(404, "Holding not found.")
        self.client.table("arbor_portfolio_holdings").delete(returning="minimal").eq("user_id", self.owner).eq("id", str(holding_id)).execute()

    @storage_errors
    def prices(self, keys):
        if not keys:
            return {}
        rows = self.client.table("arbor_market_price_values").select("*").in_("price_key", sorted(keys)).execute().data
        # Corrupt individual quotes fail closed without losing other holdings.
        result = {}
        for row in rows:
            try:
                from app.market_data.models import ReferencePrice
                price = ReferencePrice.model_validate(row)
                result[price.price_key] = price
            except ValueError:
                continue
        return result

    @storage_errors
    def history(self):
        return self.client.table("arbor_portfolio_history").select("day,value_php,captured_at").eq("user_id", self.owner).order("day", desc=True).limit(366).execute().data[::-1]

    @storage_errors
    def capture(self):
        return self.client.rpc("arbor_capture_portfolio", {}).execute().data
