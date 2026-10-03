-- Separate owner-only READ capability; the original seven-field store is reused.
-- Installation remains default closed. Reviewed actor-bound activation is separate.
BEGIN;
CREATE FUNCTION arbor_private.ask_feedback_review_enabled(p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT false $$;
REVOKE ALL ON FUNCTION arbor_private.ask_feedback_review_enabled(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.arbor_admin_ask_feedback_access_v1() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 RETURN jsonb_build_object('allowed',public.arbor_account_active_v1() AND EXISTS(
 SELECT 1 FROM arbor_private.admin_owner WHERE user_id=auth.uid()) AND arbor_private.ask_feedback_review_enabled(auth.uid()));
END $$;
CREATE FUNCTION public.arbor_admin_ask_feedback_v1(p_limit integer DEFAULT 50,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE result jsonb; BEGIN
 PERFORM arbor_private.require_request_admin();
 IF NOT arbor_private.ask_feedback_review_enabled(auth.uid()) THEN RAISE EXCEPTION 'feedback_review_denied' USING errcode='PT403'; END IF;
 IF p_limit IS NULL OR p_offset IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'invalid_page' USING errcode='PT422'; END IF;
 -- One statement snapshot for list and totals. IDs are tie breakers, never projected.
 WITH page AS (SELECT helpful,reason,intent,created_at FROM public.arbor_ask_feedback ORDER BY created_at DESC,id LIMIT p_limit+1 OFFSET p_offset),
 topics AS (SELECT intent,count(*) FILTER(WHERE helpful) AS helpful,count(*) FILTER(WHERE NOT helpful) AS not_helpful FROM public.arbor_ask_feedback GROUP BY intent)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM page p),'[]'::jsonb),
 'topics',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY not_helpful DESC,intent) FROM topics t),'[]'::jsonb),
 'offset',p_offset) INTO result;
 RETURN jsonb_set(result,'{items}',CASE WHEN jsonb_array_length(result->'items')>p_limit THEN (result->'items')-p_limit ELSE result->'items' END)||jsonb_build_object('has_more',jsonb_array_length(result->'items')>p_limit);
END $$;
REVOKE ALL ON FUNCTION public.arbor_admin_ask_feedback_access_v1(),public.arbor_admin_ask_feedback_v1(integer,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.arbor_admin_ask_feedback_access_v1(),public.arbor_admin_ask_feedback_v1(integer,integer) TO authenticated;
COMMIT;
