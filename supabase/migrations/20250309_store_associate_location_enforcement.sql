-- =============================================================================
-- STORE ASSOCIATE LOCATION ENFORCEMENT
-- =============================================================================
-- Goal: store_associate can VIEW all inventory locations but WRITE only to
--       their assigned profile.location_id. Owner/admin: full access.
--       warehouse_staff: unchanged (document for later tightening).
--
-- Do NOT apply blindly. Review and adjust for your existing RPC bodies and RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Helper to get current user's role and location_id
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_user_profile()
RETURNS TABLE(role text, location_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role, p.location_id
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_current_user_profile() IS
  'Returns role and location_id for the current auth.uid(). Used for store_associate write checks.';


-- -----------------------------------------------------------------------------
-- STEP 2: Enforce store_associate in receive_stock
-- -----------------------------------------------------------------------------
-- If your receive_stock already exists, ADD this block at the very start of
-- the function body (after DECLARE, before any other logic):
--
--   DECLARE
--     v_role text;
--     v_location_id uuid;
--   BEGIN
--     SELECT f.role, f.location_id INTO v_role, v_location_id
--     FROM public.get_current_user_profile() f;
--     IF v_role = 'store_associate' AND (v_location_id IS NULL OR p_location_id IS DISTINCT FROM v_location_id) THEN
--       RAISE EXCEPTION 'store_associate can only receive stock at assigned branch'
--         USING ERRCODE = 'P0001';
--     END IF;
--     -- ... rest of existing receive_stock logic ...
--
-- If you prefer a full replacement, use the stub below and replace the
-- "existing logic" with your actual receive_stock implementation.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_stock(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity integer,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_location_id uuid;
BEGIN
  -- Enforce: store_associate may only receive at their assigned location
  SELECT f.role, f.location_id INTO v_role, v_location_id FROM public.get_current_user_profile() f;
  IF v_role = 'store_associate' AND (v_location_id IS NULL OR p_location_id IS DISTINCT FROM v_location_id) THEN
    RAISE EXCEPTION 'store_associate can only receive stock at assigned branch'
      USING ERRCODE = 'P0001';
  END IF;

  -- Existing logic (adjust to match your real implementation)
  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (p_product_id, p_location_id, p_quantity)
  ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = public.inventory.quantity + p_quantity;

  INSERT INTO public.inventory_movements (product_id, movement_type, quantity, destination_location, note, source)
  VALUES (p_product_id, 'receive', p_quantity, p_location_id, COALESCE(p_notes, 'Receive stock'), 'manual');
END;
$$;

COMMENT ON FUNCTION public.receive_stock(uuid, uuid, integer, text) IS
  'Inventory in: adds quantity at location. Rejects store_associate if p_location_id != profile.location_id.';


-- -----------------------------------------------------------------------------
-- STEP 3: Enforce store_associate in set_inventory_count
-- -----------------------------------------------------------------------------
-- Frontend calls set_inventory_count(p_product_id, p_counted_quantity, p_reason)
-- with no location; RLS typically limits which inventory row the user sees.
-- Ensure the RPC only updates the row for the current user's location when
-- role = store_associate. Example replacement:
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_inventory_count(
  p_product_id uuid,
  p_counted_quantity integer,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_location_id uuid;
  v_updated int;
BEGIN
  SELECT f.role, f.location_id INTO v_role, v_location_id FROM public.get_current_user_profile() f;

  IF v_role = 'store_associate' THEN
    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'store_associate has no assigned branch'
        USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.inventory
    SET quantity = p_counted_quantity
    WHERE product_id = p_product_id AND location_id = v_location_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'No inventory row for this product at your branch'
        USING ERRCODE = 'P0002';
    END IF;
    -- Optionally insert into inventory_movements for audit (adjust columns to match your schema)
    INSERT INTO public.inventory_movements (product_id, movement_type, quantity, destination_location, note, source)
    VALUES (p_product_id, 'count_adjustment', p_counted_quantity, v_location_id, COALESCE(p_reason, 'Stock count'), 'stock_count');
  ELSE
    -- owner, admin, warehouse_staff: allow update by product_id (or add location param later)
    UPDATE public.inventory SET quantity = p_counted_quantity WHERE product_id = p_product_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'No inventory row for this product'
        USING ERRCODE = 'P0002';
    END IF;
    -- If you have movement logging for non-store_associate, add it here
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_inventory_count(uuid, integer, text) IS
  'Stock count: sets quantity. store_associate only at profile.location_id; others update first matching row (or extend with location param).';


-- -----------------------------------------------------------------------------
-- STEP 4: RLS on inventory (visibility = all; write = own location for store_associate)
-- -----------------------------------------------------------------------------
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Allow SELECT for all authenticated (visibility across locations)
DROP POLICY IF EXISTS "inventory_select_authenticated" ON public.inventory;
CREATE POLICY "inventory_select_authenticated"
  ON public.inventory FOR SELECT
  TO authenticated
  USING (true);

-- store_associate: INSERT/UPDATE/DELETE only where location_id = their profile.location_id
DROP POLICY IF EXISTS "inventory_insert_store_associate_own_location" ON public.inventory;
CREATE POLICY "inventory_insert_store_associate_own_location"
  ON public.inventory FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.get_current_user_profile()) IS DISTINCT FROM 'store_associate'
    OR (SELECT location_id FROM public.get_current_user_profile()) = location_id
  );

DROP POLICY IF EXISTS "inventory_update_store_associate_own_location" ON public.inventory;
CREATE POLICY "inventory_update_store_associate_own_location"
  ON public.inventory FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile()) IS DISTINCT FROM 'store_associate'
    OR (SELECT location_id FROM public.get_current_user_profile()) = location_id
  )
  WITH CHECK (
    (SELECT role FROM public.get_current_user_profile()) IS DISTINCT FROM 'store_associate'
    OR (SELECT location_id FROM public.get_current_user_profile()) = location_id
  );

