-- =============================================================================
-- FIX: "Could not choose the best candidate function" for store_receive_inventory_v2
-- Run this entire script in Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================

-- Remove the overload with (p_notes first) so only (p_product_id, p_store_location_id, p_quantity, p_notes, p_request_id) remains
DROP FUNCTION IF EXISTS public.store_receive_inventory_v2(text, uuid, integer, text, uuid);
