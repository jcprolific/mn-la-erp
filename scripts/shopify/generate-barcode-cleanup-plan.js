const fs = require('node:fs');
const path = require('node:path');

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
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

function csvValue(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function hasLegacyIndicator(row) {
  const text = `${row.product_title || ''} ${row.variant_title || ''} ${row.sku || ''}`.toLowerCase();
  return ['legacy', 'sample', 'test', 'deprecated', 'old', 'non-sellable'].some((word) =>
    text.includes(word)
  );
}

function chooseKeeper(rows) {
  function score(row) {
    let s = 0;
    const status = (row.status || '').toLowerCase();
    if (status === 'active') s += 30;
    if (status === 'draft') s += 10;
    if ((row.sku || '').trim()) s += 3;
    if ((row.inventory_item_id || '').trim()) s += 2;
    return s;
  }
  return rows
    .map((row) => ({ row, score: score(row) }))
    .sort((a, b) => b.score - a.score || String(a.row.shopify_variant_id).localeCompare(String(b.row.shopify_variant_id)))[0]
    .row;
}

function getPriority(row) {
  const status = (row.status || '').toLowerCase();
  if (status === 'active') return 'high';
  if (status === 'draft' || status === 'archived') return 'medium';
  if (hasLegacyIndicator(row)) return 'low';
  return 'low';
}

function recommendAction(row, groupRows, keeper) {
  const status = (row.status || '').toLowerCase();
  const activeRows = groupRows.filter((r) => (r.status || '').toLowerCase() === 'active');

  if (row.shopify_variant_id === keeper.shopify_variant_id) {
    if (activeRows.length === 0) {
      return {
        recommended_action: 'manual business review needed',
        review_reason: 'No active variant in group; choose canonical keeper by business decision.',
      };
    }
    if (activeRows.length > 1) {
      return {
        recommended_action: 'keep barcode on this variant',
        review_reason: 'Selected as temporary keeper; other active variants must be reassigned unique barcodes.',
      };
    }
    return {
      recommended_action: 'keep barcode on this variant',
      review_reason: 'Only active variant in duplicate group.',
    };
  }

  if (status === 'active') {
    return {
      recommended_action: 'replace barcode on this variant',
      review_reason: 'Active variant conflicts with another active/keeper barcode and must be unique.',
    };
  }

  if (status === 'draft' || status === 'archived') {
    return {
      recommended_action: 'remove barcode temporarily',
      review_reason: 'Non-active variant duplicates barcode; remove until unique barcode is assigned.',
    };
  }

  return {
    recommended_action: 'manual business review needed',
    review_reason: 'Unexpected status/non-sellable case requires manual verification.',
  };
}

function buildPlan(rows) {
  const byBarcode = new Map();
  for (const row of rows) {
    const barcode = row.barcode || '';
    const list = byBarcode.get(barcode) || [];
    list.push(row);
    byBarcode.set(barcode, list);
  }

  const groups = [...byBarcode.entries()]
    .map(([barcode, groupRows]) => ({
      barcode,
      rows: groupRows,
      count: groupRows.length,
      activeCount: groupRows.filter((r) => (r.status || '').toLowerCase() === 'active').length,
    }))
    .sort((a, b) => b.count - a.count || a.barcode.localeCompare(b.barcode));

  const planRows = [];
  for (const group of groups) {
    const keeper = chooseKeeper(group.rows);
    for (const row of group.rows) {
      const action = recommendAction(row, group.rows, keeper);
      planRows.push({
        barcode: row.barcode || '',
        number_of_affected_variants: String(group.count),
        product_title: row.product_title || '',
        variant_title: row.variant_title || '',
        sku: row.sku || '',
        shopify_product_id: row.shopify_product_id || '',
        shopify_variant_id: row.shopify_variant_id || '',
        status: row.status || '',
        inventory_item_id: row.inventory_item_id || '',
        recommended_action: action.recommended_action,
        priority: getPriority(row),
        review_reason: action.review_reason,
      });
    }
  }
  return { groups, planRows };
}

function toMarkdown(groups, planRows) {
  const totalGroups = groups.length;
  const totalAffectedVariants = planRows.length;
  const totalAffectedActive = planRows.filter((r) => r.priority === 'high').length;

  const topPriorityGroups = groups
    .filter((g) => g.activeCount > 0)
    .sort((a, b) => b.activeCount - a.activeCount || b.count - a.count || a.barcode.localeCompare(b.barcode))
    .slice(0, 20)
    .map((g) => `- \`${g.barcode}\`: ${g.count} variants (${g.activeCount} active)`)
    .join('\n');

  const details = groups
    .map((group) => {
      const rows = planRows
        .filter((row) => row.barcode === group.barcode)
        .map(
          (row) =>
            `- ${row.product_title} | ${row.variant_title} | SKU: \`${row.sku}\` | Product: \`${row.shopify_product_id}\` | Variant: \`${row.shopify_variant_id}\` | Status: \`${row.status}\` | Inventory Item: \`${row.inventory_item_id}\` | Action: **${row.recommended_action}** | Priority: **${row.priority}** | Reason: ${row.review_reason}`
        )
        .join('\n');
      return `### Barcode \`${group.barcode}\` (${group.count} variants)\n\n${rows}`;
    })
    .join('\n\n');

  return `# Shopify Barcode Cleanup Plan (Phase 2.6)

## Summary

- Total duplicate barcode groups: **${totalGroups}**
- Total affected variants: **${totalAffectedVariants}**
- Total affected active variants: **${totalAffectedActive}**
- Phase 3 import safe now: **${totalGroups === 0 ? 'Yes' : 'No'}**

## Top Priority Groups To Fix First

${topPriorityGroups || '- None'}

## Grouped Cleanup Actions

${details}
`;
}

function toCsv(planRows) {
  const headers = [
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
  for (const row of planRows) {
    lines.push(headers.map((h) => csvValue(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

function main() {
  const root = path.resolve(__dirname, '..', '..');
  const inputPath = path.join(root, 'docs', 'reports', 'shopify_duplicate_barcode_conflicts.csv');
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input missing: ${inputPath}. Run barcode conflict report first.`);
  }

  const rows = parseCsv(fs.readFileSync(inputPath, 'utf8'));
  const { groups, planRows } = buildPlan(rows);

  const outMd = path.join(root, 'docs', 'reports', 'SHOPIFY_BARCODE_CLEANUP_PLAN.md');
  const outCsv = path.join(root, 'docs', 'reports', 'shopify_barcode_cleanup_actions.csv');
  fs.writeFileSync(outMd, toMarkdown(groups, planRows), 'utf8');
  fs.writeFileSync(outCsv, toCsv(planRows), 'utf8');

  const activeCount = planRows.filter((r) => r.priority === 'high').length;
  console.log('Shopify barcode cleanup plan generated.');
  console.log(`Duplicate barcode groups: ${groups.length}`);
  console.log(`Affected variants: ${planRows.length}`);
  console.log(`Affected active variants: ${activeCount}`);
  console.log(`Markdown plan: ${outMd}`);
  console.log(`CSV actions: ${outCsv}`);
}

try {
  main();
} catch (error) {
  console.error('Failed to build Shopify barcode cleanup plan.');
  console.error(error.stack || String(error));
  process.exit(1);
}
