const fs = require('node:fs');
const path = require('node:path');
const { fetchShopifyCatalog } = require('./fetch-shopify-catalog');

function toMarkdown(barcode, rows, meta) {
  const list =
    rows.length === 0
      ? 'No variants found with this barcode.'
      : rows
          .map((row, idx) => {
            return [
              `### ${idx + 1}. ${row.product_title || '(missing product title)'}`,
              `- Variant title: ${row.variant_title || ''}`,
              `- SKU: \`${row.sku || ''}\``,
              `- Barcode: \`${row.barcode || ''}\``,
              `- Shopify product id: \`${row.shopify_product_id || ''}\``,
              `- Shopify variant id: \`${row.shopify_variant_id || ''}\``,
              `- Status: \`${row.status || ''}\``,
            ].join('\n');
          })
          .join('\n\n');

  return `# Verify Barcode ${barcode}

Generated at: \`${meta.generated_at}\`
Store domain: \`${meta.store_domain}\`
API version: \`${meta.api_version}\`

## Summary

- Barcode checked: **${barcode}**
- Matching variants found: **${rows.length}**

## Matching Variants

${list}
`;
}

async function main() {
  const barcode = process.argv[2] ? String(process.argv[2]).trim() : '144803';
  if (!barcode) throw new Error('Barcode is required.');

  const catalog = await fetchShopifyCatalog();
  const rows = catalog.normalized.variants
    .filter((variant) => (variant.barcode || '') === barcode)
    .map((variant) => ({
      product_title: variant.parent_title,
      variant_title: variant.title,
      sku: variant.sku,
      barcode: variant.barcode,
      shopify_product_id: variant.shopify_product_id,
      shopify_variant_id: variant.shopify_variant_id,
      status: variant.parent_status,
    }));

  const reportPath = path.resolve(
    __dirname,
    '..',
    '..',
    'docs',
    'reports',
    `VERIFY_BARCODE_${barcode}.md`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    toMarkdown(barcode, rows, {
      generated_at: catalog.fetched_at,
      store_domain: catalog.config.store_domain,
      api_version: catalog.config.api_version,
    }),
    'utf8'
  );

  console.log(`Barcode verification summary: ${barcode}`);
  console.log(`Matching variants: ${rows.length}`);
  for (const row of rows) {
    console.log(
      `${row.product_title} | ${row.variant_title} | ${row.sku || ''} | ${row.barcode || ''} | ${row.shopify_product_id} | ${row.shopify_variant_id} | ${row.status || ''}`
    );
  }
  console.log(`Markdown report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
