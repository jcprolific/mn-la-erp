-- =============================================================================
-- STORE INVENTORY IN: Clean placeholder data, needs_masterdata_review,
-- and RPC for manual product creation + receive
-- =============================================================================
-- Run this in Supabase SQL Editor after other store migrations.
-- Requires: public.products (id, name, sku, barcode, size, color at minimum),
--           public.inventory with UNIQUE(product_id, location_id),
--           public.inventory_movements, get_current_user_profile().
--
-- 1. Deletes placeholder/demo products and related inventory/movements
-- 2. Adds products.needs_masterdata_review (and category, cost_price, selling_price if missing)
-- 3. Adds store_create_product_and_receive RPC for "Add Product Manually"
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CLEAN PLACEHOLDER DATA (run first)
-- -----------------------------------------------------------------------------
-- Delete movements and inventory for placeholder products, then delete products.
-- Placeholder = sku contains TEST/DEMO/SAMPLE/TEMP/UNKNOWN, sku empty, barcode empty,
-- or name contains test/sample/demo (case-insensitive).

DELETE FROM public.inventory_movements
WHERE product_id IN (
  SELECT id FROM public.products
  WHERE (
    (sku IS NOT NULL AND (sku ILIKE '%TEST%' OR sku ILIKE '%DEMO%' OR sku ILIKE '%SAMPLE%' OR sku ILIKE '%TEMP%' OR sku ILIKE '%UNKNOWN%'))
    OR (sku IS NULL OR TRIM(COALESCE(sku, '')) = '')
    OR (barcode IS NULL OR TRIM(COALESCE(barcode, '')) = '')
    OR (name IS NOT NULL AND (name ILIKE '%test%' OR name ILIKE '%sample%' OR name ILIKE '%demo%'))
  )
);

DELETE FROM public.inventory
WHERE product_id IN (
  SELECT id FROM public.products
  WHERE (
    (sku IS NOT NULL AND (sku ILIKE '%TEST%' OR sku ILIKE '%DEMO%' OR sku ILIKE '%SAMPLE%' OR sku ILIKE '%TEMP%' OR sku ILIKE '%UNKNOWN%'))
    OR (sku IS NULL OR TRIM(COALESCE(sku, '')) = '')
    OR (barcode IS NULL OR TRIM(COALESCE(barcode, '')) = '')
    OR (name IS NOT NULL AND (name ILIKE '%test%' OR name ILIKE '%sample%' OR name ILIKE '%demo%'))
  )
);

DELETE FROM public.products
WHERE (
  (sku IS NOT NULL AND (sku ILIKE '%TEST%' OR sku ILIKE '%DEMO%' OR sku ILIKE '%SAMPLE%' OR sku ILIKE '%TEMP%' OR sku ILIKE '%UNKNOWN%'))
  OR (sku IS NULL OR TRIM(COALESCE(sku, '')) = '')
  OR (barcode IS NULL OR TRIM(COALESCE(barcode, '')) = '')
  OR (name IS NOT NULL AND (name ILIKE '%test%' OR name ILIKE '%sample%' OR name ILIKE '%demo%'))
);

-- -----------------------------------------------------------------------------
-- 2. ADD needs_masterdata_review AND OPTIONAL COLUMNS TO products (if not existing)
-- -----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS needs_masterdata_review boolean NOT NULL DEFAULT false;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS selling_price numeric;

COMMENT ON COLUMN public.products.needs_masterdata_review IS
  'Set to true when product was created manually from store Inventory In; owner/admin can review and correct master data.';

-- -----------------------------------------------------------------------------
-- 3. RPC: store_create_product_and_receive
-- -----------------------------------------------------------------------------
-- Creates a product (with needs_masterdata_review = true), upserts inventory
-- at the logged-in user's profile.location_id, and inserts inventory_movements.
-- Store associates can only receive into their assigned branch.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_create_product_and_receive(
  p_product_name text,
  p_sku text,
  p_barcode text,
  p_category text DEFAULT NULL,
  p_size text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_cost_price numeric DEFAULT NULL,
  p_selling_price numeric DEFAULT NULL,
  p_quantity_received integer DEFAULT 1,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_location_id uuid;
  v_product_id uuid;
  v_existing_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF TRIM(COALESCE(p_product_name, '')) = '' THEN
    RAISE EXCEPTION 'Product name is required' USING ERRCODE = 'P0002';
  END IF;
  IF TRIM(COALESCE(p_sku, '')) = '' THEN
    RAISE EXCEPTION 'SKU is required' USING ERRCODE = 'P0002';
  END IF;
  IF TRIM(COALESCE(p_barcode, '')) = '' THEN
    RAISE EXCEPTION 'Barcode is required' USING ERRCODE = 'P0002';
  END IF;

  IF p_quantity_received IS NULL OR p_quantity_received < 1 THEN
    RAISE EXCEPTION 'Quantity received must be at least 1' USING ERRCODE = 'P0002';
  END IF;

  -- Backend protection: location comes ONLY from profile; store_associate cannot override.
  SELECT role, location_id INTO v_role, v_location_id FROM public.get_current_user_profile();
  IF v_role = 'store_associate' AND (v_location_id IS NULL) THEN
    RAISE EXCEPTION 'Store associate has no assigned store location.' USING ERRCODE = 'P0001';
  END IF;
  IF v_role = 'store_associate' THEN
    -- Target location is always profile.location_id; no client-supplied location is used.
    NULL;
  END IF;
  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'No location in profile. Assign a store in Staff.' USING ERRCODE = 'P0001';
  END IF;

  -- Step 1: Use existing product if same SKU or barcode; otherwise insert new product
  SELECT id INTO v_existing_id FROM public.products
  WHERE TRIM(COALESCE(sku, '')) = TRIM(p_sku) OR TRIM(COALESCE(barcode, '')) = TRIM(p_barcode)
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    v_product_id := v_existing_id;
  ELSE
    INSERT INTO public.products (name, sku, barcode, size, color, needs_masterdata_review)
    VALUES (
      TRIM(p_product_name), TRIM(p_sku), TRIM(p_barcode),
      NULLIF(TRIM(COALESCE(p_size, '')), ''),
      NULLIF(TRIM(COALESCE(p_color, '')), ''),
      true
    )
    RETURNING id INTO v_product_id;
  END IF;

  -- Step 2 & 3: Upsert inventory at user's location, increase by quantity_received
  INSERT INTO public.inventory (product_id, location_id, quantity)
  VALUES (v_product_id, v_location_id, p_quantity_received)
  ON CONFLICT (product_id, location_id) DO UPDATE
  SET quantity = public.inventory.quantity + p_quantity_received;

  -- Step 4: Insert movement record
  INSERT INTO public.inventory_movements (
    product_id, movement_type, quantity, destination_location, note, source
  )
  VALUES (
    v_product_id, 'receive', p_quantity_received, v_location_id,
    COALESCE(NULLIF(TRIM(p_notes), ''), 'Manual product created from store inventory in'),
    'store_receive_manual'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'product_id', v_product_id,
    'location_id', v_location_id,
    'quantity_received', p_quantity_received
  );
END;
$$;

COMMENT ON FUNCTION public.store_create_product_and_receive(text, text, text, text, text, text, numeric, numeric, integer, text) IS
  'Store Inventory In: create product (needs_masterdata_review=true), add inventory at profile.location_id, log movement. Used when barcode not in master data.';
