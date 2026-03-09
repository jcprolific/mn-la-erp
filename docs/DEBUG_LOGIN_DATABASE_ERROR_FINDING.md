# Login "Database error querying schema" – Root cause

## Finding (from debug instrumentation)

The error **"Sign-in hit a database error. Raw error: Database error querying schema"** is shown only when **Supabase Auth** (`signInWithPassword`) returns an error. The app never calls `get_my_profile` in that case, so the failure happens **during sign-in on the Supabase side**, not when loading the profile.

So the problem is in the **database or Auth configuration**, not in the frontend login flow.

## Common cause: NULL token columns in auth.users

Supabase Auth often returns this error when **auth.users** has `NULL` in token columns (`confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`). Auth expects empty strings, not NULL. See [supabase/auth#1940](https://github.com/supabase/auth/issues/1940).

**Fix:** Run the SQL in **`supabase/migrations/FIX_AUTH_USERS_NULL_TOKENS.sql`** in Supabase SQL Editor (copy the SQL from that file, paste, Run). That updates existing users so those columns are `''` instead of NULL. Then try signing in again.

---

## What to do in Supabase

1. **Auth hooks (if any)**  
   Supabase Dashboard → **Authentication** → **Hooks** (or **Configuration**).  
   If you have a "Sign In" or "Customize Auth" hook that runs a function or queries the database, that code may be failing (e.g. querying a missing table or schema). Temporarily disable the hook or fix the function so it doesn’t hit a missing object.

2. **Custom JWT / DB access from Auth**  
   If you use custom JWT claims or any Auth setting that runs a SQL function or queries the DB on login, ensure that function and any tables/schemas it uses exist and are correct. The error often comes from such a query failing with a "querying schema" or "database error" message.

3. **Run the Fix Login SQL once**  
   In **SQL Editor**, run the **entire** contents of `supabase/migrations/FIX_LOGIN_PROFILES_RUN_IN_SUPABASE.sql` (copy the SQL from the file, do not paste the file path). That creates/updates `public.profiles`, the trigger, RLS, and `get_my_profile()`. This does not run on sign-in, but it ensures the schema Auth might depend on exists.

4. **Check Postgres logs**  
   In Supabase → **Logs** (or **Database** → **Logs**), look at the time you tried to sign in. Note any Postgres or Auth errors that mention "schema" or "querying". That will point to the exact failing query or function.

---

## Summary

- **Where it fails:** Supabase Auth (sign-in), before the app calls `get_my_profile`.
- **What to fix:** Auth hooks, custom JWT/DB logic, or missing DB objects used during sign-in. Use the steps above to locate and fix the failing query or hook.
