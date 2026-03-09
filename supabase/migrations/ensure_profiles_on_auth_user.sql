-- Ensure a profile row is created whenever a new auth user is created.
-- The backend that creates the user (admin_create_staff or Edge Function) must set
-- raw_user_meta_data with: full_name, role, location_id (uuid).
-- This trigger copies those into public.profiles so the ERP can load the profile.

-- 1. Ensure public.profiles has required columns (run only if table already exists; adjust if you use a different schema)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location_id uuid;
  END IF;
END $$;

-- 2. Function: on new auth user, insert or update public.profiles from raw_user_meta_data
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
      WHEN NEW.raw_user_meta_data->>'location_id' IS NOT NULL AND (NEW.raw_user_meta_data->>'location_id')::text ~ '^[0-9a-fA-F-]{36}$'
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

-- 3. Trigger on auth.users: after insert, create/update profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_auth_user();
