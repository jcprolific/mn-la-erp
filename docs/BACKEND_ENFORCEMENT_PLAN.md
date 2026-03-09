# Backend Enforcement Plan — Store Associate Location Restriction

## Confirmed current backend objects

*(Inferred from frontend only; no direct Supabase introspection available.)*

### Tables (from app code)

| Table | Referenced in | Purpose |
|-------|----------------|---------|
| `public.profiles` | auth.js, login.js, staff.js | id, role, full_name, location_id; FK to auth.users, optional FK to locations |
| `public.locations` | staff.js, inventory.js | id, name, type (e.g. warehouse, store) |
| `public.products` | inventory.js, stock-count.js | id, sku, name, size, color, barcode |
| `public.inventory` | inventory.js, app.js, stock-count.js | product_id, location_id, quantity; unique (product_id, location_id) |
| `public.inventory_movements` | inventory.js | product_id, movement_type, quantity, destination_location, note, source (and likely source_location) |
| `public.inventory_ledger` | supabase-client.js | Referenced in test fetch; exact columns unknown |

### RPCs (from app code)

| RPC | Call site | Parameters | Purpose |
|-----|-----------|------------|---------|
| `receive_stock` | inventory.js | p_product_id, p_location_id, p_quantity, p_notes | Inventory in (receive stock at a location) |
| `set_inventory_count` | stock-count.js | p_product_id, p_counted_quantity, p_reason | Stock count adjustment (no p_location_id sent; location implied by RLS/context) |
| `admin_get_staff` | staff.js | (none) | Staff list — **do not change** |
| `admin_create_staff` | staff.js | p_email, p_password, p_full_name, p_role, p_location_id | Create staff — **do not change** |
| `admin_update_staff` | staff.js | p_user_id, p_full_name, p_role, p_location_id | Update staff — **do not change** |
| `admin_toggle_staff_status` | staff.js | p_user_id, p_ban | Toggle staff status — **do not change** |

### Direct table writes (no RPC)

| Location | Operation | Table(s) | Purpose |
|----------|-----------|----------|---------|
| inventory.js (Add Product / barcode flow) | upsert | products | Upsert product by sku |
| inventory.js (same flow) | upsert | inventory | product_id, location_id, quantity (onConflict: product_id, location_id) |
| inventory.js (same flow) | insert | inventory_movements | movement_type 'receive', destination_location, etc. |

### Auth / profile in SQL

- **Assumed:** `auth.uid()` returns the current JWT user id (UUID).
- **Assumed:** Profile is in `public.profiles` with `id = auth.uid()`, columns `role`, `location_id`.
- **Unknown:** Whether any existing helper (e.g. `get_profile()`) is already used in RPCs or RLS.

---

## Affected write paths

| # | Path | Type | location_id source | Enforcement point |
|---|------|------|--------------------|-------------------|
| 1 | Inventory in (receive) | RPC `receive_stock` | p_location_id | RPC: reject if store_associate and p_location_id != profile.location_id |
| 2 | Stock count adjustment | RPC `set_inventory_count` | Implicit (RLS or internal) | RPC: ensure update only for profile.location_id when role = store_associate; reject if any other location |
| 3 | Add product + initial stock | Direct | Resolved from location name → locations.id | RLS on inventory + inventory_movements: allow insert/update only when location_id (or destination) = profile.location_id for store_associate |
| 4 | Exchange / inventory out / restock | Frontend only (store.js mock) | Not yet calling Supabase | When backend exists: same rule — reject if store_associate and request location != profile.location_id |

---

## Enforcement strategy

- **Visibility (read):** Store associate may **see** all locations (e.g. inventory across warehouse and branches). Use RLS that allows SELECT on `inventory` (and related tables) for all rows for authenticated users, or a dedicated read-only RPC/view that does not filter by location for store_associate.
- **Writes:** Enforce in **both**:
  1. **RPCs** — For every inventory write RPC, at the start: get current user profile (role, location_id). If role = `store_associate` and the request’s location (parameter or fixed context) is not equal to profile.location_id, raise an exception. Owner/admin: no location check. Warehouse_staff: leave current behavior (full write) as-is, documented for later tightening.
  2. **RLS** — On `inventory` and `inventory_movements`, ensure that for role = `store_associate`, INSERT/UPDATE/DELETE are allowed only when the row’s location (e.g. `location_id` or `destination_location`) equals the user’s `profile.location_id`. This protects direct client writes (e.g. inventory.js add-product flow) and any future code that writes without going through an RPC.

