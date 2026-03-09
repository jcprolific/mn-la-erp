# Fix Login – Step-by-Step (Beginner)

Follow these steps **in order**. Do not skip steps.

---

## ⚠️ IMPORTANT: Paste the SQL code, NOT the file path

- **WRONG:** Pasting `supabase/migrations/FIX_LOGIN_PROFILES_RUN_IN_SUPABASE.sql` into the SQL Editor (that is a path, not SQL — you will get "syntax error at or near supabase").
- **RIGHT:** Pasting the actual SQL code (lines that start with `CREATE TABLE`, `INSERT INTO`, `CREATE OR REPLACE FUNCTION`, etc.). Use the big code block in **Step 3** below.

---

## Step 1: Open Supabase

1. Open your browser (Chrome, Safari, etc.).
2. Go to: **https://supabase.com/dashboard**
3. Log in if it asks you.
4. Click your project **MN+LA ERP** (or the one with URL `nooqvrikraglddxkxrul`).

---

## Step 2: Open the SQL Editor

1. On the **left sidebar**, look for **“SQL Editor”**.
2. Click **“SQL Editor”**.
3. Click **“New query”** (or the **+** button) so you have an empty box where you can type.

---

## Step 3: Run the “Fix Login” SQL (first script)

1. **Select all** the SQL in the box below (from `--` to the last `;`).
2. **Copy** it (Ctrl+C on Windows, Cmd+C on Mac).
3. **Paste** it into the big empty box in the Supabase SQL Editor (where it says “Write your query here” or similar).
4. Click the green **“Run”** button (or press Ctrl+Enter / Cmd+Enter).
5. Wait until it says **“Success”** at the bottom. If you see red error text, tell your developer or copy the error.

**Copy the SQL in the gray box below.**  
Start from the line that says `-- FIX LOGIN` and end with the line that has `$$;`  
Do not copy the word "sql" or any backtick symbols (```) — only the SQL.

```sql
-- FIX LOGIN: Table, backfill, RLS, get_my_profile
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text,
  location_id uuid
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location_id uuid;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, location_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'viewer'),
    CASE
      WHEN NEW.raw_user_meta_data->>'location_id' IS NOT NULL
           AND (NEW.raw_user_meta_data->>'location_id')::text ~ '^[0-9a-fA-F-]{36}$'
      THEN (NEW.raw_user_meta_data->>'location_id')::uuid
      ELSE NULL
    END
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role = COALESCE(EXCLUDED.role, public.profiles.role),
    location_id = COALESCE(EXCLUDED.location_id, public.profiles.location_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_auth_user();

INSERT INTO public.profiles (id, full_name, role, location_id)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1), 'User'),
  COALESCE(u.raw_user_meta_data->>'role', 'viewer'),
  CASE
    WHEN u.raw_user_meta_data->>'location_id' IS NOT NULL
         AND (u.raw_user_meta_data->>'location_id')::text ~ '^[0-9a-fA-F-]{36}$'
    THEN (u.raw_user_meta_data->>'location_id')::uuid
    ELSE NULL
  END
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  full_name = COALESCE(NULLIF(TRIM(public.profiles.full_name), ''), EXCLUDED.full_name),
  role = COALESCE(NULLIF(TRIM(public.profiles.role), ''), EXCLUDED.role),
  location_id = COALESCE(public.profiles.location_id, EXCLUDED.location_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'role', p.role,
    'full_name', p.full_name,
    'location_id', p.location_id,
    'id', p.id
  ) INTO result
  FROM public.profiles p
  WHERE p.id = auth.uid();
  RETURN result;
END;
$$;
```

(Stop copying at the line with `$$;`.)

---

## Step 4: Try to log in again

1. Open your **MN+LA ERP** app (the login page).
2. Enter your **email** (e.g. Codillerojerem2@gmail.com).
3. Enter your **password**.
4. Click **“Sign In”**.

- If it works: you’re done.
- If it still says “Database configuration issue” or “No profile found”, do **Step 5**.

---

## Step 5: If login still fails – add your user ID to profiles

Your account might exist in “Users” but not in the “profiles” table. We’ll fix that.

### 5a. Get your User ID from Supabase

1. In Supabase, click **“Authentication”** in the left sidebar.
2. Click **“Users”**.
3. Find your email (e.g. Codillerojerem2@gmail.com) in the list.
4. In that row, find the **User ID** (a long string like `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).
5. **Copy** that whole User ID (double-click it or select it, then copy). Keep it somewhere (Notepad or Notes).

### 5b. Insert your profile in SQL Editor

1. Go back to **SQL Editor** → **New query**.
2. **Replace** the text `PASTE_YOUR_USER_ID_HERE` in the SQL below with your **actual User ID** (the one you copied). Do not remove the single quotes.
3. Copy the **entire** SQL (with your ID in it) and paste into the SQL Editor.
4. Click **Run**.

**SQL to run (put your User ID where it says PASTE_YOUR_USER_ID_HERE):**

```sql
INSERT INTO public.profiles (id, full_name, role, location_id)
VALUES (
  'PASTE_YOUR_USER_ID_HERE'::uuid,
  'My Name',
  'viewer',
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  full_name = COALESCE(NULLIF(TRIM(public.profiles.full_name), ''), 'My Name'),
  role = COALESCE(NULLIF(TRIM(public.profiles.role), ''), 'viewer');
```

Example: if your User ID is `a1b2c3d4-e5f6-7890-abcd-ef1234567890`, the first line inside VALUES should look like:

`'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,`

5. After it says **Success**, try **Sign In** again on the app.

---

## Quick checklist

- [ ] Step 1: Opened Supabase and selected the correct project.
- [ ] Step 2: Opened SQL Editor and New query.
- [ ] Step 3: Pasted the first big SQL script and clicked Run (Success).
- [ ] Step 4: Tried to log in again.
- [ ] Step 5 (only if still failing): Got User ID from Authentication → Users, then ran the INSERT SQL with your User ID.

If you still get an error after Step 5, copy the **exact** error message from the login page or from the browser console (F12 → Console) and share it so we can fix the next thing.
