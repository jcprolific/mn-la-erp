# Login fix – do these in order

Do each step in order. Stop when login works.

---

## Step 1: Fix Login SQL (profiles + get_my_profile)

1. Open in Cursor: **`supabase/migrations/FIX_LOGIN_PROFILES_RUN_IN_SUPABASE.sql`**
2. **Ctrl+A** (select all) → **Ctrl+C** (copy). You must copy the **SQL code**, not the file path.
3. Supabase → **SQL Editor** → New query → **Paste** → **Run**
4. You must see **Success** (or "Success. No rows returned").

---

## Step 2: Fix auth token columns (stops "Database error querying schema")

1. Supabase → **SQL Editor** → New query
2. Paste this and click **Run**:

```sql
UPDATE auth.users SET confirmation_token = '' WHERE confirmation_token IS NULL;
UPDATE auth.users SET recovery_token = '' WHERE recovery_token IS NULL;
UPDATE auth.users SET email_change = '' WHERE email_change IS NULL;
UPDATE auth.users SET email_change_token_new = '' WHERE email_change_token_new IS NULL;
```

3. If **Success**: go to Step 4 and try signing in.
4. If **permission denied** or error: go to Step 3.

---

## Step 3: Use a user created by the Dashboard (workaround if Step 2 failed)

1. Supabase → **Authentication** → **Users** → **Add user**
2. Email: e.g. **testlogin@mnla.com** (or any new email)
3. Password: set one you’ll remember. Check **Auto Confirm User** → **Create user**
4. Make sure Step 1 was run (so `profiles` and backfill exist). The backfill adds a row for this user.
5. In the app, sign in with this **new** email and password.

---

## Step 4: Try signing in

1. Open the app **login page**
2. **Hard refresh**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
3. Enter email and password → **Sign In**

- If it works: done.
- If **"No profile found"**: In Supabase → Authentication → Users, copy your **User ID**. In SQL Editor run (replace the UUID):

```sql
INSERT INTO public.profiles (id, full_name, role, location_id)
VALUES ('YOUR_USER_ID_HERE'::uuid, 'Your Name', 'admin', NULL)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;
```

- If **"Database error querying schema"** again: go to Step 5.

---

## Step 5: Check Auth Hooks and project

1. Supabase → **Authentication** → **Hooks** (or **Configuration**). If any hook runs on **sign-in**, **disable it** temporarily and try Step 4 again.
2. Confirm the app uses this project: in your app, the Supabase URL should be **nooqvrikraglddxkxrul** (see `supabase-client.js`). If you have multiple projects, run all SQL and create the test user in the **same** project as the app.
3. Supabase → **Logs** → try signing in again → open the log at that time and note the **exact** error message. Use that to fix the failing query or hook.

---

## Quick reference

| Step | What it does |
|------|----------------|
| 1 | Creates `profiles` table, trigger, backfill, RLS, `get_my_profile()` |
| 2 | Sets NULL token columns in `auth.users` to `''` (fixes schema error) |
| 3 | New user created via Dashboard (avoids NULL tokens if Step 2 can’t run) |
| 4 | Sign in + optional profile INSERT if “No profile found” |
| 5 | Disable Auth Hooks, check project URL, check Logs for exact error |
