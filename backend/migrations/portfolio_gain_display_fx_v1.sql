-- LOCAL ONLY: additive display metadata, no accounting/history rewrite or grants.
BEGIN;
DO $$ DECLARE original text; revised text; BEGIN
 original:=pg_get_functiondef('public.arbor_reconstructed_portfolio_history(integer,integer)'::regprocedure);
 IF position('v.cost_context_captured,v.value_usd,s.superseded into snap' in original)=0
 OR position('join public.arbor_portfolio_observed_history_status s' in original)=0
 OR position('''value_usd'',snap.value_usd,' in original)=0
 THEN RAISE EXCEPTION 'gain_display_fx_history_shape_incompatible'; END IF;
 revised:=replace(original,'v.cost_context_captured,v.value_usd,s.superseded into snap',
  'v.cost_context_captured,v.value_usd,s.superseded,display_quote.usd_php_rate_at_capture into snap');
 revised:=replace(revised,'join public.arbor_portfolio_observed_history_status s',
  'join public.arbor_portfolio_snapshots display_quote on display_quote.user_id=v.user_id and display_quote.day=v.day join public.arbor_portfolio_observed_history_status s');
 revised:=replace(revised,'''value_usd'',snap.value_usd,',
  '''value_usd'',snap.value_usd,''display_fx'',case when snap.value_usd is not null and snap.usd_php_rate_at_capture>0 and snap.captured_at is not null then pg_catalog.jsonb_build_object(''rate'',snap.usd_php_rate_at_capture::text,''source'',''captured_snapshot'',''valuation_date'',snap.day,''captured_at'',snap.captured_at,''as_of'',null) else null end,');
 -- Capture stores the rate and capture time, not the original quote timestamp.
 -- Null as_of and captured_snapshot must not be presented as an invented quote date.
 EXECUTE revised;
END $$;
COMMIT;
