-- =============================================================================
-- Fix: Remove the overload that causes "could not choose the best candidate".
-- Keep the version (p_product_id, p_store_location_id, p_quantity, p_notes, p_request_id)
-- = (uuid, uuid, integer, text, text). Drop the other: (p_notes first) = (text, uuid, integer, text, uuid).
-- Run this in Supabase SQL Editor.
-- =============================================================================

DROP FUNCTION IF EXISTS public.store_receive_inventory_v2(text, uuid, integer, text, uuid);
