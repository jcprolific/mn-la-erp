-- =============================================================================
-- !!! DO NOT PASTE THE FILE PATH INTO SUPABASE !!!
-- In Supabase SQL Editor you must paste the SQL CODE, not the filename.
--
-- WRONG (causes "syntax error at or near supabase"):
--   supabase/migrations/FIX_LOGIN_PROFILES_RUN_IN_SUPABASE.sql
--
-- RIGHT: Open THIS file in Cursor, press Ctrl+A (select all), Ctrl+C (copy),
--        then in Supabase SQL Editor paste (Ctrl+V) and click Run.
-- =============================================================================
-- FIX LOGIN: Profiles table + backfill + RLS (run once in Supabase SQL Editor)
-- =============================================================================
-- Project: https://nooqvrikraglddxkxrul.supabase.co
-- 1. Ensures public.profiles exists with correct columns
-- 2. Ensures every auth.users row has a matching public.profiles row (backfill)
-- 3. Enables RLS and allows each user to SELECT their own profile (for login)
-- Run the ENTIRE script in: Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLE: Create profiles if missing, add columns
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text,
  location_id uuid
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location_id uuid;

-- -----------------------------------------------------------------------------
-- 2. TRIGGER: Auto-create profile for NEW signups (future users)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, location_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'viewer'),
    CASE
      WHEN NEW.raw_user_meta_data->>'location_id' IS NOT NULL
           AND (NEW.raw_user_meta_data->>'location_id')::text ~ '^[0-9a-fA-F-]{36}$'
      THEN (NEW.raw_user_meta_data->>'location_id')::uuid
      ELSE NULL
    END
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role = COALESCE(EXCLUDED.role, public.profiles.role),
    location_id = COALESCE(EXCLUDED.location_id, public.profiles.location_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 3. BACKFILL: Ensure every existing auth user has a profile row
-- -----------------------------------------------------------------------------
INSERT INTO public.profiles (id, full_name, role, location_id)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1), 'User'),
  COALESCE(u.raw_user_meta_data->>'role', 'viewer'),
  CASE
    WHEN u.raw_user_meta_data->>'location_id' IS NOT NULL
         AND (u.raw_user_meta_data->>'location_id')::text ~ '^[0-9a-fA-F-]{36}$'
    THEN (u.raw_user_meta_data->>'location_id')::uuid
    ELSE NULL
  END
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  full_name = COALESCE(NULLIF(TRIM(public.profiles.full_name), ''), EXCLUDED.full_name),
  role = COALESCE(NULLIF(TRIM(public.profiles.role), ''), EXCLUDED.role),
  location_id = COALESCE(public.profiles.location_id, EXCLUDED.location_id);

-- -----------------------------------------------------------------------------
-- 4. RLS: Let each user read their own profile (required for login)
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- 5. RPC: Get current user's profile (bypasses RLS – use for login)
-- -----------------------------------------------------------------------------
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

-- Done. Try logging in again from the app.
