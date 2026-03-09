-- =============================================================================
-- FIX: "Database error querying schema" on sign-in
-- =============================================================================
-- Cause: auth.users has NULL in token columns; Auth expects empty string.
-- See: https://github.com/supabase/auth/issues/1940
--
-- Run this in Supabase SQL Editor. Copy the SQL below (not this file path).
-- If you get "permission denied", try running from Dashboard as owner or
-- use Supabase support. If a column does not exist, that line will error;
-- comment out that line and run the rest.
-- =============================================================================

UPDATE auth.users SET confirmation_token = '' WHERE confirmation_token IS NULL;
UPDATE auth.users SET recovery_token = '' WHERE recovery_token IS NULL;
UPDATE auth.users SET email_change = '' WHERE email_change IS NULL;
UPDATE auth.users SET email_change_token_new = '' WHERE email_change_token_new IS NULL;
