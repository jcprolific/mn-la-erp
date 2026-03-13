const fs = require('node:fs');
const path = require('node:path');
const { fetchShopifyCatalog } = require('./fetch-shopify-catalog');

function buildDuplicateList(variants, key) {
  const grouped = new Map();
  for (const v of variants) {
    const value = v[key];
    if (!value) continue;
    const list = grouped.get(value) || [];
    list.push(v);
    grouped.set(value, list);
  }

  return [...grouped.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([value, list]) => ({
      value,
      count: list.length,
      sample_variant_ids: list.slice(0, 10).map((x) => x.shopify_variant_id),
      sample_product_ids: [...new Set(list.slice(0, 10).map((x) => x.shopify_product_id))],
    }));
}

function buildSummary(products, variants) {
  const activeProducts = products.filter((p) => p.status === 'active').length;
  const archivedProducts = products.filter((p) => p.status === 'archived').length;
  const withBarcode = variants.filter((v) => Boolean(v.barcode)).length;
  const withoutBarcode = variants.length - withBarcode;
  const withSku = variants.filter((v) => Boolean(v.sku)).length;
  const withoutSku = variants.length - withSku;

  const productsMissingHandle = products.filter((p) => !p.handle);
  const productsMissingTitle = products.filter((p) => !p.title);
  const variantsMissingTitle = variants.filter((v) => !v.title);
  const variantsMissingPrice = variants.filter((v) => v.price === null);
  const variantsMissingInventoryItemId = variants.filter((v) => !v.inventory_item_id);

  return {
    counts: {
      total_products_fetched: products.length,
      total_variants_fetched: variants.length,
      active_products_count: activeProducts,
      archived_products_count: archivedProducts,
      variants_with_barcode: withBarcode,
      variants_without_barcode: withoutBarcode,
      variants_with_sku: withSku,
      variants_without_sku: withoutSku,
      products_missing_handle: productsMissingHandle.length,
      products_missing_title: productsMissingTitle.length,
      variants_missing_title: variantsMissingTitle.length,
      variants_missing_price: variantsMissingPrice.length,
      variants_missing_inventory_item_id: variantsMissingInventoryItemId.length,
    },
    conflicts: {
      duplicate_barcodes: buildDuplicateList(variants, 'barcode'),
      duplicate_skus: buildDuplicateList(variants, 'sku'),
    },
    warnings: {
      products_missing_handle: productsMissingHandle.slice(0, 50).map((x) => x.shopify_product_id),
      products_missing_title: productsMissingTitle.slice(0, 50).map((x) => x.shopify_product_id),
      variants_missing_title: variantsMissingTitle.slice(0, 50).map((x) => x.shopify_variant_id),
      variants_missing_price: variantsMissingPrice.slice(0, 50).map((x) => x.shopify_variant_id),
      variants_missing_inventory_item_id: variantsMissingInventoryItemId.slice(0, 50).map(
        (x) => x.shopify_variant_id
      ),
    },
    samples: {
      products: products.slice(0, 3),
      variants: variants.slice(0, 5),
    },
  };
}

function buildRecommendation(summary) {
  const critical = [];
  const caution = [];
  if (summary.conflicts.duplicate_barcodes.length) critical.push('Duplicate barcodes detected');
  if (summary.counts.products_missing_handle) critical.push('Products missing handle');
  if (summary.counts.products_missing_title || summary.counts.variants_missing_title) {
    critical.push('Missing product/variant titles');
  }
  if (!summary.counts.total_products_fetched || !summary.counts.total_variants_fetched) {
    critical.push('Empty product or variant fetch');
  }

  if (summary.conflicts.duplicate_skus.length) caution.push('Duplicate SKUs detected');
  if (summary.counts.variants_missing_price) caution.push('Variants missing price');
  if (summary.counts.variants_without_barcode) caution.push('Variants missing barcode');
  if (summary.counts.variants_missing_inventory_item_id) caution.push('Variants missing inventory item id');

  return {
    phase3_safe_to_start: critical.length === 0,
    reason:
      critical.length === 0
        ? caution.length
          ? 'Safe to start Phase 3 with caution; cleanup remains.'
          : 'Safe to start Phase 3.'
        : 'Not safe to start Phase 3 until critical issues are resolved.',
    critical_issues: critical,
    caution_issues: caution,
  };
}

