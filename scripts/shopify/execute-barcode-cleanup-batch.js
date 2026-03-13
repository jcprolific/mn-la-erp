const fs = require('node:fs');
const path = require('node:path');
const {
  readShopifyConfig,
  shopifyGraphQLRequest,
} = require('./fetch-shopify-catalog');

const UPDATE_VARIANT_MUTATION = `
mutation UpdateProductVariantBarcode($input: ProductVariantInput!) {
  productVariantUpdate(input: $input) {
    productVariant { id barcode sku title }
    userErrors { field message }
  }
}`;

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

function parseArgs(argv) {
  const args = {
    batch: null,
    apply: false,
    replacementMapPath: null,
    queuePath: path.resolve(__dirname, '..', '..', 'docs', 'reports', 'shopify_barcode_cleanup_execution_queue.csv'),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--batch' && argv[i + 1]) {
      args.batch = Number.parseInt(argv[i + 1], 10);
      i += 1;
    } else if (token === '--apply') {
      args.apply = true;
    } else if (token === '--replacement-map' && argv[i + 1]) {
      args.replacementMapPath = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if (token === '--queue' && argv[i + 1]) {
      args.queuePath = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

function readReplacementMap(replacementMapPath) {
  if (!replacementMapPath) return new Map();
  if (!fs.existsSync(replacementMapPath)) {
    throw new Error(`Replacement map not found: ${replacementMapPath}`);
  }
  const rows = readCsv(replacementMapPath);
  const map = new Map();
  for (const row of rows) {
    const variantId = String(row.shopify_variant_id || '').trim();
    const newBarcode = String(row.new_barcode || '').trim();
    if (!variantId || !newBarcode) continue;
    map.set(variantId, newBarcode);
  }
  return map;
}

async function updateVariantBarcode(endpoint, token, variantId, barcodeOrNull) {
  const data = await shopifyGraphQLRequest({
    endpoint,
    token,
    query: UPDATE_VARIANT_MUTATION,
    variables: { input: { id: variantId, barcode: barcodeOrNull } },
  });
  const payload = data && data.productVariantUpdate ? data.productVariantUpdate : {};
  const errors = payload.userErrors || [];
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join('; '));
  }
  return payload.productVariant || null;
}

function decideAction(row, replacementMap) {
  const action = String(row.recommended_action || '').toLowerCase().trim();
  if (action === 'keep barcode on this variant') {
    return { type: 'skip', reason: 'keeper_row' };
  }
  if (action === 'remove barcode temporarily') {
    return { type: 'update', barcode: null, reason: 'remove_temporary' };
  }
  if (action === 'replace barcode on this variant') {
    const replacement = replacementMap.get(row.shopify_variant_id);
    if (!replacement) {
      return { type: 'skip', reason: 'missing_replacement_barcode' };
    }
    return { type: 'update', barcode: replacement, reason: 'replace_with_map' };
  }
  return { type: 'skip', reason: 'unknown_action' };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!Number.isInteger(args.batch) || args.batch < 1) {
    throw new Error('Batch number required. Use --batch <number>.');
  }
  if (!fs.existsSync(args.queuePath)) {
    throw new Error(`Queue CSV not found: ${args.queuePath}`);
  }

  const cfg = readShopifyConfig();
  const endpoint = `https://${cfg.storeDomain}/admin/api/${cfg.apiVersion}/graphql.json`;
  const replacementMap = readReplacementMap(args.replacementMapPath);
  const queueRows = readCsv(args.queuePath).filter((row) => Number.parseInt(row.batch, 10) === args.batch);

  const startedAt = new Date().toISOString();
  const results = [];

  for (const row of queueRows) {
    const decision = decideAction(row, replacementMap);
    const item = {
      execution_order: row.execution_order,
      shopify_variant_id: row.shopify_variant_id,
      sku: row.sku,
      product_title: row.product_title,
      variant_title: row.variant_title,
      source_barcode: row.barcode,
      priority: row.priority,
      recommended_action: row.recommended_action,
      decided_action: decision.type,
      decision_reason: decision.reason,
      status: 'skipped',
      applied_barcode: null,
      error: null,
    };

    if (decision.type !== 'update') {
      results.push(item);
      continue;
    }

    item.applied_barcode = decision.barcode;
    if (!args.apply) {
      item.status = 'dry_run';
      results.push(item);
      continue;
    }

    try {
      await updateVariantBarcode(endpoint, cfg.adminAccessToken, row.shopify_variant_id, decision.barcode);
      item.status = 'applied';
    } catch (error) {
      item.status = 'failed';
      item.error = error.message;
    }
    results.push(item);
  }

  const summary = {
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    dry_run: !args.apply,
    batch: args.batch,
    queue_path: args.queuePath,
    replacement_map_path: args.replacementMapPath || null,
    total_rows: results.length,
    applied: results.filter((r) => r.status === 'applied').length,
    dry_run_updates: results.filter((r) => r.status === 'dry_run').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
  };

  const outDir = path.resolve(__dirname, '..', '..', 'docs', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outJson = path.join(outDir, `shopify_cleanup_batch_${args.batch}_execution.json`);
  fs.writeFileSync(outJson, JSON.stringify({ summary, results }, null, 2), 'utf8');

  console.log('Shopify barcode cleanup batch execution complete.');
  console.log(`Batch: ${args.batch}`);
  console.log(`Dry run: ${summary.dry_run ? 'yes' : 'no'}`);
  console.log(`Applied: ${summary.applied}`);
  console.log(`Dry-run updates: ${summary.dry_run_updates}`);
  console.log(`Skipped: ${summary.skipped}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Report: ${outJson}`);
}

main().catch((error) => {
  console.error('Failed to execute cleanup batch.');
  console.error(error.stack || String(error));
  process.exit(1);
});
