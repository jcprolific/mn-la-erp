-- =============================================================================
-- Inventory: public read (all authenticated see all branches), write only by
-- store_associate at their assigned store. Owner/admin can only VIEW.
-- =============================================================================

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Drop all existing SELECT policies so we have a single public read
DROP POLICY IF EXISTS "inventory_select_authenticated" ON public.inventory;
DROP POLICY IF EXISTS "inventory_select_owner_admin_all" ON public.inventory;
DROP POLICY IF EXISTS "inventory_select_all_authenticated" ON public.inventory;
DROP POLICY IF EXISTS "inventory_select_warehouse_location" ON public.inventory;

CREATE POLICY "inventory_select_public_read"
  ON public.inventory FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: only store_associate at their location (warehouse writes via inventory_warehouse_insert)
DROP POLICY IF EXISTS "inventory_insert_store_associate_own_location" ON public.inventory;
CREATE POLICY "inventory_insert_store_associate_own_location"
  ON public.inventory FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.get_current_user_profile() LIMIT 1) = 'store_associate'
    AND (SELECT location_id FROM public.get_current_user_profile() LIMIT 1) = location_id
  );

-- UPDATE: only store_associate at their location (owner/admin cannot adjust store inventory)
DROP POLICY IF EXISTS "inventory_update_store_associate_own_location" ON public.inventory;
CREATE POLICY "inventory_update_store_associate_own_location"
  ON public.inventory FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile() LIMIT 1) = 'store_associate'
    AND (SELECT location_id FROM public.get_current_user_profile() LIMIT 1) = location_id
  )
  WITH CHECK (
    (SELECT role FROM public.get_current_user_profile() LIMIT 1) = 'store_associate'
    AND (SELECT location_id FROM public.get_current_user_profile() LIMIT 1) = location_id
  );

-- DELETE: only store_associate at their location
DROP POLICY IF EXISTS "inventory_delete_store_associate_own_location" ON public.inventory;
CREATE POLICY "inventory_delete_store_associate_own_location"
  ON public.inventory FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile() LIMIT 1) = 'store_associate'
    AND (SELECT location_id FROM public.get_current_user_profile() LIMIT 1) = location_id
  );

-- warehouse_* policies (insert/update for warehouse location) remain unchanged
-- so warehouse staff and owner can still do Warehouse Inventory In.
