-- =============================================================================
-- AUTO-CREATE PROFILE WHEN A NEW AUTH USER IS CREATED
-- =============================================================================
-- Run this entire script once in Supabase SQL Editor.
-- It is safe to run again: it uses "IF NOT EXISTS", "OR REPLACE", and
-- "DROP TRIGGER IF EXISTS" so nothing breaks if parts already exist.
-- =============================================================================

-- STEP 1: Ensure public.profiles table exists with the columns we need
-- (If the table already exists, we only add any missing columns.)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text,
  location_id uuid
);

-- Add columns if the table existed before but without these columns
-- (Safe: ADD COLUMN IF NOT EXISTS does nothing if the column already exists.)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location_id uuid;

-- STEP 2: Function that runs every time a new user is inserted into auth.users.
-- It reads full_name, role, location_id from the new user's metadata and
-- inserts (or updates) a row in public.profiles.
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
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    location_id = EXCLUDED.location_id;
  RETURN NEW;
END;
$$;

-- STEP 3: Attach the function to auth.users so it runs after every new signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_auth_user();

-- Done. New users will now get a matching row in public.profiles automatically.
