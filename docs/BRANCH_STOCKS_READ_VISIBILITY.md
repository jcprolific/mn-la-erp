# Branch Stocks Read Visibility — Changes & Test Plan

---

## Greenhills fix: store-associate single source of truth (2025-03)

**Problem:** For a branch with 0 rows in `public.inventory` and 0 in `public.inventory_movements` (e.g. Greenhills), the store-associate Branch Stocks page could still show many rows.

**Root cause:** The page used a single path for all roles: call `get_all_branch_stocks()` (returns all branches’ inventory), then filter client-side by `filterByLocationId`. If the RPC failed (or was not deployed), the fallback was `.from('inventory').select(...).in('location_id', storeIds)`, which under RLS returns all branches’ rows. If for any reason `filterByLocationId` was not set for the store associate (e.g. profile timing or `location_id` not in `storeIds`), the UI showed **all branches’ rows** with no filter, so the associate saw “many rows” that were actually other branches’ data.

**Fix:** For **store_associate** only, the page now uses **only** `get_branch_stocks_by_location(p_location_id)` with the associate’s `profile.location_id`. No `get_all_branch_stocks`, no client-side fallback that loads all branches. Rows come solely from `public.inventory` for that one location. If that branch has 0 rows, the table shows empty.

**File/function:** `store-branch-stocks.html` → `loadStocks()`.

**Test (Greenhills empty until real inventory):**

1. Confirm in SQL: `public.inventory` and `public.inventory_movements` have 0 rows for Greenhills `location_id` (e.g. `131ea865-e547-401a-9534-5a911fe6ba0e`).
2. Log in as a Greenhills store associate. Open Branch Stocks.
3. **Expected:** Table shows “No products at this branch yet.” (no rows).
4. Receive stock for Greenhills via Store Inventory In (or warehouse receive to that store). Refresh Branch Stocks.
5. **Expected:** Rows appear only for Greenhills and match `public.inventory` for that `location_id`. Owner viewing Branch Stocks and selecting Greenhills sees the same rows.

---

## Debug: Branch Stocks empty for other stores

**Likely cause:** Inventory rows exist only for **one** branch’s `location_id`. The Branch dropdown and `get_branch_stocks_by_location` use the same `locations.id`; the RPC returns rows from `public.inventory` where `inv.location_id = p_location_id`. So if there are no rows for that `location_id`, the table correctly shows “No products in this branch yet.”

**What was verified:**

1. **Branch Stocks loading** (`store-branch-stocks.html`): `locationId` is taken from the Branch dropdown (`ownerSelect.value`) or, for store_associate without a selection, from `profile.location_id`. That value is passed to `get_branch_stocks_by_location` as `p_location_id`. No other `location_id` is used for the request.
2. **`get_branch_stocks_by_location`** (migration `20250314_get_branch_stocks_by_location.sql`): Reads from `public.inventory` joined with `public.products` on `inv.product_id = p.id`, with `WHERE inv.location_id = p_location_id`. It only returns data for store-type locations. Logic is correct.
3. **Inventory In** (`store_receive_inventory_v2`): Writes to `public.inventory` with `location_id = p_store_location_id`. Store Inventory In page uses `assignedLocationId` (profile’s branch or owner’s selected branch) as `p_store_location_id`. So the written `location_id` is correct for the branch the user chose when receiving.

**Conclusion:** If other branches (e.g. SM Megamall) show empty, it is because there are **no `inventory` rows** for that branch’s `location_id`. Stock was likely received only at one branch (e.g. the store associate’s branch or the branch selected on Inventory In).

**What was added for debugging:**

- **Console logging** in `store-branch-stocks.html`: On load and when changing branch, the console logs the selected `locationId`, its type, the RPC response (error, row count, first item), and the list of branch options when the dropdown is filled. Use DevTools → Console to confirm the value sent and the response.
- **SQL diagnostics** in `supabase/DEBUG_branch_stocks_empty_checks.sql`: Run in the Supabase SQL Editor to see:
  - All store branches and their IDs (same as the dropdown).
  - Inventory row count and total quantity per branch.
  - Recent inventory rows with branch name.
  - Recent inventory_movements to store locations.

**Minimal fix (if data is correct):** No code change to quantity or receive logic. Ensure Inventory In is done **per branch** (owner selects the target branch before receiving). If you expect data at SM Megamall, run Inventory In with “MN+LA™ SM MEGAMALL” selected (or run the diagnostic SQL to confirm which branches have rows).

---

## Summary

Store branch stocks are now **visible to all authenticated users** (owner, admin, warehouse, other stores, store associates). **Write access** (Inventory In, adjust, edit, delete) for **store** inventory remains restricted to the **store associate assigned to that branch** (`profile.location_id`). No inventory quantity logic, Inventory In behavior, `store_receive_inventory_v2`, or `warehouse_receive_inventory` was changed.

---

## Files and Policies Changed

### 1. New migration (SQL)

