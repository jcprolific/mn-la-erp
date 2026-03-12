-- =============================================================================
-- Branch stocks read visibility: products + locations
-- =============================================================================
-- Goal: All authenticated users can SELECT from products and locations so that
--       Branch Stocks (and other pages) can show any store's stock regardless of
--       role. Does NOT change inventory RLS (see 20250315 for that).
--       Does NOT change any write logic, store_receive_inventory_v2, or
--       warehouse_receive_inventory.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. products: allow SELECT for all authenticated (read-only for this migration)
-- -----------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_authenticated" ON public.products;
CREATE POLICY "products_select_authenticated"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

-- Existing INSERT/UPDATE/DELETE policies (if any) are unchanged; we only add read.
-- If your app does client-side INSERT into products (e.g. manual product add), ensure
-- an INSERT policy exists for the appropriate role (e.g. products_insert_authenticated).

-- -----------------------------------------------------------------------------
-- 2. locations: allow SELECT for all authenticated
-- -----------------------------------------------------------------------------
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locations_select_authenticated" ON public.locations;
CREATE POLICY "locations_select_authenticated"
  ON public.locations FOR SELECT
  TO authenticated
  USING (true);

-- No write policies added; only read visibility.

COMMENT ON POLICY "products_select_authenticated" ON public.products IS
  'All authenticated users can read products (for branch stocks and catalog).';
COMMENT ON POLICY "locations_select_authenticated" ON public.locations IS
  'All authenticated users can read locations (for branch selector and store list).';
