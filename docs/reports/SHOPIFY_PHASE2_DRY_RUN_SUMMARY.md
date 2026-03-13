# Shopify Phase 2 Dry-Run Summary

Generated at: `2026-03-13T17:21:57.819Z`
Store domain: `mnla.myshopify.com`
API version: `2025-01`

## Summary Table

| Metric | Value |
|---|---:|
| Total products fetched | 5373 |
| Total variants fetched | 31512 |
| Active products | 1145 |
| Archived products | 4055 |
| Variants with barcode | 16966 |
| Variants without barcode | 14546 |
| Variants with SKU | 17028 |
| Variants without SKU | 14484 |
| Products missing handle | 0 |
| Products missing title | 0 |
| Variants missing title | 0 |
| Variants missing price | 0 |
| Variants missing inventory item id | 0 |
| Duplicate barcode values | 463 |
| Duplicate SKU values | 491 |

## Validation Findings

- Archived products are included.
- IDs are preserved as text.
- Barcode/SKU are trimmed and leading zeros preserved.
- Empty strings are normalized to null.
- Prices are parsed consistently.

## Conflicts to Fix Before Import

### Duplicate Barcodes
- Barcode `261952`: 6 variants
- Barcode `131982`: 5 variants
- Barcode `109007`: 3 variants
- Barcode `109008`: 3 variants
- Barcode `109009`: 3 variants
- Barcode `109006`: 3 variants
- Barcode `109002`: 3 variants
- Barcode `109005`: 3 variants
- Barcode `109004`: 3 variants
- Barcode `109003`: 3 variants
- Barcode `577629`: 3 variants
- Barcode `144803`: 3 variants
- Barcode `110902`: 3 variants
- Barcode `800068`: 3 variants
- Barcode `900365`: 2 variants
- Barcode `130102`: 2 variants
- Barcode `130103`: 2 variants
- Barcode `130104`: 2 variants
- Barcode `130105`: 2 variants
- Barcode `130106`: 2 variants

### Duplicate SKUs
- SKU `5`: 7 variants
- SKU `261952`: 7 variants
- SKU `HNTRGRN-OST`: 6 variants
- SKU `131982`: 5 variants
- SKU `182802`: 3 variants
- SKU `109007`: 3 variants
- SKU `109008`: 3 variants
- SKU `109009`: 3 variants
- SKU `109006`: 3 variants
- SKU `109002`: 3 variants
- SKU `109005`: 3 variants
- SKU `109004`: 3 variants
- SKU `109003`: 3 variants
- SKU `577629`: 3 variants
- SKU `800068`: 3 variants
- SKU `PRPL-OST-XS`: 2 variants
- SKU `PRPL-OST-S`: 2 variants
- SKU `PRPL-OST-M`: 2 variants
- SKU `PRPL-OST-L`: 2 variants
- SKU `PRPL-OST-XL`: 2 variants

## Recommendation

- Phase 3 safe to start: **No**
- Not safe to start Phase 3 until critical issues are resolved.
- Critical: Duplicate barcodes detected
- Caution: Duplicate SKUs detected
- Caution: Variants missing barcode
