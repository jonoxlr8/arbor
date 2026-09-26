"""Disposable localhost expand/contract check against the actual SQL views."""
import json
import os
import subprocess
from datetime import datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.services.live_portfolio import HoldingInput, HoldingLedgerMetadata


pytestmark = pytest.mark.skipif(
    os.environ.get("ARBOR_LOCAL_LEDGER_TEST") != "1", reason="isolated local PostgreSQL only"
)
HOST = "127.0.0.1"
PORT = "5432"
DATABASE = "arbor_ledger_test"
USER = "arbor_test"
A = "00000000-0000-0000-0000-000000000004"
B = "00000000-0000-0000-0000-000000000005"
LEGACY_COLUMNS = (
    "id", "user_id", "product_id", "provider", "units", "cost_basis_php",
    "created_at", "updated_at", "manual_value_php", "manual_value_updated_at",
)


class DeployedHolding(HoldingInput):
    """The strict Holding fields in the currently deployed revision."""

    id: UUID
    created_at: datetime
    updated_at: datetime
    manual_value_updated_at: datetime | None = None


def sql(statement: str) -> str:
    expected = {"PGHOST": HOST, "PGPORT": PORT, "PGDATABASE": DATABASE, "PGUSER": USER}
    assert all(os.environ.get(key) == value for key, value in expected.items())
    result = subprocess.run(
        ["psql", "-w", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1",
         "-h", HOST, "-p", PORT, "-U", USER, "-d", DATABASE, "-c", statement],
        check=True, capture_output=True, text=True, timeout=30,
    )
    return result.stdout.strip()


def owner_rows(owner: str, view: str) -> list[dict]:
    text = sql(
        f"begin; set local role authenticated; set local request.jwt.claim.sub='{owner}'; "
        f"select row_to_json(v)::text from (select * from public.{view} order by id) v; commit;"
    )
    return [json.loads(line) for line in text.splitlines() if line]


def fixture_rows():
    sql(f"insert into auth.users(id) values ('{A}'),('{B}') on conflict do nothing")
    sql(
        f"begin; set local role authenticated; set local request.jwt.claim.sub='{A}'; "
        "insert into public.arbor_portfolio_holdings(product_id,provider,units,cost_basis_php) "
        "values('gotrade_vt','gotrade',2.5,250) on conflict (user_id,product_id) do nothing; "
        "insert into public.arbor_portfolio_holdings(product_id,provider,manual_value_php) "
        "values('gcash_global_equity','gcash',800) on conflict (user_id,product_id) do nothing; commit;"
    )
    sql(
        f"begin; set local role authenticated; set local request.jwt.claim.sub='{B}'; "
        "insert into public.arbor_portfolio_holdings(product_id,provider,units) "
        "values('gotrade_vgt','gotrade',1) on conflict (user_id,product_id) do nothing; commit;"
    )


def test_deployed_strict_model_accepts_legacy_view_before_and_after_migration():
    fixture_rows()
    columns = sql(
        "select string_agg(column_name,',' order by ordinal_position) "
        "from information_schema.columns where table_schema='public' "
        "and table_name='arbor_portfolio_holding_values'"
    )
    assert tuple(columns.split(",")) == LEGACY_COLUMNS
    rows = owner_rows(A, "arbor_portfolio_holding_values")
    assert {row["product_id"] for row in rows} == {"gotrade_vt", "gcash_global_equity"}
    for row in rows:
        assert tuple(row) == LEGACY_COLUMNS
        DeployedHolding.model_validate({key: value for key, value in row.items() if key != "user_id"})
    fund = next(row for row in rows if row["product_id"] == "gcash_global_equity")
    assert fund["units"] is None and fund["manual_value_php"] == "800"
    with pytest.raises(ValidationError):
        DeployedHolding.model_validate({**{k: v for k, v in rows[0].items() if k != "user_id"},
                                        "opening_units": "2.5"})
    assert {row["product_id"] for row in owner_rows(B, "arbor_portfolio_holding_values")} == {"gotrade_vgt"}


def test_phase1_ledger_view_is_owner_scoped_after_migration():
    fixture_rows()
    assert sql("select to_regclass('public.arbor_portfolio_holding_ledger_values') is not null") == "t"
    assert sql("select 'security_invoker=true'=any(reloptions) from pg_class "
               "where oid='public.arbor_portfolio_holding_values'::regclass") == "t"
    assert sql("select 'security_invoker=true'=any(reloptions) from pg_class "
               "where oid='public.arbor_portfolio_holding_ledger_values'::regclass") == "t"
    sql(
        f"begin; set local role authenticated; set local request.jwt.claim.sub='{A}'; "
        "select public.arbor_record_investment('gotrade_vt','gotrade',"
        "(now() at time zone 'Asia/Manila')::date,1,100,"
        "'00000000-0000-0000-0000-000000000106'); commit;"
    )
    rows = owner_rows(A, "arbor_portfolio_holding_ledger_values")
    assert {row["user_id"] for row in rows} == {A}
    assert {tuple(row) for row in rows} == {("id", "user_id", "opening_units", "opening_cost_php", "has_entries")}
    metadata = [HoldingLedgerMetadata.model_validate({k: v for k, v in row.items() if k != "user_id"}) for row in rows]
    assert sorted(str(item.opening_units) for item in metadata) == ["0", "2.5"]
    assert sum(item.has_entries for item in metadata) == 1
    assert {row["user_id"] for row in owner_rows(B, "arbor_portfolio_holding_ledger_values")} == {B}
    assert sql("select has_table_privilege('anon','public.arbor_portfolio_holding_ledger_values','SELECT')") == "f"
