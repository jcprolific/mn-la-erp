const fs = require('node:fs');
const path = require('node:path');
const { fetchShopifyCatalog } = require('./fetch-shopify-catalog');

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildDuplicateBarcodeGroups(variants) {
  const map = new Map();
  for (const variant of variants) {
    if (!variant.barcode) continue;
    const list = map.get(variant.barcode) || [];
    list.push(variant);
    map.set(variant.barcode, list);
  }
  return [...map.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([barcode, rows]) => ({ barcode, rows, count: rows.length }))
    .sort((a, b) => b.count - a.count || a.barcode.localeCompare(b.barcode));
}

function createMarkdown(groups, meta) {
  const top = groups.slice(0, 20);
  const topText =
    top.length === 0
      ? '- None'
      : top.map((g) => `- \`${g.barcode}\`: ${g.count} variants`).join('\n');

  const details =
    groups.length === 0
      ? 'No duplicate barcodes found.'
      : groups
          .map((group) => {
            const rows = group.rows
              .map(
                (v) =>
                  `- ${v.parent_title || '(missing product title)'} | ${v.title || '(missing variant title)'} | SKU: \`${v.sku || ''}\` | Product: \`${v.shopify_product_id}\` | Variant: \`${v.shopify_variant_id}\` | Status: \`${v.parent_status || ''}\` | Inventory Item: \`${v.inventory_item_id || ''}\``
              )
              .join('\n');
            return `### Barcode \`${group.barcode}\` (${group.count} variants)\n\n${rows}`;
          })
          .join('\n\n');

  return `# Shopify Duplicate Barcode Conflicts

Generated at: \`${meta.generated_at}\`
Store domain: \`${meta.store_domain}\`
API version: \`${meta.api_version}\`

## Summary

- Total duplicate barcode groups: **${meta.total_groups}**
- Total affected variants: **${meta.total_affected_variants}**

## Top Worst Duplicate Barcode Groups

${topText}

## Grouped Conflict Details

${details}
`;
}

function createCsv(groups) {
  const header = [
    'barcode',
    'product_title',
    'variant_title',
    'sku',
    'shopify_product_id',
    'shopify_variant_id',
    'status',
    'inventory_item_id',
  ];
  const lines = [header.join(',')];

  for (const group of groups) {
    for (const row of group.rows) {
      lines.push(
        [
          csvEscape(group.barcode),
          csvEscape(row.parent_title),
          csvEscape(row.title),
          csvEscape(row.sku),
          csvEscape(row.shopify_product_id),
          csvEscape(row.shopify_variant_id),
          csvEscape(row.parent_status),
          csvEscape(row.inventory_item_id),
        ].join(',')
      );
    }
  }

  return lines.join('\n') + '\n';
}

async function main() {
  const catalog = await fetchShopifyCatalog();
  const variants = catalog.normalized.variants;
  const groups = buildDuplicateBarcodeGroups(variants);

  const meta = {
    generated_at: catalog.fetched_at,
    store_domain: catalog.config.store_domain,
    api_version: catalog.config.api_version,
    total_groups: groups.length,
    total_affected_variants: groups.reduce((sum, g) => sum + g.count, 0),
  };

  const outDir = path.resolve(__dirname, '..', '..', 'docs', 'reports');
  fs.mkdirSync(outDir, { recursive: true });

  const mdPath = path.join(outDir, 'SHOPIFY_DUPLICATE_BARCODE_CONFLICTS.md');
  const csvPath = path.join(outDir, 'shopify_duplicate_barcode_conflicts.csv');

  fs.writeFileSync(mdPath, createMarkdown(groups, meta), 'utf8');
  fs.writeFileSync(csvPath, createCsv(groups), 'utf8');

  console.log('Duplicate barcode conflict report generated.');
  console.log(`Duplicate barcode groups: ${meta.total_groups}`);
  console.log(`Affected variants: ${meta.total_affected_variants}`);
  console.log(`Markdown report: ${mdPath}`);
  console.log(`CSV report: ${csvPath}`);
}

main().catch((error) => {
  console.error('Failed to generate duplicate barcode conflict report.');
  console.error(error.stack || String(error));
  process.exit(1);
});
