const fs = require('node:fs');
const path = require('node:path');
const { fetchShopifyCatalog } = require('./fetch-shopify-catalog');

function countBy(list, key) {
  const map = new Map();
  for (const row of list) {
    const value = row[key];
    if (!value) continue;
    map.set(value, (map.get(value) || 0) + 1);
  }
  return map;
}

function topDuplicates(map, limit) {
  return [...map.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function toMarkdown(report) {
  const duplicateBarcodes = report.metrics.duplicate_barcodes_top;
  const duplicateSkus = report.metrics.duplicate_skus_top;
  const barcodeList = duplicateBarcodes.length
    ? duplicateBarcodes.map((d) => `- \`${d.value}\`: ${d.count} variants`).join('\n')
    : '- None';
  const skuList = duplicateSkus.length
    ? duplicateSkus.map((d) => `- \`${d.value}\`: ${d.count} variants`).join('\n')
    : '- None';

  return `# Shopify Catalog Health Check

Generated at: \`${report.generated_at}\`
Store domain: \`${report.store_domain}\`
API version: \`${report.api_version}\`

## Metrics

- Total products: **${report.metrics.total_products}**
- Total variants: **${report.metrics.total_variants}**
- Active variants: **${report.metrics.active_variants}**
- Variants with barcode: **${report.metrics.variants_with_barcode}**
- Variants without barcode: **${report.metrics.variants_without_barcode}**
- Duplicate barcode groups: **${report.metrics.duplicate_barcode_groups}**
- Duplicate SKU groups: **${report.metrics.duplicate_sku_groups}**

## Top Duplicate Barcodes

${barcodeList}

## Top Duplicate SKUs

${skuList}
`;
}

async function main() {
  const catalog = await fetchShopifyCatalog();
  const products = catalog.normalized.products;
  const variants = catalog.normalized.variants;
  const activeVariants = variants.filter((v) => (v.parent_status || '').toLowerCase() !== 'archived');

  const barcodeCounts = countBy(activeVariants, 'barcode');
  const skuCounts = countBy(activeVariants, 'sku');
  const duplicateBarcodeGroups = [...barcodeCounts.values()].filter((n) => n > 1).length;
  const duplicateSkuGroups = [...skuCounts.values()].filter((n) => n > 1).length;

  const report = {
    generated_at: new Date().toISOString(),
    source_fetched_at: catalog.fetched_at,
    store_domain: catalog.config.store_domain,
    api_version: catalog.config.api_version,
    metrics: {
      total_products: products.length,
      total_variants: variants.length,
      active_variants: activeVariants.length,
      variants_with_barcode: activeVariants.filter((v) => !!v.barcode).length,
      variants_without_barcode: activeVariants.filter((v) => !v.barcode).length,
      duplicate_barcode_groups: duplicateBarcodeGroups,
      duplicate_sku_groups: duplicateSkuGroups,
      duplicate_barcodes_top: topDuplicates(barcodeCounts, 25),
      duplicate_skus_top: topDuplicates(skuCounts, 25),
    },
  };

  const outDir = path.resolve(__dirname, '..', '..', 'docs', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'shopify_catalog_health_report.json');
  const mdPath = path.join(outDir, 'SHOPIFY_CATALOG_HEALTH_REPORT.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(mdPath, toMarkdown(report), 'utf8');

  console.log('Shopify catalog health check complete.');
  console.log(`Duplicate barcode groups: ${duplicateBarcodeGroups}`);
  console.log(`Duplicate SKU groups: ${duplicateSkuGroups}`);
  console.log(`JSON report: ${jsonPath}`);
  console.log(`Markdown report: ${mdPath}`);

  if (duplicateBarcodeGroups > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error('Shopify catalog health check failed.');
  console.error(error.stack || String(error));
  process.exit(1);
});
