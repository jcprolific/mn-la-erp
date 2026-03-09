# Manual Product Save — Debugging

When you click **Save & Receive** on Add Product Manually, the app now logs every step to the browser console. Use this to see exactly which part failed.

## Console logs (in order)

1. **manual save start** — payload, currentUser, location_id (validate `location_id` is not null).
2. **inserting product** — payload sent to `products` table.
3. **product insert result** — `(data, error)`. If `error` is set, **products insert failed** (often RLS or missing column).
4. **product saved** — the created product (with `id`).
5. **upserting inventory** — payload and quantity math.
6. **inventory upsert result** — `(data, error)`. If `error` is set, **inventory upsert failed** (often RLS or missing unique constraint).
7. **inventory updated** — result data.
8. **inserting movement** — payload for `inventory_movements`.
9. **movement insert result** — `(data, error)`. If `error` is set, **inventory_movements insert failed** (often RLS or wrong column name).
10. **movement recorded** — result data.

If you see **manual save failed** and an error object, the message and `error.code` / `error.details` tell you the cause.

## What each error usually means

| Log / error | Likely cause |
|-------------|--------------|
| **product insert error** with "permission denied" / "policy" / "row-level security" | RLS on `products` is blocking INSERT. Add a policy that allows authenticated users to INSERT, or use the RPC only. |
| **product insert error** with "column ... does not exist" | Schema mismatch: `products` table is missing a column (e.g. `selling_price`, `size`). Remove that field from the insert or add the column in Supabase. |
| **inventory upsert error** with "unique constraint" / "on conflict" | Table `inventory` does not have a UNIQUE constraint on `(product_id, location_id)`. Run the migration that adds `inventory_product_location_unique`. |
| **inventory upsert error** with "permission denied" / "policy" | RLS on `inventory` is blocking INSERT/UPDATE. Add a policy for authenticated users for their `location_id`, or use RPC. |
| **movement insert error** with "column ... does not exist" | Table `inventory_movements` uses different column names (e.g. `destination_location` vs `location_id`). The app uses `destination_location`; fix schema or code to match. |
| **movement insert error** with "permission denied" / "policy" | RLS on `inventory_movements` is blocking INSERT. Add a policy or use RPC. |
| **Save timed out (15s)** | One of the three calls is hanging (network or DB). Check which log is the **last one** before the timeout (e.g. if you see "inserting product" but never "product insert result", the products insert is hanging or very slow). |

## What to run in Supabase

1. **Unique constraint on inventory** (required for upsert):
   - Run: `supabase/migrations/20250310_inventory_unique_and_rls_manual_add.sql` (at least the `DO $$ ... END $$;` block that adds `inventory_product_location_unique`).

2. **If you prefer RPC only** (no direct table inserts):
   - Ensure `store_create_product_and_receive` exists and is correct (see `20250310_store_inventory_in_cleanup_and_manual_product.sql`).
   - The frontend can be switched to call only that RPC so all writes go through it (no RLS needed on products/inventory/movements for the client).

3. **If you want client-side save to work** and get RLS errors:
   - Uncomment and run the optional policy blocks in `20250310_inventory_unique_and_rls_manual_add.sql` for `products`, `inventory`, and `inventory_movements` as needed, after reviewing them for your security rules.

## Timeout

- Timeout is **15 seconds** (for debugging). After fixing the real error, you can lower it again.
- The timeout only fires if the save does not resolve or reject within 15s. Any real Supabase error (RLS, constraint, column) returns sooner and is shown in the UI and console instead of "timed out".
