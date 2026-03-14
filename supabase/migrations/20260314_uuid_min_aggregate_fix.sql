-- Fix for cutover function compatibility:
-- PostgreSQL in this environment does not provide MIN(uuid) aggregate by default.
-- Provide public.min(uuid) so existing MIN(id) usages on UUID work.

CREATE OR REPLACE FUNCTION public.uuid_min_sfunc(state uuid, val uuid)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF state IS NULL THEN
    RETURN val;
  END IF;
  IF val IS NULL THEN
    RETURN state;
  END IF;
  IF val < state THEN
    RETURN val;
  END IF;
  RETURN state;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'min'
      AND p.proargtypes = '2950'::oidvector
  ) THEN
    CREATE AGGREGATE public.min(uuid) (
      SFUNC = public.uuid_min_sfunc,
      STYPE = uuid
    );
  END IF;
END;
$$;
