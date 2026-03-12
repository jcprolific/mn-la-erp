-- =============================================================================
-- STORE INVENTORY IN — LOCK TO ASSIGNED BRANCH ONLY
-- =============================================================================
-- store_receive_inventory: no location_id parameter; location always from
-- profiles.location_id. Validates quantity > 0, product exists, role allowed.
-- Requires: public.inventory has UNIQUE(product_id, location_id) for ON CONFLICT.
-- Requires: get_current_user_profile() and tables inventory, inventory_movements,
-- activity_logs, products exist (run 20250310_physical_store_dashboard.sql first).
-- =============================================================================

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
  v_product_exists boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Quantity must be positive (prevent duplicate/broken writes)
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0' USING ERRCODE = 'P0002';
  END IF;

  -- Product must exist
  SELECT EXISTS(SELECT 1 FROM public.products WHERE id = p_product_id) INTO v_product_exists;
  IF NOT v_product_exists THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  -- Resolve role and location from profile only (no location_id parameter accepted)
  SELECT role, location_id INTO v_role, v_location_id FROM public.get_current_user_profile();

  IF v_role = 'store_associate' THEN
    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'No assigned branch. Contact admin to assign your store.' USING ERRCODE = 'P0001';
    END IF;
    -- store_associate: location is always profile.location_id; any frontend payload ignored
  ELSIF v_role IN ('owner', 'admin', 'warehouse_staff') THEN
    -- For store dashboard flow, owner/admin/warehouse also use profile location when using this RPC
    v_location_id := (SELECT location_id FROM public.get_current_user_profile());
    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'No location in profile for this user' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'Role not allowed to receive inventory' USING ERRCODE = 'P0001';
  END IF;

  -- Upsert inventory for this branch only (unique on product_id, location_id)
  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (p_product_id, v_location_id, p_quantity)
  ON CONFLICT (product_id, location_id) DO UPDATE
  SET quantity = public.inventory.quantity + p_quantity;

  -- Log movement
  INSERT INTO public.inventory_movements (product_id, movement_type, quantity, destination_location, note, source)
  VALUES (p_product_id, 'inventory_in', p_quantity, v_location_id, COALESCE(p_notes, 'Store receive'), 'store_dashboard');

  -- Activity log
  INSERT INTO public.activity_logs (user_id, location_id, action, module, reference_id, metadata)
  VALUES (v_user_id, v_location_id, 'inventory_in_confirmed', 'store_inventory_in', p_product_id,
    jsonb_build_object('quantity', p_quantity, 'notes', p_notes));

  RETURN jsonb_build_object('ok', true, 'location_id', v_location_id);
END;
$$;

COMMENT ON FUNCTION public.store_receive_inventory(uuid, integer, text) IS
  'Store Inventory In: adds stock only to the caller''s assigned branch (profiles.location_id). Accepts no location_id; rejects store_associate with no branch, quantity <= 0, or invalid product.';
