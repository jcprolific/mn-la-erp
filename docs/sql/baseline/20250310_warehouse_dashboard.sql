-- =============================================================================
-- WAREHOUSE DASHBOARD — schema and RPCs
-- =============================================================================
-- Adds source_location to inventory_movements, warehouse RPCs, and metrics.
-- Warehouse location: first location with type = 'warehouse' (or profile.location_id for warehouse_staff).
-- =============================================================================

-- 1. Add source_location to inventory_movements (for transfer_out ledger)
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS source_location uuid REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_source_created
  ON public.inventory_movements(source_location, created_at DESC);

-- 2. Allow movement_type 'receive' and 'transfer_out' (receive may already exist)
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_type_check
  CHECK (movement_type IN (
    'adjust_in',
    'adjust_out',
    'receive',
    'sale',
    'transfer',
    'count_adjustment',
    'inventory_in',
    'transfer_out'
  ));

-- 3. Get default warehouse location (first location with type = 'warehouse')
CREATE OR REPLACE FUNCTION public.get_warehouse_location()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.locations WHERE type = 'warehouse' ORDER BY name LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_warehouse_location() IS
  'Returns the first warehouse location id (locations.type = warehouse). Used by warehouse dashboard.';

-- 4. Warehouse receive: add stock to warehouse, log movement (receive, destination = warehouse)
CREATE OR REPLACE FUNCTION public.warehouse_receive_inventory(
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
  v_warehouse_id uuid;
  v_user_id uuid;
  v_product_exists boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF (SELECT role FROM public.get_current_user_profile() LIMIT 1) NOT IN ('owner', 'admin', 'warehouse_staff', 'warehouse') THEN
    RAISE EXCEPTION 'Role not allowed to receive warehouse inventory' USING ERRCODE = 'P0001';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.products WHERE id = p_product_id) INTO v_product_exists;
  IF NOT v_product_exists THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  v_warehouse_id := public.get_warehouse_location();
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No warehouse location configured. Add a location with type = warehouse.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (p_product_id, v_warehouse_id, p_quantity)
  ON CONFLICT (product_id, location_id) DO UPDATE
  SET quantity = public.inventory.quantity + p_quantity;

  INSERT INTO public.inventory_movements (
    product_id, movement_type, quantity, destination_location, note, source, created_by
  )
  VALUES (
    p_product_id, 'receive', p_quantity, v_warehouse_id,
    COALESCE(p_notes, 'Warehouse receive'), 'warehouse_dashboard',
    v_user_id
  );

  RETURN jsonb_build_object('ok', true, 'warehouse_id', v_warehouse_id);
END;
$$;

COMMENT ON FUNCTION public.warehouse_receive_inventory(uuid, integer, text) IS
  'Warehouse Inventory In: adds quantity at warehouse location. Inserts movement_type receive, destination_location = warehouse.';

-- 5. Warehouse transfer out: subtract from warehouse, add to destination store, log movement
CREATE OR REPLACE FUNCTION public.warehouse_transfer_out(
  p_product_id uuid,
  p_destination_location_id uuid,
  p_quantity integer,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id uuid;
  v_user_id uuid;
  v_current_qty int;
  v_dest_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF (SELECT role FROM public.get_current_user_profile() LIMIT 1) NOT IN ('owner', 'admin', 'warehouse_staff', 'warehouse') THEN
    RAISE EXCEPTION 'Role not allowed to transfer out from warehouse' USING ERRCODE = 'P0001';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0' USING ERRCODE = 'P0002';
  END IF;

  v_warehouse_id := public.get_warehouse_location();
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No warehouse location configured.' USING ERRCODE = 'P0001';
  END IF;

  IF p_destination_location_id IS NULL OR p_destination_location_id = v_warehouse_id THEN
    RAISE EXCEPTION 'Invalid destination: must be a store, not warehouse.' USING ERRCODE = 'P0002';
  END IF;

  SELECT quantity INTO v_current_qty
  FROM public.inventory
  WHERE product_id = p_product_id AND location_id = v_warehouse_id;

  IF v_current_qty IS NULL OR v_current_qty < p_quantity THEN
    RAISE EXCEPTION 'Insufficient warehouse stock. Available: %', COALESCE(v_current_qty, 0) USING ERRCODE = 'P0002';
  END IF;

  -- Decrease warehouse
  UPDATE public.inventory
  SET quantity = quantity - p_quantity
  WHERE product_id = p_product_id AND location_id = v_warehouse_id;

  -- Increase destination
  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (p_product_id, p_destination_location_id, p_quantity)
  ON CONFLICT (product_id, location_id) DO UPDATE
  SET quantity = public.inventory.quantity + p_quantity;

  -- Log movement with source and destination
  INSERT INTO public.inventory_movements (
    product_id, movement_type, quantity, source_location, destination_location, note, source, created_by
  )
  VALUES (
    p_product_id, 'transfer_out', p_quantity, v_warehouse_id, p_destination_location_id,
    COALESCE(p_notes, 'Warehouse transfer out'), 'warehouse_dashboard',
    v_user_id
  );

  RETURN jsonb_build_object('ok', true, 'warehouse_id', v_warehouse_id, 'destination_id', p_destination_location_id);
END;
$$;

COMMENT ON FUNCTION public.warehouse_transfer_out(uuid, uuid, integer, text) IS
  'Warehouse Inventory Out: decreases warehouse stock, increases destination location, logs transfer_out with source_location and destination_location.';

-- 6. Warehouse dashboard metrics
CREATE OR REPLACE FUNCTION public.get_warehouse_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id uuid;
  v_total_units bigint;
  v_total_skus bigint;
  v_low_stock bigint;
  v_today_movements bigint;
  v_result jsonb;
BEGIN
  v_warehouse_id := public.get_warehouse_location();
  IF v_warehouse_id IS NULL THEN
    RETURN jsonb_build_object(
      'warehouse_id', null,
      'total_units', 0,
      'total_skus', 0,
      'low_stock_items', 0,
      'today_movements', 0
    );
  END IF;

  SELECT COALESCE(SUM(quantity), 0), COUNT(*)
  INTO v_total_units, v_total_skus
  FROM public.inventory
  WHERE location_id = v_warehouse_id;

  SELECT COUNT(*)
  INTO v_low_stock
  FROM public.inventory
  WHERE location_id = v_warehouse_id AND quantity > 0 AND quantity <= 5;

  SELECT COUNT(*)
  INTO v_today_movements
  FROM public.inventory_movements
  WHERE (source_location = v_warehouse_id OR destination_location = v_warehouse_id)
    AND created_at >= date_trunc('day', now());

  v_result := jsonb_build_object(
    'warehouse_id', v_warehouse_id,
    'total_units', v_total_units,
    'total_skus', v_total_skus,
    'low_stock_items', v_low_stock,
    'today_movements', v_today_movements
  );
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_warehouse_dashboard_metrics() IS
  'Returns warehouse dashboard metrics: total_units, total_skus, low_stock_items (qty between 1 and 5), today_movements.';
