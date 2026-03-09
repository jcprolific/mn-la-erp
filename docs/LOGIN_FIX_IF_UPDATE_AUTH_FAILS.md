# Login still failing – what to do next

Use this if you already ran **FIX_LOGIN_PROFILES_RUN_IN_SUPABASE.sql** and **FIX_AUTH_USERS_NULL_TOKENS.sql** but still get "Database error querying schema", or if you get **permission denied** when running the auth.users UPDATE.

---

## Step 1: Try the token fix again (if you haven’t or got an error)

In Supabase → **SQL Editor** → New query, paste and **Run** (copy the SQL, not the file path):

```sql
UPDATE auth.users SET confirmation_token = '' WHERE confirmation_token IS NULL;
UPDATE auth.users SET recovery_token = '' WHERE recovery_token IS NULL;
UPDATE auth.users SET email_change = '' WHERE email_change IS NULL;
UPDATE auth.users SET email_change_token_new = '' WHERE email_change_token_new IS NULL;
```

- If it says **Success**: try signing in again on the app (hard refresh the login page first).
- If it says **permission denied** or **relation "auth.users" does not exist**: go to Step 2.

---

## Step 2: New user created the right way (workaround)

The "Database error querying schema" often comes from users that were created in a way that left NULLs in `auth.users` token columns. Users created via the Dashboard “Add user” usually don’t have this.

**Option A – Use a new email for testing**

1. Supabase → **Authentication** → **Users** → **Add user**.
2. Enter a **new** email (e.g. `test@mnla.com`) and password. Check **Auto Confirm User**.
3. Click **Create user**.
4. In **SQL Editor**, run the **full** `FIX_LOGIN_PROFILES_RUN_IN_SUPABASE.sql` (so `profiles` and backfill exist). The backfill will add a row for the new user.
5. In the app, sign in with that new email and password.

**Option B – Same email (replace old user)**

1. Supabase → **Authentication** → **Users**.
2. Find the user (e.g. `codillerojerem2@gmail.com`) and **delete** that user.
3. **Add user** again with the **same** email and a new password. Check **Auto Confirm User** → **Create user**.
4. In **SQL Editor**, run the full `FIX_LOGIN_PROFILES_RUN_IN_SUPABASE.sql` if you haven’t already (so backfill runs). Or add a profile for the new user with the INSERT from `docs/LOGIN_DO_NOT_DELETE_ACCOUNT.md` (use the new user’s User ID from the Users list).
5. In the app, sign in with that email and the **new** password you just set.

---

## Step 3: Confirm project and URL

Make sure the app is using the same Supabase project where you ran the SQL and created the user. In the app, the URL should be `https://nooqvrikraglddxkxrul.supabase.co` (see `supabase-client.js`). If the project or URL is different, fix the app config or run the SQL in the correct project.

---

## Summary

| Situation | Action |
|----------|--------|
| UPDATE auth.users ran **Success** | Hard refresh login page, try sign in again. |
| **Permission denied** on auth.users | Use Step 2 (create a new user via Dashboard, then sign in with that user). |
| Still “Database error” after UPDATE | Try Step 2 with a new user; check Step 3 (correct project/URL). |
