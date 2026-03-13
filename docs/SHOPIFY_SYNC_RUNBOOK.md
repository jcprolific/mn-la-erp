# Shopify Catalog Sync Runbook

## Purpose

This runbook syncs Shopify catalog fields into ERP while keeping inventory quantity logic in ERP only.

## 1) Sync Catalog to ERP

- Dry run:
  - `npm run shopify:sync-catalog:dry-run`
- Apply:
  - `npm run shopify:sync-catalog`

What it updates:

- `products` catalog fields from Shopify (name, SKU, barcode, options, price, image, Shopify IDs).
- `barcode_status` + `scanner_enabled` via `refresh_product_barcode_statuses()`.

What it does not update:

- inventory quantities
- inventory movements
- branch/warehouse stock

## 2) Barcode Guardrails

- Scanner auto-match only works when `scanner_enabled = true` and barcode is unique.
- Duplicate or blocked barcode scans require manual variant selection in the UI.

## 3) Duplicate Cleanup Batch Execution

- Dry-run all planned batches:
  - `npm run shopify:barcode-execute-batch -- --batch 1`
- Apply a batch:
  - `npm run shopify:barcode-execute-batch -- --batch 1 --apply --replacement-map docs/reports/shopify_replacement_map_batch1.csv`

Replacement map CSV format:

- headers: `shopify_variant_id,new_barcode`
- include only rows for variants marked `replace barcode on this variant`.

## 4) Daily Monitoring

- Generate health report:
  - `npm run shopify:catalog-health`
- Output:
  - `docs/reports/shopify_catalog_health_report.json`
  - `docs/reports/SHOPIFY_CATALOG_HEALTH_REPORT.md`

Suggested schedule:

- Hourly: `shopify:sync-catalog`
- Daily: `shopify:catalog-health`
- Combined daily cycle: `shopify:daily-cycle`

## 5) Hard-Reset Cutover (Shopify Catalog Master)

Use this only for one-time architecture cutover where `public.products` is rebuilt from Shopify and all product references are remapped.

Prerequisites:

- Deploy migrations including:
  - `20260314_shopify_catalog_hard_reset_cutover.sql`
  - `20260314_disable_manual_product_create_rpc.sql`
  - `20260314_products_write_policy_shopify_admin_only.sql`
- Prepare catalog payload JSON from Shopify normalized variants.

Execute cutover:

1. Run a final dry run:
   - `npm run shopify:sync-catalog:dry-run`
2. Ensure payload has unique `shopify_variant_id` and `sku`.
3. Execute RPC with payload:
   - `select public.shopify_catalog_hard_reset_cutover(<payload_jsonb>, 'owner/admin', 'shopify catalog master cutover');`

Post-cutover validation:

- Run:
  - `npm run shopify:validate-cutover`
- Optional explicit run:
  - `npm run shopify:validate-cutover -- --run-id <cutover_run_uuid>`
- Validation report output:
  - `docs/reports/shopify_cutover_validation_<run_id>.json`

Rollback notes:

- Use `shopify_catalog_cutover_products_snapshot` + `shopify_catalog_cutover_product_id_map` for forensic rollback.
- Do not run rollback blindly; restore in a controlled SQL transaction using snapshot rows for the specific `run_id`.
