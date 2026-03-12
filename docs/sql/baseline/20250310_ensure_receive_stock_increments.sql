-- Ensure receive_stock ADDS to existing quantity (never overwrites).
-- Safe to run: replaces receive_stock with increment logic if it was wrong.
-- Requires: inventory(product_id, location_id) unique, get_current_user_profile().

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
  SELECT f.role, f.location_id INTO v_role, v_location_id FROM public.get_current_user_profile() f;
  IF v_role = 'store_associate' AND (v_location_id IS NULL OR p_location_id IS DISTINCT FROM v_location_id) THEN
    RAISE EXCEPTION 'store_associate can only receive stock at assigned branch'
      USING ERRCODE = 'P0001';
  END IF;

  -- Add to existing quantity (never overwrite); insert if no row exists
  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (p_product_id, p_location_id, p_quantity)
  ON CONFLICT (product_id, location_id) DO UPDATE
  SET quantity = public.inventory.quantity + p_quantity;

  INSERT INTO public.inventory_movements (
    product_id, movement_type, quantity, destination_location, note, source, created_by
  )
  VALUES (
    p_product_id, 'receive', p_quantity, p_location_id,
    COALESCE(p_notes, 'Receive stock'), 'manual',
    auth.uid()
  );
END;
$$;

COMMENT ON FUNCTION public.receive_stock(uuid, uuid, integer, text) IS
  'Inventory in: adds quantity at location (increments existing). Rejects store_associate if p_location_id != profile.location_id.';
