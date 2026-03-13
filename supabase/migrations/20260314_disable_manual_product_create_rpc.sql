-- =============================================================================
-- Disable manual product creation via Store Inventory In RPC.
-- Shopify catalog sync is now the only allowed product creation path.
-- =============================================================================

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
BEGIN
  RAISE EXCEPTION
    'Manual product creation is disabled. Create product variants in Shopify and run catalog sync.'
    USING ERRCODE = 'P0001';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.store_create_product_and_receive(
  text, text, text, text, text, text, numeric, numeric, integer, text
) FROM authenticated, anon;

COMMENT ON FUNCTION public.store_create_product_and_receive(
  text, text, text, text, text, text, numeric, numeric, integer, text
) IS 'Disabled by architecture cutover. Products must be created from Shopify catalog sync.';
