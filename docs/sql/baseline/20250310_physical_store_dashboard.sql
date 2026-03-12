-- =============================================================================
-- PHYSICAL STORE DASHBOARD — Phase 1
-- =============================================================================
-- activity_logs, inventory_out_requests, store_sales
-- RPCs: store_receive_inventory, store_request_inventory_out
-- Helpers: get_current_user_profile, get_user_location(), get_user_role()
-- Backend enforces location_id from profile only for store_associate.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. get_current_user_profile (required by RLS/RPCs below)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_user_profile()
RETURNS TABLE(role text, location_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role, p.location_id FROM public.profiles p WHERE p.id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- 1. Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_location()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT location_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- 2. activity_logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  action text NOT NULL,
  module text,
  reference_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_location_id ON public.activity_logs(location_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_select_own_location" ON public.activity_logs;
CREATE POLICY "activity_logs_select_own_location"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile()) IN ('owner', 'admin')
    OR location_id = (SELECT location_id FROM public.get_current_user_profile())
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "activity_logs_insert_authenticated" ON public.activity_logs;
CREATE POLICY "activity_logs_insert_authenticated"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. inventory_out_requests (pending out requests)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_out_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_out_requests_location_status ON public.inventory_out_requests(location_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_out_requests_created_at ON public.inventory_out_requests(created_at DESC);

ALTER TABLE public.inventory_out_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_out_requests_select_own_location" ON public.inventory_out_requests;
CREATE POLICY "inventory_out_requests_select_own_location"
  ON public.inventory_out_requests FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile()) IN ('owner', 'admin', 'warehouse_staff')
    OR location_id = (SELECT location_id FROM public.get_current_user_profile())
  );

DROP POLICY IF EXISTS "inventory_out_requests_insert_store_own" ON public.inventory_out_requests;
CREATE POLICY "inventory_out_requests_insert_store_own"
  ON public.inventory_out_requests FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (location_id = (SELECT location_id FROM public.get_current_user_profile()))
  );

-- -----------------------------------------------------------------------------
-- 4. store_sales (for Sales Today; one row per line item)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text,
  sold_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_store_sales_location_sold_at ON public.store_sales(location_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_sales_transaction_id ON public.store_sales(transaction_id);

ALTER TABLE public.store_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_sales_select_own_location" ON public.store_sales;
CREATE POLICY "store_sales_select_own_location"
  ON public.store_sales FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile()) IN ('owner', 'admin')
    OR location_id = (SELECT location_id FROM public.get_current_user_profile())
  );

DROP POLICY IF EXISTS "store_sales_insert_own_location" ON public.store_sales;
CREATE POLICY "store_sales_insert_own_location"
  ON public.store_sales FOR INSERT TO authenticated
  WITH CHECK (
    location_id = (SELECT location_id FROM public.get_current_user_profile())
    OR (SELECT role FROM public.get_current_user_profile()) IN ('owner', 'admin')
  );

