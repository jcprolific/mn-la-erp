-- =============================================================================
-- Store Sales V1 - barcode context + atomic process_store_sale RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_product_by_barcode_safe(p_barcode text)
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

COMMENT ON FUNCTION public.get_product_by_barcode_safe(text) IS
'Barcode lookup with sellable variant context for Sales Today V1. Includes product_id, variant_label, resolved_price, match_count, scanner_enabled.';

GRANT EXECUTE ON FUNCTION public.get_product_by_barcode_safe(text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.process_store_sale(
  p_items jsonb,
  p_request_id text DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_profile_location_id uuid;
  v_effective_location_id uuid;
  v_location_type text;
  v_request_id text;
  v_existing_tx_id uuid;
  v_existing_tx_created_by uuid;
  v_transaction_id uuid;
  v_reference_no text;
  v_total_amount numeric(12,2);
  v_total_items integer;
  v_attempt integer;
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT role, location_id
  INTO v_role, v_profile_location_id
  FROM public.get_current_user_profile()
  LIMIT 1;

  IF v_role NOT IN ('store_associate', 'owner', 'admin') THEN
    RAISE EXCEPTION 'Role not allowed to process store sale' USING ERRCODE = 'P0001';
  END IF;

  IF v_role = 'store_associate' THEN
    IF v_profile_location_id IS NULL THEN
      RAISE EXCEPTION 'store_associate has no assigned branch' USING ERRCODE = 'P0001';
    END IF;
    IF p_location_id IS NOT NULL AND p_location_id <> v_profile_location_id THEN
      RAISE EXCEPTION 'Store associate can only process sales for assigned branch' USING ERRCODE = 'P0001';
    END IF;
    v_effective_location_id := v_profile_location_id;
  ELSE
    v_effective_location_id := COALESCE(p_location_id, v_profile_location_id);
  END IF;

  IF v_effective_location_id IS NULL THEN
    RAISE EXCEPTION 'No store location selected' USING ERRCODE = 'P0001';
  END IF;

  SELECT type INTO v_location_type
  FROM public.locations
  WHERE id = v_effective_location_id;

  IF v_location_type IS DISTINCT FROM 'store' THEN
    RAISE EXCEPTION 'Sales can only be processed for store locations' USING ERRCODE = 'P0001';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale must include at least one cart line' USING ERRCODE = 'P0002';
  END IF;

  v_request_id := NULLIF(TRIM(COALESCE(p_request_id, '')), '');

  IF v_request_id IS NOT NULL THEN
    SELECT id, created_by
    INTO v_existing_tx_id, v_existing_tx_created_by
    FROM public.sales_transactions
    WHERE request_id = v_request_id
    LIMIT 1;

    IF v_existing_tx_id IS NOT NULL THEN
      IF v_existing_tx_created_by IS DISTINCT FROM v_user_id THEN
        RAISE EXCEPTION 'request_id already exists for another user' USING ERRCODE = 'P0001';
      END IF;
      SELECT jsonb_build_object(
        'ok', true,
        'idempotent_hit', true,
        'transaction', jsonb_build_object(
          'id', st.id,
          'reference_no', st.reference_no,
          'location_id', st.location_id,
          'business_date', st.business_date,
          'total_amount', st.total_amount,
          'total_items', st.total_items,
          'status', st.status,
          'created_at', st.created_at
        ),
        'items', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', i.id,
              'transaction_id', i.transaction_id,
              'location_id', i.location_id,
              'inventory_id', i.inventory_id,
              'product_id', i.product_id,
              'barcode', i.barcode,
              'product_name_snapshot', i.product_name_snapshot,
              'size_snapshot', i.size_snapshot,
              'price', i.price,
              'quantity', i.quantity,
              'line_total', i.line_total,
              'created_at', i.created_at
            )
            ORDER BY i.created_at, i.id
          )
          FROM public.sales_transaction_items i
          WHERE i.transaction_id = st.id
        ), '[]'::jsonb)
      )
      INTO v_result
      FROM public.sales_transactions st
      WHERE st.id = v_existing_tx_id;

      RETURN v_result;
    END IF;
  END IF;

  CREATE TEMP TABLE tmp_sale_lines_raw (
    line_no integer PRIMARY KEY,
    barcode text,
    product_id uuid,
    unit_price numeric(12,2),
    quantity integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_sale_lines_raw (line_no, barcode, product_id, unit_price, quantity)
  SELECT
    e.ord::integer AS line_no,
    NULLIF(TRIM(COALESCE(e.item->>'barcode', '')), '') AS barcode,
    NULLIF(TRIM(COALESCE(e.item->>'product_id', '')), '')::uuid AS product_id,
    NULLIF(TRIM(COALESCE(e.item->>'unit_price', '')), '')::numeric(12,2) AS unit_price,
    GREATEST(COALESCE(NULLIF(TRIM(COALESCE(e.item->>'quantity', '')), '')::integer, 0), 0) AS quantity
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(item, ord);

  IF EXISTS (SELECT 1 FROM tmp_sale_lines_raw WHERE quantity <= 0) THEN
    RAISE EXCEPTION 'All cart quantities must be greater than zero' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM tmp_sale_lines_raw WHERE unit_price IS NOT NULL AND unit_price < 0) THEN
    RAISE EXCEPTION 'Line unit_price cannot be negative' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_sale_lines_raw
    WHERE product_id IS NULL
      AND barcode IS NULL
  ) THEN
    RAISE EXCEPTION 'Each cart line must include barcode or product_id' USING ERRCODE = 'P0002';
  END IF;

  CREATE TEMP TABLE tmp_sale_lines_resolved (
    line_no integer PRIMARY KEY,
    product_id uuid NOT NULL,
    barcode text,
    product_name_snapshot text NOT NULL,
    size_snapshot text,
    price numeric(12,2) NOT NULL,
    quantity integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_sale_lines_resolved (
    line_no,
    product_id,
    barcode,
    product_name_snapshot,
    size_snapshot,
    price,
    quantity
  )
  SELECT
    r.line_no,
    p.id AS product_id,
    COALESCE(r.barcode, p.barcode) AS barcode,
    COALESCE(NULLIF(TRIM(COALESCE(p.name, '')), ''), COALESCE(NULLIF(TRIM(COALESCE(p.sku, '')), ''), 'Unnamed product')) AS product_name_snapshot,
    CASE
      WHEN NULLIF(TRIM(COALESCE(p.size, '')), '') IS NOT NULL
        AND NULLIF(TRIM(COALESCE(p.color, '')), '') IS NOT NULL
        THEN TRIM(p.size) || ' / ' || TRIM(p.color)
      WHEN NULLIF(TRIM(COALESCE(p.size, '')), '') IS NOT NULL
        THEN TRIM(p.size)
      WHEN NULLIF(TRIM(COALESCE(p.color, '')), '') IS NOT NULL
        THEN TRIM(p.color)
      ELSE NULL
    END AS size_snapshot,
    COALESCE(r.unit_price, COALESCE(p.shopify_price, 0)::numeric(12,2)) AS price,
    r.quantity
  FROM tmp_sale_lines_raw r
  JOIN public.products p
    ON p.id = r.product_id;

  INSERT INTO tmp_sale_lines_resolved (
    line_no,
    product_id,
    barcode,
    product_name_snapshot,
    size_snapshot,
    price,
    quantity
  )
  SELECT
    r.line_no,
    b.product_id,
    b.barcode,
    b.name AS product_name_snapshot,
    b.variant_label AS size_snapshot,
    COALESCE(r.unit_price, b.resolved_price),
    r.quantity
  FROM tmp_sale_lines_raw r
  CROSS JOIN LATERAL (
    SELECT x.*
    FROM public.get_product_by_barcode_safe(r.barcode) x
    LIMIT 1
  ) b
  WHERE r.product_id IS NULL
    AND b.match_count = 1
    AND b.scanner_enabled = true;

  IF EXISTS (
    SELECT 1
    FROM tmp_sale_lines_raw r
    WHERE NOT EXISTS (
      SELECT 1 FROM tmp_sale_lines_resolved s WHERE s.line_no = r.line_no
    )
  ) THEN
    RAISE EXCEPTION 'One or more barcodes are unresolved/ambiguous and require manual resolution'
      USING ERRCODE = 'P0002';
  END IF;

  CREATE TEMP TABLE tmp_sale_lines_agg (
    product_id uuid PRIMARY KEY,
    barcode text,
    product_name_snapshot text NOT NULL,
    size_snapshot text,
    price numeric(12,2) NOT NULL,
    quantity integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_sale_lines_agg (product_id, barcode, product_name_snapshot, size_snapshot, price, quantity)
  SELECT
    s.product_id,
    MIN(s.barcode) AS barcode,
    MIN(s.product_name_snapshot) AS product_name_snapshot,
    MIN(s.size_snapshot) AS size_snapshot,
    MAX(s.price) AS price,
    SUM(s.quantity)::integer AS quantity
  FROM tmp_sale_lines_resolved s
  GROUP BY s.product_id;

  CREATE TEMP TABLE tmp_sale_inventory_locked (
    product_id uuid PRIMARY KEY,
    inventory_id uuid NOT NULL,
    current_quantity integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_sale_inventory_locked (product_id, inventory_id, current_quantity)
  SELECT
    inv.product_id,
    inv.id AS inventory_id,
    inv.quantity AS current_quantity
  FROM public.inventory inv
  JOIN tmp_sale_lines_agg a
    ON a.product_id = inv.product_id
  WHERE inv.location_id = v_effective_location_id
  ORDER BY inv.product_id, inv.location_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM tmp_sale_lines_agg a
    LEFT JOIN tmp_sale_inventory_locked l
      ON l.product_id = a.product_id
    WHERE l.product_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Insufficient stock for one or more cart items' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_sale_lines_agg a
    JOIN tmp_sale_inventory_locked l
      ON l.product_id = a.product_id
    WHERE l.current_quantity < a.quantity
  ) THEN
    RAISE EXCEPTION 'Insufficient stock for one or more cart items' USING ERRCODE = 'P0002';
  END IF;

  SELECT
    COALESCE(SUM((a.price * a.quantity)::numeric(12,2)), 0)::numeric(12,2),
    COALESCE(SUM(a.quantity), 0)::integer
  INTO v_total_amount, v_total_items
  FROM tmp_sale_lines_agg a;

  v_transaction_id := NULL;
  FOR v_attempt IN 1..5 LOOP
    v_reference_no := 'SALE-' || to_char(v_now, 'YYYYMMDD') || '-' || LPAD(((FLOOR(random() * 1000000))::int)::text, 6, '0');
    BEGIN
      INSERT INTO public.sales_transactions (
        location_id,
        business_date,
        reference_no,
        request_id,
        total_amount,
        total_items,
        status,
        created_by,
        created_at
      ) VALUES (
        v_effective_location_id,
        current_date,
        v_reference_no,
        v_request_id,
        v_total_amount,
        v_total_items,
        'confirmed',
        v_user_id,
        v_now
      )
      RETURNING id INTO v_transaction_id;

      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_request_id IS NOT NULL THEN
          SELECT id, created_by INTO v_existing_tx_id, v_existing_tx_created_by
          FROM public.sales_transactions
          WHERE request_id = v_request_id
          LIMIT 1;
          IF v_existing_tx_id IS NOT NULL THEN
            IF v_existing_tx_created_by IS DISTINCT FROM v_user_id THEN
              RAISE EXCEPTION 'request_id already exists for another user' USING ERRCODE = 'P0001';
            END IF;
            v_transaction_id := v_existing_tx_id;
            EXIT;
          END IF;
        END IF;
    END;
  END LOOP;

  IF v_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Could not allocate unique sale reference number' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sales_transaction_items WHERE transaction_id = v_transaction_id) THEN
    INSERT INTO public.sales_transaction_items (
      transaction_id,
      location_id,
      inventory_id,
      product_id,
      barcode,
      product_name_snapshot,
      size_snapshot,
      price,
      quantity,
      line_total,
      created_at
    )
    SELECT
      v_transaction_id,
      v_effective_location_id,
      l.inventory_id,
      a.product_id,
      a.barcode,
      a.product_name_snapshot,
      a.size_snapshot,
      a.price,
      a.quantity,
      (a.price * a.quantity)::numeric(12,2),
      v_now
    FROM tmp_sale_lines_agg a
    JOIN tmp_sale_inventory_locked l
      ON l.product_id = a.product_id
    ORDER BY a.product_id;

    UPDATE public.inventory inv
    SET quantity = inv.quantity - a.quantity
    FROM tmp_sale_lines_agg a
    WHERE inv.location_id = v_effective_location_id
      AND inv.product_id = a.product_id;

    INSERT INTO public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      destination_location,
      note,
      source,
      created_by
    )
    SELECT
      a.product_id,
      'sale',
      a.quantity,
      v_effective_location_id,
      'Store sale ' || v_reference_no,
      'store_sale',
      v_user_id
    FROM tmp_sale_lines_agg a
    ORDER BY a.product_id;
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'idempotent_hit', (v_existing_tx_id IS NOT NULL),
    'transaction', jsonb_build_object(
      'id', st.id,
      'reference_no', st.reference_no,
      'location_id', st.location_id,
      'business_date', st.business_date,
      'total_amount', st.total_amount,
      'total_items', st.total_items,
      'status', st.status,
      'created_at', st.created_at
    ),
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'transaction_id', i.transaction_id,
          'location_id', i.location_id,
          'inventory_id', i.inventory_id,
          'product_id', i.product_id,
          'barcode', i.barcode,
          'product_name_snapshot', i.product_name_snapshot,
          'size_snapshot', i.size_snapshot,
          'price', i.price,
          'quantity', i.quantity,
          'line_total', i.line_total,
          'created_at', i.created_at
        )
        ORDER BY i.created_at, i.id
      )
      FROM public.sales_transaction_items i
      WHERE i.transaction_id = st.id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.sales_transactions st
  WHERE st.id = v_transaction_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.process_store_sale(jsonb, text, uuid) IS
'Atomically processes store sale for Sales Today V1: role+location checks, idempotency, barcode resolution, stock validation, sale writes, deduction, movement logs.';

GRANT EXECUTE ON FUNCTION public.process_store_sale(jsonb, text, uuid) TO authenticated;
