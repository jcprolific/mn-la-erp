-- =============================================================================
-- Shopify catalog hard-reset cutover helpers
-- - Rebuilds public.products from Shopify payload rows
-- - Remaps ERP inventory/product references to newly inserted product IDs
-- - Stores snapshot + mapping audit for rollback/debug
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.shopify_catalog_cutover_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text,
  notes text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  pre_products_count integer,
  post_products_count integer,
  pre_inventory_count integer,
  post_inventory_count integer,
  pre_inventory_movements_count integer,
  post_inventory_movements_count integer
);

CREATE TABLE IF NOT EXISTS public.shopify_catalog_cutover_products_snapshot (
  run_id uuid NOT NULL REFERENCES public.shopify_catalog_cutover_runs(id) ON DELETE CASCADE,
  old_product_id uuid NOT NULL,
  old_sku text,
  old_barcode text,
  old_shopify_variant_id text,
  old_row jsonb NOT NULL,
  PRIMARY KEY (run_id, old_product_id)
);

CREATE TABLE IF NOT EXISTS public.shopify_catalog_cutover_product_id_map (
  run_id uuid NOT NULL REFERENCES public.shopify_catalog_cutover_runs(id) ON DELETE CASCADE,
  old_product_id uuid NOT NULL,
  new_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  match_strategy text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, old_product_id)
);

