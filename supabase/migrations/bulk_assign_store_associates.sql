-- =============================================================================
-- BULK ASSIGN STORE ASSOCIATES (by email + location_id)
-- =============================================================================
-- Use: Run in Supabase SQL Editor after you have the list of emails and
--      location_id (branch UUID) for each store associate.
--
-- Prerequisite: Each email must already exist in Supabase Auth (Authentication
--               → Users). Invite them first via Dashboard or they sign up.
--
-- Steps:
-- 1. Edit the VALUES list below: add one row per person (email, location_id).
-- 2. Run the entire script in Supabase → SQL Editor.
-- 3. Result: Their profile will have role = 'store_associate' and
--    location_id = the branch you set. They can then log in and use the Store
--    Dashboard for that branch.
-- =============================================================================

-- Replace the sample rows with your (email, location_id) pairs.
-- Get location_id from: Table Editor → locations → copy the id of the branch.
WITH bulk_data AS (
  SELECT * FROM (VALUES
    ('store1@example.com', '00000000-0000-0000-0000-000000000001'::uuid),
    ('store2@example.com', '00000000-0000-0000-0000-000000000001'::uuid)
    -- Add more rows: ('email@domain.com', 'location-uuid-here'),
  ) AS t(email, location_id)
),
matched AS (
  SELECT u.id AS user_id, b.location_id
  FROM auth.users u
  INNER JOIN bulk_data b ON LOWER(TRIM(u.email)) = LOWER(TRIM(b.email))
)
UPDATE public.profiles p
SET
  role = 'store_associate',
  location_id = m.location_id
FROM matched m
WHERE p.id = m.user_id;

-- Optional: show how many were updated
-- (run separately if you want to verify)
-- SELECT COUNT(*) AS updated_count FROM public.profiles WHERE role = 'store_associate';
