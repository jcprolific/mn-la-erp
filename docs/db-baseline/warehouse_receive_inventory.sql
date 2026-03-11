-- =============================================================================
-- BASELINE: warehouse_receive_inventory (Warehouse Inventory In)
-- Source: supabase/migrations/20250311_warehouse_receive_inventory_single_write.sql
-- Do not modify this file; it is the known working definition for restore.
-- =============================================================================
-- Single write path: UPDATE existing row (add p_quantity once) or INSERT if no row.
-- One movement insert with source = 'warehouse_inventory_in'.
-- Never touches store inventory.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.warehouse_receive_inventory(
  p_product_id uuid,
  p_quantity integer,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id uuid;
  v_updated int;
BEGIN
  SELECT id INTO v_warehouse_id
  FROM public.locations
  WHERE type = 'warehouse'
  LIMIT 1;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No warehouse location configured';
  END IF;

  -- Single write path: UPDATE existing row (add p_quantity once). If no row, INSERT.
  UPDATE public.inventory
  SET quantity = quantity + p_quantity
  WHERE product_id = p_product_id AND location_id = v_warehouse_id;
  GET DIAGNOSTICS v_updated = row_count;

  IF v_updated = 0 THEN
    INSERT INTO public.inventory (product_id, location_id, quantity)
    VALUES (p_product_id, v_warehouse_id, p_quantity);
  END IF;

  INSERT INTO public.inventory_movements (
    product_id, movement_type, quantity, destination_location, note, source
  )
  VALUES (
    p_product_id, 'receive', p_quantity, v_warehouse_id,
    COALESCE(p_notes, 'Manual warehouse inventory receive'),
    'warehouse_inventory_in'
  );
END;
$$;

COMMENT ON FUNCTION public.warehouse_receive_inventory(uuid, integer, text) IS
  'Warehouse Inventory In: adds p_quantity to warehouse inventory exactly once; logs one movement.';

GRANT EXECUTE ON FUNCTION public.warehouse_receive_inventory(uuid, integer, text) TO authenticated;