CREATE OR REPLACE FUNCTION public.shopify_catalog_hard_reset_cutover(
  p_catalog_rows jsonb,
  p_actor text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_now timestamptz := now();
  v_pre_products integer := 0;
  v_pre_inventory integer := 0;
  v_pre_movements integer := 0;
  v_post_products integer := 0;
  v_post_inventory integer := 0;
  v_post_movements integer := 0;
  v_missing_references integer := 0;
BEGIN
  IF jsonb_typeof(p_catalog_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_catalog_rows must be a JSON array';
  END IF;
  IF jsonb_array_length(p_catalog_rows) = 0 THEN
    RAISE EXCEPTION 'p_catalog_rows cannot be empty';
  END IF;

  SELECT COUNT(*)::integer INTO v_pre_products FROM public.products;
  SELECT COUNT(*)::integer INTO v_pre_inventory FROM public.inventory;
  SELECT COUNT(*)::integer INTO v_pre_movements FROM public.inventory_movements;

  INSERT INTO public.shopify_catalog_cutover_runs (
    actor,
    notes,
    status,
    pre_products_count,
    pre_inventory_count,
    pre_inventory_movements_count
  )
  VALUES (
    COALESCE(NULLIF(TRIM(COALESCE(p_actor, '')), ''), current_user),
    NULLIF(TRIM(COALESCE(p_notes, '')), ''),
    'running',
    v_pre_products,
    v_pre_inventory,
    v_pre_movements
  )
  RETURNING id INTO v_run_id;

  CREATE TEMP TABLE tmp_old_products ON COMMIT DROP AS
  SELECT
    p.id AS old_product_id,
    NULLIF(TRIM(COALESCE(p.sku, '')), '') AS old_sku,
    NULLIF(TRIM(COALESCE(p.barcode, '')), '') AS old_barcode,
    NULLIF(TRIM(COALESCE(p.shopify_variant_id, '')), '') AS old_shopify_variant_id
  FROM public.products p;

  INSERT INTO public.shopify_catalog_cutover_products_snapshot (
    run_id,
    old_product_id,
    old_sku,
    old_barcode,
    old_shopify_variant_id,
    old_row
  )
  SELECT
    v_run_id,
    p.id,
    NULLIF(TRIM(COALESCE(p.sku, '')), ''),
    NULLIF(TRIM(COALESCE(p.barcode, '')), ''),
    NULLIF(TRIM(COALESCE(p.shopify_variant_id, '')), ''),
    to_jsonb(p)
  FROM public.products p;

  -- Free potentially unique keys from old rows so full catalog reinsert can proceed safely.
  UPDATE public.products p
  SET
    sku = '__archived__' || p.id::text,
    barcode = CASE
      WHEN NULLIF(TRIM(COALESCE(p.barcode, '')), '') IS NULL THEN p.barcode
      ELSE '__archived__' || p.id::text
    END,
    shopify_variant_id = CASE
      WHEN NULLIF(TRIM(COALESCE(p.shopify_variant_id, '')), '') IS NULL THEN p.shopify_variant_id
      ELSE '__archived__' || p.id::text
    END,
    catalog_source = 'erp_archived'
  WHERE EXISTS (
    SELECT 1 FROM tmp_old_products o WHERE o.old_product_id = p.id
  );

  CREATE TEMP TABLE tmp_catalog_source (
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
    shopify_options_json jsonb
  ) ON COMMIT DROP;

  INSERT INTO tmp_catalog_source (
    name,
    sku,
    barcode,
    size,
    color,
    shopify_product_id,
    shopify_variant_id,
    shopify_inventory_item_id,
    shopify_handle,
    shopify_status,
    shopify_image_url,
    shopify_price,
    shopify_compare_at_price,
    shopify_options_json
  )
  SELECT
    NULLIF(TRIM(COALESCE(e->>'name', '')), ''),
    NULLIF(TRIM(COALESCE(e->>'sku', '')), ''),
    NULLIF(TRIM(COALESCE(e->>'barcode', '')), ''),
    NULLIF(TRIM(COALESCE(e->>'size', '')), ''),
    NULLIF(TRIM(COALESCE(e->>'color', '')), ''),
    NULLIF(TRIM(COALESCE(e->>'shopify_product_id', '')), ''),
    NULLIF(TRIM(COALESCE(e->>'shopify_variant_id', '')), ''),
    NULLIF(TRIM(COALESCE(e->>'shopify_inventory_item_id', '')), ''),
    NULLIF(TRIM(COALESCE(e->>'shopify_handle', '')), ''),
    NULLIF(TRIM(COALESCE(e->>'shopify_status', '')), ''),
    NULLIF(TRIM(COALESCE(e->>'shopify_image_url', '')), ''),
    NULLIF(TRIM(COALESCE(e->>'shopify_price', '')), '')::numeric(12,2),
    NULLIF(TRIM(COALESCE(e->>'shopify_compare_at_price', '')), '')::numeric(12,2),
    CASE
      WHEN jsonb_typeof(e->'shopify_options_json') = 'array' THEN e->'shopify_options_json'
      ELSE '[]'::jsonb
    END
  FROM jsonb_array_elements(p_catalog_rows) e;

  IF EXISTS (SELECT 1 FROM tmp_catalog_source WHERE shopify_variant_id IS NULL) THEN
    RAISE EXCEPTION 'Every catalog row must include shopify_variant_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_catalog_source
    GROUP BY shopify_variant_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate shopify_variant_id found in p_catalog_rows';
  END IF;

  IF EXISTS (SELECT 1 FROM tmp_catalog_source WHERE sku IS NULL) THEN
    RAISE EXCEPTION 'Every catalog row must include sku';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_catalog_source
    GROUP BY sku
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate SKU found in p_catalog_rows';
  END IF;

  CREATE TEMP TABLE tmp_new_products ON COMMIT DROP AS
  WITH inserted AS (
    INSERT INTO public.products (
      name,
      sku,
      barcode,
      size,
      color,
      shopify_product_id,
      shopify_variant_id,
      shopify_inventory_item_id,
      shopify_handle,
      shopify_status,
      shopify_image_url,
      shopify_price,
      shopify_compare_at_price,
      shopify_options_json,
      shopify_last_synced_at,
      catalog_source
    )
    SELECT
      COALESCE(name, sku),
      sku,
      barcode,
      size,
      color,
      shopify_product_id,
      shopify_variant_id,
      shopify_inventory_item_id,
      shopify_handle,
      shopify_status,
      shopify_image_url,
      shopify_price,
      shopify_compare_at_price,
      shopify_options_json,
      v_now,
      'shopify'
    FROM tmp_catalog_source
    RETURNING id, sku, barcode, shopify_variant_id
  )
  SELECT * FROM inserted;

  CREATE TEMP TABLE tmp_old_to_new_map (
    old_product_id uuid PRIMARY KEY,
    new_product_id uuid NOT NULL,
    match_strategy text NOT NULL
  ) ON COMMIT DROP;

  -- Strategy 1: best match by Shopify variant ID.
  INSERT INTO tmp_old_to_new_map (old_product_id, new_product_id, match_strategy)
  SELECT
    o.old_product_id,
    n.id,
    'shopify_variant_id'
  FROM tmp_old_products o
  JOIN tmp_new_products n
    ON o.old_shopify_variant_id IS NOT NULL
   AND o.old_shopify_variant_id = n.shopify_variant_id
  ON CONFLICT (old_product_id) DO NOTHING;

  -- Strategy 2: fallback by exact SKU.
  INSERT INTO tmp_old_to_new_map (old_product_id, new_product_id, match_strategy)
  SELECT
    o.old_product_id,
    n.id,
    'sku'
  FROM tmp_old_products o
  JOIN tmp_new_products n
    ON o.old_sku IS NOT NULL
   AND o.old_sku = n.sku
  LEFT JOIN tmp_old_to_new_map m
    ON m.old_product_id = o.old_product_id
  WHERE m.old_product_id IS NULL
  ON CONFLICT (old_product_id) DO NOTHING;

  -- Strategy 3: fallback by barcode only when barcode is unique in new set.
  CREATE TEMP TABLE tmp_unique_new_barcodes ON COMMIT DROP AS
  SELECT
    barcode,
    MIN(id) AS new_product_id
  FROM tmp_new_products
  WHERE barcode IS NOT NULL
  GROUP BY barcode
  HAVING COUNT(*) = 1;

  INSERT INTO tmp_old_to_new_map (old_product_id, new_product_id, match_strategy)
  SELECT
    o.old_product_id,
    u.new_product_id,
    'barcode'
  FROM tmp_old_products o
  JOIN tmp_unique_new_barcodes u
    ON o.old_barcode IS NOT NULL
   AND o.old_barcode = u.barcode
  LEFT JOIN tmp_old_to_new_map m
    ON m.old_product_id = o.old_product_id
  WHERE m.old_product_id IS NULL
  ON CONFLICT (old_product_id) DO NOTHING;

  INSERT INTO public.shopify_catalog_cutover_product_id_map (
    run_id,
    old_product_id,
    new_product_id,
    match_strategy
  )
  SELECT
    v_run_id,
    m.old_product_id,
    m.new_product_id,
    m.match_strategy
  FROM tmp_old_to_new_map m;

  CREATE TEMP TABLE tmp_referenced_old_ids ON COMMIT DROP AS
  SELECT DISTINCT product_id
  FROM public.inventory
  WHERE product_id IN (SELECT old_product_id FROM tmp_old_products)
  UNION
  SELECT DISTINCT product_id
  FROM public.inventory_movements
  WHERE product_id IN (SELECT old_product_id FROM tmp_old_products)
  UNION
  SELECT DISTINCT product_id
  FROM public.inventory_out_requests
  WHERE product_id IN (SELECT old_product_id FROM tmp_old_products)
  UNION
  SELECT DISTINCT product_id
  FROM public.store_sales
  WHERE product_id IS NOT NULL
    AND product_id IN (SELECT old_product_id FROM tmp_old_products);

  SELECT COUNT(*)::integer INTO v_missing_references
  FROM tmp_referenced_old_ids r
  LEFT JOIN tmp_old_to_new_map m
    ON m.old_product_id = r.product_id
  WHERE m.old_product_id IS NULL;

  IF v_missing_references > 0 THEN
    RAISE EXCEPTION
      'Cutover aborted. % referenced products could not be mapped to Shopify catalog rows.',
      v_missing_references;
  END IF;

  UPDATE public.inventory i
  SET product_id = m.new_product_id
  FROM tmp_old_to_new_map m
  WHERE i.product_id = m.old_product_id;

  UPDATE public.inventory_movements im
  SET product_id = m.new_product_id
  FROM tmp_old_to_new_map m
  WHERE im.product_id = m.old_product_id;

  UPDATE public.inventory_out_requests ior
  SET product_id = m.new_product_id
  FROM tmp_old_to_new_map m
  WHERE ior.product_id = m.old_product_id;

  UPDATE public.store_sales ss
  SET product_id = m.new_product_id
  FROM tmp_old_to_new_map m
  WHERE ss.product_id = m.old_product_id;

  -- Remove all pre-cutover product rows after references are remapped.
  DELETE FROM public.products p
  USING tmp_old_products o
  WHERE p.id = o.old_product_id;

  IF to_regprocedure('public.refresh_product_barcode_statuses()') IS NOT NULL THEN
    PERFORM public.refresh_product_barcode_statuses();
  END IF;

  SELECT COUNT(*)::integer INTO v_post_products FROM public.products;
  SELECT COUNT(*)::integer INTO v_post_inventory FROM public.inventory;
  SELECT COUNT(*)::integer INTO v_post_movements FROM public.inventory_movements;

  UPDATE public.shopify_catalog_cutover_runs
  SET
    status = 'completed',
    completed_at = now(),
    post_products_count = v_post_products,
    post_inventory_count = v_post_inventory,
    post_inventory_movements_count = v_post_movements
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'pre_products_count', v_pre_products,
    'post_products_count', v_post_products,
    'pre_inventory_count', v_pre_inventory,
    'post_inventory_count', v_post_inventory,
    'pre_inventory_movements_count', v_pre_movements,
    'post_inventory_movements_count', v_post_movements
  );
EXCEPTION
  WHEN OTHERS THEN
    IF v_run_id IS NOT NULL THEN
      UPDATE public.shopify_catalog_cutover_runs
      SET
        status = 'failed',
        completed_at = now(),
        error_message = SQLERRM
      WHERE id = v_run_id;
    END IF;
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.shopify_catalog_hard_reset_cutover(jsonb, text, text) IS
'Hard reset cutover from Shopify catalog payload: snapshot old products, insert new catalog rows, remap product_id references, and delete old rows.';
