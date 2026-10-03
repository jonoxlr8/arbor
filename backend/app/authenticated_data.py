"""JWT-bound table/RPC queries with deterministic HTTP ownership.

Building a query allocates no connections. Each execute uses the public
PostgREST client in a context manager, so success and failure both close it.
The existing fluent table/RPC interface stays intact for application callers.
"""
from copy import deepcopy
from dataclasses import dataclass, field

import httpx
from postgrest import SyncPostgrestClient

# Only the public builder methods used by Arbor's authenticated data callers.
_QUERY_METHODS = frozenset({
    "select", "insert", "update", "delete", "eq", "in_", "is_",
    "gte", "lt", "lte", "order", "limit", "range",
})


@dataclass(frozen=True, repr=False)
class AuthenticatedDataClient:
    url: str = field(repr=False)
    key: str = field(repr=False)
    token: str = field(repr=False)

    def table(self, name):
        return DataQuery(self)._append("table", (name,), {})

    def rpc(self, name, params):
        return DataQuery(self)._append("rpc", (name, params), {})


@dataclass(frozen=True, repr=False)
class DataQuery:
    owner: AuthenticatedDataClient = field(repr=False)
    operations: tuple = field(default=(), repr=False)

    def _append(self, name, args, kwargs):
        # Snapshot caller-owned payloads before deferred execution.
        return DataQuery(self.owner, self.operations + (
            (name, deepcopy(args), deepcopy(kwargs)),
        ))

    def __getattr__(self, name):
        if name not in _QUERY_METHODS:
            raise AttributeError(name)
        return lambda *args, **kwargs: self._append(name, args, kwargs)

    def execute(self):
        headers = {"apikey": self.owner.key,
                   "Authorization": f"Bearer {self.owner.token}"}
        base_url = self.owner.url.rstrip("/") + "/rest/v1"
        # Match the existing Supabase PostgREST timeout/HTTP settings. The outer
        # context also closes HTTP if constructing the PostgREST client fails.
        with httpx.Client(timeout=120, follow_redirects=True, http2=True) as http:
            with SyncPostgrestClient(base_url, schema="public", headers=headers,
                                     http_client=http) as client:
                query = client
                for name, args, kwargs in self.operations:
                    query = getattr(query, name)(*args, **kwargs)
                return query.execute()
