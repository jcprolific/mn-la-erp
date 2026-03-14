-- =============================================================================
-- Stage support for large Shopify hard cutover (chunked upload + server-side run)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.shopify_catalog_cutover_stage (
  batch_id uuid NOT NULL,
  row_index integer NOT NULL,
  name text,
  sku text,
  barcode text,
  size text,
  color text,
  shopify_product_id text,
  shopify_variant_id text,
  shopify_inventory_item_id text,
  shopify_handle text,
  shopify_status text,
  shopify_image_url text,
  shopify_price numeric(12,2),
  shopify_compare_at_price numeric(12,2),
  shopify_options_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, row_index)
);

CREATE INDEX IF NOT EXISTS shopify_catalog_cutover_stage_batch_idx
  ON public.shopify_catalog_cutover_stage(batch_id);

CREATE OR REPLACE FUNCTION public.shopify_catalog_hard_reset_cutover_from_stage(
  p_batch_id uuid,
  p_actor text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_count integer;
BEGIN
  SELECT COUNT(*)::integer INTO v_count
  FROM public.shopify_catalog_cutover_stage s
  WHERE s.batch_id = p_batch_id;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No stage rows found for batch_id %', p_batch_id;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'name', s.name,
      'sku', s.sku,
      'barcode', s.barcode,
      'size', s.size,
      'color', s.color,
      'shopify_product_id', s.shopify_product_id,
      'shopify_variant_id', s.shopify_variant_id,
      'shopify_inventory_item_id', s.shopify_inventory_item_id,
      'shopify_handle', s.shopify_handle,
      'shopify_status', s.shopify_status,
      'shopify_image_url', s.shopify_image_url,
      'shopify_price', s.shopify_price,
      'shopify_compare_at_price', s.shopify_compare_at_price,
      'shopify_options_json', COALESCE(s.shopify_options_json, '[]'::jsonb)
    )
    ORDER BY s.row_index
  )
  INTO v_payload
  FROM public.shopify_catalog_cutover_stage s
  WHERE s.batch_id = p_batch_id;

  PERFORM set_config('statement_timeout', '0', true);

  RETURN public.shopify_catalog_hard_reset_cutover(
    v_payload,
    p_actor,
    COALESCE(NULLIF(TRIM(COALESCE(p_notes, '')), ''), 'shopify staged cutover')
  );
END;
$$;

COMMENT ON FUNCTION public.shopify_catalog_hard_reset_cutover_from_stage(uuid, text, text) IS
'Runs hard reset cutover from rows already uploaded to shopify_catalog_cutover_stage for given batch_id.';