-- -----------------------------------------------------------------------------
-- 5. store_receive_inventory — RPC: add stock to assigned branch only
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_receive_inventory(
  p_product_id uuid,
  p_quantity integer,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location_id uuid;
  v_role text;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT role, location_id INTO v_role, v_location_id FROM public.get_current_user_profile();

  IF v_role = 'store_associate' THEN
    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'store_associate has no assigned branch' USING ERRCODE = 'P0001';
    END IF;
    -- Use only profile location; ignore any frontend payload
  ELSIF v_role NOT IN ('owner', 'admin', 'warehouse_staff') THEN
    RAISE EXCEPTION 'Role not allowed to receive inventory' USING ERRCODE = 'P0001';
  ELSE
    -- owner/admin/warehouse: need location; for store dashboard we still require location from profile when coming from store UI
    v_location_id := (SELECT location_id FROM public.get_current_user_profile());
    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'No location in profile for this user' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (p_product_id, v_location_id, p_quantity)
  ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = public.inventory.quantity + p_quantity;

  INSERT INTO public.inventory_movements (product_id, movement_type, quantity, destination_location, note, source)
  VALUES (p_product_id, 'inventory_in', p_quantity, v_location_id, COALESCE(p_notes, 'Store receive'), 'store_dashboard');

  INSERT INTO public.activity_logs (user_id, location_id, action, module, reference_id, metadata)
  VALUES (v_user_id, v_location_id, 'inventory_in_confirmed', 'store_inventory_in', p_product_id, jsonb_build_object('quantity', p_quantity, 'notes', p_notes));

  RETURN jsonb_build_object('ok', true, 'location_id', v_location_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. store_request_inventory_out — RPC: create pending out request
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_request_inventory_out(
  p_product_id uuid,
  p_quantity integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location_id uuid;
  v_role text;
  v_user_id uuid;
  v_request_id uuid;
  v_current_qty int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT role, location_id INTO v_role, v_location_id FROM public.get_current_user_profile();

  IF v_role = 'store_associate' THEN
    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'store_associate has no assigned branch' USING ERRCODE = 'P0001';
    END IF;
  ELSIF v_role NOT IN ('owner', 'admin', 'warehouse_staff') THEN
    RAISE EXCEPTION 'Role not allowed to request inventory out' USING ERRCODE = 'P0001';
  ELSE
    v_location_id := (SELECT location_id FROM public.get_current_user_profile());
    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'No location in profile' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT quantity INTO v_current_qty FROM public.inventory WHERE product_id = p_product_id AND location_id = v_location_id;
  IF v_current_qty IS NULL OR v_current_qty < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock at branch' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.inventory_out_requests (product_id, location_id, quantity, reason, status, created_by)
  VALUES (p_product_id, v_location_id, p_quantity, p_reason, 'pending', v_user_id)
  RETURNING id INTO v_request_id;

  INSERT INTO public.activity_logs (user_id, location_id, action, module, reference_id, metadata)
  VALUES (v_user_id, v_location_id, 'inventory_out_requested', 'store_inventory_out', v_request_id, jsonb_build_object('product_id', p_product_id, 'quantity', p_quantity, 'reason', p_reason));

  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC: get_store_dashboard_metrics (location_id from profile)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_store_dashboard_metrics(p_location_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location_id uuid;
  v_role text;
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_sales_today numeric;
  v_txn_today bigint;
  v_items_today bigint;
  v_branch_units bigint;
  v_low_stock int;
  v_pending_out int;
BEGIN
  v_today_start := date_trunc('day', now() AT TIME ZONE 'UTC');
  v_today_end := v_today_start + interval '1 day';

  SELECT role, location_id INTO v_role, v_location_id FROM public.get_current_user_profile();

  IF p_location_id IS NOT NULL AND v_role IN ('owner', 'admin') THEN
    v_location_id := p_location_id;
  ELSIF v_location_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_location', 'metrics', null);
  END IF;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_sales_today
  FROM public.store_sales WHERE location_id = v_location_id AND sold_at >= v_today_start AND sold_at < v_today_end;

  SELECT COUNT(DISTINCT transaction_id) INTO v_txn_today
  FROM public.store_sales WHERE location_id = v_location_id AND sold_at >= v_today_start AND sold_at < v_today_end;

  SELECT COALESCE(SUM(quantity), 0) INTO v_items_today
  FROM public.store_sales WHERE location_id = v_location_id AND sold_at >= v_today_start AND sold_at < v_today_end;

  SELECT COALESCE(SUM(quantity), 0) INTO v_branch_units FROM public.inventory WHERE location_id = v_location_id;

  SELECT COUNT(*)::int INTO v_low_stock FROM public.inventory inv
  JOIN public.products p ON p.id = inv.product_id
  WHERE inv.location_id = v_location_id AND inv.quantity > 0 AND inv.quantity <= 5;

  SELECT COUNT(*)::int INTO v_pending_out FROM public.inventory_out_requests WHERE location_id = v_location_id AND status = 'pending';

  RETURN jsonb_build_object(
    'sales_today', v_sales_today,
    'transactions_today', v_txn_today,
    'items_sold_today', v_items_today,
    'branch_stock_count', v_branch_units,
    'low_stock_items', v_low_stock,
    'pending_inventory_out', v_pending_out
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC: get_store_branch_stocks (products + inventory for location only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_store_branch_stocks(p_location_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location_id uuid;
  v_role text;
  v_rows jsonb;
BEGIN
  SELECT role, location_id INTO v_role, v_location_id FROM public.get_current_user_profile();
  IF p_location_id IS NOT NULL AND v_role IN ('owner', 'admin') THEN
    v_location_id := p_location_id;
  ELSIF p_location_id IS NOT NULL AND v_role = 'store_associate' AND p_location_id = v_location_id THEN
    v_location_id := p_location_id;
  ELSIF v_location_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT p.id, p.sku, p.name, p.size, p.color, p.barcode, inv.quantity
    FROM public.inventory inv
    INNER JOIN public.products p ON p.id = inv.product_id
    WHERE inv.location_id = v_location_id
    ORDER BY p.name, p.sku
  ) t;
  RETURN v_rows;
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. RPC: get_store_sales_today (sales for location, today only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_store_sales_today(p_location_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_location_id uuid;
  v_role text;
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_rows jsonb;
  v_summary jsonb;
BEGIN
  v_today_start := date_trunc('day', now() AT TIME ZONE 'UTC');
  v_today_end := v_today_start + interval '1 day';

  SELECT role, location_id INTO v_role, v_location_id FROM public.get_current_user_profile();
  IF p_location_id IS NOT NULL AND v_role IN ('owner', 'admin') THEN
    v_location_id := p_location_id;
  ELSIF v_location_id IS NULL THEN
    RETURN jsonb_build_object('summary', jsonb_build_object(), 'transactions', '[]'::jsonb);
  END IF;

  SELECT jsonb_agg(row_to_json(t)::jsonb) INTO v_rows
  FROM (
    SELECT s.id, s.transaction_id, s.product_id, p.name AS product_name, p.sku, s.quantity, s.unit_price, s.total_amount, s.payment_method, s.sold_at
    FROM public.store_sales s
    LEFT JOIN public.products p ON p.id = s.product_id
    WHERE s.location_id = v_location_id AND s.sold_at >= v_today_start AND s.sold_at < v_today_end
    ORDER BY s.sold_at DESC
    LIMIT 100
  ) t;

  SELECT jsonb_build_object(
    'total_sales', (SELECT COALESCE(SUM(total_amount), 0) FROM public.store_sales WHERE location_id = v_location_id AND sold_at >= v_today_start AND sold_at < v_today_end),
    'transaction_count', (SELECT COUNT(DISTINCT transaction_id) FROM public.store_sales WHERE location_id = v_location_id AND sold_at >= v_today_start AND sold_at < v_today_end),
    'items_sold', (SELECT COALESCE(SUM(quantity), 0) FROM public.store_sales WHERE location_id = v_location_id AND sold_at >= v_today_start AND sold_at < v_today_end)
  ) INTO v_summary;

  RETURN jsonb_build_object('summary', v_summary, 'transactions', COALESCE(v_rows, '[]'::jsonb));
END;
$$;
