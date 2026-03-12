-- Branch Stocks: return inventory.id from read RPCs and delete by inventory id.
-- 1. get_branch_stocks_by_location: return inventory_id, product_id, location_id (store associate path).
-- 2. get_all_branch_stocks: return inventory_id.
-- 3. delete_inventory_row(p_inventory_id uuid): delete by id; same owner/admin and store_associate checks.

DROP FUNCTION IF EXISTS public.get_branch_stocks_by_location(uuid);
CREATE FUNCTION public.get_branch_stocks_by_location(p_location_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_store boolean;
  v_rows jsonb;
BEGIN
  IF p_location_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT EXISTS (SELECT 1 FROM public.locations WHERE id = p_location_id AND type = 'store') INTO v_is_store;
  IF NOT v_is_store THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT inv.id AS inventory_id, inv.product_id, inv.location_id, p.id AS product_id, p.sku, p.name, p.size, p.color, p.barcode, inv.quantity
    FROM public.inventory inv
    INNER JOIN public.products p ON p.id = inv.product_id
    WHERE inv.location_id = p_location_id
    ORDER BY p.name, p.sku
  ) t;
  RETURN v_rows;
END;
$$;

DROP FUNCTION IF EXISTS public.get_all_branch_stocks();
CREATE FUNCTION public.get_all_branch_stocks()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_result
  FROM (
    SELECT inv.id AS inventory_id, inv.product_id, inv.location_id, loc.name AS branch_name,
      COALESCE(p.barcode, '') AS barcode, COALESCE(p.name, '') AS name, COALESCE(p.size, '') AS size, COALESCE(p.color, '') AS color,
      inv.quantity
    FROM public.inventory inv
    INNER JOIN public.products p ON p.id = inv.product_id
    INNER JOIN public.locations loc ON loc.id = inv.location_id AND loc.type = 'store'
    ORDER BY loc.name, p.name, inv.product_id
  ) t;
  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.delete_inventory_row(uuid, uuid);
CREATE FUNCTION public.delete_inventory_row(p_inventory_id uuid)
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
    RAISE EXCEPTION 'inventory id is required' USING ERRCODE = 'P0001';
  END IF;

  SELECT f.role, f.location_id INTO v_role, v_profile_location_id
  FROM public.get_current_user_profile() f LIMIT 1;

  v_role := NULLIF(TRIM(v_role), '');
  IF v_role IS NOT NULL THEN v_role := LOWER(v_role); END IF;

  IF v_role IS NULL AND v_profile_location_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user (auth.uid()=%). Ensure public.profiles has a row with id = auth.uid().', v_auth_uid
      USING ERRCODE = 'P0001', HINT = 'Check public.profiles has a row with id = auth.uid()';
  END IF;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profile role is missing. Contact admin to set profiles.role (e.g. store_associate) for your user.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_role IN ('owner', 'admin') THEN
    DELETE FROM public.inventory WHERE id = p_inventory_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
  END IF;

  IF v_role = 'store_associate' THEN
    IF v_profile_location_id IS NULL THEN
      RAISE EXCEPTION 'store_associate has no assigned branch' USING ERRCODE = 'P0001';
    END IF;
    SELECT location_id INTO v_inv_location_id FROM public.inventory WHERE id = p_inventory_id;
    IF v_inv_location_id IS NULL THEN
      RETURN 0;
    END IF;
    IF v_inv_location_id IS DISTINCT FROM v_profile_location_id THEN
      RAISE EXCEPTION 'store_associate can only delete inventory at assigned branch' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.inventory WHERE id = p_inventory_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
  END IF;

  RAISE EXCEPTION 'You do not have permission to delete inventory rows' USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.delete_inventory_row(uuid) IS
  'Branch Stocks: delete one inventory row by id. Returns deleted count (0 or 1). owner/admin: any; store_associate: own branch only.';

GRANT EXECUTE ON FUNCTION public.delete_inventory_row(uuid) TO authenticated;
