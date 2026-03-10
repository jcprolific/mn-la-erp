# Inventory In: Warehouse vs Store Separation

## Rule

- **Warehouse Inventory In** and **Store Inventory In** are completely separate.
- They must not trigger each other or affect each other's data.
- Only **Transfer** may move stock between warehouse and store.

## Behavior

### 1. Warehouse Inventory In

- **RPC:** `warehouse_receive_inventory(p_product_id, p_quantity, p_notes)`
- **Updates:** Only `inventory` row where `location_id` = warehouse (from `locations.type = 'warehouse'`).
- **Movement:** Inserts `inventory_movements` with `source = 'warehouse_inventory_in'`.
- **Must not:** Create/update any store inventory row or insert `source = 'store_inventory_in'`.
- **Used by:** `warehouse-inventory-in.js`, warehouse dashboard receive in `warehouse.js`.

### 2. Store Inventory In

- **RPC:** `receive_stock(p_product_id, p_location_id, p_quantity, p_notes)`
- **Updates:** Only `inventory` row where `location_id` = passed store branch (`p_location_id`).
- **Movement:** When `p_notes = 'store_inventory_in'`, inserts with `source = 'store_inventory_in'`; otherwise `source = 'manual'`.
- **Must not:** Create/update warehouse inventory. Backend rejects if `p_location_id` is a warehouse location.
- **Used by:** `store-inventory-in.html` (with `p_notes: 'store_inventory_in'`).

### 3. Transfer

- Only explicit transfer logic should move stock between warehouse and store (warehouse decreases, store increases, transfer movement logged separately).

## Backend enforcement (migration `20250311_inventory_in_warehouse_store_separation.sql`)

- `receive_stock`:
  - Rejects when `p_location_id` is a warehouse (`locations.type = 'warehouse'`). Error: *Use Warehouse Inventory In for warehouse receives.*
  - Sets movement `source = 'store_inventory_in'` when `p_notes = 'store_inventory_in'`, else `'manual'`.
- `warehouse_receive_inventory`: Unchanged; already warehouse-only and uses `source = 'warehouse_inventory_in'`.

## Frontend

- **Warehouse Inventory In page:** Calls only `warehouse_receive_inventory`. No `receive_stock`, no direct `inventory`/`inventory_movements` writes for receive.
- **Store Inventory In page:** Calls only `receive_stock` with branch `p_location_id` and `p_notes: 'store_inventory_in'`. No `warehouse_receive_inventory`, no direct writes for receive.
- **Generic receive (e.g. inventory.js modal):** Uses `receive_stock`. If user selects a warehouse location, backend returns an error directing them to use Warehouse Inventory In.
