-- REVIEW PROPOSAL ONLY. Default transaction rolls back; no cron or app grants.
-- After explicit owner approval, the operator may enable the policy line below.
BEGIN;
SET LOCAL statement_timeout='8s';
SET LOCAL lock_timeout='2s';
-- SET LOCAL arbor.request_retention_policy_reviewed='90-days';
DO $guard$ BEGIN
 IF current_setting('arbor.request_retention_policy_reviewed',true) IS DISTINCT FROM '90-days'
 THEN RAISE EXCEPTION 'request_retention_policy_not_approved'; END IF;
 IF session_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.arbor_investment_requests'::regclass))
 THEN RAISE EXCEPTION 'request_retention_operator_required'; END IF;
END $guard$;
WITH candidates AS (
 SELECT r.id FROM public.arbor_investment_requests r
 LEFT JOIN arbor_private.account_lifecycle l ON l.user_id=r.user_id
 WHERE r.received_at < statement_timestamp()-interval '90 days'
  AND coalesce(l.state,'active')='active'
  AND NOT EXISTS(SELECT 1 FROM arbor_private.account_erasure_operations o
    WHERE o.owner_id=r.user_id AND (o.holds<>'[]'::jsonb
      OR o.state IN ('reviewed','erasing','data_erased','auth_erased')))
 ORDER BY r.received_at,r.id LIMIT 250
 FOR UPDATE OF r SKIP LOCKED
), removed AS (
 DELETE FROM public.arbor_investment_requests r USING candidates c
 WHERE r.id=c.id RETURNING r.received_at
)
SELECT count(*) as proposed_rows_removed,min(received_at) as oldest_received,
       max(received_at) as newest_received FROM removed;
ROLLBACK;
-- COMMIT requires a separately reviewed invocation; do not claim a hard expiry.
