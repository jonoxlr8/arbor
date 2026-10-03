-- LOCAL PROPOSAL ONLY: do not apply hosted without separate schema/access approval.
-- No new stored data, execution grants, mutation RPCs or changes to canonical kernels.
BEGIN;
CREATE FUNCTION arbor_private.deletion_review_enabled(p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT false $$;
REVOKE ALL ON FUNCTION arbor_private.deletion_review_enabled(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION arbor_private.require_deletion_review() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM arbor_private.require_request_admin();
 IF NOT arbor_private.deletion_review_enabled(auth.uid()) THEN
  RAISE EXCEPTION 'deletion_review_not_authorized' USING errcode='PT403'; END IF;
END $$;
REVOKE ALL ON FUNCTION arbor_private.require_deletion_review() FROM PUBLIC,anon,authenticated,service_role;
CREATE VIEW arbor_private.deletion_review_rows AS
SELECT coalesce(q.request_id,o.request_id) AS request_id,q.requested_at,
 coalesce(q.status,'record_unavailable') AS request_status,q.withdrawn_at,l.state AS lifecycle_state,
 coalesce(o.state,'not_started') AS processing_state,coalesce(o.holds,'[]'::jsonb) AS holds,
 o.verified_at,o.completed_at,o.receipt_expires_at,coalesce(o.provider_status,'unassessed') AS provider_status,
 CASE WHEN o.state='completed' AND o.completed_at IS NOT NULL AND o.receipt_expires_at>clock_timestamp()
  AND o.provider_status IN ('pending_copies','confirmed')
  AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=o.owner_id)
  AND NOT EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=o.owner_id)
  THEN o.id ELSE NULL END AS receipt_id
FROM arbor_private.account_deletion_requests q
FULL JOIN arbor_private.account_erasure_operations o ON o.request_id=q.request_id AND o.owner_id=q.user_id
LEFT JOIN arbor_private.account_lifecycle l ON l.user_id=q.user_id
WHERE o.state IS DISTINCT FROM 'completed' OR o.receipt_expires_at>clock_timestamp() OR o.holds<>'[]'::jsonb;
REVOKE ALL ON arbor_private.deletion_review_rows FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.arbor_admin_deletion_access_v1() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 RETURN jsonb_build_object('allowed',public.arbor_account_active_v1() AND EXISTS(
  SELECT 1 FROM arbor_private.admin_owner WHERE user_id=auth.uid()) AND arbor_private.deletion_review_enabled(auth.uid()));
END $$;
CREATE FUNCTION public.arbor_admin_deletions_v1(p_limit integer DEFAULT 50,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE items jsonb; BEGIN
 PERFORM arbor_private.require_deletion_review();
 IF p_limit IS NULL OR p_offset IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset NOT BETWEEN 0 AND 10000
  THEN RAISE EXCEPTION 'invalid_page' USING errcode='PT422'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO items FROM (
  SELECT * FROM arbor_private.deletion_review_rows ORDER BY coalesce(requested_at,completed_at) DESC,request_id LIMIT p_limit+1 OFFSET p_offset)t;
 RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(items)>p_limit THEN items-p_limit ELSE items END,'has_more',jsonb_array_length(items)>p_limit,'offset',p_offset);
END $$;
CREATE FUNCTION public.arbor_admin_deletion_v1(p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE item jsonb; BEGIN
 PERFORM arbor_private.require_deletion_review();
 SELECT to_jsonb(t) INTO item FROM arbor_private.deletion_review_rows t WHERE request_id=p_request;
 IF item IS NULL THEN RAISE EXCEPTION 'request_unavailable' USING errcode='PT404'; END IF;
 RETURN item;
END $$;
REVOKE ALL ON FUNCTION public.arbor_admin_deletion_access_v1(),public.arbor_admin_deletions_v1(integer,integer),public.arbor_admin_deletion_v1(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.arbor_admin_deletion_access_v1(),public.arbor_admin_deletions_v1(integer,integer),public.arbor_admin_deletion_v1(uuid) TO authenticated;
-- Capability remains false for EVERY actor, including the existing investment owner.
-- Separate later approved operator DDL must bind this function to one verified actor UUID;
-- check current owner/live session/Terms independently on every read. No table grant.
COMMIT;
