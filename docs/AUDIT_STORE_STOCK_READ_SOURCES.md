# Audit: Store stock read sources and data mismatch

## Summary

**Root cause of “other stores appear to have products”:** The **Store Dashboard** (`store.html` + `store.js`) uses **mock inventory** from `buildStoreInventory(storeId)` (slug-based) for **owner/admin** and can briefly use it for **store associate** before profile is ready. Only **ONE AYALA** has rows in `public.inventory`; all other branches have 0 rows. Any screen that reads from `public.inventory` (or RPCs that read it) will show 0 for non-Ayala. The mismatch is that the Store Dashboard was showing **fake data** for those branches instead of `public.inventory`.

---

## 1. Store Dashboard (`store.html` + `store.js`)

| Who            | What runs | Data source | Table/RPC |
|----------------|-----------|-------------|-----------|
| **Owner/Admin**| `init()` → `switchStore(currentStoreId)` | **MOCK** | `buildStoreInventory(storeId)` — in-memory catalogue + `seedQty(sku, storeId, size)`. **Not** `public.inventory`. |
| **Store associate** | `init()` then (after guard) `setStoreFromSession()` → `loadDashboardMetrics()` | **Real** | `loadBranchInventory(locationId)` → `from('inventory').select(...).eq('location_id', locationId)` = **public.inventory**. |

- **Store selector (owner/admin):** `<select id="storeSelect">` options are **hardcoded slugs**: `one-ayala`, `bgc`, `sm-mega`, `gateway`, etc. (see `store.html` ~1200–1207). When the user changes store, `switchStore(storeId)` runs with that slug and sets `storeInventory = buildStoreInventory(storeId)` → **mock data**.
- **Store selector (store associate):** Replaced in `store.html` guard with a single option `value="<profile.location_id UUID>"`. So associate uses UUID; `loadBranchInventory(uuid)` reads **public.inventory** (real, and 0 for non-Ayala).
- **Race:** If `store.js` `init()` runs before `Auth.guard()` has set profile, `Session.locationId()` can be null; then `init()` takes the `else` branch and calls `switchStore(storeSel.value)` with the first option value `'one-ayala'` → **mock data** until `setStoreFromSession()` runs after guard.

**Conclusion:** Owner/admin **always** see mock inventory on the Store Dashboard. Store associate can see real data after guard, but may briefly see mock if init runs before profile. **No** store dashboard path should use mock; all should use **public.inventory** (or equivalent RPC).

---

## 2. Branch Stocks (`store-branch-stocks.html`)

| Who            | Data source | Table/RPC |
|----------------|-------------|-----------|
| **All roles**  | `get_branch_stocks_by_location(p_location_id)` | RPC reads **public.inventory** JOIN **public.products** WHERE `inv.location_id = p_location_id`. |

- Single code path: everyone uses the Branch dropdown (or profile default) and the same RPC. No mock. Other branches correctly show 0 when they have no rows in `public.inventory`.

---

## 3. Store Inventory In (`store-inventory-in.html`)

| Purpose | Data source | Table/RPC |
|---------|-------------|-----------|
| Current branch stock for a product | `from('inventory').select('quantity').eq('product_id', ...).eq('location_id', assignedLocationId)` | **public.inventory** |
| Check product at branch | `from('inventory').select('product_id').eq('location_id', locId).eq('product_id', productId)` | **public.inventory** |
| Write (receive) | `store_receive_inventory_v2(..., p_store_location_id: locId)` | Writes to **public.inventory** (and movements). |

All reads/writes use **public.inventory** and correct `location_id`. No mock.

---

## 4. Store Inventory Out (`store-inventory-out.html`)

| Purpose | Data source | Table/RPC |
|---------|-------------|-----------|
| Branch stock for selected product | `from('inventory').select('quantity').eq('product_id', product.id).eq('location_id', locId)` | **public.inventory** |

Real data only.

---

## 5. Store Sales Today (`store-sales-today.html`)

| Purpose | Data source | Table/RPC |
|---------|-------------|-----------|
| Sales | `get_store_sales_today` (RPC) | **public.store_sales** (no inventory stock display). |

---

## 6. Stores dashboard / multi-store view (`stores-dashboard.html`)

| Purpose | Data source | Table/RPC |
|---------|-------------|-----------|
| Inventory per store | `loadInventoryForStore(locationId)` → `from('inventory').select(...).eq('location_id', locationId)` | **public.inventory** |

Real data only. Shows 0 for branches with no rows.

---

## 7. RPCs that read inventory

| RPC | Reads from | Notes |
|-----|------------|-------|
| `get_branch_stocks_by_location(p_location_id)` | **public.inventory** + **public.products** | Used by Branch Stocks; single source of truth per location. |
| `get_store_branch_stocks(p_location_id)` | **public.inventory** + **public.products** | Same logic; uses profile when p_location_id is null. Not used by Branch Stocks after unification. |
| `get_store_dashboard_metrics(p_location_id)` | **public.inventory** (branch_stock_count, low_stock_items), store_sales, inventory_out_requests | All real. |

---

## 8. Exact cause of mismatch

1. **Store Dashboard (store.js)** uses **mock** data for owner/admin via `buildStoreInventory(storeId)` with slugs (`one-ayala`, `bgc`, etc.). So BGC, Gateway, Greenhills, etc. **appear** to have stock on the dashboard even though **public.inventory** has 0 rows for those locations.
2. **Store associate** can see mock data briefly if `init()` runs before profile is ready (`Session.locationId()` null) and then `switchStore('one-ayala')` runs; after guard, `setStoreFromSession()` loads real data.
3. **Inventory In** writes to **public.inventory** with correct `p_store_location_id`; only ONE AYALA has received stock in DB, so only Ayala has rows. No bug there.

---

## 9. Fix (minimal, no change to quantity or receive logic)

- **Store Dashboard:** Stop using mock inventory. For **owner/admin**, populate the store selector from **public.locations** (UUIDs) and use **loadBranchInventory(locationId)** (or the same RPC as Branch Stocks) so the dashboard always shows **public.inventory**. Remove or bypass `buildStoreInventory` for the main dashboard flow.
- **Store associate:** Keep using `loadDashboardMetrics()` / `loadBranchInventory(Session.locationId())`; ensure `setStoreFromSession()` runs after guard so we never leave mock data on screen.

### Fix applied

- **store.js**
  - **Owner/Admin:** `init()` now calls `loadStoresAndSelectBranch()` instead of `switchStore(currentStoreId)`. That function fetches `locations` (type = store) from the API, replaces `#storeSelect` options with `value = location.id` (UUID), then calls `loadDashboardMetrics()` so inventory and metrics come from **public.inventory** and `get_store_dashboard_metrics(p_location_id)`.
  - **Store selector change:** When the dropdown value is a UUID (length ≥ 36), the handler calls `applyStoreSelection()` → `loadDashboardMetrics()` (real data). Only when the value is a slug (legacy) does it fall back to `switchStore()` (mock).
  - **Metrics RPC:** `loadDashboardMetrics()` now passes `p_location_id: effectiveLocationId` to `get_store_dashboard_metrics` so owner/admin see metrics for the selected branch.
- **store.html:** No change. The initial hardcoded slug options are replaced by `loadStoresAndSelectBranch()` when store.js runs for owner/admin. Store associate still gets a single option (UUID) from the existing guard().
