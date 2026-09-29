"""Factual tracking must page every canonical owner-scoped history point."""
from types import SimpleNamespace

from app.services.portfolio_store import PortfolioStore


def test_all_history_pages_use_owner_rpc_and_keep_sql_gain_fields():
    rows = [dict(day=f"2026-01-{(index % 28) + 1:02d}", value_php="100.00",
                 recorded_cost_php="100.00", recorded_gain_php="0.00",
                 recorded_gain_percentage="0.00", cost_complete=True,
                 cost_context_captured=True, captured_at="2026-01-01T00:00:00Z")
            for index in range(1003)]
    requests = []

    class Query:
        def __init__(self, arguments):
            self.start = arguments["p_offset"]
            self.end = self.start + arguments["p_limit"]

        def execute(self):
            return SimpleNamespace(data=rows[self.start:self.end])

    def rpc(name, arguments):
        requests.append(("rpc", name, arguments))
        return Query(arguments)

    store = object.__new__(PortfolioStore)
    store.owner = "dedicated-owner"
    store.client = SimpleNamespace(rpc=rpc)
    actual = store.history()
    assert len(actual) == 1003
    assert actual[-1]["recorded_gain_php"] == "0.00"
    # No user ID is passed by the client; the SQL RPC derives it from auth.uid().
    assert ("rpc", "arbor_reconstructed_portfolio_history", {"p_offset": 0, "p_limit": 1000}) in requests
    assert ("rpc", "arbor_reconstructed_portfolio_history", {"p_offset": 1000, "p_limit": 1000}) in requests
