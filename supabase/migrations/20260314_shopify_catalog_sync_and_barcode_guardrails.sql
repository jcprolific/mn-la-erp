-- Shopify catalog mirror + barcode scanner guardrails.
-- Keeps ERP inventory quantity logic untouched.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS shopify_product_id text,
  ADD COLUMN IF NOT EXISTS shopify_variant_id text,
  ADD COLUMN IF NOT EXISTS shopify_inventory_item_id text,
  ADD COLUMN IF NOT EXISTS shopify_handle text,
  ADD COLUMN IF NOT EXISTS shopify_status text,
  ADD COLUMN IF NOT EXISTS shopify_image_url text,
  ADD COLUMN IF NOT EXISTS shopify_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS shopify_compare_at_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS shopify_options_json jsonb,
  ADD COLUMN IF NOT EXISTS shopify_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS catalog_source text DEFAULT 'erp',
  ADD COLUMN IF NOT EXISTS barcode_status text DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS scanner_enabled boolean DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS products_shopify_variant_id_key
  ON public.products (shopify_variant_id)
  WHERE shopify_variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_shopify_product_id_idx
  ON public.products (shopify_product_id);

CREATE INDEX IF NOT EXISTS products_barcode_idx
  ON public.products (barcode);

CREATE OR REPLACE FUNCTION public.refresh_product_barcode_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH normalized AS (
    SELECT
      p.id,
      NULLIF(TRIM(COALESCE(p.barcode, '')), '') AS normalized_barcode,
      CASE
        WHEN LOWER(COALESCE(p.shopify_status, 'active')) = 'archived' THEN false
        ELSE true
      END AS is_scan_active
    FROM public.products p
  ),
  barcode_counts AS (
    SELECT
      n.normalized_barcode,
      COUNT(*) FILTER (WHERE n.is_scan_active) AS active_matches
    FROM normalized n
    WHERE n.normalized_barcode IS NOT NULL
    GROUP BY n.normalized_barcode
  )
  UPDATE public.products p
  SET
    barcode_status = CASE
      WHEN n.normalized_barcode IS NULL THEN 'missing'
      WHEN COALESCE(c.active_matches, 0) > 1 THEN 'duplicate_conflict'
      ELSE 'valid_unique'
    END,
    scanner_enabled = CASE
      WHEN n.normalized_barcode IS NULL THEN false
      WHEN COALESCE(c.active_matches, 0) > 1 THEN false
      ELSE true
    END
  FROM normalized n
  LEFT JOIN barcode_counts c
    ON c.normalized_barcode = n.normalized_barcode
  WHERE p.id = n.id;
END;
$$;

COMMENT ON FUNCTION public.refresh_product_barcode_statuses() IS
'Recompute barcode_status/scanner_enabled from current product barcodes. Blocks scanner auto-match for duplicates/missing.';

CREATE OR REPLACE FUNCTION public.get_product_by_barcode_safe(p_barcode text)
RETURNS TABLE (
  id uuid,
  sku text,
  name text,
  barcode text,
  size text,
  color text,
  shopify_variant_id text,
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
      p.sku,
      p.name,
      p.barcode,
      p.size,
      p.color,
      p.shopify_variant_id,
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
    m.sku,
    m.name,
    m.barcode,
    m.size,
    m.color,
    m.shopify_variant_id,
    m.barcode_status,
    m.scanner_enabled,
    c.total_matches AS match_count,
    m.created_at
  FROM matches m
  CROSS JOIN counts c;
$$;

COMMENT ON FUNCTION public.get_product_by_barcode_safe(text) IS
'Barcode lookup with scanner guardrails. Returns all matches with match_count and scanner_enabled for ambiguity handling.';

GRANT EXECUTE ON FUNCTION public.refresh_product_barcode_statuses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_by_barcode_safe(text) TO authenticated, anon;

SELECT public.refresh_product_barcode_statuses();
