# Auto-Create Profile for New Staff (Step-by-Step)

This guide makes sure every new auth user gets a matching row in `public.profiles` with `id`, `full_name`, `role`, and `location_id`.

---

## Part A: Run the SQL in Supabase

### Step 1: Open Supabase SQL Editor

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) and sign in.
2. Open your project (the one your ERP uses).
3. In the left sidebar, click **“SQL Editor”**.
4. Click **“New query”** so you have an empty editor.

### Step 2: Paste the migration script

1. Open this file in your project:
   - **`supabase/migrations/auto_create_profile_on_signup.sql`**
2. Select all the SQL (Ctrl+A / Cmd+A) and copy it.
3. Paste it into the Supabase SQL Editor.

### Step 3: Run the script

1. Click **“Run”** (or press Ctrl+Enter / Cmd+Enter).
2. You should see a success message at the bottom (e.g. “Success. No rows returned”).
3. If you see an error, read the message. Common cases:
   - **“relation auth.users does not exist”** – You’re not in a Supabase project or the Auth schema isn’t available (unusual).
   - **“permission denied”** – Use an account that has permission to create functions and triggers (e.g. owner).

That’s it for the database. From now on, **whenever a new row is inserted into `auth.users`**, a row is automatically created (or updated) in `public.profiles` with:

- **id** = new user’s id  
- **full_name** = from the user’s metadata  
- **role** = from the user’s metadata  
- **location_id** = from the user’s metadata (or `NULL` if missing/invalid)

The trigger reads these from **`raw_user_meta_data`** on the new auth user. So whoever creates the user must put `full_name`, `role`, and `location_id` there.

---

## Part B: Make sure the backend sends metadata

The frontend does **not** create the auth user. It only calls:

- **RPC:** `admin_create_staff`
- **Payload:** `p_email`, `p_password`, `p_full_name`, `p_role`, `p_location_id`

So the **backend** that implements “create this staff user” must:

1. Create the user in Supabase Auth (e.g. with the Auth Admin API).
2. When creating that user, set **user metadata** (which becomes `raw_user_meta_data` in `auth.users`) to:
   - **full_name** = value of `p_full_name`
   - **role** = value of `p_role`
   - **location_id** = value of `p_location_id` (the UUID string from the dropdown)

Then the trigger in Part A will see that metadata and insert the correct row into `public.profiles`.

---

## Step 4: Find where the user is created in your backend

You need the place that **actually creates the auth user** when an admin adds staff. That might be:

- A **Postgres function** named `admin_create_staff` (or one that it calls), or  
- A **Supabase Edge Function**, or  
- Another **backend service** that uses the Supabase Admin API.

In the Supabase Dashboard:

1. Go to **Database → Functions** and look for something like `admin_create_staff`.
2. Or go to **Edge Functions** and look for one that creates users when staff are added.

That function/service is what you must update.

---

## Step 5: Update the backend to pass metadata

Whoever creates the user (e.g. inside `admin_create_staff` or in an Edge Function) must call the Auth API with **user_metadata** set.

**If you use the Supabase Auth Admin API** (e.g. in an Edge Function or a server):

- When you call **create user** (e.g. `auth.admin.createUser()` or the REST endpoint that creates a user), pass a **user_metadata** (or equivalent) object like this:

```json
{
  "full_name": "<value of p_full_name>",
  "role": "<value of p_role>",
  "location_id": "<value of p_location_id as string, e.g. UUID>"
}
```

**Example (JavaScript, Supabase Admin client):**

```js
const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email: p_email,
  password: p_password,
  email_confirm: true,
  user_metadata: {
    full_name: p_full_name,
    role: p_role,
    location_id: p_location_id   // string UUID from the form
  }
});
```

**If `admin_create_staff` is a Postgres function** that inserts into `auth.users` (or uses an extension to create users):

- Then wherever that insert happens, set `raw_user_meta_data` to a JSON object containing `full_name`, `role`, and `location_id` (e.g. from the function parameters `p_full_name`, `p_role`, `p_location_id`).

The important part: **the new row in `auth.users` must have `raw_user_meta_data` with keys `full_name`, `role`, and `location_id`** so the trigger can copy them into `public.profiles`.

---

## Step 6: Confirm the frontend is sending the right data

The ERP frontend already sends everything you need. In `staff.js`, when you click **Save Profile** for a new staff:

- **Payload:**  
  `p_email`, `p_password`, `p_full_name`, `p_role`, `p_location_id`
- **`p_location_id`** is the value from the “Assigned Location” dropdown.

So the frontend **is** sending `full_name`, `role`, and `location_id` (as `p_full_name`, `p_role`, `p_location_id`). The backend must take those three and put them into the new user’s metadata when creating the auth user.

---

## Summary

| Step | What to do |
|------|------------|
| 1–3 | Run `supabase/migrations/auto_create_profile_on_signup.sql` in Supabase SQL Editor once. |
| 4 | Find the backend that creates the auth user (e.g. `admin_create_staff` or an Edge Function). |
| 5 | Update that code so when it creates the user it sets **user_metadata** (or `raw_user_meta_data`) with **full_name**, **role**, and **location_id**. |
| 6 | No change needed in the frontend; it already sends `p_full_name`, `p_role`, `p_location_id`. |

After that, every newly created staff account will automatically get a matching row in `public.profiles` with `id`, `full_name`, `role`, and `location_id`.

---

## Tasks 5 & 6: Does admin_create_staff send metadata?

**5. Check whether admin_create_staff sends full_name, role, location_id into the new user’s metadata**

- The **frontend** (this repo) only calls `window.db.rpc('admin_create_staff', payload)` with:
  - `p_email`, `p_password`, `p_full_name`, `p_role`, `p_location_id`
- The **implementation** of `admin_create_staff` lives in **your Supabase project** (Database → Functions, or an Edge Function), not in this codebase. So we cannot see from this repo whether it passes metadata when creating the auth user.

**6. What the backend must do**

- The **backend** that creates the new auth user (the function or service that runs when `admin_create_staff` is called) must be updated so that when it creates the user it passes **user_metadata** (stored as `raw_user_meta_data` in `auth.users`):
  - **full_name** ← from `p_full_name`
  - **role** ← from `p_role`
  - **location_id** ← from `p_location_id` (as string, e.g. the UUID from the dropdown)

- **Where to update:** In Supabase, open the function or Edge Function that implements “create staff user” (often named `admin_create_staff` in Database → Functions, or the Edge Function that the RPC might call). In that code, wherever the auth user is created (e.g. `auth.admin.createUser()` or equivalent), add or set:
  - `user_metadata: { full_name: p_full_name, role: p_role, location_id: p_location_id }`

- **Fields that must be passed:** `full_name`, `role`, `location_id` (all three). If any are missing, the trigger will still create a profile row but with empty or default values (e.g. role `'viewer'`), and the staff may not have the correct role or location in the ERP.
