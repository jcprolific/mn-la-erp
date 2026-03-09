-- Set your profile to store_associate with the given store location.
-- Run in Supabase SQL Editor. Then sign out and sign in again.

UPDATE public.profiles
SET role = 'store_associate', location_id = '131ea865-e547-401a-9534-5a911fe6ba0e'::uuid
WHERE id = '3f900eee-0b3e-46ec-aa8b-b2a00abb27a8'::uuid;
