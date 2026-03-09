-- =============================================================================
-- Set profile for flowmaticph@gmail.com as store_associate with location
-- =============================================================================
-- 1. In Supabase: Authentication → Users → Add user
--    Email: flowmaticph@gmail.com
--    Password: (set one and share with the user)
--    Check "Auto Confirm User" → Create user
--
-- 2. In Authentication → Users, find flowmaticph@gmail.com and COPY their User ID (UUID)
--
-- 3. Replace NEW_USER_ID_HERE below with that User ID, then run this in SQL Editor.
-- =============================================================================

UPDATE public.profiles
SET
  role = 'store_associate',
  location_id = '3e7690a8-378b-4d4a-9db4-c42610866351'::uuid,
  full_name = COALESCE(NULLIF(TRIM(full_name), ''), 'Flowmatic')
WHERE id = 'NEW_USER_ID_HERE'::uuid;

-- If the store location is the other UUID, use this instead of above:
-- UPDATE public.profiles
-- SET role = 'store_associate', location_id = '351fd55f-9b98-4016-991f-a834789e9db0'::uuid, full_name = COALESCE(NULLIF(TRIM(full_name), ''), 'Flowmatic')
-- WHERE id = 'NEW_USER_ID_HERE'::uuid;
