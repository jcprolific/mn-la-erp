# Inventory system baseline — rules and restore guide

This folder is the **known working baseline** for the inventory database logic. If the system breaks again (e.g. double inventory, wrong totals), restore the SQL from here and follow the rules below.

---

## How inventory in works

1. **Warehouse Inventory In**
   - **RPC (batch UI):** `warehouse_receive_inventory_v2(p_product_id, p_quantity, p_notes, p_request_id)` — idempotent by `request_id`; used by warehouse-inventory-in page. **Client must send a unique `request_id` per line** (e.g. `batchId + '-' + index`) so every item in a batch is applied; same rule as Store Inventory In.
   - **RPC (legacy):** `warehouse_receive_inventory(p_product_id, p_quantity, p_notes)` — no request_id; single write only.
   - Resolves the single warehouse location from `locations` where `type = 'warehouse'`.
   - **Single write to `inventory`:** either `UPDATE inventory SET quantity = quantity + p_quantity` for the existing row, or `INSERT` one row if none exists. Then **one** `INSERT` into `inventory_movements` with `source = 'warehouse_inventory_in'`, and `request_id` when using v2.
   - Used by warehouse dashboard / warehouse-inventory-in flows only. Never touches store rows.

2. **Store Inventory In**
   - **RPC:** `store_receive_inventory_v2(p_product_id, p_store_location_id, p_quantity, p_notes, p_request_id, p_batch_id)`
   - Validates that `p_store_location_id` is **not** a warehouse (rejects with error if it is).
   - **Idempotency:** if `p_request_id` is provided and a movement already exists for that `request_id` + destination + product + `receive`, the function returns without changing anything.
   - **Single write to `inventory`:** same pattern as warehouse: `UPDATE` existing row (increment by `p_quantity`) or `INSERT` one row; then **one** `INSERT` into `inventory_movements` with `source = 'store_inventory_in'`, plus `request_id` and `batch_id` when provided.
   - Used by Store Inventory In page only. Never touches warehouse.

3. **Other flows**
   - **receive_stock:** store/branch only; rejects warehouse. Uses `INSERT ... ON CONFLICT DO UPDATE` (legacy; Store Inventory In page uses `store_receive_inventory_v2`).
   - **set_inventory_count:** sets quantity to a final total (overwrite), used for stock count / adjust; inserts `count_adjustment` movement.

---

## Why quantity should only be written once

- Each “receive” action (one user click, one RPC call) must change `inventory` **exactly once** and insert **exactly one** `inventory_movements` row for that receive.
- If quantity is applied twice (e.g. by a trigger plus the RPC, or by two code paths), stock will double.
- The design is: **no triggers** on `inventory` or `inventory_movements` that update quantity or insert movements. All receive logic lives inside the RPCs, and each RPC does one `UPDATE` or one `INSERT` on `inventory`, then one `INSERT` into `inventory_movements`.

---

## What caused the previous double inventory bug

- **Cause:** Using `INSERT INTO inventory ... ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = inventory.quantity + excluded.quantity` (or similar) in combination with other logic (e.g. triggers, or a second code path) that also updated `inventory` or inserted into `inventory_movements` for the same receive.
- In some cases the conflict path or trigger could run in a way that effectively applied the same quantity twice, or the same receive was processed twice without idempotency.
- **Fix (current baseline):**
  - **Single-write pattern:** do **not** use `INSERT ... ON CONFLICT DO UPDATE` for receive. Use explicit:
    - `UPDATE inventory SET quantity = quantity + p_quantity WHERE ... ; GET DIAGNOSTICS v_updated = row_count;`
    - `IF v_updated = 0 THEN INSERT INTO inventory (...) VALUES (...); END IF;`
    - then a single `INSERT` into `inventory_movements`.
  - **Store:** idempotency by `request_id`: if a movement for that `request_id` (and same product/destination/type) already exists, return without writing.
  - **No triggers** on `inventory` / `inventory_movements` that perform receive-style updates or movement inserts.

---

## What should NEVER be changed

1. **Single write per receive**
   - Do **not** reintroduce `INSERT ... ON CONFLICT DO UPDATE` for receive flows. Keep the explicit `UPDATE`-then-`INSERT` pattern in `warehouse_receive_inventory` and `store_receive_inventory_v2`.

2. **No triggers that write inventory or movements**
   - Do **not** add triggers on `inventory` or `inventory_movements` that:
     - update `inventory.quantity`, or
     - insert into `inventory_movements`
   for receive or count-adjust flows. All such logic must stay in the RPCs.

3. **Warehouse vs store separation**
   - `warehouse_receive_inventory` must only touch the warehouse location and must only insert movements with `source = 'warehouse_inventory_in'`.
   - `store_receive_inventory_v2` must reject warehouse locations and must only write store branch rows and movements with `source = 'store_inventory_in'`. Do not allow one RPC to do both warehouse and store in one call.

4. **Idempotency and per-line request_id (store and warehouse)**
   - Do not remove the `request_id` check in `store_receive_inventory_v2` or `warehouse_receive_inventory_v2`. Do not drop the unique index on `(request_id, product_id, destination_location)` on `inventory_movements`. Retries with the same `request_id` must not create duplicate movements or duplicate quantity.
   - **Client rule (do not change):** Store and Warehouse Inventory In pages must send a **unique `request_id` per line** in a batch (e.g. `requestId + '-' + index`). Using one request_id for the whole batch causes the 2nd+ line with the same product to be skipped by idempotency and totals will not match.

5. **Unique (product_id, location_id) on inventory**
   - The unique constraint on `inventory(product_id, location_id)` is required for the single-write pattern (one row per product per location). Do not drop it.

6. **Movement type constraint**
   - Keep `inventory_movements_type_check` including `'receive'` and `'count_adjustment'` so that receive and count-adjust RPCs can insert the correct movement types.

---

## Restore procedure

1. Re-apply (in order):
   - `inventory_triggers.sql` (supporting schema: request_id, batch_id, unique index on request_id+product_id+destination_location, movement_type check).
   - `warehouse_receive_inventory.sql` (legacy 3-param).
   - `warehouse_receive_inventory_v2.sql` (batch UI; idempotent by request_id).
   - `store_receive_inventory_v2.sql`.
2. Ensure no triggers exist on `inventory` or `inventory_movements` that update quantity or insert movements (see `inventory_triggers.sql`).
3. If you have other RPCs (e.g. `receive_stock`, `set_inventory_count`), ensure they do not double-apply quantity and do not conflict with these rules; see project migrations for their definitions.
