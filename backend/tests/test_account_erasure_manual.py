from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest
from app.services.account_erasure_manual import Binding, TABLES, render


def binding():
    counts = {key: None if key == 'arbor_ask_usage_monthly' else 0 for key in TABLES}
    return Binding('gnjjtlswwhkpiabyayvi', uuid4(), uuid4(), uuid4(), 1,
                   datetime.now(timezone.utc), counts)


def test_modes_are_explicit_and_execution_disabled_by_default():
    b = binding(); now = datetime.now(timezone.utc)
    for mode in ('zero_sessions', 'banned_barrier'):
        sql = render(b, 'database', now, now + timedelta(seconds=180), admission_mode=mode)
        assert 'execution_approved boolean:=false' in sql
        assert sql.endswith('ROLLBACK;')
        assert f"admission_mode text:='{mode}'" in sql
        assert 'DELETE FROM auth.' not in sql and 'DELETE FROM storage.' not in sql
    assert "admission_mode text:='zero_sessions'" in render(b, 'database', now, now + timedelta(seconds=180))
    with pytest.raises(ValueError):
        render(b, 'database', now, now + timedelta(seconds=180), admission_mode='fallback')


@pytest.mark.parametrize('phase', ['sessions_ready', 'database', 'auth_ready'])
def test_ban_is_authoritative_locked_bounded_and_storage_fails_closed(phase):
    b = binding(); now = datetime.now(timezone.utc)
    sql = render(b, phase, now, now + timedelta(seconds=180), admission_mode='banned_barrier')
    assert 'u.created_at=bound_original_created FOR UPDATE' in sql
    assert 'banned_until<expiry' in sql
    assert 'manual_current_ban_required' in sql
    assert 'manual_storage_configuration_changed' in sql
    assert 'manual_unreviewed_owner_surface' in sql
    assert 'manual_lifecycle_policy_changed' in sql
    assert "phase IN ('auth_confirm','complete')" in sql
    assert 'auth.sessions' in sql


@pytest.mark.parametrize('phase', ['auth_confirm', 'complete'])
def test_final_receipt_always_requires_identity_and_sessions_absent(phase):
    b = binding(); now = datetime.now(timezone.utc)
    sql = render(b, phase, now, now + timedelta(seconds=180), admission_mode='banned_barrier')
    assert 'manual_auth_identity_still_present' in sql
    assert 'manual_sessions_or_storage_remain' in sql
    assert "'whole_account_erasure_claim',false" in sql


def test_reviewed_histories_require_cascade_owner_security_without_relaxing_unknown_surfaces():
 b=binding();now=datetime.now(timezone.utc)
 sql=render(b,'database',now,now+timedelta(seconds=180),admission_mode='banned_barrier')
 assert "ARRAY['arbor_budget_versions','arbor_plan_versions']" in sql
 assert 'manual_history_schema_changed' in sql and 'manual_history_security_changed' in sql
 assert "k.confdeltype='c' AND k.convalidated" in sql
 assert "has_table_privilege('service_role'" in sql
 assert 'manual_unreviewed_owner_surface' in sql
