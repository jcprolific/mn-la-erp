# "Failed to create user: Database error checking email"

This usually means **one of two things**:

---

## 1. That email already exists (most common)

**codillerojerem2@gmail.com** is probably already in **Authentication → Users**.

- Do **not** click **"Create a new user"** again with the same email.
- Use the **existing** user and only add a profile row.

**What to do:**

1. In Supabase go to **Authentication** → **Users**.
2. Find **codillerojerem2@gmail.com** in the list.
3. Copy that user’s **User ID** (UUID).
4. Open **SQL Editor** → **New query**. Run this (replace the UUID with the one you copied):

```sql
INSERT INTO public.profiles (id, full_name, role, location_id)
VALUES (
  'PASTE_THE_USER_ID_HERE'::uuid,
  'Jerem',
  'admin',
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  full_name = COALESCE(NULLIF(TRIM(public.profiles.full_name), ''), 'Jerem'),
  role = COALESCE(NULLIF(TRIM(public.profiles.role), ''), 'admin');
```

5. Click **Run**. Then try **Sign in** again in your app.

---

## 2. Trigger error when creating a brand‑new user

If you are creating a **new** email (not already in the list) and still get "Database error checking email", the **trigger** that creates the profile row might be failing.

**What to do:**

1. In Supabase go to **SQL Editor**.
2. Run the full **FIX_LOGIN_PROFILES_RUN_IN_SUPABASE.sql** again (the whole script: table, trigger, backfill, RLS, `get_my_profile`). That recreates the trigger and table.
3. Try **Create a new user** again in the dashboard.

If it still fails, check **Logs** in Supabase (e.g. Postgres logs) for the exact error when you click "Create user".

---

**Summary:** For **codillerojerem2@gmail.com**, use the existing user and only add/update the row in **profiles** with the SQL above. Do not create a second user with the same email.
