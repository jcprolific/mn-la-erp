-- =============================================================================
-- Fix: products table has shopify_price, not selling_price.
-- Replace all p.selling_price references with shopify_price only.
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_product_by_barcode_safe(text);

CREATE FUNCTION public.get_product_by_barcode_safe(p_barcode text)
RETURNS TABLE (
  id uuid,
  product_id uuid,
  sku text,
  name text,
  barcode text,
  size text,
  color text,
  variant_label text,
  resolved_price numeric(12,2),
  shopify_variant_id text,
  shopify_inventory_item_id text,
  barcode_status text,
  scanner_enabled boolean,
  match_count integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH matches AS (
    SELECT
      p.id,
      p.id AS product_id,
      p.sku,
      p.name,
      p.barcode,
      p.size,
      p.color,
      CASE
        WHEN NULLIF(TRIM(COALESCE(p.size, '')), '') IS NOT NULL
          AND NULLIF(TRIM(COALESCE(p.color, '')), '') IS NOT NULL
          THEN TRIM(p.size) || ' / ' || TRIM(p.color)
        WHEN NULLIF(TRIM(COALESCE(p.size, '')), '') IS NOT NULL
          THEN TRIM(p.size)
        WHEN NULLIF(TRIM(COALESCE(p.color, '')), '') IS NOT NULL
          THEN TRIM(p.color)
        WHEN NULLIF(TRIM(COALESCE(p.sku, '')), '') IS NOT NULL
          THEN TRIM(p.sku)
        ELSE TRIM(COALESCE(p.name, 'Variant'))
      END AS variant_label,
      COALESCE(p.shopify_price, 0)::numeric(12,2) AS resolved_price,
      p.shopify_variant_id,
      p.shopify_inventory_item_id,
      p.barcode_status,
      p.scanner_enabled,
      p.created_at
    FROM public.products p
    WHERE TRIM(COALESCE(p.barcode, '')) = TRIM(COALESCE(p_barcode, ''))
    ORDER BY p.created_at ASC
  ),
  counts AS (
    SELECT COUNT(*)::integer AS total_matches FROM matches
  )
  SELECT
    m.id,
    m.product_id,
    m.sku,
    m.name,
    m.barcode,
    m.size,
    m.color,
    m.variant_label,
    m.resolved_price,
    m.shopify_variant_id,
    m.shopify_inventory_item_id,
    m.barcode_status,
    m.scanner_enabled,
    c.total_matches AS match_count,
    m.created_at
  FROM matches m
  CROSS JOIN counts c;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_by_barcode_safe(text) TO authenticated, anon;
