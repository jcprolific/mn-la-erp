# Warehouse Dashboard — Deliverables Summary

## 1. Files changed / added

| File | Action |
|------|--------|
| `auth.js` | **Changed** — Added `warehouse` role to `ROLE_ROUTES` (→ `warehouse.html`) |
| `index.html` | **Changed** — Redirect `warehouse` role to warehouse dashboard in addition to `warehouse_staff` |
| `app.js` | **Changed** — Added Warehouse module card (owner/admin only), `updateWarehouseCardSummary()` for metrics on card |
| `warehouse.html` | **Replaced** — Full Warehouse Dashboard: metrics, action cards, Branch Stocks panel, Item Availability panel, Recent Ledger table, Inventory In/Out modals |
| `warehouse.js` | **Added** — All warehouse logic: auth, metrics, ledger, Inventory In/Out flows, Branch Stocks, Item Availability |
| `supabase/migrations/20250310_warehouse_dashboard.sql` | **Added** — Schema (source_location, movement_type), RPCs and metrics |

## 2. Routes / pages

| Route / page | Who can access | Purpose |
|--------------|----------------|---------|
| `warehouse.html` | `warehouse_staff`, `warehouse`, `owner`, `admin` | Warehouse Dashboard (metrics, actions, ledger, Branch Stocks, Item Availability) |
| `index.html` | `owner`, `admin` (warehouse card visible only to them) | Main Dashboard; Warehouse card opens `warehouse.html` and shows summary stats |

- **Store associates** do not see the Warehouse card and are redirected from `index` to `store.html`; they never see the warehouse dashboard.
- **Warehouse staff** (and role `warehouse`) are redirected from `index` to `warehouse.html` and only use the warehouse dashboard.

## 3. Database queries / RPCs

| Name | Type | Purpose |
|------|------|---------|
| `get_warehouse_location()` | RPC | Returns single warehouse location id (`locations.type = 'warehouse'`, first by name). |
| `get_warehouse_dashboard_metrics()` | RPC | Returns `{ warehouse_id, total_units, total_skus, low_stock_items, today_movements }` for the warehouse. |
| `warehouse_receive_inventory(p_product_id, p_quantity, p_notes)` | RPC | Inventory In: upsert `inventory` at warehouse, insert `inventory_movements` (movement_type `receive`, destination_location = warehouse, created_by = auth.uid()). Role check: owner, admin, warehouse_staff, warehouse. |
| `warehouse_transfer_out(p_product_id, p_destination_location_id, p_quantity, p_notes)` | RPC | Inventory Out: decrease warehouse `inventory`, increase destination `inventory`, insert `inventory_movements` (movement_type `transfer_out`, source_location = warehouse, destination_location = store, created_by = auth.uid()). Same role check. |
| `get_product_by_barcode(p_barcode)` | RPC (existing) | Barcode lookup for Inventory In/Out. |
| `inventory_movements` | Table select | Ledger: filter `source_location = warehouse_id OR destination_location = warehouse_id`, order by `created_at DESC`, limit 100. Products and locations (and profiles for Created By) loaded in a second step. |
| `inventory` | Table select | Branch Stocks: `location_id = warehouse_id`, `quantity > 0`; join products; last movement per product from `inventory_movements`. |
| `inventory` + `locations` | Table select | Item Availability: all inventory with `quantity > 0`, grouped by product; warehouse qty vs per-branch summary. |
| `locations` | Table select | Stores for Inventory Out destination dropdown: `type = 'store'`. |
| `profiles` | Table select | Ledger “Created By”: `id IN (created_by ids)` for `full_name`. |

## 4. Assumptions — warehouse location

- **Warehouse** is identified by **the first row in `locations` with `type = 'warehouse'`** (ordered by `name`).
- There is a single “logical” warehouse for the dashboard; multiple warehouse rows would still use the first one from `get_warehouse_location()`.
- **No** use of `profile.location_id` for warehouse staff to choose warehouse; all warehouse operations use this single warehouse id from `get_warehouse_location()`.
- **Prerequisite:** At least one location must have `type = 'warehouse'`. If none exists, `get_warehouse_location()` returns NULL and the dashboard shows “No warehouse location configured” and RPCs that need it will error accordingly.

## 5. Schema changes (migration)

- **`inventory_movements`**
  - New column: `source_location uuid REFERENCES locations(id)` (optional, for transfer-out and ledger).
  - New index: `idx_inventory_movements_source_created`.
  - `movement_type` check extended with: `inventory_in`, `transfer_out`.
- **New RPCs:** `get_warehouse_location`, `warehouse_receive_inventory`, `warehouse_transfer_out`, `get_warehouse_dashboard_metrics`.

## 6. Behavior summary

- **Warehouse stock** is changed only via movements: Inventory In (receive) and Inventory Out (transfer_out). No direct edit of warehouse inventory without a ledger record.
- **Ledger** shows only warehouse-related rows: `source_location = warehouse OR destination_location = warehouse`.
- **Role security:** Warehouse write RPCs allow only `owner`, `admin`, `warehouse_staff`, `warehouse`. Store associates cannot open the warehouse dashboard (redirect on index, no warehouse card).
