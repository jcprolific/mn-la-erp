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

function makeWorksheet(rows) {
  const body = rows
    .map((row) => {
      return [
        `### #${row.execution_order} ${row.product_title}`,
        `- Variant: ${row.variant_title}`,
        `- Barcode: \`${row.barcode}\``,
        `- SKU: \`${row.sku}\``,
        `- Recommended action: **${row.recommended_action}**`,
        `- [ ] completed`,
        `- [ ] needs review`,
        '',
      ].join('\n');
    })
    .join('\n');

  return `# Shopify Batch 1 Worksheet

## Batch 1 progress

0 / 50 completed

## Operator checklist

${body}`;
}

function printConsoleView(rows) {
  console.log('Batch 1 Operator Console View');
  console.log(
    'execution_order | barcode | product_title | variant_title | sku | recommended_action'
  );
  for (const row of rows) {
    console.log(
      `${row.execution_order} | ${row.barcode} | ${row.product_title} | ${row.variant_title} | ${row.sku} | ${row.recommended_action}`
    );
  }
}

function main() {
  const root = path.resolve(__dirname, '..', '..');
  const csvPath = path.join(root, 'docs', 'reports', 'shopify_barcode_cleanup_execution_queue.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Missing queue file: ${csvPath}`);
  }

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'))
    .filter((row) => String(row.batch) === '1')
    .sort((a, b) => Number(a.execution_order) - Number(b.execution_order));

  const worksheetPath = path.join(root, 'docs', 'reports', 'SHOPIFY_BATCH1_WORKSHEET.md');
  fs.writeFileSync(worksheetPath, makeWorksheet(rows), 'utf8');

  printConsoleView(rows);
  console.log(`Worksheet written: ${worksheetPath}`);
}

try {
  main();
} catch (error) {
  console.error(error.stack || String(error));
  process.exit(1);
}
