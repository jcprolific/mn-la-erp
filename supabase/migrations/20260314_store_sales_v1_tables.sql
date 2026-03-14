-- =============================================================================
-- Store Sales V1 - transactional schema (atomic sales path support)
-- =============================================================================
-- Safety goals:
-- - Additive only: does not modify existing inventory-in / warehouse flows
-- - RPC-only writes: no direct authenticated insert/update/delete policies
-- - Idempotency support via request_id unique index
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sales_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  business_date date NOT NULL DEFAULT current_date,
  reference_no text NOT NULL,
  request_id text,
  total_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  total_items integer NOT NULL DEFAULT 0 CHECK (total_items >= 0),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.sales_transactions(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  barcode text,
  product_name_snapshot text NOT NULL,
  size_snapshot text,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_transactions_location_business_date
  ON public.sales_transactions (location_id, business_date DESC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_transactions_reference_no_unique
  ON public.sales_transactions (reference_no);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_transactions_request_id_unique
  ON public.sales_transactions (request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_transactions_created_by_created_at
  ON public.sales_transactions (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_transaction_items_transaction_id
  ON public.sales_transaction_items (transaction_id);

CREATE INDEX IF NOT EXISTS idx_sales_transaction_items_location_created_at
  ON public.sales_transaction_items (location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_transaction_items_product_id
  ON public.sales_transaction_items (product_id);

CREATE INDEX IF NOT EXISTS idx_sales_transaction_items_barcode
  ON public.sales_transaction_items (barcode);

CREATE INDEX IF NOT EXISTS idx_sales_transaction_items_inventory_id
  ON public.sales_transaction_items (inventory_id);

ALTER TABLE public.sales_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_transaction_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_transactions_select_scoped" ON public.sales_transactions;
CREATE POLICY "sales_transactions_select_scoped"
  ON public.sales_transactions
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile() LIMIT 1) IN ('owner', 'admin')
    OR location_id = (SELECT location_id FROM public.get_current_user_profile() LIMIT 1)
  );

DROP POLICY IF EXISTS "sales_transaction_items_select_scoped" ON public.sales_transaction_items;
CREATE POLICY "sales_transaction_items_select_scoped"
  ON public.sales_transaction_items
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.get_current_user_profile() LIMIT 1) IN ('owner', 'admin')
    OR location_id = (SELECT location_id FROM public.get_current_user_profile() LIMIT 1)
  );

COMMENT ON TABLE public.sales_transactions IS
'Store sales transaction headers for Sales Today V1. Write path is RPC-only.';

COMMENT ON TABLE public.sales_transaction_items IS
'Store sales line items for Sales Today V1 with snapshots and audit tracing.';
