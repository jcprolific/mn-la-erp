-- Ensure set_inventory_count SETS quantity to the given value (final total), never adds.
-- Fix: allow movement_type 'count_adjustment' so Branch Stocks Adjust quantity can insert into inventory_movements.
-- Safe to run: (1) updates check constraint to allow count_adjustment, (2) replaces set_inventory_count.

-- 1. Allow 'count_adjustment' in inventory_movements_type_check (keep existing allowed values).
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_type_check
  CHECK (movement_type IN (
    'adjust_in',
    'adjust_out',
    'receive',
    'sale',
    'transfer',
    'count_adjustment'
  ));

-- 2. set_inventory_count: SET quantity to p_counted_quantity (final total).
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
    -- SET quantity to p_counted_quantity (final total). Do NOT add to current.
    UPDATE public.inventory
    SET quantity = p_counted_quantity
    WHERE product_id = p_product_id AND location_id = v_location_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'No inventory row for this product at your branch'
        USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.inventory_movements (product_id, movement_type, quantity, destination_location, note, source)
    VALUES (p_product_id, 'count_adjustment', p_counted_quantity, v_location_id, COALESCE(p_reason, 'Stock count'), 'stock_count');
  ELSE
    UPDATE public.inventory SET quantity = p_counted_quantity WHERE product_id = p_product_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'No inventory row for this product'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_inventory_count(uuid, integer, text) IS
  'Sets inventory quantity to p_counted_quantity (final total). Used by Branch Stocks Adjust quantity. Does not add; overwrites.';
