-- =============================================================================
-- Store Sales V1 - read RPCs (new tables only)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_store_dashboard_sales_metrics_v1(p_location_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_profile_location_id uuid;
  v_effective_location_id uuid;
  v_location_type text;
  v_sales_today numeric(12,2);
  v_transactions_today bigint;
  v_items_sold_today bigint;
BEGIN
  SELECT role, location_id
  INTO v_role, v_profile_location_id
  FROM public.get_current_user_profile()
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  IF v_role = 'store_associate' THEN
    v_effective_location_id := v_profile_location_id;
  ELSIF v_role IN ('owner', 'admin') THEN
    v_effective_location_id := COALESCE(p_location_id, v_profile_location_id);
  ELSE
    RETURN jsonb_build_object('error', 'role_not_allowed');
  END IF;

  IF v_effective_location_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_location');
  END IF;

  SELECT type INTO v_location_type
  FROM public.locations
  WHERE id = v_effective_location_id;

  IF v_location_type IS DISTINCT FROM 'store' THEN
    RETURN jsonb_build_object('error', 'invalid_location_type');
  END IF;

  SELECT COALESCE(SUM(st.total_amount), 0)::numeric(12,2),
         COUNT(*)::bigint,
         COALESCE(SUM(st.total_items), 0)::bigint
  INTO v_sales_today, v_transactions_today, v_items_sold_today
  FROM public.sales_transactions st
  WHERE st.location_id = v_effective_location_id
    AND st.business_date = current_date
    AND st.status = 'confirmed';

  RETURN jsonb_build_object(
    'location_id', v_effective_location_id,
    'business_date', current_date,
    'sales_today', COALESCE(v_sales_today, 0),
    'transactions_today', COALESCE(v_transactions_today, 0),
    'items_sold_today', COALESCE(v_items_sold_today, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.get_store_dashboard_sales_metrics_v1(uuid) IS
'Returns Sales Today V1 dashboard metrics from sales_transactions only.';

GRANT EXECUTE ON FUNCTION public.get_store_dashboard_sales_metrics_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_store_sales_today_v1(p_location_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_profile_location_id uuid;
  v_effective_location_id uuid;
  v_location_type text;
  v_summary jsonb;
  v_transactions jsonb;
BEGIN
  SELECT role, location_id
  INTO v_role, v_profile_location_id
  FROM public.get_current_user_profile()
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object(
      'summary', jsonb_build_object('error', 'not_authenticated'),
      'transactions', '[]'::jsonb
    );
  END IF;

  IF v_role = 'store_associate' THEN
    v_effective_location_id := v_profile_location_id;
  ELSIF v_role IN ('owner', 'admin') THEN
    v_effective_location_id := COALESCE(p_location_id, v_profile_location_id);
  ELSE
    RETURN jsonb_build_object(
      'summary', jsonb_build_object('error', 'role_not_allowed'),
      'transactions', '[]'::jsonb
    );
  END IF;

  IF v_effective_location_id IS NULL THEN
    RETURN jsonb_build_object(
      'summary', jsonb_build_object('error', 'no_location'),
      'transactions', '[]'::jsonb
    );
  END IF;

  SELECT type INTO v_location_type
  FROM public.locations
  WHERE id = v_effective_location_id;

  IF v_location_type IS DISTINCT FROM 'store' THEN
    RETURN jsonb_build_object(
      'summary', jsonb_build_object('error', 'invalid_location_type'),
      'transactions', '[]'::jsonb
    );
  END IF;

  SELECT jsonb_build_object(
    'location_id', v_effective_location_id,
    'business_date', current_date,
    'total_sales', COALESCE(SUM(st.total_amount), 0)::numeric(12,2),
    'transaction_count', COUNT(*)::bigint,
    'items_sold', COALESCE(SUM(st.total_items), 0)::bigint
  )
  INTO v_summary
  FROM public.sales_transactions st
  WHERE st.location_id = v_effective_location_id
    AND st.business_date = current_date
    AND st.status = 'confirmed';

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO v_transactions
  FROM (
    SELECT
      st.id,
      st.reference_no,
      st.location_id,
      st.business_date,
      st.total_items,
      st.total_amount,
      st.status,
      st.created_by,
      st.created_at,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', i.id,
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
      ), '[]'::jsonb) AS items
    FROM public.sales_transactions st
    WHERE st.location_id = v_effective_location_id
      AND st.business_date = current_date
      AND st.status = 'confirmed'
    ORDER BY st.created_at DESC, st.id DESC
    LIMIT 100
  ) AS t;

  RETURN jsonb_build_object(
    'summary', COALESCE(v_summary, jsonb_build_object()),
    'transactions', COALESCE(v_transactions, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_store_sales_today_v1(uuid) IS
'Returns Sales Today V1 summary + recent transactions from sales_transactions and sales_transaction_items.';

GRANT EXECUTE ON FUNCTION public.get_store_sales_today_v1(uuid) TO authenticated;
