BEGIN;
-- Local-only proposal. No Auth hook is enabled by this migration.
-- CLI absent in this workspace; existing reviewed account_* migration convention.
CREATE TABLE arbor_private.terms_documents (
 version text PRIMARY KEY CHECK(version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
 content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
 document_text text NOT NULL CHECK(octet_length(document_text)<=65536),
 published_at timestamptz, effective_at timestamptz,
 UNIQUE(version,content_digest),
 CHECK(content_digest=encode(sha256(convert_to(document_text,'UTF8')),'hex'))
);
CREATE TABLE arbor_private.terms_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 current_version text NOT NULL REFERENCES arbor_private.terms_documents(version),
 enforcement_enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE arbor_private.terms_signup_intents (
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 email_hash text NOT NULL UNIQUE CHECK(email_hash ~ '^[0-9a-f]{64}$'),
 version text NOT NULL REFERENCES arbor_private.terms_documents(version),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '10 minutes')
);
CREATE TABLE arbor_private.terms_acceptances (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 version text NOT NULL REFERENCES arbor_private.terms_documents(version),
 content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 source text NOT NULL CHECK(source IN ('signup','account')),
 PRIMARY KEY(user_id,version),
 FOREIGN KEY(version,content_digest) REFERENCES arbor_private.terms_documents(version,content_digest)
);
ALTER TABLE arbor_private.terms_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE arbor_private.terms_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE arbor_private.terms_signup_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE arbor_private.terms_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arbor_private.terms_documents,arbor_private.terms_control,arbor_private.terms_signup_intents,arbor_private.terms_acceptances FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO arbor_private.terms_documents(version,content_digest,document_text) VALUES ('2026-10-01.1','16081efb1de73fb08c2afeaa905ac4b6d0659c2f1ac6dab6d44d66642602e599',$document${"title":"Terms","introduction":"The boundaries of the current private beta.","sections":[["Operator and contact","The current operator is Jonathan Isidoro, operating Arbor. Contact support@arbor.ph for questions about the beta."],["Beta eligibility","The beta is for people aged 18 or older in the Philippines. This is the beta eligibility policy; Arbor does not currently verify age."],["What Arbor provides","Arbor is a planning, tracking and education companion. You choose your approach and investments. Arbor calculates, tracks and explains. It does not hold money, execute trades, open provider accounts or automatically synchronize brokerage transactions."],["Your account and records","Protect account access and provide accurate information. Record actual investments from your provider records, including units received and the amount paid. A planned amount, unfinished provider recording or monthly check-in is not proof that an investment occurred. Do not submit brokerage credentials or someone else's private financial information."],["Investment decisions","You decide whether to follow a calculated breakdown. Information and explanations are not personalized buy/sell instructions. Verify provider eligibility, fees, minimums, execution details and current product documents before investing. Provider references identify supported paths and imply no partnership or endorsement."],["Values, projections and explanations","Reference values can be delayed, incomplete or unavailable and can differ from execution prices. Contributions are not investment profit. Projections use planning assumptions and are hypothetical; they do not guarantee results. Explanations can be mistaken. Use your provider records to verify transactions and seek qualified advice where needed."],["Beta availability","Private-beta members currently receive an Arbor Plus trial. Monthly contribution planning, Plan Alignment, Projection & What If and deeper portfolio-aware explanations are Plus capabilities. Subscription checkout and public Free access are not active. Get started opens account creation. No trial duration, future price, billing date or automatic conversion is promised here."],["Service availability and responsible use","Arbor is a beta service. Features and availability may change, and interruptions may occur. Use the service lawfully and respect other people's account access and privacy. Access may be restricted where necessary to protect accounts, prevent misuse or meet applicable legal requirements. Contact support@arbor.ph about an access concern."],["Responsibility and complaints","You remain responsible for your investment decisions and for verifying records against your provider. Philippine law governs these intended beta conditions. Contact support@arbor.ph first about a concern so Jonathan can review it. This does not require arbitration or prevent you from exercising statutory rights or approaching an appropriate authority. Nothing here excludes rights or responsibilities that applicable law does not permit to be excluded."],["About these terms","Acceptance is recorded only after an explicit action for an identified Terms version. Publishing this page does not establish that an existing user has accepted it. A material update requires a new acceptance before normal account use; export, deletion requests and support remain accessible. No payment obligation, fixed trial duration or automatic paid conversion is created by these terms."]]}$document$);
-- Document bodies and receipt evidence cannot be rewritten in place.
CREATE FUNCTION arbor_private.terms_immutable_document()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'terms_document_immutable'; END IF;
 IF (NEW.version,NEW.content_digest,NEW.document_text) IS DISTINCT FROM (OLD.version,OLD.content_digest,OLD.document_text)
 OR (OLD.published_at IS NOT NULL AND NEW.published_at IS DISTINCT FROM OLD.published_at)
 OR (OLD.effective_at IS NOT NULL AND NEW.effective_at IS DISTINCT FROM OLD.effective_at)
 THEN RAISE EXCEPTION 'terms_document_immutable'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION arbor_private.terms_immutable_document() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER terms_document_immutable BEFORE UPDATE OR DELETE ON arbor_private.terms_documents FOR EACH ROW EXECUTE FUNCTION arbor_private.terms_immutable_document();
