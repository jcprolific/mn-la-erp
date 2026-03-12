-- Debug and fix for store_associate delete: ensure profile is found and log values.
-- 1. If get_current_user_profile() returns no row, raise clear error (profile not found).
-- 2. RAISE NOTICE so Supabase Logs show: auth.uid(), role, profile location_id, p_product_id, p_location_id, match.

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
  v_auth_uid uuid;
BEGIN
  v_auth_uid := auth.uid();

  IF p_product_id IS NULL OR p_location_id IS NULL THEN
    RAISE EXCEPTION 'product_id and location_id are required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT f.role, f.location_id INTO v_role, v_profile_location_id
  FROM public.get_current_user_profile() f
  LIMIT 1;

  v_role := NULLIF(TRIM(v_role), '');
  IF v_role IS NOT NULL THEN
    v_role := LOWER(v_role);
  END IF;

  -- Debug: log so Supabase Logs show values (and detect no-row)
  RAISE NOTICE 'delete_inventory_row: auth.uid()=%, role=%, profile_location_id=%, p_product_id=%, p_location_id=%, location_match=%',
    v_auth_uid, v_role, v_profile_location_id, p_product_id, p_location_id,
    (v_profile_location_id IS NOT DISTINCT FROM p_location_id);

  IF v_role IS NULL AND v_profile_location_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user (auth.uid()=%). Ensure public.profiles has a row with id = auth.uid().'
      USING ERRCODE = 'P0001', HINT = 'Check public.profiles has a row with id = auth.uid()';
  END IF;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profile role is missing. Contact admin to set profiles.role (e.g. store_associate) for your user.'
      USING ERRCODE = 'P0001';
  END IF;

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
  'Branch Stocks: delete one inventory row. owner/admin: any branch; store_associate: own branch only. Debug: RAISE NOTICE and profile-not-found check.';
