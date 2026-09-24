"""Normal JWT/RLS persistence; no service-role access in the application reader."""
from datetime import datetime, timezone
from functools import wraps

from fastapi import HTTPException
from postgrest.exceptions import APIError
from httpx import TransportError
from app.database import get_authenticated_client
from app.services.live_portfolio import Holding, HoldingInput, MANUAL_FUNDS, ManualValueInput


def storage_errors(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except APIError as exc:
            if exc.code == "23505":
                raise HTTPException(409, "This investment is already recorded. Edit its units instead.") from None
            if exc.code == "23514":
                raise HTTPException(422, "Keep a current fund value or positive units. Otherwise remove the holding.") from None
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
            if payload["manual_value_php"] is None:
                payload.pop("manual_value_php")
            # user_id is the DB's auth.uid() default, not a client override.
            self.client.table("arbor_portfolio_holdings").insert(payload, returning="minimal").execute()
        else:
            found = next((h for h in self.holdings() if str(h.id) == str(holding_id)), None)
            if not found:
                raise HTTPException(404, "Holding not found.")
            if (found.provider, found.product_id) != (value.provider, value.product_id):
                raise HTTPException(422, "Edit units or remove the record before changing investment.")
            changes = {"units": payload["units"], "cost_basis_php": payload["cost_basis_php"],
                       "updated_at": datetime.now(timezone.utc).isoformat()}
            if "manual_value_php" in value.model_fields_set and value.manual_value_php != found.manual_value_php:
                changes["manual_value_php"] = payload["manual_value_php"]
            self.client.table("arbor_portfolio_holdings").update(changes, returning="minimal").eq("user_id", self.owner).eq("id", str(holding_id)).execute()

    @storage_errors
    def save_manual_value(self, holding_id, request: ManualValueInput):
        found = next((h for h in self.holdings() if str(h.id) == str(holding_id)), None)
        if not found:
            raise HTTPException(404, "Holding not found.")
        if found.product_id not in MANUAL_FUNDS:
            raise HTTPException(422, "Current value entry is only available for supported PHP funds.")
        if request.manual_value_php is None and found.units is None:
            raise HTTPException(422, "Add fund units before clearing the value, or remove the holding.")
        # DB trigger owns the timestamp, including reaffirming the same amount.
        self.client.table("arbor_portfolio_holdings").update(
            request.model_dump(mode="json"), returning="minimal"
        ).eq("user_id", self.owner).eq("id", str(holding_id)).execute()

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
