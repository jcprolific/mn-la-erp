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
    return {
      url: urlMatch ? urlMatch[1] : null,
      key: keyMatch ? keyMatch[1] : null,
    };
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

function readSupabaseConfig(options = {}) {
  const allowMissingWriteKey = Boolean(options.allowMissingWriteKey);
  const root = path.resolve(__dirname, '..', '..');
  const envPrimary = parseEnvFile(path.join(root, 'supabase', '.env'));
  const envFallback = parseEnvFile(path.join(root, 'supabase', 'mn+la.env'));
  const env = { ...envFallback, ...envPrimary, ...process.env };
  const clientCfg = readSupabaseClientConstants();

  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || clientCfg.url;
  const serviceRoleKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SERVICE_ROLE_KEY ||
    env.SUPABASE_SECRET_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    clientCfg.key;

  if (!url || !serviceRoleKey) {
    if (allowMissingWriteKey) {
      return { url: null, serviceRoleKey: null, writable: false };
    }
    throw new Error(
      'Missing Supabase config. Require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY).'
    );
  }

  const writable = isServiceRoleKey(serviceRoleKey);

  return { url, serviceRoleKey, writable };
}

function parseArgs(argv) {
  const args = { dryRun: false, limit: null };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dry-run') args.dryRun = true;
    if (token === '--limit' && argv[i + 1]) {
      args.limit = Number.parseInt(argv[i + 1], 10);
      i += 1;
    }
  }
  return args;
}

function buildProductName(parentTitle, variantTitle) {
  const parent = (parentTitle || '').trim();
  const variant = (variantTitle || '').trim();
  if (!variant || variant.toLowerCase() === 'default title') return parent || variant || 'Shopify Item';
  if (!parent) return variant;
  return `${parent} - ${variant}`;
}

function pickOptionValue(options, nameHint) {
  const list = Array.isArray(options) ? options : [];
  const needle = String(nameHint || '').toLowerCase();
  const exact = list.find((opt) => String(opt?.name || '').toLowerCase() === needle);
  if (exact && exact.value) return exact.value;
  const loose = list.find((opt) => String(opt?.name || '').toLowerCase().includes(needle));
  return loose && loose.value ? loose.value : null;
}

function fallbackSku(variantId, idx) {
  const suffix = (variantId || `idx-${idx + 1}`).split('/').pop();
  return `SHOPIFY-${suffix}`;
}

async function fetchExistingProducts(db) {
  const mapByVariantId = new Map();
  const mapBySku = new Map();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await db
      .from('products')
      .select('id, sku, shopify_variant_id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.shopify_variant_id) mapByVariantId.set(row.shopify_variant_id, row);
      if (row.sku) mapBySku.set(row.sku, row);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return { mapByVariantId, mapBySku };
}

async function main() {
  const args = parseArgs(process.argv);
  const catalog = await fetchShopifyCatalog();
  const products = catalog.normalized.products;
  const variants = catalog.normalized.variants;
  const productsById = new Map(products.map((p) => [p.shopify_product_id, p]));

  const cfg = readSupabaseConfig({ allowMissingWriteKey: args.dryRun });
  const db = cfg.url && cfg.serviceRoleKey
    ? createClient(cfg.url, cfg.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    : null;

  let existingMaps = { mapByVariantId: new Map(), mapBySku: new Map() };
  if (db) {
    try {
      existingMaps = await fetchExistingProducts(db);
    } catch (error) {
      if (!args.dryRun) throw error;
      console.warn('[sync] Existing product lookup skipped in dry-run:', error.message);
    }
  }
  const { mapByVariantId, mapBySku } = existingMaps;
  const syncAt = new Date().toISOString();
  const targetVariants =
    Number.isInteger(args.limit) && args.limit > 0 ? variants.slice(0, args.limit) : variants;

  let inserted = 0;
  let updatedByVariantId = 0;
  let updatedBySku = 0;
  let failed = 0;

  for (let i = 0; i < targetVariants.length; i += 1) {
    const variant = targetVariants[i];
    const parent = productsById.get(variant.shopify_product_id) || {};
    const options = variant.options_json || [];
    const sku = variant.sku || fallbackSku(variant.shopify_variant_id, i);
    const payload = {
      name: buildProductName(parent.title, variant.title),
      sku,
      size: pickOptionValue(options, 'size') || variant.option1 || null,
      color:
        pickOptionValue(options, 'color') ||
        (pickOptionValue(options, 'colour') || variant.option2 || null),
      barcode: variant.barcode || null,
      shopify_product_id: variant.shopify_product_id || null,
      shopify_variant_id: variant.shopify_variant_id || null,
      shopify_inventory_item_id: variant.inventory_item_id || null,
      shopify_handle: parent.handle || null,
      shopify_status: parent.status || variant.parent_status || null,
      shopify_image_url: parent.image_url || null,
      shopify_price: variant.price,
      shopify_compare_at_price: variant.compare_at_price,
      shopify_options_json: options,
      shopify_last_synced_at: syncAt,
      catalog_source: 'shopify',
    };

    const existingByVariant = variant.shopify_variant_id
      ? mapByVariantId.get(variant.shopify_variant_id)
      : null;
    const existingBySku = sku ? mapBySku.get(sku) : null;

    if (args.dryRun) {
      if (existingByVariant) updatedByVariantId += 1;
      else if (existingBySku && !existingBySku.shopify_variant_id) updatedBySku += 1;
      else inserted += 1;
      continue;
    }
    if (!db || !cfg.writable) {
      throw new Error(
        'Writable Supabase key required for apply mode. Set SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY).'
      );
    }

    try {
      if (existingByVariant) {
        const { error } = await db.from('products').update(payload).eq('id', existingByVariant.id);
        if (error) throw error;
        updatedByVariantId += 1;
        mapBySku.set(sku, { ...existingByVariant, sku, shopify_variant_id: variant.shopify_variant_id });
      } else if (existingBySku && !existingBySku.shopify_variant_id) {
        const { error } = await db.from('products').update(payload).eq('id', existingBySku.id);
        if (error) throw error;
        updatedBySku += 1;
        mapByVariantId.set(variant.shopify_variant_id, {
          ...existingBySku,
          shopify_variant_id: variant.shopify_variant_id,
          sku,
        });
      } else {
        const { data, error } = await db.from('products').insert(payload).select('id').single();
        if (error) throw error;
        inserted += 1;
        mapByVariantId.set(variant.shopify_variant_id, { id: data.id, sku, shopify_variant_id: variant.shopify_variant_id });
        mapBySku.set(sku, { id: data.id, sku, shopify_variant_id: variant.shopify_variant_id });
      }
    } catch (error) {
      failed += 1;
      console.error(`[sync] Failed variant ${variant.shopify_variant_id || sku}: ${error.message}`);
    }
  }

  if (!args.dryRun) {
    const { error: refreshErr } = await db.rpc('refresh_product_barcode_statuses');
    if (refreshErr) {
      throw new Error(`Failed to refresh barcode statuses: ${refreshErr.message}`);
    }
  }

  console.log('Shopify catalog sync finished.');
  console.log(`Dry run: ${args.dryRun ? 'yes' : 'no'}`);
  console.log(`Variants processed: ${targetVariants.length}`);
  console.log(`Supabase writable key available: ${cfg.writable ? 'yes' : 'no'}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated by shopify_variant_id: ${updatedByVariantId}`);
  console.log(`Updated by sku backfill: ${updatedBySku}`);
  console.log(`Failed: ${failed}`);
}

main().catch((error) => {
  console.error('Shopify catalog sync failed.');
  console.error(error.stack || String(error));
  process.exit(1);
});
