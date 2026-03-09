# Store Dashboard & Role-Based Access

## Summary

- **Store Dashboard** (`store.html`) is the dedicated landing page for `store_associate`.
- **Visibility**: Store associates can view inventory/data for all locations (read-only for non-assigned).
- **Write**: Store associates can perform inventory actions only for their **assigned** `location_id`.
- **Navigation**: Login and index redirect by role; store dashboard is locked to assigned branch in the UI.

---

## 1. Files Created or Updated

### Created

| File | Purpose |
|------|--------|
| `session.js` | Session helper (`Session.userId()`, `role()`, `locationId()`, `fullName()`, `locationName()`, `profile()`) and permission helpers (`Permissions.canViewAllLocations()`, `Permissions.canWriteLocation(locationId)`, `isStoreAssociate()`, `isWarehouseStaff()`, `isOwnerOrAdmin()`). |
| `docs/STORE_DASHBOARD_AND_ACCESS.md` | This document: behavior, enforcement, backend notes, test plan. |

### Updated

| File | Changes |
|------|--------|
| `store.html` | Loads `auth.js` and `session.js`; runs `Auth.guard()`; allows only `store_associate` (others redirected to `index.html`); fills profile dropdown and logout; locks store selector to assigned branch (single option, disabled); hides “Back to Master Dashboard” for store associate. |
| `store.js` | Uses `Session` and `Permissions`; for `store_associate`, sets `currentStoreId` from `Session.locationId()` and does not allow changing store; `buildStoreInventory` supports UUID `storeId` for mock; `switchStore` shows `Session.locationName()` when `storeId` is not in `STORES`. |
| `index.html` | After `Auth.guard()`, redirects `store_associate` → `store.html` and `warehouse_staff` → `warehouse.html` so they land on the correct dashboard. |

### Unchanged (by design)

- Staff creation flow and `admin_create_staff`.
- `auth.js` (already had `ROLE_ROUTES`: `store_associate` → `store.html`, `warehouse_staff` → `warehouse.html`, others → `index.html`).
- `login.js` (still calls `Auth.roleRedirect(profile.role)` after sign-in).
- Inventory module (`inventory.html` / `inventory.js`) — to be wired to Session/Permissions and backend in a later phase.

---

## 2. Route / Page for the New Store Dashboard

- **Route/URL:** `store.html` (same as before; now role-restricted and branch-locked).
- **Who lands here:**
  - **Login:** `role === 'store_associate'` → `Auth.roleRedirect('store_associate')` → `store.html`.
  - **Index:** If a `store_associate` opens `index.html`, they are redirected to `store.html`.
- **Access:** Only `store_associate` can use the Store Dashboard; anyone else is redirected to `index.html`.

---

## 3. Role-Based Redirect After Login

- **Login** (`login.js`): On success, calls `window.Auth.roleRedirect(profile.role)`.
- **Auth** (`auth.js`): `ROLE_ROUTES` maps:
  - `store_associate` → `store.html`
  - `warehouse_staff` → `warehouse.html`
  - `owner`, `admin`, `accountant`, `viewer` → `index.html`
- **Index** (`index.html`): After guard, if `profile.role === 'store_associate'` → `store.html`; if `profile.role === 'warehouse_staff'` → `warehouse.html`.

Result: store associates always land on the Store Dashboard; warehouse staff on the Warehouse Dashboard; others on the Global/Admin Dashboard.

---

## 4. Inventory Visibility vs Write Permissions

### Session & Permissions (`session.js`)

- **Visibility:** `Permissions.canViewAllLocations()` — for all current roles (including `store_associate`), returns true so that overview/item availability can show all locations. Other branches/warehouse are read-only for store associate.
- **Write:** `Permissions.canWriteLocation(locationId)`:
  - `store_associate`: `true` only when `locationId === Session.locationId()`.
  - `owner` / `admin`: `true` for any location.
  - `warehouse_staff`: currently `true` for any (refine later if needed).
  - `accountant` / `viewer`: `false`.

### Store Dashboard (`store.html` + `store.js`)

- **Branch stocks / Sales today / Pending tasks:** Shown only for the logged-in user’s assigned branch (store selector locked to `Session.locationId()` and `Session.locationName()`).
- **Item availability:** Currently mock on Store Dashboard; when wired to real data, it should show all locations in read-only except the assigned branch (which is editable).
- **Inventory actions (Quick Sale, Inventory Out, Exchange, Request Restock):** UI only offers the single (assigned) branch; any API calls from this page must use `Session.locationId()` for `store_associate`. Backend must reject writes for other locations.

