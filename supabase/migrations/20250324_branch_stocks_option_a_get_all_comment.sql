-- Option A: get_all_branch_stocks() is read-only; allowed for owner, admin, store_associate.
-- No change to function body or GRANT (already GRANT EXECUTE TO authenticated).
-- Write/delete/update remain restricted via delete_inventory_row RPC and RLS.
COMMENT ON FUNCTION public.get_all_branch_stocks() IS
  'Read-only: returns all store branch inventory. Allowed for owner, admin, store_associate. Store associate can view all branches; actions (edit/delete) remain restricted to own location via frontend and delete_inventory_row RPC.';
