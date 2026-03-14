-- Align shopify_inventory_item_id type with Shopify GID/string IDs.
-- Needed for hard-cutover payload inserts.

ALTER TABLE public.products
  ALTER COLUMN shopify_inventory_item_id TYPE text
  USING shopify_inventory_item_id::text;
