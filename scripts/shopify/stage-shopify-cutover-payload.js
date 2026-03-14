const crypto = require('node:crypto');
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

  if (!url || !key) throw new Error('Missing Supabase config. Need SUPABASE_URL + service role key.');
  if (!isServiceRoleKey(key)) throw new Error('Staging requires SUPABASE_SERVICE_ROLE_KEY.');
  return { url, key };
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

function buildRows(variants, productsById) {
  const baseSkuCounts = new Map();
  for (let i = 0; i < variants.length; i += 1) {
    const v = variants[i];
    const baseSku = v.sku || fallbackSku(v.shopify_variant_id, i);
    baseSkuCounts.set(baseSku, Number(baseSkuCounts.get(baseSku) || 0) + 1);
  }

  const usedSkus = new Set();
  return variants.map((v, i) => {
    const parent = productsById.get(v.shopify_product_id) || {};
    const parentTitle = sanitizeNameText(parent.title || 'Shopify Item');
    const variantTitle = sanitizeNameText(v.title || '');
    const baseSku = v.sku || fallbackSku(v.shopify_variant_id, i);
    const needsVariantSuffix = Number(baseSkuCounts.get(baseSku) || 0) > 1;
    let sku = needsVariantSuffix ? `${baseSku}-${variantSuffix(v.shopify_variant_id, i)}` : baseSku;
    let n = 1;
    while (usedSkus.has(sku)) {
      n += 1;
      sku = `${sku}-${n}`;
    }
    usedSkus.add(sku);

    return {
      row_index: i + 1,
      name:
        variantTitle && variantTitle.toLowerCase() !== 'default title'
          ? `${parentTitle} - ${variantTitle}`
          : parentTitle || variantTitle || 'Shopify Item',
      sku,
      barcode: v.barcode || null,
      size: v.options_json?.[0]?.value || v.option1 || null,
      color: v.options_json?.[1]?.value || v.option2 || null,
      shopify_product_id: v.shopify_product_id || null,
      shopify_variant_id: v.shopify_variant_id || null,
      shopify_inventory_item_id: v.inventory_item_id || null,
      shopify_handle: parent.handle || v.parent_handle || null,
      shopify_status: parent.status || v.parent_status || null,
      shopify_image_url: parent.image_url || null,
      shopify_price: v.price,
      shopify_compare_at_price: v.compare_at_price,
      shopify_options_json: v.options_json || [],
    };
  });
}

function parseArgs(argv) {
  const args = { chunkSize: 500, batchId: null };
  for (let i = 2; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--chunk-size' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isInteger(parsed) && parsed > 0) args.chunkSize = parsed;
      i += 1;
    } else if (t === '--batch-id' && argv[i + 1]) {
      args.batchId = argv[i + 1].trim();
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const batchId = args.batchId || crypto.randomUUID();

  const catalog = await fetchShopifyCatalog();
  const productsById = new Map((catalog.normalized.products || []).map((p) => [p.shopify_product_id, p]));
  const rows = buildRows(catalog.normalized.variants || [], productsById);

  const cfg = readSupabaseConfig();
  const db = createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: delErr } = await db
    .from('shopify_catalog_cutover_stage')
    .delete()
    .eq('batch_id', batchId);
  if (delErr) throw delErr;

  for (let i = 0; i < rows.length; i += args.chunkSize) {
    const chunk = rows.slice(i, i + args.chunkSize).map((r) => ({ batch_id: batchId, ...r }));
    const { error } = await db.from('shopify_catalog_cutover_stage').insert(chunk);
    if (error) throw error;
    if ((i / args.chunkSize) % 10 === 0) {
      console.log(`Staged rows: ${Math.min(i + args.chunkSize, rows.length)} / ${rows.length}`);
    }
  }

  console.log('Staging complete.');
  console.log(`Batch ID: ${batchId}`);
  console.log(`Total rows staged: ${rows.length}`);
}

main().catch((error) => {
  console.error('Staging failed.');
  console.error(error.stack || String(error));
  process.exit(1);
});
