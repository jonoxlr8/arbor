-- MANUAL REVIEW/APPLICATION ONLY. Never applied by application startup.
-- Requires existing owner-scoped profiles RLS and authenticated grants.
-- Inspect existing CHECK constraints/triggers before applying; unknown live schema
-- constraints are not removed here. Run in a transaction; take a backup first.
BEGIN;
ALTER TABLE public.profiles
  ADD COLUMN strategy_engine_version text,
  ADD COLUMN v2_inputs jsonb;

-- One logical profile per user, shared across v1 and v2. Existing null/duplicate
-- owners intentionally abort this migration rather than deleting/repairing rows.
ALTER TABLE public.profiles ALTER COLUMN user_id SET NOT NULL;
CREATE UNIQUE INDEX profiles_one_profile_per_user_v2 ON public.profiles(user_id);

-- Preserve each existing NOT NULL rule for legacy rows while allowing v2 to omit
-- fields with no v2 meaning, and to omit its optional goal. Do not invent values.
DO $$
DECLARE col text;
BEGIN
  FOR col IN SELECT attname FROM pg_attribute
    WHERE attrelid = 'public.profiles'::regclass AND attnotnull
      AND attname IN ('goal_target', 'investment_horizon', 'risk_tolerance', 'risk_score', 'risk_level')
  LOOP
    EXECUTE format('ALTER TABLE public.profiles ALTER COLUMN %I DROP NOT NULL', col);
    EXECUTE format('ALTER TABLE public.profiles ADD CONSTRAINT %I CHECK (strategy_engine_version IS NOT DISTINCT FROM ''2.0'' OR %I IS NOT NULL)',
                   'profiles_legacy_required_' || col, col);
  END LOOP;
END $$;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_version_payload CHECK (COALESCE(
  CASE WHEN strategy_engine_version = '2.0' THEN (v2_inputs IS NOT NULL
      AND jsonb_typeof(v2_inputs) = 'object'
      AND v2_inputs ?& ARRAY['emergency_savings','high_interest_debt','horizon','risk_response']
      AND country = 'Philippines' AND currency = 'PHP'
      AND investment_horizon IS NULL AND risk_tolerance IS NULL
      AND risk_score IS NULL AND risk_level IS NULL)
  ELSE ((strategy_engine_version IS NULL OR strategy_engine_version = '1.0') AND v2_inputs IS NULL)
  END, false));

-- No implicit migration through an update. Explicit migration is a later task.
CREATE FUNCTION public.arbor_preserve_profile_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.strategy_engine_version IS DISTINCT FROM OLD.strategy_engine_version THEN
    RAISE EXCEPTION 'Profile engine version changes require explicit migration';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER arbor_preserve_profile_version
BEFORE UPDATE ON public.profiles FOR EACH ROW
EXECUTE FUNCTION public.arbor_preserve_profile_version();
COMMIT;
