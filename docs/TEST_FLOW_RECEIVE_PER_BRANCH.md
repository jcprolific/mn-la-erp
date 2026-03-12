# Test flow: Receive stock per branch (owner/admin)

## Verified behavior (no quantity logic changed)

1. **Store Inventory In** supports selecting a specific branch for owner/admin:
   - Owner/admin **always** see the **Store (owner/admin)** dropdown (no longer only when `profile.location_id` is null).
   - Dropdown is filled from `public.locations` (type = store) with UUIDs; label shows "Receiving into: **&lt;branch name&gt;**".

2. **Receive flow writes to the selected branch:**
   - On **Save & Receive**, the page uses `locId = assignedLocationId` (the dropdown value).
   - It calls `store_receive_inventory_v2({ p_product_id, p_store_location_id: locId, p_quantity, ... })`.
   - The RPC writes to `public.inventory` with `location_id = p_store_location_id`, so stock is recorded for the **selected** branch.

3. **UI fix applied:** Owner/admin branch selector is now shown whenever role is owner or admin (previously it only showed when `profile.location_id` was null), so the target branch can always be chosen.

---

## Short test flow: one product into BGC, Gateway, SM Megamall

Use a **single product** that exists in `public.products` (e.g. one you already have at ONE AYALA, or any product from your catalog). Same product can be received into multiple branches.

### Prerequisites

- Logged in as **owner** or **admin**.
- At least one product in `public.products` (e.g. with a known barcode or searchable name).

---

### 1. Receive into BGC

1. Open **Store Inventory In** (store-inventory-in.html).
2. Confirm the **Store (owner/admin)** dropdown is visible. Select **MN+LA™ BGC** (or your BGC location name).
3. Confirm the badge shows **Receiving into: MN+LA™ BGC** (or equivalent).
4. Add **one** product to the list (barcode scan or search), set qty to **1**.
5. Click **Save & Receive**.
6. Expect: “Stock received successfully.”

**Verify:**

- **Branch Stocks:** Open Branch Stocks, choose **BGC** in the Branch dropdown. The product should appear with quantity 1 (or incremented if row already existed).
- **Store Dashboard:** Open Store Dashboard, select **BGC** in the store selector. The product should appear in the grid and unit count should include it.

---

### 2. Receive into Gateway

1. Stay on **Store Inventory In**.
2. In **Store (owner/admin)** select **MN+LA™ ARTISAN CAFE GATEWAY II** (or your Gateway location name).
3. Badge should show **Receiving into: … Gateway …**.
4. Add the **same** product (or another), qty **1**. Click **Save & Receive**.

**Verify:**

- **Branch Stocks:** Select **Gateway** in the Branch dropdown. The product should appear for Gateway.
- **Store Dashboard:** Select **Gateway** in the store selector. The product should appear for Gateway.

---

### 3. Receive into SM Megamall

1. On **Store Inventory In**, select **MN+LA™ SM MEGAMALL** (or your SM Megamall location name) in the dropdown.
2. Badge shows **Receiving into: … SM MEGAMALL …**.
3. Add the same or another product, qty **1**. Click **Save & Receive**.

**Verify:**

- **Branch Stocks:** Select **SM Megamall**. The product should appear.
- **Store Dashboard:** Select **SM Megamall**. The product should appear.

---

## Checklist

| Step | Action | Expect |
|------|--------|--------|
| 1 | Store Inventory In → select BGC → add 1 product → Save & Receive | Success toast |
| 2 | Branch Stocks → select BGC | Product row(s) for BGC |
| 3 | Store Dashboard → select BGC | Product in grid, unit count includes it |
| 4 | Store Inventory In → select Gateway → add 1 product → Save & Receive | Success |
| 5 | Branch Stocks → select Gateway | Product row(s) for Gateway |
| 6 | Store Dashboard → select Gateway | Product in grid for Gateway |
| 7 | Store Inventory In → select SM Megamall → add 1 product → Save & Receive | Success |
| 8 | Branch Stocks → select SM Megamall | Product row(s) for SM Megamall |
| 9 | Store Dashboard → select SM Megamall | Product in grid for SM Megamall |

---

## If something fails

- **Dropdown not visible:** Ensure you are logged in as **owner** or **admin**. The fix makes the branch selector always visible for these roles.
- **Wrong branch after receive:** Before clicking Save & Receive, confirm the badge shows “Receiving into: **&lt;correct branch&gt;**”. If it’s wrong, change the dropdown and try again.
- **Product not in Branch Stocks / Store Dashboard:** Confirm the correct branch is selected in the Branch/Store dropdown on those pages. Both read from `public.inventory` filtered by `location_id`; receiving uses `p_store_location_id` for that branch.

No changes were made to `store_receive_inventory_v2` or to any quantity/receive logic; only the Store Inventory In UI was updated so owner/admin can always choose the target branch.