function buildMarkdown(report) {
  const c = report.summary.counts;
  const duplicateBarcodes = report.summary.conflicts.duplicate_barcodes.length;
  const duplicateSkus = report.summary.conflicts.duplicate_skus.length;

  const topBarcodeText =
    duplicateBarcodes === 0
      ? '- None'
      : report.summary.conflicts.duplicate_barcodes
          .slice(0, 20)
          .map((x) => `- Barcode \`${x.value}\`: ${x.count} variants`)
          .join('\n');

  const topSkuText =
    duplicateSkus === 0
      ? '- None'
      : report.summary.conflicts.duplicate_skus
          .slice(0, 20)
          .map((x) => `- SKU \`${x.value}\`: ${x.count} variants`)
          .join('\n');

  const critical = report.recommendation.critical_issues.map((x) => `- Critical: ${x}`).join('\n');
  const caution = report.recommendation.caution_issues.map((x) => `- Caution: ${x}`).join('\n');

  return `# Shopify Phase 2 Dry-Run Summary

Generated at: \`${report.generated_at}\`
Store domain: \`${report.store_domain}\`
API version: \`${report.api_version}\`

## Summary Table

| Metric | Value |
|---|---:|
| Total products fetched | ${c.total_products_fetched} |
| Total variants fetched | ${c.total_variants_fetched} |
| Active products | ${c.active_products_count} |
| Archived products | ${c.archived_products_count} |
| Variants with barcode | ${c.variants_with_barcode} |
| Variants without barcode | ${c.variants_without_barcode} |
| Variants with SKU | ${c.variants_with_sku} |
| Variants without SKU | ${c.variants_without_sku} |
| Products missing handle | ${c.products_missing_handle} |
| Products missing title | ${c.products_missing_title} |
| Variants missing title | ${c.variants_missing_title} |
| Variants missing price | ${c.variants_missing_price} |
| Variants missing inventory item id | ${c.variants_missing_inventory_item_id} |
| Duplicate barcode values | ${duplicateBarcodes} |
| Duplicate SKU values | ${duplicateSkus} |

## Validation Findings

- Archived products are included.
- IDs are preserved as text.
- Barcode/SKU are trimmed and leading zeros preserved.
- Empty strings are normalized to null.
- Prices are parsed consistently.

## Conflicts to Fix Before Import

### Duplicate Barcodes
${topBarcodeText}

### Duplicate SKUs
${topSkuText}

## Recommendation

- Phase 3 safe to start: **${report.recommendation.phase3_safe_to_start ? 'Yes' : 'No'}**
- ${report.recommendation.reason}
${critical}
${caution}
`;
}

async function main() {
  const catalog = await fetchShopifyCatalog();
  const products = catalog.normalized.products;
  const variants = catalog.normalized.variants;
  const summary = buildSummary(products, variants);
  const recommendation = buildRecommendation(summary);

  const report = {
    generated_at: catalog.fetched_at,
    store_domain: catalog.config.store_domain,
    api_version: catalog.config.api_version,
    summary,
    recommendation,
  };

  const outDir = path.resolve(__dirname, '..', '..', 'docs', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'shopify_dry_run_report.json');
  const mdPath = path.join(outDir, 'SHOPIFY_PHASE2_DRY_RUN_SUMMARY.md');

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(mdPath, buildMarkdown(report), 'utf8');

  console.log('Shopify dry-run completed.');
  console.log(`Products fetched: ${summary.counts.total_products_fetched}`);
  console.log(`Variants fetched: ${summary.counts.total_variants_fetched}`);
  console.log(`Duplicate barcodes: ${summary.conflicts.duplicate_barcodes.length}`);
  console.log(`Duplicate SKUs: ${summary.conflicts.duplicate_skus.length}`);
  console.log(`JSON report: ${jsonPath}`);
  console.log(`Markdown summary: ${mdPath}`);
}

main().catch((error) => {
  console.error('Shopify dry-run failed.');
  console.error(error.stack || String(error));
  process.exit(1);
});
