"""Fixed-loopback repository for the local workflow; never reads credentials.

OS locking serializes operator processes; SQL functions independently guard
request versions and owner admission against concurrent application actions.
"""
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
from uuid import UUID, uuid4

from scripts.account_erasure_local import query


class LocalRepository:
    def __init__(self):
        if os.environ.get("ARBOR_LOCAL_ERASURE_TEST") != "1":
            raise ValueError("Synthetic local qualification flag required.")
        if query("select current_setting('data_directory')") not in {
                "/tmp/arbor-export-pg", "/private/tmp/arbor-export-pg"}:
            raise ValueError("Unexpected database; stop.")
        if query("select current_database()") != "arbor_lifecycle_qualification":
            raise ValueError("Unexpected database; stop.")

    @contextmanager
    def locked(self, owner):
        owner = UUID(str(owner))
        directory = Path("/tmp/arbor-local-erasure-locks")
        directory.mkdir(mode=0o700, exist_ok=True)
        if directory.is_symlink() or directory.stat().st_uid != os.getuid():
            raise ValueError("Unsafe local lock directory.")
        fd = os.open(directory / str(owner), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            yield
        finally:
            os.close(fd)

    def request(self, owner):
        owner = UUID(str(owner))
        result = query(f"select jsonb_build_object('request_id',q.request_id,'version',l.version,'state',l.state) from arbor_private.account_lifecycle l join arbor_private.account_deletion_requests q using(user_id) where l.user_id='{owner}'")
        if not result:
            raise ValueError("Current request missing.")
        data = json.loads(result)
        data["request_id"] = UUID(data["request_id"])
        return data

    def inventory(self, owner):
        return json.loads(query(f"select arbor_private.erasure_inventory('{UUID(str(owner))}')"))

    def review(self, evidence, counts):
        # Reconcile a review whose commit response was lost. Never create a
        # second operation or overwrite another request's authorization.
        existing = query(f"select id from arbor_private.account_erasure_operations where owner_id='{UUID(str(evidence.owner_id))}'")
        operation = UUID(existing) if existing else uuid4()
        query(f"select arbor_private.erasure_review('{evidence.owner_id}','{evidence.request_id}',{int(evidence.request_version)},'{operation}',true)")
        reviewed = self.read(operation)
        if reviewed["counts"] != counts:
            raise ValueError("Inventory changed during review; repeat assessment.")
        return reviewed

    def read(self, operation_id):
        result = query(f"select to_jsonb(o) from arbor_private.account_erasure_operations o where id='{UUID(str(operation_id))}'")
        if not result:
            raise ValueError("Operation missing.")
        data = json.loads(result)
        for field in ("id", "owner_id", "request_id"):
            data[field] = UUID(data[field])
        return data

    def transition(self, name, operation):
        operation_id = UUID(str(operation["id"]))
        query(f"select arbor_private.{name}('{operation_id}')")
        return self.read(operation_id)

    def begin(self, operation):
        return self.transition("erasure_begin", operation)

    def erase_data(self, operation):
        return self.transition("erasure_data", operation)

    def mark_auth_erased(self, operation):
        return self.transition("erasure_auth_confirm", operation)

    def complete(self, operation):
        status = operation["provider_status"]
        if status not in {"pending_copies", "confirmed"}:
            raise ValueError("Provider assessment missing.")
        operation_id = UUID(str(operation["id"]))
        query(f"select arbor_private.erasure_finish('{operation_id}','{status}')")
        return self.read(operation_id)
