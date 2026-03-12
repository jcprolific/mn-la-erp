# SQL Baseline — Current Update (MN+LA ERP)

Baseline copy ng lahat ng SQL ng current update. Do not run this folder as one batch; use for reference or restore.

## Contents

- **supabase/migrations/** — Lahat ng migration files (copied here). Apply in Supabase in **filename order** (date prefix 20250309 … 20250323, then ADD_, FIX_, auto_, bulk_, ensure_).
- **docs/sql/** — `BRANCH_STOCKS_DELETE_TESTS.sql` (manual test notes).
- **docs/** — `RUN_THIS_SET_STORE_ASSOCIATE.sql`, `ADD_STORE_ASSOCIATE_flowmaticph.sql` (one-off/setup).
- **supabase/** — `FIX_store_receive_inventory_v2_ambiguous_run_in_supabase.sql`, `DEBUG_branch_stocks_empty_checks.sql` (fixes/debug).

## Applying from scratch

1. Run migrations from `supabase/migrations/` in order (by name), or use Supabase CLI: `supabase db push`.
2. Optional one-offs: run docs scripts or supabase fix scripts as needed.

## Date of baseline

Updated **2025-03** — Branch Stocks delete-by-inventory-id; Warehouse Stocks delete-by-inventory-id (20250323), RLS for warehouse_staff/warehouse.
