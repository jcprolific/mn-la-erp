-- =============================================================================
-- get_all_stores_branch_stock_counts: Returns total stock count per store.
-- Used by Store Dashboard "Branch Stock Count by Store" section (owner/admin).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_all_stores_branch_stock_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.name), '[]'::jsonb) INTO v_result
  FROM (
    SELECT loc.id AS location_id, loc.name, COALESCE(SUM(inv.quantity), 0)::bigint AS branch_stock_count
    FROM public.locations loc
    LEFT JOIN public.inventory inv ON inv.location_id = loc.id
    WHERE loc.type = 'store'
    GROUP BY loc.id, loc.name
  ) t;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_all_stores_branch_stock_counts() IS
  'Returns per-store branch stock counts for Store Dashboard. [{location_id, name, branch_stock_count}, ...]. Allowed for owner, admin, store_associate.';

GRANT EXECUTE ON FUNCTION public.get_all_stores_branch_stock_counts() TO authenticated;
