-- =============================================================================
-- DEBUG: Branch Stocks empty for other stores — data checks
-- Run in Supabase SQL Editor to see where inventory lives and if location_ids
-- match the branch dropdown. No writes; read-only diagnostics.
-- =============================================================================

-- 1) All store branches with their IDs (same source as Branch dropdown)
SELECT id AS location_id, name AS branch_name, type
FROM public.locations
WHERE type = 'store'
ORDER BY name;

-- 2) Inventory row count per branch (location_id)
SELECT
  l.id AS location_id,
  l.name AS branch_name,
  COUNT(inv.product_id) AS inventory_rows,
  COALESCE(SUM(inv.quantity), 0) AS total_quantity
FROM public.locations l
LEFT JOIN public.inventory inv ON inv.location_id = l.id
WHERE l.type = 'store'
GROUP BY l.id, l.name
ORDER BY l.name;

-- 3) All inventory rows with branch name (latest/full picture)
SELECT
  inv.product_id,
  inv.location_id,
  l.name AS branch_name,
  inv.quantity,
  p.name AS product_name,
  p.barcode
FROM public.inventory inv
JOIN public.locations l ON l.id = inv.location_id
LEFT JOIN public.products p ON p.id = inv.product_id
WHERE l.type = 'store'
ORDER BY l.name, p.name
LIMIT 200;

-- 4) Latest inventory_movements to store locations (who received what where)
SELECT
  im.product_id,
  im.destination_location AS location_id,
  l.name AS branch_name,
  im.quantity,
  im.movement_type,
  im.source,
  im.created_at
FROM public.inventory_movements im
JOIN public.locations l ON l.id = im.destination_location
WHERE l.type = 'store'
ORDER BY im.created_at DESC
LIMIT 50;

-- 5) If a specific branch shows empty: replace the UUID below with that branch's id
--    and run to confirm whether any inventory exists for it.
/*
SELECT 'inventory rows for this location' AS check_type, COUNT(*) AS cnt
FROM public.inventory
WHERE location_id = '00000000-0000-0000-0000-000000000000';  -- replace with branch location_id

SELECT 'location exists and is store' AS check_type
FROM public.locations
WHERE id = '00000000-0000-0000-0000-000000000000' AND type = 'store';  -- replace
*/
