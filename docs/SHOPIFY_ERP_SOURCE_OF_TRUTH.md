# Shopify and ERP Source of Truth

This integration follows a strict ownership model:

- Shopify owns product catalog details:
  - product name/title
  - variants/options
  - SKU
  - barcode
  - selling price
  - product images
- ERP (Supabase) owns all inventory quantities and movement history:
  - inventory in
  - inventory out
  - branch stock
  - warehouse stock
  - stock movements and ledger

## Non-Negotiable Rules

- Catalog sync from Shopify must never write quantity fields.
- Inventory movement workflows must never be sourced from Shopify.
- Barcode scanner auto-match is allowed only when a barcode resolves to exactly one scan-eligible variant.
- Duplicate or missing barcodes must not auto-resolve; users must pick a variant manually.

## Implementation Notes

- `products.shopify_*` columns are catalog metadata only.
- Existing inventory logic (RPCs and stock movement flows) stays unchanged.
- Barcode safety is enforced by `barcode_status` and `scanner_enabled` fields derived from duplicate checks.
