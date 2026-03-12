-- Branch stocks by location: SECURITY DEFINER, no profile check.
-- Used by Branch Stocks page for owner/admin so data is returned even when
-- get_current_user_profile() is null or role check fails (e.g. session edge cases).
-- Only returns data for store-type locations.

CREATE OR REPLACE FUNCTION public.get_branch_stocks_by_location(p_location_id uuid)
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
  IF p_location_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.locations WHERE id = p_location_id AND type = 'store'
  ) INTO v_is_store;

  IF NOT v_is_store THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT p.id, p.sku, p.name, p.size, p.color, p.barcode, inv.quantity
    FROM public.inventory inv
    INNER JOIN public.products p ON p.id = inv.product_id
    WHERE inv.location_id = p_location_id
    ORDER BY p.name, p.sku
  ) t;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.get_branch_stocks_by_location(uuid) IS
  'Returns branch stock rows for a store location. SECURITY DEFINER; no auth.uid() check. Used by Branch Stocks page for owner/admin.';

GRANT EXECUTE ON FUNCTION public.get_branch_stocks_by_location(uuid) TO authenticated;
