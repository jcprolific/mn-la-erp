-- =============================================================================
-- Branch Stocks: single source of truth for read path
-- =============================================================================
-- Returns all inventory rows for all store locations. SECURITY DEFINER so every
-- authenticated user gets the same full dataset (no RLS variance by role).
-- Owner all-branches and store-associate single-branch both use this; frontend
-- filters by branch for display. Does not change write logic or store_receive_*
-- or warehouse_receive_*.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_all_branch_stocks()
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
    SELECT
      inv.product_id,
      inv.location_id,
      loc.name AS branch_name,
      COALESCE(p.barcode, '') AS barcode,
      COALESCE(p.name, '') AS name,
      COALESCE(p.size, '') AS size,
      COALESCE(p.color, '') AS color,
      inv.quantity
    FROM public.inventory inv
    INNER JOIN public.products p ON p.id = inv.product_id
    INNER JOIN public.locations loc ON loc.id = inv.location_id AND loc.type = 'store'
    ORDER BY loc.name, p.name, inv.product_id
  ) t;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_all_branch_stocks() IS
  'Returns all branch stock rows for every store location. Single read source for Branch Stocks page; frontend filters by branch.';

GRANT EXECUTE ON FUNCTION public.get_all_branch_stocks() TO authenticated;
