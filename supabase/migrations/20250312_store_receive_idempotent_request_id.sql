-- =============================================================================
-- Store receive idempotency: request_id on inventory_movements + idempotent RPC
-- =============================================================================
-- 1. Add request_id to inventory_movements for idempotency and status lookup.
-- 2. Unique constraint so same request_id cannot create duplicate movements.
-- 3. Index for status verification (client checks if movement exists by request_id).
-- 4. store_receive_inventory_v2: if request_id supplied and movement exists, return;
--    otherwise do atomic inventory update + movement insert with request_id.
-- =============================================================================

-- 1. request_id column (nullable for backward compatibility with existing rows)
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS request_id text;

-- 2. Unique constraint: same request_id cannot be inserted twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_request_id_unique
  ON public.inventory_movements (request_id)
  WHERE request_id IS NOT NULL;

-- 3. Index for status lookup (client: "did this request_id complete?")
CREATE INDEX IF NOT EXISTS idx_inventory_movements_request_id_dest
  ON public.inventory_movements (request_id, destination_location)
  WHERE request_id IS NOT NULL;

COMMENT ON COLUMN public.inventory_movements.request_id IS
  'Idempotency key for store/warehouse receive: same request_id never creates duplicate movements.';

-- 4. Idempotent store_receive_inventory_v2: check request_id first, then atomic update+insert; includes p_batch_id for audit
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
