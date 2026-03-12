-- =============================================================================
-- Branch Stocks delete: SQL tests (run in Supabase SQL Editor)
-- =============================================================================
-- "No inventory row was deleted" = delete_inventory_row returned 0.
-- Use these to: (1) see if the row exists, (2) test delete in SQL.
-- Run blocks one at a time. Replace REPLACE_* with real UUIDs from step 1 / 2.

-- -----------------------------------------------------------------------------
-- 1. List store locations (get id for "ONE AYALA" / your branch)
-- -----------------------------------------------------------------------------
SELECT id, name, type
FROM public.locations
WHERE type = 'store'
ORDER BY name;
-- Copy one id (e.g. MN+LA™ ONE AYALA) for step 2.


-- -----------------------------------------------------------------------------
-- 2. List inventory for that branch (get real product_id + location_id)
-- -----------------------------------------------------------------------------
-- Replace REPLACE_LOCATION_UUID with the id from step 1.
SELECT inv.product_id, inv.location_id, inv.quantity, p.name AS product_name, loc.name AS branch_name
FROM public.inventory inv
JOIN public.products p ON p.id = inv.product_id
JOIN public.locations loc ON loc.id = inv.location_id
WHERE inv.location_id = 'REPLACE_LOCATION_UUID'
ORDER BY p.name
LIMIT 20;
-- Copy one (product_id, location_id) pair for step 3 and 4.


-- -----------------------------------------------------------------------------
-- 3. Check if this exact row exists (use same IDs as the app sends)
-- -----------------------------------------------------------------------------
-- Get p_product_id and p_location_id from browser: DevTools → Network → 
-- find the delete_inventory_row request → Request payload. Paste here.
-- If this returns 0 rows, that's why delete returns 0.
SELECT product_id, location_id, quantity
FROM public.inventory
WHERE product_id = 'REPLACE_PRODUCT_UUID'
  AND location_id = 'REPLACE_LOCATION_UUID';


-- -----------------------------------------------------------------------------
-- 4. Helper function: count matching rows (0 = no row, 1 = row exists)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_row_exists(
  p_product_id uuid,
  p_location_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.inventory
  WHERE product_id = p_product_id AND location_id = p_location_id;
$$;

-- Run after replacing UUIDs (from step 2 or from Network payload):
-- SELECT public.inventory_row_exists(
--   'REPLACE_PRODUCT_UUID'::uuid,
--   'REPLACE_LOCATION_UUID'::uuid
-- );
-- 0 = no row (delete will stay 0). 1 = row exists (delete should return 1).


-- -----------------------------------------------------------------------------
-- 5. Direct DELETE test (bypasses RPC auth; run only to verify row exists)
-- -----------------------------------------------------------------------------
-- Uncomment and replace REPLACE_* with real UUIDs from step 2, then run.
-- In SQL Editor you are postgres/service role. This deletes without auth.
-- If this deletes 1 row, the row existed; app issue may be payload or auth.uid() in RPC.
/*
DO $$
DECLARE
  v_product_id uuid := 'REPLACE_PRODUCT_UUID';
  v_location_id uuid := 'REPLACE_LOCATION_UUID';
  v_deleted int;
BEGIN
  DELETE FROM public.inventory
  WHERE product_id = v_product_id AND location_id = v_location_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % row(s).', v_deleted;
END $$;
*/


-- -----------------------------------------------------------------------------
-- 6. Optional: see what the Branch Stocks RPC returns for a branch
-- -----------------------------------------------------------------------------
-- SELECT * FROM public.get_branch_stocks_by_location('REPLACE_LOCATION_UUID'::uuid);
-- "id" in each object = product_id. location_id for that view = the same UUID you passed.
