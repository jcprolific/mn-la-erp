-- =============================================================================
-- WAREHOUSE INVENTORY RLS: Allow warehouse roles to write to inventory and
-- inventory_movements for warehouse location (fixes "permission denied for table inventory"
-- when using Warehouse Inventory In direct table writes).
-- Requires: get_current_user_profile(), locations with type = 'warehouse'.
-- =============================================================================

-- 1. inventory: allow warehouse roles to INSERT/UPDATE rows where location is warehouse
-- -----------------------------------------------------------------------------
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_warehouse_insert" ON public.inventory;
CREATE POLICY "inventory_warehouse_insert"
  ON public.inventory FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.get_current_user_profile() LIMIT 1) IN ('owner', 'admin', 'warehouse_staff', 'warehouse')
    AND location_id IN (SELECT id FROM public.locations WHERE type = 'warehouse')
  );

DROP POLICY IF EXISTS "inventory_warehouse_update" ON public.inventory;
CREATE POLICY "inventory_warehouse_update"
  ON public.inventory FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile() LIMIT 1) IN ('owner', 'admin', 'warehouse_staff', 'warehouse')
    AND location_id IN (SELECT id FROM public.locations WHERE type = 'warehouse')
  )
  WITH CHECK (
    (SELECT role FROM public.get_current_user_profile() LIMIT 1) IN ('owner', 'admin', 'warehouse_staff', 'warehouse')
    AND location_id IN (SELECT id FROM public.locations WHERE type = 'warehouse')
  );

-- 2. inventory_movements: allow warehouse roles to INSERT where destination is warehouse
-- -----------------------------------------------------------------------------
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_movements_warehouse_insert" ON public.inventory_movements;
CREATE POLICY "inventory_movements_warehouse_insert"
  ON public.inventory_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.get_current_user_profile() LIMIT 1) IN ('owner', 'admin', 'warehouse_staff', 'warehouse')
    AND destination_location IN (SELECT id FROM public.locations WHERE type = 'warehouse')
  );
