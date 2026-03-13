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

function readSupabaseConfig() {
  const root = path.resolve(__dirname, '..', '..');
  const envPrimary = parseEnvFile(path.join(root, 'supabase', '.env'));
  const envFallback = parseEnvFile(path.join(root, 'supabase', 'mn+la.env'));
  const env = { ...envFallback, ...envPrimary, ...process.env };
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  return { url, key };
}

async function main() {
  const { url, key } = readSupabaseConfig();
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await db.rpc('refresh_product_barcode_statuses');
  if (error) throw error;

  console.log('Barcode statuses refreshed.');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
