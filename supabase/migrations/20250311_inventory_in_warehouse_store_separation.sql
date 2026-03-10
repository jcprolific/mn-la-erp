-- =============================================================================
-- Enforce strict separation: Warehouse Inventory In vs Store Inventory In.
-- - receive_stock: store/branch only; reject warehouse; log source correctly.
-- - warehouse_receive_inventory: already warehouse-only (no change).
-- =============================================================================

-- 1. receive_stock: must NEVER update warehouse. Only store/branch locations.
--    When called from Store Inventory In (p_notes = 'store_inventory_in'),
--    movement source = 'store_inventory_in'. Otherwise 'manual'.
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
  v_location_type text;
  v_source text;
BEGIN
  -- Reject warehouse: Store Inventory In must not touch warehouse. Use Warehouse Inventory In for warehouse.
  SELECT type INTO v_location_type FROM public.locations WHERE id = p_location_id LIMIT 1;
  IF v_location_type = 'warehouse' THEN
    RAISE EXCEPTION 'Use Warehouse Inventory In for warehouse receives. receive_stock is for store/branch only.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT f.role, f.location_id INTO v_role, v_location_id FROM public.get_current_user_profile() f;
  IF v_role = 'store_associate' AND (v_location_id IS NULL OR p_location_id IS DISTINCT FROM v_location_id) THEN
    RAISE EXCEPTION 'store_associate can only receive stock at assigned branch'
      USING ERRCODE = 'P0001';
  END IF;

  v_source := CASE WHEN p_notes = 'store_inventory_in' THEN 'store_inventory_in' ELSE 'manual' END;

  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (p_product_id, p_location_id, p_quantity)
  ON CONFLICT (product_id, location_id) DO UPDATE
  SET quantity = public.inventory.quantity + p_quantity;

  INSERT INTO public.inventory_movements (
    product_id, movement_type, quantity, destination_location, note, source, created_by
  )
  VALUES (
    p_product_id, 'receive', p_quantity, p_location_id,
    COALESCE(p_notes, 'Receive stock'), v_source,
    auth.uid()
  );
END;
$$;

COMMENT ON FUNCTION public.receive_stock(uuid, uuid, integer, text) IS
  'Store/branch inventory in only. Adds quantity at location. Rejects warehouse (use Warehouse Inventory In). When p_notes = store_inventory_in, movement source = store_inventory_in.';

-- 2. warehouse_receive_inventory (existing): remains warehouse-only.
--    It uses only locations.type = 'warehouse' and source = 'warehouse_inventory_in'.
--    No change needed; it never creates/updates store inventory or inserts store_inventory_in.
