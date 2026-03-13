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
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
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

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function parseArgs(argv) {
  const args = {
    batch: null,
    queuePath: path.resolve(__dirname, '..', '..', 'docs', 'reports', 'shopify_barcode_cleanup_execution_queue.csv'),
    outPath: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--batch' && argv[i + 1]) {
      args.batch = Number.parseInt(argv[i + 1], 10);
      i += 1;
    } else if (token === '--queue' && argv[i + 1]) {
      args.queuePath = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if (token === '--out' && argv[i + 1]) {
      args.outPath = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

function buildOutPath(batch, explicitPath) {
  if (explicitPath) return explicitPath;
  return path.resolve(
    __dirname,
    '..',
    '..',
    'docs',
    'reports',
    `shopify_replacement_map_batch${batch}.csv`
  );
}

function main() {
  const args = parseArgs(process.argv);
  if (!Number.isInteger(args.batch) || args.batch < 1) {
    throw new Error('Batch number required. Use --batch <number>.');
  }
  if (!fs.existsSync(args.queuePath)) {
    throw new Error(`Queue CSV not found: ${args.queuePath}`);
  }

  const rows = readCsv(args.queuePath)
    .filter((row) => Number.parseInt(row.batch, 10) === args.batch)
    .filter((row) => String(row.recommended_action || '').toLowerCase() === 'replace barcode on this variant');

  const outPath = buildOutPath(args.batch, args.outPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const headers = [
    'shopify_variant_id',
    'sku',
    'product_title',
    'variant_title',
    'current_barcode',
    'new_barcode',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.shopify_variant_id || '',
        row.sku || '',
        row.product_title || '',
        row.variant_title || '',
        row.barcode || '',
        '',
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');

  console.log('Replacement map template generated.');
  console.log(`Batch: ${args.batch}`);
  console.log(`Rows needing replacement barcodes: ${rows.length}`);
  console.log(`Output: ${outPath}`);
}

try {
  main();
} catch (error) {
  console.error(error.stack || String(error));
  process.exit(1);
}
