-- =============================================================================
-- Shopify hard reset cutover V2
-- - Reads rows from stage table (by batch_id)
-- - Handles optional tables (inventory_out_requests, store_sales)
-- - Compatible with schemas where those tables are absent
-- =============================================================================

CREATE OR REPLACE FUNCTION public.shopify_catalog_hard_reset_cutover_from_stage_v2(
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
  v_run_id uuid;
  v_now timestamptz := now();
  v_pre_products integer := 0;
  v_pre_inventory integer := 0;
  v_pre_movements integer := 0;
  v_post_products integer := 0;
  v_post_inventory integer := 0;
  v_post_movements integer := 0;
  v_stage_count integer := 0;
  v_missing_references integer := 0;
BEGIN
  SELECT COUNT(*)::integer INTO v_stage_count
  FROM public.shopify_catalog_cutover_stage s
  WHERE s.batch_id = p_batch_id;

  IF v_stage_count = 0 THEN
    RAISE EXCEPTION 'No stage rows found for batch_id %', p_batch_id;
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
    COALESCE(NULLIF(TRIM(COALESCE(p_notes, '')), ''), 'shopify staged cutover v2'),
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
    shopify_inventory_item_id = NULL,
    catalog_source = 'erp_archived'
  WHERE EXISTS (
    SELECT 1 FROM tmp_old_products o WHERE o.old_product_id = p.id
  );

  CREATE TEMP TABLE tmp_catalog_source ON COMMIT DROP AS
  SELECT
    s.name,
    s.sku,
    s.barcode,
    s.size,
    s.color,
    s.shopify_product_id,
    s.shopify_variant_id,
    s.shopify_inventory_item_id,
    s.shopify_handle,
    s.shopify_status,
    s.shopify_image_url,
    s.shopify_price,
    s.shopify_compare_at_price,
    COALESCE(s.shopify_options_json, '[]'::jsonb) AS shopify_options_json
  FROM public.shopify_catalog_cutover_stage s
  WHERE s.batch_id = p_batch_id
  ORDER BY s.row_index;

  IF EXISTS (
    SELECT 1
    FROM tmp_catalog_source
    GROUP BY sku
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate SKU found in staged rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_catalog_source
    GROUP BY shopify_variant_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate shopify_variant_id found in staged rows';
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
      NULL,
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

  CREATE TEMP TABLE tmp_unique_new_barcodes ON COMMIT DROP AS
  SELECT
    barcode,
    (array_agg(id ORDER BY id::text))[1] AS new_product_id
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
  WHERE product_id IN (SELECT old_product_id FROM tmp_old_products);

  IF to_regclass('public.inventory_out_requests') IS NOT NULL THEN
    INSERT INTO tmp_referenced_old_ids
    SELECT DISTINCT product_id
    FROM public.inventory_out_requests
    WHERE product_id IN (SELECT old_product_id FROM tmp_old_products);
  END IF;

  IF to_regclass('public.store_sales') IS NOT NULL THEN
    INSERT INTO tmp_referenced_old_ids
    SELECT DISTINCT product_id
    FROM public.store_sales
    WHERE product_id IS NOT NULL
      AND product_id IN (SELECT old_product_id FROM tmp_old_products);
  END IF;

  SELECT COUNT(*)::integer INTO v_missing_references
  FROM (SELECT DISTINCT product_id FROM tmp_referenced_old_ids) r
  LEFT JOIN tmp_old_to_new_map m
    ON m.old_product_id = r.product_id
  WHERE m.old_product_id IS NULL;

  IF v_missing_references > 0 THEN
    RAISE EXCEPTION
      'Cutover aborted. % referenced products could not be mapped to staged Shopify rows.',
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

  IF to_regclass('public.inventory_out_requests') IS NOT NULL THEN
    UPDATE public.inventory_out_requests ior
    SET product_id = m.new_product_id
    FROM tmp_old_to_new_map m
    WHERE ior.product_id = m.old_product_id;
  END IF;

  IF to_regclass('public.store_sales') IS NOT NULL THEN
    UPDATE public.store_sales ss
    SET product_id = m.new_product_id
    FROM tmp_old_to_new_map m
    WHERE ss.product_id = m.old_product_id;
  END IF;

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

COMMENT ON FUNCTION public.shopify_catalog_hard_reset_cutover_from_stage_v2(uuid, text, text) IS
'Schema-compatible V2 cutover from stage table with optional-table guards and staged mapping/remap.';
