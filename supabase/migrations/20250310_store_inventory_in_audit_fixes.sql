-- =============================================================================
-- STORE INVENTORY IN — Audit fixes (infrastructure audit implementation)
-- =============================================================================
-- Implements: inventory uniqueness, inventory_movements audit columns + index,
-- receive_stock with created_by and transaction, store_receive_inventory with created_by.
-- Run in Supabase SQL Editor after 20250309_store_associate_location_enforcement and
-- 20250310_store_inventory_in_lock (and 20250310_inventory_unique_and_rls_manual_add if used).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ensure inventory has unique (product_id, location_id)
-- -----------------------------------------------------------------------------
ALTER TABLE public.inventory
  DROP CONSTRAINT IF EXISTS inventory_product_location_unique;

ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_product_location_unique
  UNIQUE (product_id, location_id);

-- -----------------------------------------------------------------------------
-- 2. Ensure inventory_movements has created_at and created_by for audit
-- -----------------------------------------------------------------------------
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for audit queries by destination and time
CREATE INDEX IF NOT EXISTS idx_inventory_movements_dest_created
  ON public.inventory_movements(destination_location, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. receive_stock: add created_by, wrap in transaction
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_stock(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity integer,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_location_id uuid;
BEGIN
  -- Enforce: store_associate may only receive at their assigned location
  SELECT f.role, f.location_id INTO v_role, v_location_id FROM public.get_current_user_profile() f;
  IF v_role = 'store_associate' AND (v_location_id IS NULL OR p_location_id IS DISTINCT FROM v_location_id) THEN
    RAISE EXCEPTION 'store_associate can only receive stock at assigned branch'
      USING ERRCODE = 'P0001';
  END IF;

  -- Single transaction: inventory upsert + movement log (rollback both on failure)
  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (p_product_id, p_location_id, p_quantity)
  ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = public.inventory.quantity + p_quantity;

  INSERT INTO public.inventory_movements (
    product_id, movement_type, quantity, destination_location, note, source, created_by
  )
  VALUES (
    p_product_id, 'receive', p_quantity, p_location_id,
    COALESCE(p_notes, 'Receive stock'), 'manual',
    auth.uid()
  );
END;
$$;

COMMENT ON FUNCTION public.receive_stock(uuid, uuid, integer, text) IS
  'Inventory in: adds quantity at location. Rejects store_associate if p_location_id != profile.location_id. Writes created_by for audit.';

-- -----------------------------------------------------------------------------
-- 4. store_receive_inventory: add created_by to movement insert
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
  v_product_exists boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.products WHERE id = p_product_id) INTO v_product_exists;
  IF NOT v_product_exists THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT role, location_id INTO v_role, v_location_id FROM public.get_current_user_profile();

  IF v_role = 'store_associate' THEN
    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'No assigned branch. Contact admin to assign your store.' USING ERRCODE = 'P0001';
    END IF;
  ELSIF v_role IN ('owner', 'admin', 'warehouse_staff') THEN
    v_location_id := (SELECT location_id FROM public.get_current_user_profile());
    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'No location in profile for this user' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'Role not allowed to receive inventory' USING ERRCODE = 'P0001';
  END IF;

  -- Upsert inventory (transactional with movement insert below)
  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (p_product_id, v_location_id, p_quantity)
  ON CONFLICT (product_id, location_id) DO UPDATE
  SET quantity = public.inventory.quantity + p_quantity;

  -- Log movement with created_by for audit
  INSERT INTO public.inventory_movements (
    product_id, movement_type, quantity, destination_location, note, source, created_by
  )
  VALUES (
    p_product_id, 'inventory_in', p_quantity, v_location_id,
    COALESCE(p_notes, 'Store receive'), 'store_dashboard',
    auth.uid()
  );

  INSERT INTO public.activity_logs (user_id, location_id, action, module, reference_id, metadata)
  VALUES (v_user_id, v_location_id, 'inventory_in_confirmed', 'store_inventory_in', p_product_id,
    jsonb_build_object('quantity', p_quantity, 'notes', p_notes));

  RETURN jsonb_build_object('ok', true, 'location_id', v_location_id);
END;
$$;

COMMENT ON FUNCTION public.store_receive_inventory(uuid, integer, text) IS
  'Store Inventory In: adds stock only to the caller''s assigned branch (profiles.location_id). Accepts no location_id; rejects store_associate with no branch, quantity <= 0, or invalid product. Writes created_by on inventory_movements.';
