-- =============================================================================
-- BASELINE: store_receive_inventory_v2 (Store Inventory In)
-- Source: supabase/migrations/20250312_store_receive_idempotent_request_id.sql
-- Do not modify this file; it is the known working definition for restore.
-- =============================================================================
-- Idempotent by request_id. Optional batch_id for audit.
-- Single write path: UPDATE existing row or INSERT if none; then one movement.
-- Rejects warehouse location (use Warehouse Inventory In).
-- =============================================================================

-- Prerequisites (from same migration):
-- ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS request_id text;
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_request_id_unique
--   ON public.inventory_movements (request_id) WHERE request_id IS NOT NULL;
-- CREATE INDEX IF NOT EXISTS idx_inventory_movements_request_id_dest
--   ON public.inventory_movements (request_id, destination_location) WHERE request_id IS NOT NULL;
-- inventory_movements.batch_id (from 20250312_store_receive_batch_id.sql)

CREATE OR REPLACE FUNCTION public.store_receive_inventory_v2(
  p_product_id uuid,
  p_store_location_id uuid,
  p_quantity integer,
  p_notes text DEFAULT NULL,
  p_request_id text DEFAULT NULL,
  p_batch_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location_type text;
  v_updated int;
BEGIN
  IF p_store_location_id IS NULL THEN
    RAISE EXCEPTION 'Store location is required' USING ERRCODE = 'P0001';
  END IF;

  -- Reject warehouse: store receive must never touch warehouse
  SELECT type INTO v_location_type FROM public.locations WHERE id = p_store_location_id LIMIT 1;
  IF v_location_type = 'warehouse' THEN
    RAISE EXCEPTION 'Use Warehouse Inventory In for warehouse. This RPC is for store branches only.' USING ERRCODE = 'P0001';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: if request_id provided and movement already exists, do nothing (success)
  IF p_request_id IS NOT NULL AND p_request_id <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.inventory_movements
      WHERE request_id = p_request_id
        AND destination_location = p_store_location_id
        AND product_id = p_product_id
        AND movement_type = 'receive'
    ) THEN
      RETURN;
    END IF;
  END IF;

  -- Atomic single write: UPDATE existing row (increment quantity). If no row, INSERT.
  UPDATE public.inventory
  SET quantity = quantity + p_quantity
  WHERE product_id = p_product_id AND location_id = p_store_location_id;
  GET DIAGNOSTICS v_updated = row_count;

  IF v_updated = 0 THEN
    INSERT INTO public.inventory (product_id, location_id, quantity)
    VALUES (p_product_id, p_store_location_id, p_quantity);
  END IF;

  INSERT INTO public.inventory_movements (
    product_id, movement_type, quantity, destination_location, note, source, request_id, batch_id
  )
  VALUES (
    p_product_id, 'receive', p_quantity, p_store_location_id,
    COALESCE(p_notes, 'Store receive'),
    'store_inventory_in',
    NULLIF(TRIM(p_request_id), ''),
    NULLIF(TRIM(p_batch_id), '')
  );
END;
$$;

COMMENT ON FUNCTION public.store_receive_inventory_v2(uuid, uuid, integer, text, text, text) IS
  'Store Inventory In: idempotent by request_id; optional batch_id for audit. Adds p_quantity to store branch inventory; same request_id returns without duplicate write. Atomic UPDATE/INSERT.';

GRANT EXECUTE ON FUNCTION public.store_receive_inventory_v2(uuid, uuid, integer, text, text, text) TO authenticated;
