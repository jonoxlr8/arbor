"""Factual tracking must return every retained owner-scoped observation."""
from types import SimpleNamespace

from app.services.portfolio_store import PortfolioStore


def test_all_history_pages_remain_owner_scoped_and_keep_sql_gain_fields():
    rows = [dict(day=f"2026-01-{(index % 28) + 1:02d}", value_php="100.00",
                 recorded_cost_php="100.00", recorded_gain_php="0.00",
                 recorded_gain_percentage="0.00", cost_complete=True,
                 cost_context_captured=True, captured_at="2026-01-01T00:00:00Z")
            for index in range(1003)]
    requests = []

    class Query:
        def select(self, columns):
            requests.append(("columns", columns))
            return self

        def eq(self, field, owner):
            requests.append(("owner", field, owner))
            return self

        def order(self, field):
            requests.append(("order", field))
            return self

        def range(self, start, end):
            requests.append(("range", start, end))
            self.start, self.end = start, end
            return self

        def execute(self):
            return SimpleNamespace(data=rows[self.start:self.end + 1])

    def table(name):
        requests.append(("table", name))
        return Query()

    store = object.__new__(PortfolioStore)
    store.owner = "dedicated-owner"
    store.client = SimpleNamespace(table=table)
    actual = store.history()
    assert len(actual) == 1003
    assert actual[-1]["recorded_gain_php"] == "0.00"
    assert ("range", 0, 999) in requests
    assert ("range", 1000, 1999) in requests
    assert requests.count(("owner", "user_id", "dedicated-owner")) == 2
    assert requests.count(("table", "arbor_portfolio_history")) == 2
    assert any(row[0] == "columns" and "recorded_cost_php" in row[1] for row in requests)
