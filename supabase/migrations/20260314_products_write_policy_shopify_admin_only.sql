-- =============================================================================
-- Product catalog write guardrails
-- - Remove broad authenticated insert policy
-- - Allow catalog writes only for owner/admin in app (service role remains for sync scripts)
-- =============================================================================

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_insert_authenticated" ON public.products;
DROP POLICY IF EXISTS "products_insert_owner_admin" ON public.products;
DROP POLICY IF EXISTS "products_update_owner_admin" ON public.products;
DROP POLICY IF EXISTS "products_delete_owner_admin" ON public.products;

CREATE POLICY "products_insert_owner_admin"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM public.get_current_user_profile()) IN ('owner', 'admin')
  );

CREATE POLICY "products_update_owner_admin"
  ON public.products FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile()) IN ('owner', 'admin')
  )
  WITH CHECK (
    (SELECT role FROM public.get_current_user_profile()) IN ('owner', 'admin')
  );

CREATE POLICY "products_delete_owner_admin"
  ON public.products FOR DELETE TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile()) IN ('owner', 'admin')
  );

COMMENT ON POLICY "products_insert_owner_admin" ON public.products IS
'Only owner/admin may insert products from app clients. Shopify sync uses service_role key.';

COMMENT ON POLICY "products_update_owner_admin" ON public.products IS
'Only owner/admin may update products from app clients. Shopify sync uses service_role key.';

COMMENT ON POLICY "products_delete_owner_admin" ON public.products IS
'Only owner/admin may delete products from app clients.';
