-- =============================================================================
-- Drop inventory_movements_quantity_positive constraint.
-- The CHECK (quantity > 0) was blocking valid inventory out/sale when stock=1.
-- RPCs insert positive quantities; constraint removed to fix the blocking issue.
-- =============================================================================

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_quantity_positive;
