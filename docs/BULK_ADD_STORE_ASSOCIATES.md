# Bulk Add Store Associates

How to assign multiple people as **store associates** with a designated branch (location) in one go.

## What you need

- **Email** of each person (must already exist in Supabase Auth).
- **Location ID** (UUID) of the branch they are assigned to.

To get location IDs: **Supabase Dashboard → Table Editor → `locations`** → copy the `id` of each branch.

---

## Option A: Users already in Supabase Auth

If the users already have accounts (they signed up or you invited them):

1. Open **Supabase → SQL Editor**.
2. Open the file **`supabase/migrations/bulk_assign_store_associates.sql`** in your project.
3. Edit the `VALUES` list: replace the sample rows with your **(email, location_id)** pairs, for example:

   ```sql
   WITH bulk_data AS (
     SELECT * FROM (VALUES
       ('juan.delacruz@company.com', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid),
       ('maria.santos@company.com', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid),
       ('pedro.reyes@company.com', 'b2c3d4e5-f6a7-8901-bcde-f12345678901'::uuid)
     ) AS t(email, location_id)
   ),
   ...
   ```

4. Run the **entire** script (Ctrl+A → Run).
5. Each of those users will now have `role = 'store_associate'` and `location_id` set to the branch you specified. They can log in and use the Store Dashboard for that branch.

---

## Option B: Users not yet in Supabase Auth

You need to create/invite the users first, then run the bulk SQL.

### Step 1: Invite or create users

- **Supabase Dashboard → Authentication → Users → Invite user**  
  Invite each person by email. They will receive an invite link and their account will be created when they accept.

- Or use **Supabase Auth Admin API** (e.g. from a small script or backend) to call `inviteUserByEmail` or `createUser` for each email. When creating, you can pass `user_metadata: { role: 'store_associate', location_id: '<uuid>', full_name: '...' }` so the profile is set automatically by the trigger.

### Step 2: Bulk assign role and branch

After the users exist in **Authentication → Users**, use **Option A** above: run **`bulk_assign_store_associates.sql`** in the SQL Editor with the same **(email, location_id)** list. This sets (or updates) `role` and `location_id` in `public.profiles` for each email.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Get branch UUIDs from **Table Editor → locations**. |
| 2 | Ensure each person has an account under **Authentication → Users** (invite or signup if needed). |
| 3 | Run **`bulk_assign_store_associates.sql`** in SQL Editor with your **(email, location_id)** list. |
| 4 | Those users can log in as store associates for their assigned branch. |

No products, inventory, or other data are changed; only `public.profiles` is updated for the listed users.
