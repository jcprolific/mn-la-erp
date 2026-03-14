const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const { fetchShopifyCatalog } = require('./fetch-shopify-catalog');

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

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch (_) {
    return null;
  }
}

function isServiceRoleKey(token) {
  const payload = decodeJwtPayload(token);
  return payload && payload.role === 'service_role';
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
    throw new Error('Missing Supabase config. Need SUPABASE_URL + service role key.');
  }
  if (!isServiceRoleKey(key)) {
    throw new Error('Cutover requires SUPABASE_SERVICE_ROLE_KEY.');
  }
  return { url, key };
}

function parseArgs(argv) {
  const args = {
    apply: false,
    actor: 'owner/admin',
    notes: 'shopify catalog master cutover',
    output: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--apply') args.apply = true;
    else if (t === '--actor' && argv[i + 1]) {
      args.actor = argv[i + 1].trim();
      i += 1;
    } else if (t === '--notes' && argv[i + 1]) {
      args.notes = argv[i + 1].trim();
      i += 1;
    } else if (t === '--output' && argv[i + 1]) {
      args.output = argv[i + 1].trim();
      i += 1;
    }
  }
  return args;
}

function fallbackSku(variantId, idx) {
  const suffix = String(variantId || `idx-${idx + 1}`).split('/').pop();
  return `SHOPIFY-${suffix}`;
}

function variantSuffix(variantId, idx) {
  return String(variantId || `idx-${idx + 1}`).split('/').pop();
}

function sanitizeNameText(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/\s*[-|]\s*(?:PHP|₱)\s*\d+(?:[.,]\d{1,2})?\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildCutoverRows(variants, productsById) {
  const usedSkus = new Set();
  return variants.map((v, idx) => {
    const parent = productsById.get(v.shopify_product_id) || {};
    const parentTitle = sanitizeNameText(parent.title || 'Shopify Item');
    const variantTitle = sanitizeNameText(v.title || '');
    let sku = v.sku || fallbackSku(v.shopify_variant_id, idx);
    if (usedSkus.has(sku)) {
      sku = `${sku}-${variantSuffix(v.shopify_variant_id, idx)}`;
    }
    let collisionAttempt = 1;
    while (usedSkus.has(sku)) {
      collisionAttempt += 1;
      sku = `${sku}-${collisionAttempt}`;
    }
    usedSkus.add(sku);
    return {
      name:
        variantTitle && variantTitle.toLowerCase() !== 'default title'
          ? `${parentTitle} - ${variantTitle}`
          : parentTitle || variantTitle || 'Shopify Item',
      sku,
      barcode: v.barcode,
      size: v.options_json?.[0]?.value || v.option1 || null,
      color: v.options_json?.[1]?.value || v.option2 || null,
      shopify_product_id: v.shopify_product_id,
      shopify_variant_id: v.shopify_variant_id,
      shopify_inventory_item_id: null,
      shopify_handle: parent.handle || v.parent_handle || null,
      shopify_status: parent.status || v.parent_status || null,
      shopify_image_url: parent.image_url || null,
      shopify_price: v.price,
      shopify_compare_at_price: v.compare_at_price,
      shopify_options_json: v.options_json || [],
    };
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const catalog = await fetchShopifyCatalog();
  const productsById = new Map((catalog.normalized.products || []).map((p) => [p.shopify_product_id, p]));
  const rows = buildCutoverRows(catalog.normalized.variants || [], productsById);
  const outputPath =
    args.output ||
    path.resolve(__dirname, '..', '..', 'docs', 'reports', 'shopify_cutover_payload.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2), 'utf8');

  console.log(`Payload rows: ${rows.length}`);
  console.log(`Payload saved: ${outputPath}`);

  if (!args.apply) {
    console.log('Dry mode only. Re-run with --apply to execute cutover RPC.');
    return;
  }

  const cfg = readSupabaseConfig();
  const db = createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db.rpc('shopify_catalog_hard_reset_cutover_no_timeout', {
    p_catalog_rows: rows,
    p_actor: args.actor,
    p_notes: args.notes,
  });
  if (error) throw error;

  const run = Array.isArray(data) ? data[0] : data;
  console.log('Cutover RPC completed.');
  console.log(`Run ID: ${run?.run_id || 'n/a'}`);
  console.log(`Pre products: ${run?.pre_products_count}`);
  console.log(`Post products: ${run?.post_products_count}`);
  console.log(`Pre inventory rows: ${run?.pre_inventory_count}`);
  console.log(`Post inventory rows: ${run?.post_inventory_count}`);
}

main().catch((error) => {
  console.error('Shopify hard cutover failed.');
  if (error && error.stack) console.error(error.stack);
  else if (error && error.message) console.error(error.message);
  else console.error(String(error));
  process.exit(1);
});