### Frontend enforcement

- Store selector is disabled and single-option for `store_associate`.
- All actions on the Store Dashboard run in the context of that one branch (`currentStoreId === Session.locationId()`).
- When inventory or other pages are updated, they should use `Permissions.canWriteLocation(locationId)` to show/disable buttons and pass the correct `location_id` to APIs.

### Backend enforcement (required)

- Do **not** rely only on hidden buttons. Every inventory write (inventory in/out, exchange, stock movements, etc.) must be validated server-side.
- **Rule:** If `role === 'store_associate'` and the transaction’s `location_id` is not equal to the user’s `location_id`, the backend must reject the request (e.g. 403 or error message).
- Apply this in:
  - RPCs used for inventory in, inventory out, exchange, restock requests, branch-level stock movements.
  - Any Supabase RLS policies or Postgres checks that run for those operations.

---

## 5. SQL / RPC / Policy Updates (no schema change)

- **No new tables or columns** were added; `public.profiles` and `location_id` are already in place.
- **Backend (Supabase) should:**
  1. **RPCs / API:** For every inventory (or store) write, accept `location_id` and the authenticated user’s `profile.role` and `profile.location_id`. If `role === 'store_associate'` and `location_id !== profile.location_id`, reject the call.
  2. **RLS / policies:** If you use RLS on inventory or related tables, ensure that for `store_associate`:
     - **SELECT:** Can see rows for all locations (read-only visibility).
     - **INSERT/UPDATE/DELETE:** Only for rows where `location_id = (user's profile.location_id)` (or equivalent), or enforce the same rule inside RPCs and keep RLS permissive for service role.

You can implement the above either in RPC logic only or in RLS; the important part is that writes for a location other than the store associate’s assigned branch are rejected.

---

## 6. Test Plan

### 6.1 Store associate

- **Login** with a user that has `role = store_associate` and a non-null `location_id`.
- **Redirect:** Lands on `store.html` (from login and from `index.html` if opened manually).
- **Store selector:** Single option, disabled, showing the assigned branch name.
- **Branch stocks / Sales today:** Only that branch’s data (mock or real).
- **Quick Sale, Inventory Out, Exchange, Request Restock:** Only for the assigned branch; no way to choose another location.
- **Back link:** “Back to Master Dashboard” is hidden.
- **Direct URL:** Visiting `index.html` redirects to `store.html`.

### 6.2 Warehouse user

- **Login** with `role = warehouse_staff`.
- **Redirect:** Lands on `warehouse.html` (from login and from `index.html` if opened manually).
- **No change** to existing warehouse behavior; no store-associate branch lock.

### 6.3 Owner / Admin

- **Login** with `role = owner` or `role = admin`.
- **Redirect:** Lands on `index.html` (Global/Admin Dashboard).
- **Store dashboard:** If they open `store.html` directly, they are redirected to `index.html` (store page is restricted to `store_associate` only in the current implementation). If you later allow owner/admin to “view as” store, you would relax this and use `Permissions.canWriteLocation` so only store associate is branch-locked.
- **Full access** to other modules (Staff, Inventory, etc.) as before.

### 6.4 Backend (when implemented)

- As **store_associate**, call an inventory-out (or similar) RPC with `location_id` = another branch’s ID → expect **rejection** (e.g. 403 or error).
- As **store_associate**, call the same RPC with `location_id` = that user’s `profile.location_id` → expect **success** (assuming valid payload).
- As **owner** or **admin**, call with any valid `location_id` → expect **success**.

---

## 7. Optional Next Steps (not done in this phase)

- **Inventory page** (`inventory.html`): Use `Session` and `Permissions`; show all locations for “item availability”; allow write actions (dropdowns, buttons) only when `Permissions.canWriteLocation(locationId)` is true; pass `Session.locationId()` for store_associate when calling write APIs.
- **Warehouse dashboard** (`warehouse.html`): Add role check so only `warehouse_staff` (and optionally owner/admin) can access; redirect `store_associate` to `store.html` if opened directly.
- **Placeholder modules** on Store Dashboard (Time In/Out, Break/Lunch, Schedule, Commission, Salary, Memo/IR): Add as links or stub sections when ready; data should be scoped to the assigned branch for store_associate where applicable.
