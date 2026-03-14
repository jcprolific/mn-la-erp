-- Run hard cutover without statement timeout for large catalogs.

CREATE OR REPLACE FUNCTION public.shopify_catalog_hard_reset_cutover_no_timeout(
  p_catalog_rows jsonb,
  p_actor text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('statement_timeout', '0', true);

  v_result := public.shopify_catalog_hard_reset_cutover(
    p_catalog_rows,
    p_actor,
    p_notes
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.shopify_catalog_hard_reset_cutover_no_timeout(jsonb, text, text) IS
'Wrapper for shopify_catalog_hard_reset_cutover that disables statement_timeout for large one-time cutover runs.';
