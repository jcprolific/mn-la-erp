-- =============================================================================
-- RESET SALES DATA FOR STAFF ONBOARDING
-- =============================================================================
-- Use: Run in Supabase SQL Editor when preparing for real usage.
-- Effect: Clears all sales history so Store Dashboard metrics start from zero.
--
-- DOES NOT touch: products, inventory, inventory_movements, users, profiles,
--                 locations, activity_logs, inventory_out_requests.
-- =============================================================================

-- Single sales table in this schema: store_sales (line items + transaction_id).
-- Dashboard metrics (get_store_dashboard_metrics, get_store_sales_today) read
-- from store_sales only. After this, sales_today, transactions_today, and
-- cash/total sales will be 0.

TRUNCATE TABLE public.store_sales;

-- Optional: verify row count is 0 (no output expected if empty)
-- SELECT COUNT(*) FROM public.store_sales;
