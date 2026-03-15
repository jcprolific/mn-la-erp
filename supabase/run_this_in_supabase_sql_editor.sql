-- Run this in Supabase Dashboard → SQL Editor
-- Fix: set_inventory_count with p_location_id for Branch Stocks Adjust quantity

CREATE OR REPLACE FUNCTION public.set_inventory_count(
  p_product_id uuid,
  p_counted_quantity integer,
  p_reason text DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_profile_location_id uuid;
  v_effective_location_id uuid;
  v_updated int;
BEGIN
  SELECT f.role, f.location_id INTO v_role, v_profile_location_id
  FROM public.get_current_user_profile() f
  LIMIT 1;

  IF v_role = 'store_associate' THEN
    IF v_profile_location_id IS NULL THEN
      RAISE EXCEPTION 'store_associate has no assigned branch'
        USING ERRCODE = 'P0001';
    END IF;
    v_effective_location_id := COALESCE(p_location_id, v_profile_location_id);
    IF v_effective_location_id IS DISTINCT FROM v_profile_location_id THEN
      RAISE EXCEPTION 'store_associate can only adjust inventory at assigned branch'
        USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.inventory
    SET quantity = p_counted_quantity
    WHERE product_id = p_product_id AND location_id = v_effective_location_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'No inventory row for this product at your branch'
        USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.inventory_movements (product_id, movement_type, quantity, destination_location, note, source)
    VALUES (p_product_id, 'count_adjustment', p_counted_quantity, v_effective_location_id, COALESCE(p_reason, 'Stock count'), 'stock_count');
  ELSIF v_role IN ('owner', 'admin') THEN
    IF p_location_id IS NULL THEN
      RAISE EXCEPTION 'location_id required to adjust inventory for a branch'
        USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.inventory
    SET quantity = p_counted_quantity
    WHERE product_id = p_product_id AND location_id = p_location_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'No inventory row for this product at the specified branch'
        USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.inventory_movements (product_id, movement_type, quantity, destination_location, note, source)
    VALUES (p_product_id, 'count_adjustment', p_counted_quantity, p_location_id, COALESCE(p_reason, 'Stock count'), 'stock_count');
  ELSE
    v_effective_location_id := p_location_id;
    IF v_effective_location_id IS NULL THEN
      UPDATE public.inventory SET quantity = p_counted_quantity WHERE product_id = p_product_id;
    ELSE
      UPDATE public.inventory
      SET quantity = p_counted_quantity
      WHERE product_id = p_product_id AND location_id = v_effective_location_id;
    END IF;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'No inventory row for this product'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_inventory_count(uuid, integer, text, uuid) IS
  'Sets inventory quantity to p_counted_quantity (final total). Branch Stocks: pass p_location_id.';
