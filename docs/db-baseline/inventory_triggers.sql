-- =============================================================================
-- BASELINE: Inventory-related triggers and supporting schema
-- Do not modify this file; it documents the known working state for restore.
-- =============================================================================
--
-- TRIGGERS ON INVENTORY TABLES
-- ---------------------------
-- There are NO row-level triggers on public.inventory or public.inventory_movements.
-- All inventory receive/update logic is inside RPCs (store_receive_inventory_v2,
-- warehouse_receive_inventory, receive_stock, set_inventory_count). Do not add
-- triggers that modify inventory quantity or insert into inventory_movements on
-- INSERT/UPDATE of these tables, or you risk double-counting (see inventory_rules.md).
--
-- SUPPORTING SCHEMA FOR STORE RECEIVE (idempotency and audit)
-- ----------------------------------------------------------
-- These objects are required for store_receive_inventory_v2 to work correctly.
-- Apply if restoring from baseline and they are missing.
--

-- request_id: idempotency key (same request_id = no duplicate movement)
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_request_id_unique
  ON public.inventory_movements (request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_request_id_dest
  ON public.inventory_movements (request_id, destination_location)
  WHERE request_id IS NOT NULL;

COMMENT ON COLUMN public.inventory_movements.request_id IS
  'Idempotency key for store/warehouse receive: same request_id never creates duplicate movements.';

-- batch_id: audit (one batch per Receive action)
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS batch_id text;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_batch_id
  ON public.inventory_movements (batch_id)
  WHERE batch_id IS NOT NULL;

COMMENT ON COLUMN public.inventory_movements.batch_id IS
  'Batch id for store receive action; same for all items in one Receive click.';

-- inventory: unique (product_id, location_id) required for single-write UPDATE/INSERT pattern
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.inventory'::regclass
      AND conname = 'inventory_product_location_unique'
  ) THEN
    ALTER TABLE public.inventory
    ADD CONSTRAINT inventory_product_location_unique
    UNIQUE (product_id, location_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'inventory_product_location_unique: %', SQLERRM;
END $$;

-- inventory_movements: allowed movement_type values (include count_adjustment for set_inventory_count)
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_type_check
  CHECK (movement_type IN (
    'adjust_in',
    'adjust_out',
    'receive',
    'sale',
    'transfer',
    'count_adjustment'
  ));
