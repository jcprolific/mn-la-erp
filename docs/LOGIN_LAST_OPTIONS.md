# Login still failing – last options

The app and SQL scripts are correct. The error "Database error querying schema" comes from **Supabase Auth** when signing in. Only these can fix it:

---

## Option A: Run the token fix in Supabase (if you haven’t)

In Supabase → **SQL Editor** → New query, paste and **Run**:

```sql
UPDATE auth.users SET confirmation_token = '' WHERE confirmation_token IS NULL;
UPDATE auth.users SET recovery_token = '' WHERE recovery_token IS NULL;
UPDATE auth.users SET email_change = '' WHERE email_change IS NULL;
UPDATE auth.users SET email_change_token_new = '' WHERE email_change_token_new IS NULL;
```

If **Success** → hard refresh the login page (Ctrl+Shift+R) and sign in again.

If **permission denied** → use Option B.

---

## Option B: Sign in with a user created in the Dashboard

1. Supabase → **Authentication** → **Users** → **Add user**.
2. Use a **new** email (e.g. `admin@mnla.com`) and a password. Check **Auto Confirm User** → **Create user**.
3. Ensure you already ran **FIX_LOGIN_PROFILES_RUN_IN_SUPABASE.sql** (so `profiles` and backfill exist).
4. In the app, sign in with this **new** email and password.

Users created via “Add user” don’t have the NULL token issue.

---

## Option C: Ask Supabase to fix or run the UPDATE

If Option A gives permission denied and Option B is not acceptable:

1. Open a ticket or post in [Supabase Discord](https://discord.supabase.com) or [GitHub Discussions](https://github.com/supabase/supabase/discussions).
2. Say: “Sign-in returns **500: Database error querying schema**. Logs show: **Scan error on column confirmation_token: converting NULL to string is unsupported**. I need to set NULL token columns in `auth.users` to empty string, or need a way to fix existing users. See https://github.com/supabase/auth/issues/1940.”
3. They can run the UPDATE for you or suggest a supported workaround.

---

## Checklist before you contact support

- [ ] Ran **FIX_LOGIN_PROFILES_RUN_IN_SUPABASE.sql** (full script) in the **same** project the app uses.
- [ ] Tried Option A (UPDATE auth.users) – note if you got Success or permission denied.
- [ ] Tried Option B (new user via Add user, then sign in with that user).
- [ ] Confirmed app URL in `supabase-client.js` matches the project (nooqvrikraglddxkxrul).
- [ ] In Supabase **Authentication** → **Hooks**: no custom hook enabled for sign-in (or you disabled it for testing).