CREATE FUNCTION arbor_private.terms_immutable_receipt()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'terms_receipt_immutable'; END $$;
REVOKE ALL ON FUNCTION arbor_private.terms_immutable_receipt() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER terms_receipt_immutable BEFORE UPDATE ON arbor_private.terms_acceptances FOR EACH ROW EXECUTE FUNCTION arbor_private.terms_immutable_receipt();
INSERT INTO arbor_private.terms_control(current_version) VALUES ('2026-10-01.1');
CREATE FUNCTION public.arbor_terms_current_v1()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('version',d.version,'digest',d.content_digest,'document_text',d.document_text,'published_at',d.published_at,'effective_at',d.effective_at,'enforcement_enabled',c.enforcement_enabled)
 FROM arbor_private.terms_control c JOIN arbor_private.terms_documents d ON d.version=c.current_version
$$;
REVOKE ALL ON FUNCTION public.arbor_terms_current_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.arbor_terms_current_v1() TO anon,authenticated;

CREATE FUNCTION public.arbor_terms_signup_intent_v1(p_email text,p_version text,p_digest text,p_confirm boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' SET lock_timeout='2s' AS $$
DECLARE c arbor_private.terms_control%rowtype; d arbor_private.terms_documents%rowtype; e text; token text; issued timestamptz;
BEGIN
 PERFORM set_config('response.headers','[{"Cache-Control":"private, no-store"}]',true);
 IF p_confirm IS DISTINCT FROM true OR p_email IS NULL OR length(p_email)>254
 OR btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 THEN RAISE EXCEPTION 'terms_confirmation_required' USING ERRCODE='PT400'; END IF;
 IF coalesce(current_setting('request.headers',true),'{}')::jsonb->>'prefer' ~* 'tx[[:space:]]*=[[:space:]]*rollback'
 THEN RAISE EXCEPTION 'terms_transaction_override_denied' USING ERRCODE='PT400'; END IF;
 SELECT * INTO c FROM arbor_private.terms_control FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'terms_configuration_missing' USING ERRCODE='PT503'; END IF;
 SELECT * INTO d FROM arbor_private.terms_documents WHERE version=c.current_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'terms_document_missing' USING ERRCODE='PT503'; END IF;
 IF p_version IS DISTINCT FROM d.version OR p_digest IS DISTINCT FROM d.content_digest
 THEN RAISE EXCEPTION 'terms_version_changed' USING ERRCODE='PT409'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('arbor-terms-intents',0)) THEN RAISE EXCEPTION 'terms_busy' USING ERRCODE='PT429'; END IF;
 e:=encode(sha256(convert_to(lower(btrim(p_email)),'UTF8')),'hex');
 IF EXISTS(SELECT 1 FROM arbor_private.terms_signup_intents WHERE email_hash=e AND created_at>clock_timestamp()-interval '10 seconds')
 THEN RAISE EXCEPTION 'terms_busy' USING ERRCODE='PT429'; END IF;
 DELETE FROM arbor_private.terms_signup_intents WHERE expires_at<=clock_timestamp() OR email_hash=e;
 IF (SELECT count(*) FROM arbor_private.terms_signup_intents)>=1000 THEN RAISE EXCEPTION 'terms_capacity' USING ERRCODE='PT429'; END IF;
 token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');issued:=clock_timestamp();
 INSERT INTO arbor_private.terms_signup_intents(token_hash,email_hash,version,created_at,expires_at)
 VALUES(encode(sha256(convert_to(token,'UTF8')),'hex'),e,d.version,issued,issued+interval '10 minutes');
 RETURN jsonb_build_object('intent_token',token,'version',d.version,'digest',d.content_digest,'expires_at',issued+interval '10 minutes');
