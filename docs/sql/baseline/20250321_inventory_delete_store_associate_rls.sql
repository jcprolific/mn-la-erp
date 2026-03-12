-- Ensure store_associate can DELETE inventory rows at their assigned branch only.
-- Works alongside inventory_delete_owner_admin (owner/admin can delete any branch).
-- RLS: DELETE allowed when role = store_associate AND profile.location_id = row.location_id.

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_delete_store_associate_own_location" ON public.inventory;
CREATE POLICY "inventory_delete_store_associate_own_location"
  ON public.inventory FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile() LIMIT 1) = 'store_associate'
    AND (SELECT location_id FROM public.get_current_user_profile() LIMIT 1) = location_id
  );

COMMENT ON POLICY "inventory_delete_store_associate_own_location" ON public.inventory IS
  'Store associates can delete inventory only at their assigned branch (profile.location_id).';
