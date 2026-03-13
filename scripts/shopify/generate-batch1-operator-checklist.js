const fs = require('node:fs');
const path = require('node:path');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || '';
    });
    return row;
  });
}

function csvValue(v) {
  const s = v == null ? '' : String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  const headers = [
    'execution_order',
    'batch',
    'barcode',
    'number_of_affected_variants',
    'product_title',
    'variant_title',
    'sku',
    'shopify_product_id',
    'shopify_variant_id',
    'status',
    'inventory_item_id',
    'recommended_action',
    'priority',
    'review_reason',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvValue(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

function toChecklistMarkdown(rows) {
  const high = rows.filter((r) => r.priority === 'high').length;
  const medium = rows.filter((r) => r.priority === 'medium').length;
  const actionCounts = rows.reduce((acc, row) => {
    acc[row.recommended_action] = (acc[row.recommended_action] || 0) + 1;
    return acc;
  }, {});

  const byBarcode = rows.reduce((acc, row) => {
    acc[row.barcode] = acc[row.barcode] || [];
    acc[row.barcode].push(row);
    return acc;
  }, {});

  const grouped = Object.keys(byBarcode)
    .sort()
    .map((barcode) => {
      const groupRows = byBarcode[barcode].sort((a, b) => Number(a.execution_order) - Number(b.execution_order));
      const body = groupRows
        .map((row) => {
          return `- [ ] #${row.execution_order} | ${row.recommended_action} | ${row.product_title} | ${row.variant_title} | SKU: \`${row.sku}\` | Product: \`${row.shopify_product_id}\` | Variant: \`${row.shopify_variant_id}\` | Status: \`${row.status}\``;
        })
        .join('\n');
      return `### Barcode \`${barcode}\` (${groupRows.length} rows)\n\n${body}`;
    })
    .join('\n\n');

  return `# Shopify Barcode Cleanup Batch 1 Operator Checklist

## Scope

- Batch: **1**
- Total rows: **${rows.length}**
- High priority: **${high}**
- Medium priority: **${medium}**

## Action Mix

- keep barcode on this variant: **${actionCounts['keep barcode on this variant'] || 0}**
- replace barcode on this variant: **${actionCounts['replace barcode on this variant'] || 0}**
- remove barcode temporarily: **${actionCounts['remove barcode temporarily'] || 0}**
- manual business review needed: **${actionCounts['manual business review needed'] || 0}**

## Operator Steps (Shopify Admin)

1. Open each variant using Product + Variant IDs.
2. Apply the exact \`recommended_action\`.
3. If action is \`replace barcode on this variant\`, assign a unique barcode not used by any other active variant.
4. If action is \`remove barcode temporarily\`, clear barcode and save.
5. If action is \`manual business review needed\`, stop and escalate to merch/inventory owner.
6. After completing all rows, re-run:
   - \`npm run shopify:barcode-conflicts\`
   - \`npm run shopify:barcode-cleanup-plan\`
   - \`npm run shopify:barcode-cleanup-queue\`

## Batch 1 Checklist

${grouped}
`;
}

function main() {
  const root = path.resolve(__dirname, '..', '..');
  const queuePath = path.join(root, 'docs', 'reports', 'shopify_barcode_cleanup_execution_queue.csv');
  if (!fs.existsSync(queuePath)) {
    throw new Error('Missing execution queue CSV. Run shopify:barcode-cleanup-queue first.');
  }

  const allRows = parseCsv(fs.readFileSync(queuePath, 'utf8'));
  const batch1Rows = allRows.filter((r) => String(r.batch) === '1');

  const mdPath = path.join(root, 'docs', 'reports', 'SHOPIFY_BARCODE_CLEANUP_BATCH1_OPERATOR_CHECKLIST.md');
  const csvPath = path.join(root, 'docs', 'reports', 'shopify_barcode_cleanup_batch1_actions.csv');

  fs.writeFileSync(mdPath, toChecklistMarkdown(batch1Rows), 'utf8');
  fs.writeFileSync(csvPath, toCsv(batch1Rows), 'utf8');

  console.log('Batch 1 operator checklist generated.');
  console.log(`Rows in batch 1: ${batch1Rows.length}`);
  console.log(`Markdown: ${mdPath}`);
  console.log(`CSV: ${csvPath}`);
}

try {
  main();
} catch (e) {
  console.error(e.stack || String(e));
  process.exit(1);
}
