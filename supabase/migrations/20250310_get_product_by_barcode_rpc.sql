-- =============================================================================
-- RPC: get_product_by_barcode — barcode lookup for Store Inventory In
-- =============================================================================
-- Store associates need to look up products by barcode. If products table has
-- RLS enabled without a SELECT policy for store roles, direct .from('products')
-- returns no rows. This RPC runs with SECURITY DEFINER so the lookup succeeds
-- regardless of RLS. Returns up to 2 rows (oldest first) so caller can detect
-- duplicates and use the first match.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_product_by_barcode(p_barcode text)
RETURNS TABLE (
  id uuid,
  sku text,
  name text,
  barcode text,
  size text,
  color text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.sku, p.name, p.barcode, p.size, p.color, p.created_at
  FROM public.products p
  WHERE TRIM(COALESCE(p.barcode, '')) = TRIM(COALESCE(p_barcode, ''))
  ORDER BY p.created_at ASC
  LIMIT 2;
$$;

COMMENT ON FUNCTION public.get_product_by_barcode(text) IS
  'Store Inventory In: lookup product(s) by barcode. Bypasses RLS. Returns up to 2 rows (oldest first) for duplicate detection.';