**Safest minimal-change approach:**

1. Add a single helper function `get_current_user_profile()` (or use existing if present) returning (role, location_id) from `public.profiles` for `auth.uid()`.
2. In `receive_stock`: at top, call helper; if role = `store_associate` and `p_location_id` is distinct from profile.location_id, raise.
3. In `set_inventory_count`: call helper; if role = `store_associate`, only perform update where `location_id = profile.location_id` (and ensure the RPC does not update by product_id alone for other locations). If the RPC currently has no location scope, add an explicit WHERE location_id = profile.location_id for store_associate.
4. Add or adjust RLS on `inventory`: SELECT allowed for authenticated users (all rows); INSERT/UPDATE/DELETE for store_associate only when `location_id = (SELECT location_id FROM public.profiles WHERE id = auth.uid())`.
5. Add or adjust RLS on `inventory_movements`: INSERT for store_associate only when `destination_location = (SELECT location_id FROM public.profiles WHERE id = auth.uid())` (and SELECT as needed for visibility).
6. Do **not** change staff RPCs or staff creation flow.

---

## Proposed SQL migration draft

See file: **`supabase/migrations/20250309_store_associate_location_enforcement.sql`**.

- **Apply only after review.** Do not apply automatically.
- The migration **replaces** `receive_stock` and `set_inventory_count` with full bodies. If your existing RPCs contain different logic (e.g. different upsert behavior, extra validations, or movement column names), merge the store_associate check into your existing functions instead of replacing them outright. Use the “STEP 2” and “STEP 3” comments in the migration as a snippet guide.
- If `inventory_movements` uses a different column than `destination_location` (e.g. `to_location_id`), adjust the RLS policy expressions accordingly.

---

## Rollback SQL

See section **Rollback SQL** in the same migration file (commented block at the end). Run that block to revert policies and function changes; no table or column drops.

---

## Test plan

| Scenario | Actor | Action | Expected |
|----------|--------|--------|----------|
| Store associate write own branch | store_associate (location_id = L1) | receive_stock(p_location_id := L1) or set_inventory_count for product at L1 | Success |
| Store associate write other branch | store_associate (location_id = L1) | receive_stock(p_location_id := L2), L2 ≠ L1 | Rejected (error or RLS denial) |
| Store associate direct insert inventory | store_associate | INSERT into inventory (product_id, location_id := L2, quantity) with L2 ≠ profile.location_id | Rejected by RLS |
| Owner/admin write any branch | owner or admin | receive_stock(p_location_id := any); direct insert/update inventory | Success |
| Warehouse staff | warehouse_staff | receive_stock; set_inventory_count; direct writes | Current behavior unchanged (full access); document for future tightening |

---

## Risks / assumptions / unknowns

- **Assumptions:** (1) `public.profiles` has `id` (uuid), `role` (text), `location_id` (uuid). (2) `receive_stock` and `set_inventory_count` exist and their signatures match the frontend. (3) `inventory` has columns product_id, location_id, quantity; unique on (product_id, location_id). (4) `inventory_movements` has at least product_id, destination_location (or equivalent). (5) No existing RLS on these tables contradicts the new rules (or existing RLS is documented and merged carefully).
- **Unknowns:** (1) Exact definitions of `receive_stock` and `set_inventory_count` (logic and WHERE clauses). (2) Whether `set_inventory_count` takes a location or infers it; if it infers, we must ensure it uses profile.location_id for store_associate. (3) Full column set of `inventory_movements` and whether there is a single “location” column or both source and destination. (4) Any triggers on inventory/inventory_movements that could bypass RLS (e.g. trigger running as definer). (5) Whether `inventory_ledger` is the source of truth and inventory is a view/cache — not modified in this plan.
- **Risks:** (1) If RPCs are missing or named differently, migration will fail at CREATE OR REPLACE. (2) If RLS is too strict for warehouse_staff, we may need role-specific conditions (e.g. allow warehouse_staff to write any location). (3) Changing RLS can break existing clients until they use the correct role/location; test in a non-production environment first.
