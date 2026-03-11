-- =============================================================================
-- BASELINE: warehouse_receive_inventory_v2 (Warehouse Inventory In — batch)
-- Do not modify this file; it is the known working definition for restore.
-- =============================================================================
-- Idempotent by request_id. Same single-write pattern as store_receive_inventory_v2.
-- Frontend MUST pass a unique request_id per line (e.g. batchId + '-' + index) so
-- multiple products or same product multiple times in one batch all get applied.
-- Requires: inventory_triggers.sql (request_id column + unique index on
--   request_id, product_id, destination_location) applied first.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.warehouse_receive_inventory_v2(
  p_product_id uuid,
  p_quantity integer,
  p_notes text DEFAULT NULL,
  p_request_id text DEFAULT NULL
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

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: if request_id provided and movement already exists, do nothing (success)
  IF p_request_id IS NOT NULL AND p_request_id <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.inventory_movements
      WHERE request_id = p_request_id
        AND destination_location = v_warehouse_id
        AND product_id = p_product_id
        AND movement_type = 'receive'
    ) THEN
      RETURN;
    END IF;
  END IF;

  -- Single write: UPDATE existing row (add p_quantity once). If no row, INSERT.
  UPDATE public.inventory
  SET quantity = quantity + p_quantity
  WHERE product_id = p_product_id AND location_id = v_warehouse_id;
  GET DIAGNOSTICS v_updated = row_count;

  IF v_updated = 0 THEN
    INSERT INTO public.inventory (product_id, location_id, quantity)
    VALUES (p_product_id, v_warehouse_id, p_quantity);
  END IF;

  INSERT INTO public.inventory_movements (
    product_id, movement_type, quantity, destination_location, note, source, request_id
  )
  VALUES (
    p_product_id, 'receive', p_quantity, v_warehouse_id,
    COALESCE(p_notes, 'Manual warehouse inventory receive'),
    'warehouse_inventory_in',
    NULLIF(TRIM(p_request_id), '')
  );
END;
$$;

COMMENT ON FUNCTION public.warehouse_receive_inventory_v2(uuid, integer, text, text) IS
  'Warehouse Inventory In: idempotent by request_id. Client must send unique request_id per line (e.g. batchId + "-" + index). Single write to inventory + one movement.';

GRANT EXECUTE ON FUNCTION public.warehouse_receive_inventory_v2(uuid, integer, text, text) TO authenticated;
