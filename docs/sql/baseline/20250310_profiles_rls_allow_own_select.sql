-- =============================================================================
-- PROFILES: Allow users to read their own row (fix login "profile fetch" errors)
-- =============================================================================
-- If RLS is enabled on public.profiles but no policy allows SELECT, the login
-- page cannot load the profile and shows a database/config error.
-- Run this in Supabase SQL Editor. Safe to run multiple times.
-- =============================================================================

-- Enable RLS on profiles (no effect if already on)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if we're re-running (avoid duplicate policy name)
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

-- Logged-in user can SELECT only their own profile row (required for login)
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Optional: allow service role / backend to manage all rows (e.g. admin_create_staff).
-- If your app only uses RPCs with SECURITY DEFINER to write profiles, you can skip this.
-- CREATE POLICY "profiles_service_all"
--   ON public.profiles FOR ALL
--   USING (auth.jwt() ->> 'role' = 'service_role');
