/* ============================================================
   MN+LA ERP – Supabase Client
   ============================================================
   Uses the Supabase UMD CDN build (loaded before this script).
   The client is attached to window.db so every other script
   in the project can access it without additional imports.
   ============================================================ */

(function () {
    'use strict';

    /* ---------- CONFIG ---------- */
    const SUPABASE_URL = 'https://nooqvrikraglddxkxrul.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vb3F2cmlrcmFnbGRkeGt4cnVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzQ5ODQsImV4cCI6MjA4ODI1MDk4NH0.Xo307PHhpdmIRxvzUj5MgSI-FS84iSEkyB3DSecGn1Y';

    /* ---------- INIT CLIENT ---------- */
    // supabase.createClient is exposed globally by the UMD CDN build
    if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
        console.error('[Supabase] CDN script not loaded. Make sure the Supabase CDN <script> tag is placed before supabase-client.js in index.html.');
        return;
    }

    const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Make the client and config globally accessible (for RPC fetch fallback etc.)
    window.db = db;
    window.SUPABASE_URL = SUPABASE_URL;
    window.SUPABASE_ANON_KEY = SUPABASE_KEY;

    console.log('[Supabase] Client initialised ✓  (window.db is ready)');

    /* ---------- TEST FETCH ---------- */
    async function testFetch() {
        try {
            const { data, error } = await db
                .from('inventory_ledger')
                .select('*')
                .limit(5);

            if (error) {
                console.error('[Supabase Test] Error fetching inventory_ledger:', error.message, error);
                return;
            }

            console.log(`[Supabase Test] inventory_ledger — ${data.length} row(s) returned:`);
            console.table(data);
        } catch (err) {
            console.error('[Supabase Test] Unexpected error:', err);
        }
    }

    testFetch();

})();
