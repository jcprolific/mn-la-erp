-- =============================================================================
-- WAREHOUSE INVENTORY SELECT: Allow warehouse roles to READ inventory at
-- warehouse location so Warehouse Stocks page can show data (client query
-- was returning [] due to RLS).
-- =============================================================================

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Allow SELECT for authenticated users when viewing warehouse location inventory
-- (warehouse roles + owner/admin need to see Warehouse Stocks page)
DROP POLICY IF EXISTS "inventory_select_warehouse_location" ON public.inventory;
CREATE POLICY "inventory_select_warehouse_location"
  ON public.inventory FOR SELECT
  TO authenticated
  USING (
    location_id IN (SELECT id FROM public.locations WHERE type = 'warehouse')
    AND (SELECT role FROM public.get_current_user_profile() LIMIT 1) IN ('owner', 'admin', 'warehouse_staff', 'warehouse')
  );

-- If no SELECT policy exists for other locations, keep existing behavior by
-- not dropping inventory_select_authenticated (from store migration).
-- This policy adds read access for warehouse location for warehouse roles.
