HOW TO FIX LOGIN - RUN THIS IN SUPABASE
========================================

YOU MUST PASTE THE *CONTENT* OF THE SQL FILE, NOT THE FILE PATH.

WRONG (will give "syntax error at or near supabase"):
  supabase/migrations/FIX_LOGIN_PROFILES_RUN_IN_SUPABASE.sql

RIGHT:
  1. Open the FILE: FIX_LOGIN_PROFILES_RUN_IN_SUPABASE.sql (this folder)
  2. Click inside the file. Press Ctrl+A (Windows) or Cmd+A (Mac) to SELECT ALL
  3. Copy (Ctrl+C / Cmd+C)
  4. In Supabase: SQL Editor -> New query -> Paste (Ctrl+V / Cmd+V) -> Run

The editor should show many lines starting with -- or CREATE or INSERT.
If the editor only shows one line like "supabase/migrations/..." you pasted the path. Open the file and copy from inside it.
