-- =============================================================================
-- Store Inventory Out - Immediate Deduction
-- Replaces request-only flow with immediate stock decrement for store users.
-- =============================================================================

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
  v_current_qty integer;
  v_remaining_qty integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero' USING ERRCODE = 'P0002';
  END IF;

  IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Reason is required' USING ERRCODE = 'P0002';
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

  SELECT quantity
  INTO v_current_qty
  FROM public.inventory
  WHERE product_id = p_product_id
    AND location_id = v_location_id
  FOR UPDATE;

  IF v_current_qty IS NULL OR v_current_qty < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock at branch' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.inventory
  SET quantity = quantity - p_quantity
  WHERE product_id = p_product_id
    AND location_id = v_location_id
  RETURNING quantity INTO v_remaining_qty;

  INSERT INTO public.inventory_out_requests (
    product_id,
    location_id,
    quantity,
    reason,
    status,
    created_by,
    resolved_at,
    resolved_by
  )
  VALUES (
    p_product_id,
    v_location_id,
    p_quantity,
    p_reason,
    'approved',
    v_user_id,
    now(),
    v_user_id
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.inventory_movements (
    product_id,
    movement_type,
    quantity,
    destination_location,
    note,
    source,
    created_by
  )
  VALUES (
    p_product_id,
    'adjust_out',
    p_quantity,
    v_location_id,
    'Store inventory out: ' || p_reason,
    'store_inventory_out',
    v_user_id
  );

  INSERT INTO public.activity_logs (user_id, location_id, action, module, reference_id, metadata)
  VALUES (
    v_user_id,
    v_location_id,
    'inventory_out_processed',
    'store_inventory_out',
    v_request_id,
    jsonb_build_object(
      'product_id', p_product_id,
      'quantity', p_quantity,
      'reason', p_reason,
      'status', 'approved',
      'inventory_after', v_remaining_qty
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'status', 'approved',
    'processed', true,
    'inventory_after', v_remaining_qty
  );
END;
$$;
