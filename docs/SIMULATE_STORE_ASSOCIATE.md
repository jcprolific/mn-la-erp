# Simulate store associate (test with your own account)

You can turn your current user into a **store_associate** with an assigned store so the app sends you to the Store Dashboard and shows the store-associate experience.

---

## Step 1: Get your User ID

1. Supabase → **Authentication** → **Users**
2. Find your user (the one you use to log in) and **copy** the **User ID** (UUID)

---

## Step 2: Get the store Location ID

1. Supabase → **Table Editor** → **locations**
2. Find the **store** you want to be “assigned” to (same one you’d pick in Add users)
3. **Copy** that row’s **id** (UUID)

If you’re not sure which is a store: check the **type** column (e.g. `store`) or the **name** of the location.

---

## Step 3: Update your profile in SQL

1. Supabase → **SQL Editor** → New query
2. Paste the SQL below and **replace** both UUIDs:
   - `YOUR_USER_ID` → your User ID from Step 1
   - `STORE_LOCATION_ID` → the location id from Step 2

```sql
UPDATE public.profiles
SET role = 'store_associate', location_id = 'STORE_LOCATION_ID'::uuid
WHERE id = 'YOUR_USER_ID'::uuid;
```

3. Click **Run**. You should see something like “Success. 1 row affected” (or “0 rows” if the IDs were wrong).

---

## Step 4: Sign out and sign in again

1. In the app, **sign out** (profile menu → Log out, or clear session)
2. Go to the **login page** and **sign in** again with the same email and password

After login, the app will read your updated profile and redirect you to **Store Dashboard** (`store.html`) as a store associate for that location.

---

## Switch back to viewer or admin

To revert to viewer (or admin), run again with the role you want and `location_id = NULL` if you don’t want a store:

```sql
UPDATE public.profiles
SET role = 'viewer', location_id = NULL
WHERE id = 'YOUR_USER_ID'::uuid;
```

Then sign out and sign in again. (Use `admin` or `owner` instead of `viewer` if you prefer.)
