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
  if (!lines.length) return [];
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
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function actionWeight(action) {
  if (action === 'replace barcode on this variant') return 1;
  if (action === 'manual business review needed') return 2;
  if (action === 'remove barcode temporarily') return 3;
  if (action === 'keep barcode on this variant') return 4;
  return 9;
}

function priorityWeight(priority) {
  if (priority === 'high') return 1;
  if (priority === 'medium') return 2;
  return 3;
}

function buildQueue(rows) {
  const byBarcode = new Map();
  for (const row of rows) {
    const key = row.barcode || '';
    const arr = byBarcode.get(key) || [];
    arr.push(row);
    byBarcode.set(key, arr);
  }

  const groups = [...byBarcode.entries()].map(([barcode, groupRows]) => {
    const groupSize = Number(groupRows[0]?.number_of_affected_variants || groupRows.length);
    const highCount = groupRows.filter((r) => r.priority === 'high').length;
    const criticalCount = groupRows.filter((r) =>
      ['replace barcode on this variant', 'manual business review needed'].includes(r.recommended_action)
    ).length;
    return { barcode, groupRows, groupSize, highCount, criticalCount };
  });

  groups.sort((a, b) => {
    if (b.highCount !== a.highCount) return b.highCount - a.highCount;
    if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount;
    if (b.groupSize !== a.groupSize) return b.groupSize - a.groupSize;
    return a.barcode.localeCompare(b.barcode);
  });

  const queue = [];
  let order = 1;
  for (const group of groups) {
    const sortedRows = [...group.groupRows].sort((a, b) => {
      const pa = priorityWeight(a.priority);
      const pb = priorityWeight(b.priority);
      if (pa !== pb) return pa - pb;
      const aa = actionWeight(a.recommended_action);
      const ab = actionWeight(b.recommended_action);
      if (aa !== ab) return aa - ab;
      return (a.shopify_variant_id || '').localeCompare(b.shopify_variant_id || '');
    });

    for (const row of sortedRows) {
      queue.push({
        execution_order: order,
        batch: Math.ceil(order / 50),
        barcode: row.barcode,
        number_of_affected_variants: row.number_of_affected_variants,
        product_title: row.product_title,
        variant_title: row.variant_title,
        sku: row.sku,
        shopify_product_id: row.shopify_product_id,
        shopify_variant_id: row.shopify_variant_id,
        status: row.status,
        inventory_item_id: row.inventory_item_id,
        recommended_action: row.recommended_action,
        priority: row.priority,
        review_reason: row.review_reason,
      });
      order += 1;
    }
  }
  return { groups, queue };
}

function queueCsv(queue) {
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
  for (const row of queue) {
    lines.push(headers.map((h) => csvValue(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

function queueMarkdown(groups, queue) {
  const total = queue.length;
  const high = queue.filter((r) => r.priority === 'high').length;
  const medium = queue.filter((r) => r.priority === 'medium').length;
  const low = queue.filter((r) => r.priority === 'low').length;
  const batches = Math.ceil(total / 50);

  const topGroups = groups
    .slice(0, 20)
    .map((g) => `- \`${g.barcode}\` | variants: ${g.groupSize} | high: ${g.highCount} | critical actions: ${g.criticalCount}`)
    .join('\n');

  const firstBatch = queue
    .slice(0, 25)
    .map(
      (r) =>
        `- #${r.execution_order} [${r.priority}] ${r.recommended_action} | ${r.product_title} | ${r.variant_title} | barcode \`${r.barcode}\` | variant \`${r.shopify_variant_id}\``
    )
    .join('\n');

  return `# Shopify Barcode Cleanup Execution Order (Phase 2.6b)

## Summary

- Total queued variant actions: **${total}**
- High priority actions: **${high}**
- Medium priority actions: **${medium}**
- Low priority actions: **${low}**
- Planned batches (50 actions/batch): **${batches}**

## Prioritization Logic

- Sort groups by active impact first.
- Within each group, run high-priority rows first.
- Execute \`replace barcode on this variant\` and \`manual business review needed\` before lower impact actions.

## Top Groups To Start With

${topGroups || '- None'}

## First Batch Preview (Top 25)

${firstBatch || '- None'}

## Output

- Full execution queue CSV: \`docs/reports/shopify_barcode_cleanup_execution_queue.csv\`
`;
}

function main() {
  const root = path.resolve(__dirname, '..', '..');
  const input = path.join(root, 'docs', 'reports', 'shopify_barcode_cleanup_actions.csv');
  if (!fs.existsSync(input)) {
    throw new Error('Missing cleanup actions CSV. Run barcode cleanup plan first.');
  }

  const rows = parseCsv(fs.readFileSync(input, 'utf8'));
  const { groups, queue } = buildQueue(rows);

  const outCsv = path.join(root, 'docs', 'reports', 'shopify_barcode_cleanup_execution_queue.csv');
  const outMd = path.join(root, 'docs', 'reports', 'SHOPIFY_BARCODE_CLEANUP_EXECUTION_ORDER.md');
  fs.writeFileSync(outCsv, queueCsv(queue), 'utf8');
  fs.writeFileSync(outMd, queueMarkdown(groups, queue), 'utf8');

  console.log('Barcode cleanup execution queue generated.');
  console.log(`Rows queued: ${queue.length}`);
  console.log(`CSV: ${outCsv}`);
  console.log(`Markdown: ${outMd}`);
}

try {
  main();
} catch (error) {
  console.error(error.stack || String(error));
  process.exit(1);
}
