-- =============================================================================
-- Branch Stocks: allow owner/admin to edit and delete inventory for any branch.
-- store_associate: edit/delete only at profile.location_id (unchanged).
-- Uses public.inventory as source of truth; no changes to store_receive_inventory_v2
-- or warehouse_receive_inventory.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. set_inventory_count: add p_location_id so owner/admin can target a branch.
--    store_associate: p_location_id must equal profile.location_id (or null = own).
--    owner/admin: p_location_id required so the correct row is updated.
-- -----------------------------------------------------------------------------
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
    -- warehouse_staff / other: allow with p_location_id if provided for consistency
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
  'Sets inventory quantity to p_counted_quantity (final total). Branch Stocks: pass p_location_id. owner/admin: required; store_associate: must be own branch.';

-- -----------------------------------------------------------------------------
-- 2. RLS: allow owner and admin to UPDATE and DELETE any inventory row.
--    store_associate keeps existing policy (own location only).
-- -----------------------------------------------------------------------------
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_update_owner_admin" ON public.inventory;
CREATE POLICY "inventory_update_owner_admin"
  ON public.inventory FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile() LIMIT 1) IN ('owner', 'admin')
  )
  WITH CHECK (
    (SELECT role FROM public.get_current_user_profile() LIMIT 1) IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "inventory_delete_owner_admin" ON public.inventory;
CREATE POLICY "inventory_delete_owner_admin"
  ON public.inventory FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile() LIMIT 1) IN ('owner', 'admin')
  );

-- -----------------------------------------------------------------------------
-- 3. delete_inventory_row RPC: SECURITY DEFINER so delete always allowed when
--    role/location rules pass. Use this from Branch Stocks instead of direct
--    table delete to avoid RLS "permission denied" (e.g. if policies not applied).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_inventory_row(
  p_product_id uuid,
  p_location_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_profile_location_id uuid;
  v_deleted int;
BEGIN
  IF p_product_id IS NULL OR p_location_id IS NULL THEN
    RAISE EXCEPTION 'product_id and location_id are required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT f.role, f.location_id INTO v_role, v_profile_location_id
  FROM public.get_current_user_profile() f
  LIMIT 1;

  IF v_role IN ('owner', 'admin') THEN
    DELETE FROM public.inventory
    WHERE product_id = p_product_id AND location_id = p_location_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted = 0 THEN
      RAISE EXCEPTION 'No inventory row found for this product at the specified branch'
        USING ERRCODE = 'P0002';
    END IF;
    RETURN;
  END IF;

  IF v_role = 'store_associate' THEN
    IF v_profile_location_id IS NULL THEN
      RAISE EXCEPTION 'store_associate has no assigned branch'
        USING ERRCODE = 'P0001';
    END IF;
    IF p_location_id IS DISTINCT FROM v_profile_location_id THEN
      RAISE EXCEPTION 'store_associate can only delete inventory at assigned branch'
        USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.inventory
    WHERE product_id = p_product_id AND location_id = p_location_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted = 0 THEN
      RAISE EXCEPTION 'No inventory row for this product at your branch'
        USING ERRCODE = 'P0002';
    END IF;
    RETURN;
  END IF;

  RAISE EXCEPTION 'You do not have permission to delete inventory rows'
    USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.delete_inventory_row(uuid, uuid) IS
  'Branch Stocks: delete one inventory row. owner/admin: any branch; store_associate: own branch only.';

GRANT EXECUTE ON FUNCTION public.delete_inventory_row(uuid, uuid) TO authenticated;
