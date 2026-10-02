"""Normal JWT/RLS persistence; no service-role access in the application reader."""
from datetime import date, datetime, timezone
from decimal import Decimal
from functools import wraps
from calendar import monthrange

from fastapi import HTTPException
from postgrest.exceptions import APIError
from httpx import TransportError
from app.database import get_authenticated_client
from app.services.live_portfolio import Holding, HoldingInput, HoldingLedgerMetadata, MANUAL_FUNDS, ManualValueInput, InvestmentEntryInput, InvestmentRevisionInput, OpeningPositionCorrection


def storage_errors(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except APIError as exc:
            if exc.code == "P0001":
                if exc.message in ("idempotency_conflict", "stale_entry_revision", "ledger_managed_holding"):
                    raise HTTPException(409, "This record changed. Reload its activity before trying again.") from None
                if exc.message in ("share_basis_required", "invalid_share_basis"):
                    raise HTTPException(422, "Confirm whether the VGT share count is from before or after the April 21, 2026 split.") from None
                if exc.message == "opening_position_confirmation_required":
                    raise HTTPException(409, "Confirm the units you already owned before adding this fund investment.") from None
                if exc.message in ("entry_not_found", "holding_not_found"):
                    raise HTTPException(404, "Investment entry not found.") from None
                if exc.message in ("invalid_investment_entry", "opening_position_not_applicable", "position_limit"):
                    raise HTTPException(422, "Check the investment date, units, and optional PHP amount.") from None
            if exc.code == "23505":
                raise HTTPException(409, "This investment already has a position. Open it and choose Add more.") from None
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
        holdings = [Holding.model_validate({k: v for k, v in row.items() if k != "user_id"}) for row in rows]
        vgt_ids = [str(h.id) for h in holdings if h.product_id == "gotrade_vgt"]
        if vgt_ids:
            basis_rows = (self.client.table("arbor_portfolio_holding_ledger_values").select("*")
                          .eq("user_id", self.owner).in_("id", vgt_ids).execute().data)
            by_id = {str(row["id"]): row for row in basis_rows}
            for index, holding in enumerate(holdings):
                if holding.product_id != "gotrade_vgt":
                    continue
                row = by_id.get(str(holding.id))
                if row is None:
                    raise HTTPException(503, "Share basis records are temporarily unavailable.")
                holdings[index] = holding.model_copy(update={
                    "valuation_units": None if row["valuation_units"] is None else Decimal(row["valuation_units"]),
                    "valuation_units_quote_date": None if row["quote_date"] is None else date.fromisoformat(row["quote_date"]),
                    "effective_units": None if row["effective_units"] is None else Decimal(row["effective_units"]),
                    "opening_share_basis": row["opening_share_basis"],
                    "share_basis_checked": True,
                    "share_basis_required": row["effective_units"] is None,
                })
        return holdings

    @storage_errors
    def ledger_metadata(self):
        rows = (self.client.table("arbor_portfolio_holding_ledger_values")
                .select("id,opening_units,opening_cost_php,has_entries").eq("user_id", self.owner).execute().data)
        return {str(item.id): item.model_dump(mode="json", exclude={"id"})
                for item in (HoldingLedgerMetadata.model_validate(row) for row in rows)}

    @storage_errors
    def save(self, value: HoldingInput, holding_id=None):
        payload = value.model_dump(mode="json")
        basis = payload.pop("opening_share_basis", None)
        if value.product_id == "gotrade_vgt":
            if value.units is not None and not basis:
                raise HTTPException(422, "Confirm the VGT opening share count basis.")
            payload["opening_share_basis"] = basis
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
            if value.product_id == "gotrade_vgt":
                changes["opening_share_basis"] = basis
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
    def record_entry(self, request: InvestmentEntryInput):
        payload = request.model_dump(mode="json")
        rpc = "arbor_record_investment_with_share_basis" if request.product_id == "gotrade_vgt" else "arbor_record_investment"
        args = {
            "p_product_id": payload["product_id"], "p_provider": payload["provider"],
            "p_investment_date": payload["investment_date"], "p_units": payload["units"],
            "p_amount_paid_php": payload["amount_paid_php"], "p_idempotency_key": payload["idempotency_key"],
            "p_opening_units": payload["opening_units"], "p_opening_cost_php": payload["opening_cost_php"],
            "p_confirm_conversion": payload["confirm_conversion"],
        }
        if request.product_id == "gotrade_vgt":
            args["p_share_basis"] = payload["share_basis"]
        return self.client.rpc(rpc, args).execute().data

    @storage_errors
    def revise_entry(self, entry_id, request: InvestmentRevisionInput | None, revision: int, void: bool):
        payload = request.model_dump(mode="json") if request else {}
        args = {
            "p_entry_id": str(entry_id), "p_expected_revision": revision,
            "p_investment_date": payload.get("investment_date"), "p_units": payload.get("units"),
            "p_amount_paid_php": payload.get("amount_paid_php"), "p_void": void,
        }
        rpc = "arbor_revise_investment" if void or "share_basis" not in request.model_fields_set else "arbor_revise_investment_with_share_basis"
        if rpc.endswith("with_share_basis"):
            args["p_share_basis"] = payload["share_basis"]
        return self.client.rpc(rpc, args).execute().data

    @storage_errors
    def activity(self, holding_id=None, page=0, month=None, recent=False):
        query = (self.client.table("arbor_investment_entry_values").select("*")
                 .eq("user_id", self.owner).is_("voided_at", "null"))
        if holding_id is not None:
            query = query.eq("holding_id", str(holding_id))
        if month is not None:
            year, number = (int(part) for part in month.split("-"))
            query = query.gte("investment_date", f"{month}-01").lte(
                "investment_date", f"{month}-{monthrange(year, number)[1]:02d}")
        if recent:
            return query.order("updated_at", desc=True).order("id", desc=True).range(page * 20, page * 20 + 20).execute().data
        return (query.order("investment_date", desc=True).order("recorded_at", desc=True).order("id", desc=True)
                .range(page * 20, page * 20 + 20).execute().data)

    @storage_errors
    def correct_opening(self, holding_id, request: OpeningPositionCorrection):
        payload = request.model_dump(mode="json")
        args = {
            "p_holding_id": str(holding_id), "p_expected_updated_at": payload["expected_updated_at"],
            "p_opening_units": payload["opening_units"], "p_opening_cost_php": payload["opening_cost_php"],
        }
        rpc = "arbor_correct_opening_with_share_basis" if request.share_basis is not None else "arbor_correct_opening_position"
        if request.share_basis is not None:
            args["p_share_basis"] = payload["share_basis"]
        return self.client.rpc(rpc, args).execute().data

    @storage_errors
    def review_activity(self, start, end):
        """All active dated rows in a bounded window, through normal owner JWT/RLS."""
        rows = []
        expected = None
        for offset in range(0, 10001, 1000):
            result = (self.client.table("arbor_investment_entry_values")
                .select("id,holding_id,product_id,provider,investment_date,amount_paid_php,updated_at,revision,voided_at", count="exact")
                .eq("user_id", self.owner).is_("voided_at", "null")
                .gte("investment_date", start).lt("investment_date", end)
                .order("investment_date").order("id").range(offset, offset + 999).execute())
            if result.count is None or result.count > 10000:
                raise HTTPException(503, "This review exceeds the supported record limit. Your records remain available in Investment activity.")
            if expected is not None and expected != result.count:
                raise HTTPException(409, "Your investment records changed. Refresh this review.")
            expected = result.count
            rows.extend(result.data)
            if len(rows) == expected:
                return rows
            if len(result.data) != 1000:
                raise HTTPException(503, "The complete recorded activity could not be verified.")
        raise HTTPException(503, "The complete recorded activity could not be verified.")

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
        # The owner RPC merges corrected-ledger valuations with compatible
        # immutable observations. The SQL function owns deterministic day order
        # and pagination rather than relying on an unordered outer RPC range.
        rows = []
        page_size = 1000
        while True:
            page = self.client.rpc("arbor_reconstructed_portfolio_history", {
                "p_offset": len(rows), "p_limit": page_size,
            }).execute().data
            rows.extend(page)
            if len(page) < page_size:
                return rows

    @storage_errors
    def capture(self):
        return self.client.rpc("arbor_capture_portfolio", {}).execute().data

    def insight_rows(self, table, columns, order):
        try:
            rows = []
            expected = None
            tie = {"arbor_budget_versions": "month", "arbor_plan_versions": "id", "arbor_portfolio_snapshots": "day", "arbor_portfolio_history_changes": "id"}[table]
            for offset in range(0, 10001, 1000):
                result = (self.client.table(table).select(columns, count="exact")
                          .eq("user_id", self.owner).order(order).order(tie).range(offset, offset+999).execute())
                if result.count is None or result.count > 10000:
                    raise HTTPException(503, "The complete planning history could not be verified.")
                if expected is not None and expected != result.count:
                    raise HTTPException(409, "Planning history changed. Refresh this comparison.")
                expected = result.count
                rows.extend(result.data)
                if len(rows) == expected:
                    return rows
                if len(result.data) != 1000:
                    raise HTTPException(503, "The complete planning history could not be verified.")
            raise HTTPException(503, "The complete planning history could not be verified.")
        except APIError as exc:
            if exc.code in ("42P01", "42703", "PGRST204", "PGRST205"):
                return None  # History not deployed: honest unavailability.
            raise HTTPException(503, "Planning history is temporarily unavailable.") from None
        except TransportError:
            raise HTTPException(503, "Planning history is temporarily unavailable.") from None

    def budget_versions(self):
        first = self.insight_rows("arbor_budget_versions", "month,amount_php::text,recorded_at", "month")
        if first != self.insight_rows("arbor_budget_versions", "month,amount_php::text,recorded_at", "month"):
            raise HTTPException(409, "Your budget changed. Refresh this review.")
        return first

    def alignment_history(self):
        tables = [("arbor_portfolio_snapshots", "day,captured_at,value_php::text,allocation_values", "captured_at"),
                  ("arbor_plan_versions", "id,valid_from,profile_data", "id"),
                  ("arbor_portfolio_history_changes", "affected_from,changed_at", "changed_at")]
        first = [self.insight_rows(*t) for t in tables]
        if first != [self.insight_rows(*t) for t in tables]:
            raise HTTPException(409, "Your planning records changed. Refresh this comparison.")
        observations, versions, changes = first
        if changes is None:
            return None, versions
        if observations is not None:
            observations = [r for r in observations if not any(
                c["affected_from"] <= r["day"] and
                datetime.fromisoformat(c["changed_at"].replace("Z", "+00:00")) > datetime.fromisoformat(r["captured_at"].replace("Z", "+00:00"))
                for c in changes)]
        return observations, versions