END $$;
REVOKE ALL ON FUNCTION public.arbor_terms_signup_intent_v1(text,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.arbor_terms_signup_intent_v1(text,text,text,boolean) TO anon,authenticated;

CREATE FUNCTION public.arbor_terms_before_user_created_v1(event jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET statement_timeout='2s' AS $$
DECLARE c arbor_private.terms_control%rowtype; token text; e text;
BEGIN
 SELECT * INTO c FROM arbor_private.terms_control FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'terms_configuration_missing' USING ERRCODE='PT503'; END IF;
 IF NOT c.enforcement_enabled THEN RETURN '{}'::jsonb; END IF;
 token:=event->'user'->'user_metadata'->>'arbor_terms_intent'; e:=event->'user'->>'email';
 IF token IS NULL OR token !~ '^[0-9a-f]{64}$' OR e IS NULL OR length(e)>254
 OR NOT EXISTS(SELECT 1 FROM arbor_private.terms_signup_intents i WHERE
 i.token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') AND i.email_hash=encode(sha256(convert_to(lower(btrim(e)),'UTF8')),'hex')
 AND i.version=c.current_version AND i.expires_at>clock_timestamp())
 THEN RETURN jsonb_build_object('error',jsonb_build_object('http_code',400,'message','Review and accept the current Arbor Terms before creating an account.')); END IF;
 RETURN '{}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.arbor_terms_before_user_created_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Hook EXECUTE for supabase_auth_admin is deliberately a separate activation grant.

CREATE FUNCTION arbor_private.terms_signup_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c arbor_private.terms_control%rowtype; i arbor_private.terms_signup_intents%rowtype; d arbor_private.terms_documents%rowtype; token text;
BEGIN
 SELECT * INTO c FROM arbor_private.terms_control FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'terms_configuration_missing' USING ERRCODE='PT503'; END IF;
 token:=NEW.raw_user_meta_data->>'arbor_terms_intent';
 IF token IS NULL AND NOT c.enforcement_enabled THEN RETURN NEW; END IF;
 IF token IS NULL OR token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'terms_signup_intent_required'; END IF;
 SELECT * INTO i FROM arbor_private.terms_signup_intents WHERE token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') FOR UPDATE;
 IF NOT FOUND OR i.email_hash IS DISTINCT FROM encode(sha256(convert_to(lower(btrim(NEW.email)),'UTF8')),'hex')
 OR i.version IS DISTINCT FROM c.current_version OR i.expires_at<=clock_timestamp()
 THEN RAISE EXCEPTION 'terms_signup_intent_invalid'; END IF;
 SELECT * INTO d FROM arbor_private.terms_documents WHERE version=i.version;
 INSERT INTO arbor_private.terms_acceptances(user_id,version,content_digest,accepted_at,source) VALUES(NEW.id,i.version,d.content_digest,clock_timestamp(),'signup');
 DELETE FROM arbor_private.terms_signup_intents WHERE token_hash=i.token_hash;
 -- Remove this short-lived capability from persisted Auth metadata.
 UPDATE auth.users SET raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)-'arbor_terms_intent' WHERE id=NEW.id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION arbor_private.terms_signup_record() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER arbor_terms_signup_record AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION arbor_private.terms_signup_record();

CREATE FUNCTION arbor_private.terms_required(p_owner uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c arbor_private.terms_control%rowtype;
BEGIN
 SELECT * INTO c FROM arbor_private.terms_control;
 IF NOT FOUND THEN RAISE EXCEPTION 'terms_configuration_missing' USING ERRCODE='PT503'; END IF;
 RETURN c.enforcement_enabled AND NOT EXISTS(SELECT 1 FROM arbor_private.terms_acceptances a WHERE a.user_id=p_owner AND a.version=c.current_version);
END $$;
REVOKE ALL ON FUNCTION arbor_private.terms_required(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.arbor_terms_account_v1(p_action text DEFAULT 'status',p_version text DEFAULT NULL,p_digest text DEFAULT NULL,p_confirm boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' SET lock_timeout='2s' AS $$
<<terms_scope>> DECLARE owner_id uuid; c arbor_private.terms_control%rowtype; d arbor_private.terms_documents%rowtype; a arbor_private.terms_acceptances%rowtype;
BEGIN
 PERFORM set_config('response.headers','[{"Cache-Control":"private, no-store"}]',true);
 IF p_action NOT IN ('status','accept') OR p_action IS NULL THEN RAISE EXCEPTION 'terms_action_invalid' USING ERRCODE='PT400'; END IF;
 IF coalesce(current_setting('request.headers',true),'{}')::jsonb->>'prefer' ~* 'tx[[:space:]]*=[[:space:]]*rollback'
 THEN RAISE EXCEPTION 'terms_transaction_override_denied' USING ERRCODE='PT400'; END IF;
 owner_id:=arbor_private.lifecycle_session(p_action='accept');
 PERFORM pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:'||owner_id::text,0));
 SELECT * INTO c FROM arbor_private.terms_control FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'terms_configuration_missing' USING ERRCODE='PT503'; END IF;
 SELECT * INTO d FROM arbor_private.terms_documents WHERE version=c.current_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'terms_document_missing' USING ERRCODE='PT503'; END IF;
 IF p_action='accept' THEN
  IF EXISTS(SELECT 1 FROM arbor_private.account_lifecycle WHERE user_id=owner_id AND state='erasing') OR EXISTS(SELECT 1 FROM arbor_private.account_erasure_operations WHERE account_erasure_operations.owner_id=terms_scope.owner_id AND state IN ('erasing','data_erased','auth_erased','completed')) THEN RAISE EXCEPTION 'terms_erasure_started' USING ERRCODE='PT403'; END IF;
  IF p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'terms_confirmation_required' USING ERRCODE='PT400'; END IF;
  IF p_version IS DISTINCT FROM d.version OR p_digest IS DISTINCT FROM d.content_digest THEN RAISE EXCEPTION 'terms_version_changed' USING ERRCODE='PT409'; END IF;
  INSERT INTO arbor_private.terms_acceptances(user_id,version,content_digest,source) VALUES(owner_id,d.version,d.content_digest,'account') ON CONFLICT(user_id,version) DO NOTHING;
 END IF;
 SELECT * INTO a FROM arbor_private.terms_acceptances WHERE user_id=owner_id AND version=d.version;
 RETURN jsonb_build_object('version',d.version,'digest',d.content_digest,'document_text',d.document_text,'required',c.enforcement_enabled AND a.user_id IS NULL,'accepted_at',a.accepted_at);
END $$;
REVOKE ALL ON FUNCTION public.arbor_terms_account_v1(text,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.arbor_terms_account_v1(text,text,text,boolean) TO authenticated;

-- Enforce ordinary personal data access without gating rights/lifecycle/export.
DO $rewrite$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.arbor_account_active_v1()'::regprocedure);
 IF d NOT LIKE '%owner_id:=arbor_private.lifecycle_session(false);%' THEN RAISE EXCEPTION 'terms_active_guard_incompatible'; END IF;
 d:=replace(d,'owner_id:=arbor_private.lifecycle_session(false);','owner_id:=arbor_private.lifecycle_session(false); IF current_setting(''transaction_read_only'')=''off'' THEN PERFORM 1 FROM arbor_private.terms_control FOR SHARE; END IF; IF arbor_private.terms_required(owner_id) THEN RETURN false; END IF;');
 EXECUTE d;
 -- All current private RPC/trigger/RLS financial admission guards use this helper.
 d:=pg_get_functiondef('public.arbor_account_export_v1(uuid,uuid)'::regprocedure);
 IF d NOT LIKE '%RETURN result;%' OR d LIKE '%terms_acceptances%' THEN RAISE EXCEPTION 'terms_export_incompatible'; END IF;
 d:=replace(d,'RETURN result;', 'result:=result||jsonb_build_object(''terms_acceptances'',coalesce((SELECT jsonb_agg(jsonb_build_object(''version'',version,''content_digest'',content_digest,''accepted_at'',accepted_at,''source'',source) ORDER BY accepted_at) FROM arbor_private.terms_acceptances WHERE user_id=p_verified_owner),''[]''::jsonb)); IF octet_length(result::text)>20971520 THEN RAISE EXCEPTION ''export_too_large''; END IF; RETURN result;');
 EXECUTE d;
 d:=pg_get_functiondef('arbor_private.erasure_inventory(uuid)'::regprocedure);
 IF d NOT LIKE '%IF total>10000%' OR d LIKE '%terms_acceptances%' THEN RAISE EXCEPTION 'terms_erasure_inventory_incompatible'; END IF;
 d:=replace(d,'IF total>10000', 'SELECT count(*) INTO n FROM arbor_private.terms_acceptances WHERE user_id=p_owner; total:=total+n; result:=result||jsonb_build_object(''terms_acceptances'',n); IF total>10000');
 EXECUTE d;
 d:=pg_get_functiondef('arbor_private.erasure_data(uuid)'::regprocedure);
 IF d NOT LIKE '%DELETE FROM arbor_private.account_export_cooldowns%' OR d LIKE '%terms_acceptances%' THEN RAISE EXCEPTION 'terms_erasure_data_incompatible'; END IF;
 d:=replace(d,'DELETE FROM arbor_private.account_export_cooldowns', 'DELETE FROM arbor_private.terms_acceptances WHERE user_id=o.owner_id; DELETE FROM arbor_private.terms_signup_intents WHERE email_hash=(SELECT encode(sha256(convert_to(lower(btrim(email)),''UTF8'')),''hex'') FROM auth.users WHERE id=o.owner_id); DELETE FROM arbor_private.account_export_cooldowns');
 EXECUTE d;
END $rewrite$;
COMMIT;