DROP POLICY IF EXISTS "inventory_delete_store_associate_own_location" ON public.inventory;
CREATE POLICY "inventory_delete_store_associate_own_location"
  ON public.inventory FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile()) IS DISTINCT FROM 'store_associate'
    OR (SELECT location_id FROM public.get_current_user_profile()) = location_id
  );

-- If you already have other policies (e.g. for anon or service role), keep them;
-- the above names are chosen to avoid clashes. Adjust if your project uses different names.


-- -----------------------------------------------------------------------------
-- STEP 5: RLS on inventory_movements (store_associate: insert only for own location)
-- -----------------------------------------------------------------------------
-- Assumes column destination_location (uuid) or equivalent. Adjust if your schema uses different names.
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_movements_select_authenticated" ON public.inventory_movements;
CREATE POLICY "inventory_movements_select_authenticated"
  ON public.inventory_movements FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "inventory_movements_insert_store_associate_own_location" ON public.inventory_movements;
CREATE POLICY "inventory_movements_insert_store_associate_own_location"
  ON public.inventory_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.get_current_user_profile()) IS DISTINCT FROM 'store_associate'
    OR (SELECT location_id FROM public.get_current_user_profile()) = destination_location
  );

-- UPDATE/DELETE on movements: restrict store_associate to rows for their location if you use such operations
DROP POLICY IF EXISTS "inventory_movements_update_store_associate_own" ON public.inventory_movements;
CREATE POLICY "inventory_movements_update_store_associate_own"
  ON public.inventory_movements FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile()) IS DISTINCT FROM 'store_associate'
    OR (SELECT location_id FROM public.get_current_user_profile()) = destination_location
  );

DROP POLICY IF EXISTS "inventory_movements_delete_store_associate_own" ON public.inventory_movements;
CREATE POLICY "inventory_movements_delete_store_associate_own"
  ON public.inventory_movements FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile()) IS DISTINCT FROM 'store_associate'
    OR (SELECT location_id FROM public.get_current_user_profile()) = destination_location
  );


-- =============================================================================
-- ROLLBACK SQL (run this block to revert; no table/column drops)
-- =============================================================================
/*
-- Drop RLS policies (inventory)
DROP POLICY IF EXISTS "inventory_delete_store_associate_own_location" ON public.inventory;
DROP POLICY IF EXISTS "inventory_update_store_associate_own_location" ON public.inventory;
DROP POLICY IF EXISTS "inventory_insert_store_associate_own_location" ON public.inventory;
DROP POLICY IF EXISTS "inventory_select_authenticated" ON public.inventory;
-- Optionally disable RLS if you had it off before:
-- ALTER TABLE public.inventory DISABLE ROW LEVEL SECURITY;

-- Drop RLS policies (inventory_movements)
DROP POLICY IF EXISTS "inventory_movements_delete_store_associate_own" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_update_store_associate_own" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_insert_store_associate_own_location" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_select_authenticated" ON public.inventory_movements;
-- ALTER TABLE public.inventory_movements DISABLE ROW LEVEL SECURITY;

-- Restore original receive_stock and set_inventory_count (you must restore from your backup or version control;
-- this migration does not store the previous bodies).

-- Drop helper (optional)
DROP FUNCTION IF EXISTS public.get_current_user_profile();
*/


-- =============================================================================
-- TEST MATRIX (manual verification)
-- =============================================================================
-- 1. store_associate, profile.location_id = L1
--    - receive_stock(p_location_id := L1) -> success
--    - receive_stock(p_location_id := L2) -> exception
--    - set_inventory_count(product at L1) -> success
--    - INSERT into inventory (location_id = L2) -> RLS deny
-- 2. owner / admin
--    - receive_stock(any location); direct INSERT/UPDATE inventory -> success
-- 3. warehouse_staff
--    - Current behavior unchanged (all writes allowed); document for later
-- 4. accountant / viewer
--    - If they have no write policies elsewhere, these RLS policies do not grant them write;
--      add explicit policies if they should have limited write.
-- =============================================================================
