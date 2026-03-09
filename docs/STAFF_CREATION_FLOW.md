# Staff creation flow

## 1. Frontend (Save Profile)

When **Save Profile** is clicked on the Add New Staff modal, `staff.js`:

- Builds payload: `{ p_email, p_password, p_full_name, p_role, p_location_id }`
- Calls `window.db.rpc('admin_create_staff', payload)`
- `p_location_id` is the value from the Assigned Location dropdown (required for Store Associate)

So the frontend **does** call `admin_create_staff` and passes the selected `location_id`.

---

## 2. Backend: what must happen

For newly created staff to be usable in the ERP:

1. **Create auth user**  
   A new row must exist in `auth.users` (same as sign-up). This is done with the **Supabase Auth Admin API** (service role), e.g. `auth.admin.createUser({ email, password, user_metadata: { full_name, role, location_id } })`. It cannot be done from a normal Postgres function alone.

2. **Create profile row**  
   After the auth user exists, a row must exist in `public.profiles` with:
   - `id` = auth user id (UUID from `auth.users.id`)
   - `full_name`
   - `role`
   - `location_id` (UUID from `locations.id`)

If the profile row is missing, login and auth.js will not find a profile and the user will not be usable (e.g. “Could not load your profile”).

---

## 3. Current behavior vs required

| Step | Current / possible gap | Required |
|------|------------------------|----------|
| Save Profile clicked | ✅ Frontend calls `admin_create_staff` with `p_email`, `p_password`, `p_full_name`, `p_role`, `p_location_id` | Same |
| Auth user created | ❓ Depends on your Supabase backend (RPC or Edge Function) | Must create user in `auth.users` |
| Profile row created | ❓ Often missing if backend only creates the user and does not insert into `public.profiles` | Must insert row in `public.profiles` with `id`, `full_name`, `role`, `location_id` |

So: **the profile row is often missing** when the backend only creates the auth user and does not insert into `profiles`, or does not pass `location_id` into the profile.

---

## 4. Fix: ensure profile row is created

Two parts:

### A. Backend that creates the user

Wherever you create the user (Edge Function or server using the **service role**), do:

- Create user with `auth.admin.createUser({ email, password, user_metadata: { full_name, role, location_id } })`.
- Then either:
  - Insert into `public.profiles` in the same backend (id = user.id, full_name, role, location_id), **or**
  - Rely on the trigger below to create the profile from `user_metadata` when the user is created.

### B. Database: trigger to create profile from auth user

If the user is created with `user_metadata` containing `full_name`, `role`, and `location_id`, you can ensure a profile row is always created by running the migration in `supabase/migrations/ensure_profiles_on_auth_user.sql`. It:

- Creates `public.profiles` columns if needed.
- Adds a trigger on `auth.users`: on INSERT, insert (or update) a row in `public.profiles` with `id = new.id`, and `full_name`, `role`, `location_id` from `raw_user_meta_data`.

Then:

- **Profile row:** Created automatically when the auth user is created with the right metadata.
- **location_id:** Saved into `profiles` because it is read from `raw_user_meta_data.location_id` in the trigger (and your backend must set it when creating the user).

Run that migration in the Supabase SQL Editor (or via CLI) so the trigger is in place.

---

## 5. Summary: is the profile row created or missing?

- **If** your backend only creates the user in `auth.users` and does **not** insert into `public.profiles`, or does not set `raw_user_meta_data` with `full_name`, `role`, `location_id`, then the **profile row is missing** and the new staff cannot be used in the ERP (login will fail to load profile).
- **Fix:**  
  1. Run `supabase/migrations/ensure_profiles_on_auth_user.sql` so that every new auth user gets a profile row from `raw_user_meta_data`.  
  2. Ensure whoever creates the user (e.g. `admin_create_staff` implementation or an Edge Function) creates the user with `user_metadata: { full_name, role, location_id }` so the trigger can copy them into `profiles`.  
  3. The dropdown’s selected `location_id` is already sent as `p_location_id`; the backend must pass it into that user metadata (and thus into the profile) when creating the user.
