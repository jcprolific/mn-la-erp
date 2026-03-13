const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function readSupabaseClientConstants() {
  try {
    const root = path.resolve(__dirname, '..', '..');
    const src = fs.readFileSync(path.join(root, 'supabase-client.js'), 'utf8');
    const urlMatch = src.match(/const\s+SUPABASE_URL\s*=\s*'([^']+)'/);
    const keyMatch = src.match(/const\s+SUPABASE_KEY\s*=\s*'([^']+)'/);
    return { url: urlMatch ? urlMatch[1] : null, key: keyMatch ? keyMatch[1] : null };
  } catch (_) {
    return { url: null, key: null };
  }
}

function readSupabaseConfig() {
  const root = path.resolve(__dirname, '..', '..');
  const envPrimary = parseEnvFile(path.join(root, 'supabase', '.env'));
  const envFallback = parseEnvFile(path.join(root, 'supabase', 'mn+la.env'));
  const env = { ...envFallback, ...envPrimary, ...process.env };
  const clientCfg = readSupabaseClientConstants();

  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || clientCfg.url;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SERVICE_ROLE_KEY ||
    env.SUPABASE_SECRET_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    clientCfg.key;

  if (!url || !key) {
    throw new Error('Missing Supabase config. Need SUPABASE_URL and service role key.');
  }
  return { url, key };
}

function parseArgs(argv) {
  const args = { runId: null, output: null };
  for (let i = 2; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--run-id' && argv[i + 1]) {
      args.runId = argv[i + 1].trim();
      i += 1;
    } else if (t === '--output' && argv[i + 1]) {
      args.output = argv[i + 1].trim();
      i += 1;
    }
  }
  return args;
}

async function fetchLatestRun(db) {
  const { data, error } = await db
    .from('shopify_catalog_cutover_runs')
    .select('id,status,started_at,completed_at,pre_products_count,post_products_count,pre_inventory_count,post_inventory_count,pre_inventory_movements_count,post_inventory_movements_count,error_message')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function fetchRunById(db, runId) {
  const { data, error } = await db
    .from('shopify_catalog_cutover_runs')
    .select('id,status,started_at,completed_at,pre_products_count,post_products_count,pre_inventory_count,post_inventory_count,pre_inventory_movements_count,post_inventory_movements_count,error_message')
    .eq('id', runId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function scalarCount(db, table, filterNullProduct = false) {
  let q = db.from(table).select('*', { head: true, count: 'exact' });
  if (filterNullProduct) q = q.not('product_id', 'is', null);
  const { count, error } = await q;
  if (error) throw error;
  return Number(count || 0);
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = readSupabaseConfig();
  const db = createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const run = args.runId ? await fetchRunById(db, args.runId) : await fetchLatestRun(db);
  if (!run) {
    throw new Error('No cutover run found. Execute cutover first, then run validation.');
  }

  const liveInventory = await scalarCount(db, 'inventory');
  const liveMovements = await scalarCount(db, 'inventory_movements');
  const liveProducts = await scalarCount(db, 'products');
  const liveStoreSalesWithProduct = await scalarCount(db, 'store_sales', true);
  const liveInventoryOut = await scalarCount(db, 'inventory_out_requests');

  const report = {
    run,
    live: {
      products_count: liveProducts,
      inventory_count: liveInventory,
      inventory_movements_count: liveMovements,
      store_sales_with_product_count: liveStoreSalesWithProduct,
      inventory_out_requests_count: liveInventoryOut,
    },
    checks: {
      inventory_row_count_preserved: run.pre_inventory_count === run.post_inventory_count,
      inventory_movement_row_count_preserved:
        run.pre_inventory_movements_count === run.post_inventory_movements_count,
      products_rebuilt: run.post_products_count > 0,
      run_completed: run.status === 'completed',
    },
    generated_at: new Date().toISOString(),
  };

  const outputPath =
    args.output ||
    path.resolve(
      __dirname,
      '..',
      '..',
      'docs',
      'reports',
      `shopify_cutover_validation_${run.id}.json`
    );
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  const checks = report.checks;
  const ok = Object.values(checks).every(Boolean);

  console.log('Shopify cutover validation finished.');
  console.log(`Run ID: ${run.id}`);
  console.log(`Output: ${outputPath}`);
  console.log(`inventory_row_count_preserved: ${checks.inventory_row_count_preserved}`);
  console.log(
    `inventory_movement_row_count_preserved: ${checks.inventory_movement_row_count_preserved}`
  );
  console.log(`products_rebuilt: ${checks.products_rebuilt}`);
  console.log(`run_completed: ${checks.run_completed}`);

  if (!ok) process.exit(2);
}

main().catch((error) => {
  console.error('Shopify cutover validation failed.');
  if (error && error.stack) {
    console.error(error.stack);
  } else if (error && error.message) {
    console.error(error.message);
  } else {
    try {
      console.error(JSON.stringify(error, null, 2));
    } catch (_) {
      console.error(String(error));
    }
  }
  process.exit(1);
});
