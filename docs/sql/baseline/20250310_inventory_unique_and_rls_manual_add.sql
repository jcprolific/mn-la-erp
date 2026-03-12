-- =============================================================================
-- INVENTORY UNIQUE CONSTRAINT + RLS FOR MANUAL PRODUCT ADD (STORE)
-- =============================================================================
-- Run in Supabase SQL Editor if manual save fails with conflict or RLS errors.
-- 1. Ensures inventory has unique (product_id, location_id) for upsert
-- 2. Optional: created_by on inventory_movements for audit (manual add by store associate)
-- 3. Optional: RLS policies so store users can insert products, upsert inventory,
--    insert inventory_movements (for their location only). If you prefer RPC-only,
--    skip the policy section and use store_create_product_and_receive RPC.
-- =============================================================================

-- Optional: allow inventory_movements to store created_by (for manual_inventory_in)
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Unique constraint required for .upsert(..., { onConflict: 'product_id,location_id' })
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.inventory'::regclass
      AND conname = 'inventory_product_location_unique'
  ) THEN
    ALTER TABLE public.inventory
    ADD CONSTRAINT inventory_product_location_unique
    UNIQUE (product_id, location_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'inventory_product_location_unique: %', SQLERRM;
END $$;

-- Optional: allow authenticated users to insert into products (for manual add)
-- Uncomment if client-side save fails with "permission denied" or "policy" on products:
/*
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_insert_authenticated" ON public.products;
CREATE POLICY "products_insert_authenticated"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (true);
*/

-- Optional: allow authenticated users to upsert inventory for their profile location
-- Uncomment if client-side save fails on inventory:
/*
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_upsert_own_location" ON public.inventory;
CREATE POLICY "inventory_upsert_own_location"
  ON public.inventory FOR ALL TO authenticated
  USING (location_id = (SELECT location_id FROM public.get_current_user_profile()))
  WITH CHECK (location_id = (SELECT location_id FROM public.get_current_user_profile()));
*/

-- Optional: allow insert into inventory_movements for own location
-- Uncomment if client-side save fails on inventory_movements:
/*
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_movements_insert_own_location" ON public.inventory_movements;
CREATE POLICY "inventory_movements_insert_own_location"
  ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (destination_location = (SELECT location_id FROM public.get_current_user_profile()));
*/
