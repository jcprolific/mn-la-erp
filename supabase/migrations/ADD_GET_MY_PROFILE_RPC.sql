-- Run this in Supabase SQL Editor if login still fails after FIX_LOGIN_PROFILES.
-- This RPC lets the app read your profile without RLS blocking.

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'role', p.role,
    'full_name', p.full_name,
    'location_id', p.location_id,
    'id', p.id
  ) INTO result
  FROM public.profiles p
  WHERE p.id = auth.uid();
  RETURN result;
END;
$$;
