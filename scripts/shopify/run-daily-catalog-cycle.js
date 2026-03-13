const { spawnSync } = require('node:child_process');
const path = require('node:path');

function runNodeScript(relativePath, args = []) {
  const scriptPath = path.resolve(__dirname, relativePath);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Step failed: ${relativePath}`);
  }
}

function main() {
  // 1) Pull latest Shopify catalog into ERP.
  runNodeScript('./sync-shopify-catalog-to-supabase.js');

  // 2) Recompute health and duplicate signals for monitoring.
  // This script exits 2 when duplicates exist, which is expected while cleanup is ongoing.
  const healthPath = path.resolve(__dirname, './check-shopify-catalog-health.js');
  const health = spawnSync(process.execPath, [healthPath], {
    stdio: 'inherit',
    env: process.env,
  });
  if (health.status !== 0 && health.status !== 2) {
    throw new Error('Catalog health check failed unexpectedly.');
  }

  console.log('Daily Shopify catalog cycle complete.');
}

try {
  main();
} catch (error) {
  console.error(error.stack || String(error));
  process.exit(1);
}
