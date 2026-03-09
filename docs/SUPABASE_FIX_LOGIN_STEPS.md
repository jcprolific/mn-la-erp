# Fix login: "Database configuration issue" / missing profile

Kung lumalabas pa rin ang **"Database configuration issue. Ensure the profiles table exists in Supabase and your user has a profile row"**, gawin ang mga sumusunod sa Supabase.

## 1. Buksan ang SQL Editor

1. Pumunta sa **https://supabase.com/dashboard**
2. Piliin ang project: **nooqvrikraglddxkxrul** (MNILA ERP)
3. Sa left sidebar: **SQL Editor** → **New query**

## 2. I-run ang fix script

1. Buksan sa project ang file:  
   `supabase/migrations/FIX_LOGIN_PROFILES_RUN_IN_SUPABASE.sql`
2. **Copy** ang buong contents (lahat ng SQL)
3. **Paste** sa Supabase SQL Editor
4. I-click ang **Run** (o Ctrl+Enter / Cmd+Enter)

Dapat walang error; makikita sa baba ang "Success" o row count.

## 3. Ano ang ginagawa ng script

- **Table** – Sinisiguro na may `public.profiles` at tamang columns (`id`, `full_name`, `role`, `location_id`).
- **Trigger** – Bawat bagong user sa Auth ay magkakaroon ng row sa `profiles`.
- **Backfill** – Lahat ng **existing** user sa Authentication → Users ay bibigyan ng row sa `profiles` (kung wala pa). Email at metadata ang gagamitin para sa `full_name` at `role`.
- **RLS** – Row Level Security sa `profiles` at policy para makabasa ang user ng **sarili nilang** row (kailangan para sa login).

## 4. Pagkatapos ma-run

1. Subukan ulit mag-**Sign in** sa app (email + password).
2. Kung may user na wala pa sa Staff/Admin at gusto mo sila maging admin/owner, i-edit ang row nila sa **Table Editor** → **profiles**: palitan ang `role` (hal. `owner` o `admin`) at lagyan ng `full_name` kung kailangan.

## 5. Kung na-run mo na ang script pero ayaw pa rin mag-login

I-run **lang** ang RPC na ito sa SQL Editor (para gumana ang login kahit may RLS issue):

**File:** `supabase/migrations/ADD_GET_MY_PROFILE_RPC.sql`

Copy-paste ang **buong laman** ng file sa SQL Editor → Run. Pagkatapos, subukan ulit mag-Sign in.

## 6. Kung may error pa rin

- Sa browser: **F12** → **Console**. Hanapin ang `[Login] Profile fetch failed:` at basahin ang exact error message.
- Sa Supabase: **Table Editor** → **profiles**. Siguraduhing may row na ang **id** ay kapareho ng user ID ng account na ginagamit mo sa login (makikita ang user ID sa **Authentication** → **Users**).
