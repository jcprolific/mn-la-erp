-- Warehouse Stocks: delete by inventory id, extend delete_inventory_row for warehouse roles,
-- and ensure get_warehouse_stocks returns inventory_id.
-- Warehouse staff must have profiles.location_id = warehouse location to delete.

-- 1. get_warehouse_stocks: return inventory_id, product_id, location_id, product fields, quantity, updated_at.
DROP FUNCTION IF EXISTS public.get_warehouse_stocks();
CREATE FUNCTION public.get_warehouse_stocks()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      inv.id AS inventory_id,
      inv.product_id,
      inv.location_id,
      COALESCE(p.barcode, '') AS barcode,
      COALESCE(p.name, '') AS name,
      COALESCE(p.size, '') AS size,
      COALESCE(p.color, '') AS color,
      inv.quantity,
      inv.updated_at
    FROM public.inventory inv
    INNER JOIN public.products p ON p.id = inv.product_id
    WHERE inv.location_id IN (SELECT id FROM public.locations WHERE type = 'warehouse')
    ORDER BY p.name, inv.product_id
  ) t;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.get_warehouse_stocks() IS
  'Returns warehouse stock rows for all warehouse locations. SECURITY DEFINER; returns inventory_id, product_id, location_id, product fields, quantity, updated_at.';

GRANT EXECUTE ON FUNCTION public.get_warehouse_stocks() TO authenticated;

-- 2. RLS: allow warehouse roles to DELETE inventory only at their assigned warehouse location.
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_delete_warehouse_own_location" ON public.inventory;
CREATE POLICY "inventory_delete_warehouse_own_location"
  ON public.inventory FOR DELETE
  TO authenticated
  USING (
    location_id IN (SELECT id FROM public.locations WHERE type = 'warehouse')
    AND (SELECT role FROM public.get_current_user_profile() LIMIT 1) IN ('owner', 'admin', 'warehouse_staff', 'warehouse')
    AND (SELECT location_id FROM public.get_current_user_profile() LIMIT 1) = location_id
  );

COMMENT ON POLICY "inventory_delete_warehouse_own_location" ON public.inventory IS
  'Warehouse users (owner, admin, warehouse_staff, warehouse) can delete inventory rows only at their assigned warehouse location.';

-- 3. delete_inventory_row: extend to support warehouse roles while keeping store behavior.
CREATE OR REPLACE FUNCTION public.delete_inventory_row(p_inventory_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_profile_location_id uuid;
  v_inv_location_id uuid;
  v_deleted int;
  v_auth_uid uuid;
BEGIN
  v_auth_uid := auth.uid();

  IF p_inventory_id IS NULL THEN
    RAISE EXCEPTION 'inventory id is required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT f.role, f.location_id
  INTO v_role, v_profile_location_id
  FROM public.get_current_user_profile() f
  LIMIT 1;

  v_role := NULLIF(TRIM(v_role), '');
  IF v_role IS NOT NULL THEN
    v_role := LOWER(v_role);
  END IF;

  IF v_role IS NULL AND v_profile_location_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user (auth.uid()=%). Ensure public.profiles has a row with id = auth.uid().',
      v_auth_uid
      USING ERRCODE = 'P0001',
            HINT = 'Check public.profiles has a row with id = auth.uid()';
  END IF;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profile role is missing. Contact admin to set profiles.role (e.g. store_associate, warehouse_staff) for your user.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT location_id INTO v_inv_location_id
  FROM public.inventory
  WHERE id = p_inventory_id;

  IF v_inv_location_id IS NULL THEN
    -- Row already missing; behave like 0 deletes.
    RETURN 0;
  END IF;

  IF v_role IN ('owner', 'admin') THEN
    DELETE FROM public.inventory
    WHERE id = p_inventory_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
  END IF;

  IF v_role = 'store_associate' THEN
    IF v_profile_location_id IS NULL THEN
      RAISE EXCEPTION 'store_associate has no assigned branch'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_inv_location_id IS DISTINCT FROM v_profile_location_id THEN
      RAISE EXCEPTION 'store_associate can only delete inventory at assigned branch'
        USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.inventory
    WHERE id = p_inventory_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
  END IF;

  IF v_role IN ('warehouse_staff', 'warehouse') THEN
    IF v_profile_location_id IS NULL THEN
      RAISE EXCEPTION 'warehouse user has no assigned warehouse location'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_inv_location_id IS DISTINCT FROM v_profile_location_id THEN
      RAISE EXCEPTION 'warehouse user can only delete inventory at assigned warehouse location'
        USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.inventory
    WHERE id = p_inventory_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
  END IF;

  RAISE EXCEPTION 'You do not have permission to delete inventory rows'
    USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.delete_inventory_row(uuid) IS
  'Delete one inventory row by id. Returns deleted count (0 or 1). owner/admin: any location; store_associate: own branch; warehouse roles: own warehouse location only.';

GRANT EXECUTE ON FUNCTION public.delete_inventory_row(uuid) TO authenticated;