| File | What changed |
|------|----------------|
| `supabase/migrations/20250316_branch_stocks_read_visibility_products_locations.sql` | **New file.** Enables RLS on `public.products` and `public.locations`, adds SELECT-only policies for authenticated users. |

**Policies added:**

- **`public.products`**
  - `products_select_authenticated`: `FOR SELECT TO authenticated USING (true)`  
  - (No new INSERT/UPDATE/DELETE; existing policies unchanged.)

- **`public.locations`**
  - `locations_select_authenticated`: `FOR SELECT TO authenticated USING (true)`  
  - (No write policies added.)

**Not changed:**

- `public.inventory` — already has desired behavior from `20250315_inventory_public_read_store_associate_write_only.sql`:
  - SELECT: all authenticated (`inventory_select_public_read`).
  - INSERT/UPDATE/DELETE for **store** rows: only `store_associate` with `profile.location_id = location_id`.
  - Warehouse insert/update still via `inventory_warehouse_insert` / `inventory_warehouse_update`.

### 2. Store Branch Stocks page (HTML/JS)

| File | What changed |
|------|----------------|
| `store-branch-stocks.html` | Access, branch selector, data loading, and write actions. |

**Changes:**

- **Access:** Page now allows `warehouse_staff` and `warehouse` in addition to `store_associate`, `owner`, and `admin`.
- **Branch selector:** Shown for owner, admin, warehouse_staff, warehouse, **and** store_associate. Store associate’s default selection is their assigned branch; they can switch to other branches to **view only**.
- **Data loading:** **Store associate** uses only `get_branch_stocks_by_location(profile.location_id)` (single branch, single source of truth from `public.inventory`). **Owner/admin** use `get_all_branch_stocks()` then filter by selected branch; fallback to client `.from('inventory').in('location_id', storeIds)` only when RPC fails. Store associate never sees other branches’ data in the fetch.
- **Write actions (Adjust / Edit / Delete):** Shown only when `canWriteForCurrentBranch` is true, i.e. when the user is a **store_associate** and the selected branch is **their** `profile.location_id`. Owner, admin, warehouse, and store associates viewing another branch see no adjust/edit/delete (view only).
- **Subtitle:** Wrapper given `id="pageSubtitle"` for possible future “view only” messaging.
- **Label:** Branch dropdown label changed from “Store (owner/admin)” to “Branch”.

---

## Test Plan

### 1. Owner can view all stores

- Log in as **owner**.
- Open **Branch Stocks** (store-branch-stocks.html).
- Confirm the **Branch** dropdown lists all store locations.
- Select different branches and confirm stock rows load for each.
- Confirm **no** Adjust / Edit / Delete (owner is view-only for store inventory).

### 2. Warehouse can view all stores

- Log in as **warehouse_staff** or **warehouse**.
- Open **Branch Stocks**.
- Confirm Branch dropdown is visible and lists all stores.
- Select different branches and confirm stock data loads.
- Confirm no Adjust / Edit / Delete.

### 3. Other stores (store associate) can view all stores

- Log in as **store_associate** for **Branch A**.
- Open **Branch Stocks**.
- Confirm Branch dropdown is visible; default is Branch A.
- Switch dropdown to **Branch B** (or another branch).
- Confirm Branch B’s stock rows load.
- Confirm **no** Adjust / Edit / Delete when Branch B is selected (view only).
- Switch back to **Branch A**; confirm Adjust / Edit / Delete **are** visible and work.

### 4. Store associate can only write to own branch

- As **store_associate** for Branch A, select **Branch A** in the dropdown.
- Confirm Adjust and Delete are visible.
- Adjust quantity for a product; confirm it saves and list refreshes.
- Delete (remove) an item from branch stock; confirm it is removed.
- Switch to **Branch B**; confirm no Adjust/Delete buttons; confirm row click does not open adjust modal.
- (Optional) Try calling `set_inventory_count` or direct `inventory` UPDATE/DELETE for another branch via client; confirm RLS denies or RPC restricts so only own branch can be written.

### 5. Inventory In quantities unchanged

- Run existing **Store Inventory In** flow (e.g. `store_receive_inventory_v2` or your Inventory In UI) for a store associate at their assigned branch.
- Confirm received quantities match what you receive (no double increment, no wrong location).
- Confirm **warehouse** Inventory In and **warehouse_receive_inventory** behavior unchanged (no code changes were made to those flows).

---

## Rollback

- **Migration:** Drop the new policies and, if desired, disable RLS on `products` and `locations` (only if no other policies depend on it):

```sql
DROP POLICY IF EXISTS "products_select_authenticated" ON public.products;
DROP POLICY IF EXISTS "locations_select_authenticated" ON public.locations;
-- Optional: ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
-- Optional: ALTER TABLE public.locations DISABLE ROW LEVEL SECURITY;
```

- **UI:** Revert `store-branch-stocks.html` to restore previous access rules and branch selector behavior (owner/admin only) and store-associate-only loading path.
