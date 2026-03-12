/* ============================================================
   MN+LA Store Dashboard — store.js
   ============================================================ */

(function () {
    'use strict';

    /* ────────────────────────────────────────────────────────
       CONSTANTS
    ──────────────────────────────────────────────────────── */
    const LOW_STOCK_THRESHOLD = 3;
    /** Match Branch Stocks page: low = quantity > 0 and quantity <= 5 */
    const LOW_STOCK_BRANCH = 5;
    const SIZES = ['XS', 'S', 'M', 'L', 'XL'];

    /** @deprecated Mock store names; dashboard now uses real locations from API. Kept for buildStoreInventory fallback only. */
    const STORES = {
        'one-ayala': 'MN+LA™ ONE AYALA',
        'bgc': 'MN+LA™ BGC',
        'sm-mega': 'MN+LA™ SM MEGA MALL',
        'gateway': 'MN+LA™ ARTISAN CAFE GATEWAY II',
        'ciannat': 'MN+LA™ CIANNAT COMPLEX',
        'greenhills': 'MN+LA™ GREENHILLS',
        'sm-north': 'MN+LA™ SM NORTH EDSA',
        'sm-manila': 'MN+LA™ SM MANILA',
    };

    const STORE_DASHBOARD_LOCATION_KEY = 'store_dashboard_selected_location_id';

    /* ────────────────────────────────────────────────────────
       MOCK PRODUCT CATALOGUE
       category: tees | pants | outerwear | accessories
    ──────────────────────────────────────────────────────── */
    const CATALOGUE = [
        { sku: 'MON-FERN-S', name: '"MONARCH" S/S DRAPE IN FERN', category: 'tees', price: 1890 },
        { sku: 'CCT-BSND-M', name: 'CHOP CHOP TEE IN BLACK SAND', category: 'tees', price: 1490 },
        { sku: 'HBX-OAT-L', name: '"HITTER" V3 BOX LITE TEE IN OAT', category: 'tees', price: 1590 },
        { sku: 'HLS-WHT-M', name: '"HITTER" V3 LONGSLEEVE TEE IN WHITE', category: 'tees', price: 1790 },
        { sku: 'KDT-CAV-L', name: '"KISS...DON\'T TELL" TEE IN CAVIAR', category: 'tees', price: 1590 },
        { sku: 'KDT-NAV-M', name: '"KISS...DON\'T TELL" TEE IN NAVY', category: 'tees', price: 1590 },
        { sku: 'ITP-GLC-S', name: '"INCREASE THE PEACE" TEE IN GLACIER', category: 'tees', price: 1590 },
        { sku: 'ITP-CAV-M', name: '"INCREASE THE PEACE" TEE IN CAVIAR', category: 'tees', price: 1590 },
        { sku: 'HOE-CAV-L', name: '"HEAVEN ON EARTH" TEE IN CAVIAR', category: 'tees', price: 1590 },
        { sku: 'BRL-CAV-M', name: '"BRAWLERS" TEE IN CAVIAR', category: 'tees', price: 1590 },
        { sku: 'ROD-WOD-S', name: '"RIDE OR DIE" TEE IN WOOD', category: 'tees', price: 1590 },
        { sku: 'ROD-CAV-M', name: '"RIDE OR DIE" TEE IN CAVIAR', category: 'tees', price: 1590 },
        { sku: 'DJP-OBS-30', name: 'DOJO PANTS IN OBSIDIAN', category: 'pants', price: 2490 },
        { sku: 'DJP-SGR-30', name: 'DOJO PANTS IN SAGE', category: 'pants', price: 2490 },
        { sku: 'DJP-STG-30', name: 'DOJO PANTS IN STONE GREY', category: 'pants', price: 2490 },
        { sku: 'DKP-INK-32', name: 'DOUBLE KNEE PHAT PANTS IN INK FALL', category: 'pants', price: 2890 },
        { sku: 'PHP-HGR-30', name: 'PHAT PANTS IN HEATHER GREY', category: 'pants', price: 2690 },
        { sku: 'NWP-DTEL-30', name: 'NEEDLEWORK PANTS IN DEEP TEAL', category: 'pants', price: 2890 },
        { sku: 'MMP-OLV-30', name: '"MULTI M+" PHAT PANTS IN OLIVE', category: 'pants', price: 2890 },
        { sku: 'MPS-CGRY-30', name: 'M+ PINSTRIPE OVERPOCKET PHAT PANTS IN CHARCOAL GREY', category: 'pants', price: 3290 },
        { sku: 'ART-OLIV-M', name: 'ARTISAN JACKET IN OLIVE', category: 'outerwear', price: 3990 },
        { sku: 'DCK-OLIV-M', name: 'DECK JACKET IN OLIVE', category: 'outerwear', price: 3690 },
        { sku: 'CFS-OLIV-M', name: 'CRAFTSMAN SHIRT IN OLIVE', category: 'outerwear', price: 2690 },
        { sku: 'CLS-ANT-M', name: 'CRAFTSMAN L/S SHIRT IN ANTHRACITE', category: 'outerwear', price: 2690 },
        { sku: 'ADJ-CAV-M', name: 'ARTISAN DOJO PANTS IN CAVIAR', category: 'pants', price: 3290 },
        { sku: 'APX-LIL-OS', name: 'APEX RING IN LILAC', category: 'accessories', price: 790 },
        { sku: 'APX-STL-OS', name: 'APEX RING IN STEEL TIDE', category: 'accessories', price: 790 },
        { sku: 'MND-S-OS', name: 'MANDARIN S/S S', category: 'tees', price: 1390 },
    ];

    /* ────────────────────────────────────────────────────────
       MOCK INVENTORY PER STORE
       Generates plausible quantity data per store per product/size.
       In production this would come from Supabase.
    ──────────────────────────────────────────────────────── */
    function seedQty(sku, storeId, size) {
        // Deterministic pseudo-random from sku+store+size characters
        const str = sku + storeId + size;
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
        const v = Math.abs(h) % 18; // 0-17
        // Bias toward realistic clothing stock levels
        if (v <= 1) return 0;
        if (v <= 3) return 1;
        if (v <= 5) return 2;
        if (v <= 8) return Math.floor(Math.abs(h >> 3) % 4) + 3; // 3-6
        return Math.floor(Math.abs(h >> 4) % 8) + 5; // 5-12
    }

    /** For mock seeding, use a stable string (UUIDs get hashed to a slug-like key). */
    function storeSeedKey(storeId) {
        if (STORES[storeId]) return storeId;
        if (typeof storeId === 'string' && storeId.length > 8) return storeId.slice(0, 8);
        return storeId || 'one-ayala';
    }

    function buildStoreInventory(storeId) {
        const seedKey = storeSeedKey(storeId);
        return CATALOGUE.map(p => {
            const sizes = {};
            const sizeList = p.category === 'accessories' ? ['OS'] : SIZES;
            sizeList.forEach(sz => { sizes[sz] = seedQty(p.sku, seedKey, sz); });
            return { ...p, sizes };
        });
    }

    /* ────────────────────────────────────────────────────────
       BRANCH INVENTORY (same source of truth as Branch Stocks page)
    ──────────────────────────────────────────────────────── */
    /**
     * Load branch inventory using the exact same query as store-branch-stocks.html.
     * Returns { rows, totalQty, lowStockCount, outOfStockCount }.
     * rows: same shape as Branch Stocks (product_id, barcode, name, size, color, sku, quantity).
     */
    async function loadBranchInventory(locationId) {
        const empty = { rows: [], totalQty: 0, lowStockCount: 0, outOfStockCount: 0 };
        if (!window.db || !locationId) return empty;
        const res = await window.db
            .from('inventory')
            .select('quantity, product_id, products(barcode, name, size, color, sku, category, cost_price)')
            .eq('location_id', locationId);
        if (res.error || !res.data || !Array.isArray(res.data)) return empty;
        const rows = res.data.map(row => {
            const p = row.products != null ? row.products : row.product;
            const prod = Array.isArray(p) ? p[0] : p;
            const product = prod && typeof prod === 'object' ? prod : {};
            const qty = typeof row.quantity === 'number' ? row.quantity : (parseInt(row.quantity, 10) || 0);
            return {
                product_id: row.product_id || null,
                barcode: product.barcode != null ? product.barcode : '',
                name: product.name != null ? product.name : '',
                size: product.size != null ? product.size : '',
                color: product.color != null ? product.color : '',
                sku: product.sku != null ? product.sku : '',
                category: product.category != null ? product.category : 'tees',
                cost_price: product.cost_price != null ? Number(product.cost_price) : 0,
                quantity: qty
            };
        });
        const totalQty = rows.reduce((sum, r) => sum + (r.quantity || 0), 0);
        const lowStockCount = rows.filter(r => (r.quantity || 0) > 0 && (r.quantity || 0) <= LOW_STOCK_BRANCH).length;
        const outOfStockCount = rows.filter(r => (r.quantity || 0) <= 0).length;
        return { rows, totalQty, lowStockCount, outOfStockCount };
    }

    /**
     * Map branch inventory rows (one per product variant, same as Branch Stocks) to dashboard card format.
     * Each row = one variant = one card with sizes[size] = quantity (no duplicate counting).
     */
    function branchRowsToStoreInventory(rows) {
        return rows.map(r => {
            const sz = (r.size && String(r.size).trim()) ? String(r.size).trim() : 'OS';
            const sizes = {};
            sizes[sz] = r.quantity || 0;
            return {
                name: r.name || r.sku || '—',
                sku: r.sku || '—',
                category: r.category || 'tees',
                price: r.cost_price || 0,
                sizes
            };
        });
    }

    /* ────────────────────────────────────────────────────────
       STATE
    ──────────────────────────────────────────────────────── */
    let currentStoreId = 'one-ayala';
    let storeInventory = [];
    let activeTab = 'all';
    let searchQuery = '';
    let activePayMethod = 'cash';

    /* ────────────────────────────────────────────────────────
       HELPERS
    ──────────────────────────────────────────────────────── */
    function totalUnits(inv) {
        return inv.reduce((sum, p) => sum + Object.values(p.sizes).reduce((s, v) => s + v, 0), 0);
    }
    function lowStockCount(inv) {
        return inv.filter(p =>
            Object.values(p.sizes).some(q => q > 0 && q <= LOW_STOCK_THRESHOLD)
        ).length;
    }
    function hasLowOrOut(p) {
        return Object.values(p.sizes).some(q => q <= LOW_STOCK_THRESHOLD);
    }
    function hasOut(p) {
        return Object.values(p.sizes).some(q => q === 0);
    }
    function peso(n) {
        return '₱' + Number(n).toLocaleString();
    }
    function today() {
        return new Date().toISOString().slice(0, 10);
    }

    /* ────────────────────────────────────────────────────────
       TOAST
    ──────────────────────────────────────────────────────── */
    function showToast(msg, type = '') {
        const el = document.getElementById('sdToast');
        if (!el) return;
        el.textContent = msg;
        el.className = 'sd-toast' + (type ? ' sd-toast--' + type : '');
        void el.offsetWidth; // reflow
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 3000);
    }

    /* ────────────────────────────────────────────────────────
       RENDER METRICS
    ──────────────────────────────────────────────────────── */
    const setStat = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    async function loadDashboardMetrics() {
        if (!window.db) return;
        const isStoreAssociate = window.Permissions && window.Permissions.isStoreAssociate();
        const locationId = window.Session && window.Session.locationId();
        const storeSelect = document.getElementById('storeSelect');
        const effectiveLocationId = locationId || (storeSelect && storeSelect.value && storeSelect.value.length > 36 ? storeSelect.value : null) || currentStoreId;
        // #region agent log
        try {
            fetch('http://127.0.0.1:7263/ingest/d43589ba-66e5-4801-9f39-b68a05443d33',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5a364e'},body:JSON.stringify({sessionId:'5a364e',location:'store.js:loadDashboardMetrics',message:'effectiveLocationId and source',data:{effectiveLocationId: effectiveLocationId || null, fromSession: !!locationId, fromSelect: !!(storeSelect && storeSelect.value), currentStoreId: currentStoreId || null},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
        } catch (_) {}
        // #endregion
        try {
            if (effectiveLocationId) {
                const { rows, totalQty, lowStockCount } = await loadBranchInventory(effectiveLocationId);
                // #region agent log
                try {
                    fetch('http://127.0.0.1:7263/ingest/d43589ba-66e5-4801-9f39-b68a05443d33',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5a364e'},body:JSON.stringify({sessionId:'5a364e',location:'store.js:loadBranchInventory result',message:'inventory row count for dashboard',data:{effectiveLocationId, rowCount: (rows && rows.length) || 0, totalQty: totalQty || 0},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
                } catch (_) {}
                // #endregion
                storeInventory = branchRowsToStoreInventory(rows);
                setStat('sdStatUnits', totalQty.toLocaleString());
                setStat('sdStatLowStock', String(lowStockCount));
                renderProductGrid();
            }
            const rpcParams = effectiveLocationId ? { p_location_id: effectiveLocationId } : {};
            const { data, error } = await window.db.rpc('get_store_dashboard_metrics', rpcParams);
            if (error) throw error;
            if (data && !data.error) {
                const m = data;
                setStat('sdStatSales', peso(m.sales_today ?? 0));
                setStat('sdStatCash', peso(m.sales_today ?? 0));
                setStat('sdStatTxn', (m.transactions_today ?? 0).toLocaleString());
                setStat('sdStatPendingOut', String(m.pending_inventory_out ?? 0));
                if (!effectiveLocationId) {
                    setStat('sdStatUnits', (m.branch_stock_count ?? 0).toLocaleString());
                    setStat('sdStatLowStock', String(m.low_stock_items ?? 0));
                }
            }
            const bestEl = document.getElementById('sdStatBestSeller');
            if (bestEl) bestEl.textContent = '—';
        } catch (e) {
            console.warn('[Store] loadDashboardMetrics failed:', e);
            setStat('sdStatSales', peso(0));
            setStat('sdStatCash', peso(0));
            setStat('sdStatTxn', '0');
        }
    }

    /**
     * Populate store selector from public.locations (type=store) and load real inventory for selected branch.
     * Store associate: always use their assigned location_id and name from Session (never first store in list).
     * Owner/admin: can switch store to see any branch's dashboard and real branch stocks.
     */
    async function loadStoresAndSelectBranch() {
        const storeSel = document.getElementById('storeSelect');
        if (!window.db) return;
        try {
            // Store associate: use only their assigned location so dashboard shows correct branch (e.g. SM North, not BARBERSHOP)
            const isStoreAssociate = window.Permissions && window.Permissions.isStoreAssociate();
            const sessionLocationId = window.Session && window.Session.locationId();
            if (isStoreAssociate && sessionLocationId) {
                currentStoreId = sessionLocationId;
                const fullName = window.Session.locationName() || 'My Branch';
                if (storeSel) {
                    storeSel.innerHTML = '<option value="' + sessionLocationId + '">' + (fullName || sessionLocationId) + '</option>';
                    storeSel.value = sessionLocationId;
                }
                const titleEl = document.getElementById('storeTitle');
                const pillLabel = document.getElementById('sdSwitcherName');
                if (titleEl) titleEl.textContent = fullName;
                if (pillLabel) pillLabel.textContent = fullName.replace(/^MN\+LA™\s*/i, '') || fullName;
                if (typeof localStorage !== 'undefined') localStorage.setItem(STORE_DASHBOARD_LOCATION_KEY, sessionLocationId);
                await loadDashboardMetrics();
                return;
            }

            const { data: locations, error } = await window.db.from('locations').select('id, name').eq('type', 'store').order('name');
            if (error || !locations || !locations.length) {
                if (storeSel) storeSel.innerHTML = '<option value="">— No stores —</option>';
                storeInventory = [];
                renderMetrics();
                renderProductGrid();
                return;
            }
            if (storeSel) {
                storeSel.innerHTML = locations.map(loc => `<option value="${loc.id}">${loc.name || loc.id}</option>`).join('');
            }
            const savedId = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_DASHBOARD_LOCATION_KEY) : null;
            const validSaved = savedId && locations.some(l => l.id === savedId);
            const locationId = validSaved ? savedId : locations[0].id;
            currentStoreId = locationId;
            if (storeSel) storeSel.value = locationId;
            if (typeof localStorage !== 'undefined') localStorage.setItem(STORE_DASHBOARD_LOCATION_KEY, locationId);
            // #region agent log
            try {
                const loc = locations.find(l => l.id === locationId);
                fetch('http://127.0.0.1:7263/ingest/d43589ba-66e5-4801-9f39-b68a05443d33',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5a364e'},body:JSON.stringify({sessionId:'5a364e',location:'store.js:loadStoresAndSelectBranch',message:'dashboard store set',data:{locationId, storeName: (loc && loc.name) || null, fromSaved: validSaved},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
            } catch (_) {}
            // #endregion
            const titleEl = document.getElementById('storeTitle');
            const pillLabel = document.getElementById('sdSwitcherName');
            const loc = locations.find(l => l.id === locationId);
            const fullName = (loc && loc.name) || locationId;
            if (titleEl) titleEl.textContent = fullName;
            if (pillLabel) pillLabel.textContent = fullName.replace(/^MN\+LA™\s*/i, '') || fullName;
            await loadDashboardMetrics();
        } catch (e) {
            console.warn('[Store] loadStoresAndSelectBranch failed:', e);
            if (storeSel) storeSel.innerHTML = '<option value="">— Error —</option>';
            storeInventory = [];
            renderMetrics();
            renderProductGrid();
        }
    }

    function renderMetrics() {
        if (window.Permissions && window.Permissions.isStoreAssociate()) {
            loadDashboardMetrics();
            return;
        }
        const inv = storeInventory;
        setStat('sdStatUnits', totalUnits(inv).toLocaleString());
        setStat('sdStatSales', peso(0));
        setStat('sdStatTxn', '0');
        setStat('sdStatLowStock', String(lowStockCount(inv)));
        setStat('sdStatPendingOut', '0');
        setStat('sdStatCash', peso(0));
    }

    /* ────────────────────────────────────────────────────────
       RENDER PRODUCT GRID
    ──────────────────────────────────────────────────────── */
    function filteredInventory() {
        return storeInventory.filter(p => {
            const q = searchQuery.toLowerCase();
            const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
            const matchesTab =
                activeTab === 'all' ? true :
                    activeTab === 'low' ? hasLowOrOut(p) :
                        activeTab === 'out' ? hasOut(p) :
                            activeTab === p.category;
            return matchesSearch && matchesTab;
        });
    }

    function renderProductGrid() {
        const grid = document.getElementById('sdProductGrid');
        if (!grid) return;
        const items = filteredInventory();

        if (items.length === 0) {
            grid.innerHTML = `<div class="sd-empty" style="grid-column:1/-1;">
        <span class="material-icons-round">search_off</span>
        No products found for this filter.
      </div>`;
            return;
        }

        const sizeList = (p) => {
            const base = p.category === 'accessories' ? ['OS'] : SIZES;
            const fromData = Object.keys(p.sizes || {}).filter(s => !base.includes(s));
            return [...base, ...fromData];
        };
        const maxQty = 12; // bar scale

        grid.innerHTML = items.map(p => {
            const sl = sizeList(p);
            const totalQ = Object.values(p.sizes).reduce((s, v) => s + v, 0);
            const isLow = hasLowOrOut(p);
            const needsRestock = Object.values(p.sizes).some(q => q <= LOW_STOCK_THRESHOLD);

            const sizeRows = sl.map(sz => {
                const qty = p.sizes[sz] || 0;
                const isZero = qty === 0;
                const isLowSz = qty > 0 && qty <= LOW_STOCK_THRESHOLD;
                const barPct = Math.min(100, (qty / maxQty) * 100);
                const barClass = isZero ? 'sd-size-bar--zero' : isLowSz ? 'sd-size-bar--low' : '';
                const statusBadge = isZero
                    ? `<span class="sd-size-status sd-size-status--out">Out</span>`
                    : isLowSz
                        ? `<span class="sd-size-status sd-size-status--low">Low</span>`
                        : '';
                return `
          <div class="sd-size-row">
            <span class="sd-size-label">${sz}</span>
            <div class="sd-size-bar-wrap"><div class="sd-size-bar ${barClass}" style="width:${barPct}%;"></div></div>
            <span class="sd-size-qty">${qty}</span>
            ${statusBadge}
          </div>`;
            }).join('');

            return `
        <div class="sd-product-card" data-sku="${p.sku}">
          <div class="sd-product-name">${p.name}</div>
          <div class="sd-product-sku">${p.sku} &middot; ${peso(p.price)}</div>
          <div class="sd-size-list">${sizeRows}</div>
          <div class="sd-card-footer">
            <span class="sd-card-status">${totalQ} units total</span>
            ${needsRestock
                    ? `<button class="sd-restock-btn" data-restock-sku="${p.sku}" data-restock-name="${p.name.replace(/"/g, '&quot;')}">
                  <span class="material-icons-round">move_to_inbox</span> Request Restock
                 </button>`
                    : ''}
          </div>
        </div>`;
        }).join('');

        // Bind inline restock buttons
        grid.querySelectorAll('[data-restock-sku]').forEach(btn => {
            btn.addEventListener('click', () => {
                const sku = btn.dataset.restockSku;
                const name = btn.dataset.restockName;
                openRestockModal(sku, name);
            });
        });
    }

    /* ────────────────────────────────────────────────────────
       POPULATE PRODUCT SELECTS  (reused across modals)
    ──────────────────────────────────────────────────────── */
    function populateProductSelect(selectId) {
        const el = document.getElementById(selectId);
        if (!el) return;
        el.innerHTML = '<option value="">Select product…</option>' +
            CATALOGUE.map(p => `<option value="${p.sku}">${p.name}</option>`).join('');
    }

    function bindProductSizeSelect(productSelectId, sizeSelectId) {
        const pSel = document.getElementById(productSelectId);
        const sSel = document.getElementById(sizeSelectId);
        if (!pSel || !sSel) return;
        pSel.addEventListener('change', () => {
            const prod = CATALOGUE.find(p => p.sku === pSel.value);
            if (!prod) { sSel.innerHTML = '<option value="">—</option>'; return; }
            const sizes = prod.category === 'accessories' ? ['OS'] : SIZES;
            sSel.innerHTML = sizes.map(sz => {
                const inv = storeInventory.find(p => p.sku === prod.sku);
                const qty = inv ? (inv.sizes[sz] || 0) : 0;
                return `<option value="${sz}">${sz} (${qty} in store)</option>`;
            }).join('');
        });
    }

    /* ────────────────────────────────────────────────────────
       MODAL HELPERS
    ──────────────────────────────────────────────────────── */
    function openModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('open');
    }
    function closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('open');
    }

    /* ────────────────────────────────────────────────────────
       RESTOCK MODAL  (pre-fill from card button or open blank)
    ──────────────────────────────────────────────────────── */
    function openRestockModal(sku, name) {
        populateProductSelect('rsProduct');
        if (sku) {
            const sel = document.getElementById('rsProduct');
            if (sel) sel.value = sku;
            // Trigger size population
            sel.dispatchEvent(new Event('change'));
        }
        openModal('restockModal');
    }

    /* ────────────────────────────────────────────────────────
       DAILY SALES REPORT
    ──────────────────────────────────────────────────────── */
    function renderSalesReport() {
        const sales = [];
        const total = 0;
        const cash = 0;
        const cod = 0;

        const rptTotal = document.getElementById('rptTotal');
        const rptTxn = document.getElementById('rptTxn');
        const rptCash = document.getElementById('rptCash');
        const rptCod = document.getElementById('rptCod');
        if (rptTotal) rptTotal.textContent = peso(total);
        if (rptTxn) rptTxn.textContent = String(sales.length);
        if (rptCash) rptCash.textContent = peso(cash);
        if (rptCod) rptCod.textContent = peso(cod);

        const bodyEl = document.getElementById('sdReportBody');
        if (bodyEl) bodyEl.innerHTML = sales.length === 0
            ? '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">No sales data.</td></tr>'
            : sales.map(t => `
      <tr>
        <td>${t.time}</td>
        <td style="color:var(--text-primary);font-weight:500;">${t.product.length > 30 ? t.product.slice(0, 28) + '…' : t.product}</td>
        <td>${t.size}</td>
        <td>${t.qty}</td>
        <td><span style="font-size:.7rem;padding:2px 8px;border-radius:5px;background:rgba(255,255,255,.06);color:var(--text-secondary);">${t.method}</span></td>
        <td style="color:var(--text-primary);font-weight:600;">${peso(t.amount)}</td>
        <td>${t.staff}</td>
      </tr>`).join('');
    }

    /* ────────────────────────────────────────────────────────
       STORE SWITCH
    ──────────────────────────────────────────────────────── */
    /** Uses mock data (deprecated). Only for fallback if API unavailable. */
    function switchStore(storeId) {
        currentStoreId = storeId;
        storeInventory = buildStoreInventory(storeId);
        const fullName = STORES[storeId] || (window.Session && window.Session.locationName()) || String(storeId);
        const titleEl = document.getElementById('storeTitle');
        if (titleEl) titleEl.textContent = fullName;
        const shortName = fullName.replace(/^MN\+LA™\s*/i, '');
        const pillLabel = document.getElementById('sdSwitcherName');
        if (pillLabel) pillLabel.textContent = shortName;
        renderMetrics();
        renderProductGrid();
    }

    /** For owner/admin: refresh dashboard from public.inventory for the currently selected location (UUID in storeSelect). */
    async function applyStoreSelection() {
        const storeSel = document.getElementById('storeSelect');
        if (!storeSel || !storeSel.value) return;
        const locationId = storeSel.value;
        if (locationId.length < 36) return;
        currentStoreId = locationId;
        if (typeof localStorage !== 'undefined') localStorage.setItem(STORE_DASHBOARD_LOCATION_KEY, locationId);
        // #region agent log
        try {
            fetch('http://127.0.0.1:7263/ingest/d43589ba-66e5-4801-9f39-b68a05443d33',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5a364e'},body:JSON.stringify({sessionId:'5a364e',location:'store.js:applyStoreSelection',message:'owner changed store',data:{locationId, storeName: (storeSel.options[storeSel.selectedIndex] && storeSel.options[storeSel.selectedIndex].text) || null},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
        } catch (_) {}
        // #endregion
        const opt = storeSel.options[storeSel.selectedIndex];
        const fullName = (opt && opt.text) || locationId;
        const titleEl = document.getElementById('storeTitle');
        const pillLabel = document.getElementById('sdSwitcherName');
        if (titleEl) titleEl.textContent = fullName;
        if (pillLabel) pillLabel.textContent = fullName.replace(/^MN\+LA™\s*/i, '') || fullName;
        await loadDashboardMetrics();
    }

    /* ────────────────────────────────────────────────────────
       INIT
    ──────────────────────────────────────────────────────── */
    function init() {
        if (window.Permissions && window.Permissions.isStoreAssociate() && window.Session && window.Session.locationId()) {
            currentStoreId = window.Session.locationId();
            const fullName = window.Session.locationName() || 'My Branch';
            const titleEl = document.getElementById('storeTitle');
            if (titleEl) titleEl.textContent = fullName;
            const pillLabel = document.getElementById('sdSwitcherName');
            if (pillLabel) pillLabel.textContent = fullName.replace(/^MN\+LA™\s*/i, '') || fullName;
            loadDashboardMetrics();
        } else {
            loadStoresAndSelectBranch();
        }

        // Set today's date in report picker
        const rdEl = document.getElementById('reportDate');
        if (rdEl) rdEl.value = today();

        // Store selector: owner/admin can switch branch to see that store's dashboard and real inventory.
        const storeSel = document.getElementById('storeSelect');
        if (storeSel && !storeSel.disabled) {
            storeSel.addEventListener('change', () => {
                const val = storeSel.value;
                if (val && val.length >= 36) {
                    applyStoreSelection();
                }
            });
        }

        // ── Search ──
        const searchEl = document.getElementById('sdSearch');
        if (searchEl) {
            searchEl.addEventListener('input', () => {
                searchQuery = searchEl.value.trim();
                renderProductGrid();
            });
        }

        // ── Tabs ──
        document.querySelectorAll('.sd-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.sd-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeTab = btn.dataset.tab;
                renderProductGrid();
            });
        });

        // ── Close modal buttons ──
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => closeModal(btn.dataset.close));
        });

        // Close on overlay click
        document.querySelectorAll('.sd-modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', e => {
                if (e.target === overlay) overlay.classList.remove('open');
            });
        });

        // ── Action buttons ──
        document.getElementById('btnQuickSale')?.addEventListener('click', () => {
            populateProductSelect('qsProduct');
            bindProductSizeSelect('qsProduct', 'qsSize');
            openModal('quickSaleModal');
        });

        document.getElementById('btnInventoryOut')?.addEventListener('click', () => {
            populateProductSelect('ioProduct');
            bindProductSizeSelect('ioProduct', 'ioSize');
            openModal('inventoryOutModal');
        });

        document.getElementById('btnExchange')?.addEventListener('click', () => {
            populateProductSelect('exRetProduct');
            populateProductSelect('exNewProduct');
            bindProductSizeSelect('exRetProduct', 'exRetSize');
            bindProductSizeSelect('exNewProduct', 'exNewSize');
            openModal('exchangeModal');
        });

        document.getElementById('btnRequestRestock')?.addEventListener('click', () => {
            populateProductSelect('rsProduct');
            bindProductSizeSelect('rsProduct', 'rsSize');
            openRestockModal(null, null);
        });

        document.getElementById('btnDailySales')?.addEventListener('click', () => {
            renderSalesReport();
            openModal('salesReportModal');
        });

        // ── Payment method toggle ──
        document.querySelectorAll('.sd-pay-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.sd-pay-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activePayMethod = btn.dataset.pay;
            });
        });

        // ── Quick Sale confirm ──
        document.getElementById('btnConfirmSale')?.addEventListener('click', () => {
            const prod = document.getElementById('qsProduct')?.value;
            const size = document.getElementById('qsSize')?.value;
            const qty = parseInt(document.getElementById('qsQty')?.value) || 1;
            const price = parseFloat(document.getElementById('qsPrice')?.value) || 0;
            if (!prod || !size) { showToast('Please select a product and size.'); return; }
            // Deduct mock inventory
            const invItem = storeInventory.find(p => p.sku === prod);
            if (invItem && invItem.sizes[size] !== undefined) {
                invItem.sizes[size] = Math.max(0, invItem.sizes[size] - qty);
            }
            closeModal('quickSaleModal');
            renderMetrics();
            renderProductGrid();
            showToast(`Sale recorded — ${peso(price * qty)}`, 'success');
        });

        // ── Inventory Out confirm ──
        document.getElementById('btnConfirmInvOut')?.addEventListener('click', () => {
            const prod = document.getElementById('ioProduct')?.value;
            const size = document.getElementById('ioSize')?.value;
            const qty = parseInt(document.getElementById('ioQty')?.value) || 1;
            if (!prod || !size) { showToast('Please select a product and size.'); return; }
            const invItem = storeInventory.find(p => p.sku === prod);
            if (invItem && invItem.sizes[size] !== undefined) {
                invItem.sizes[size] = Math.max(0, invItem.sizes[size] - qty);
            }
            closeModal('inventoryOutModal');
            renderMetrics();
            renderProductGrid();
            showToast('Inventory out logged.', 'success');
        });

        // ── Exchange confirm ──
        document.getElementById('btnConfirmExchange')?.addEventListener('click', () => {
            const retProd = document.getElementById('exRetProduct')?.value;
            const retSize = document.getElementById('exRetSize')?.value;
            const newProd = document.getElementById('exNewProduct')?.value;
            const newSize = document.getElementById('exNewSize')?.value;
            if (!retProd || !newProd) { showToast('Please fill in both items.'); return; }
            // Return item: +1, new item: -1
            const retItem = storeInventory.find(p => p.sku === retProd);
            const newItem = storeInventory.find(p => p.sku === newProd);
            if (retItem && retSize) retItem.sizes[retSize] = (retItem.sizes[retSize] || 0) + 1;
            if (newItem && newSize) newItem.sizes[newSize] = Math.max(0, (newItem.sizes[newSize] || 0) - 1);
            closeModal('exchangeModal');
            renderMetrics();
            renderProductGrid();
            showToast('Exchange recorded.', 'success');
        });

        // ── Restock confirm ──
        document.getElementById('btnConfirmRestock')?.addEventListener('click', () => {
            const prod = document.getElementById('rsProduct')?.value;
            const size = document.getElementById('rsSize')?.value;
            const qty = document.getElementById('rsQty')?.value || '5';
            const staff = document.getElementById('rsStaff')?.value || '';
            const prio = document.getElementById('rsPriority')?.value || 'normal';
            if (!prod) { showToast('Please select a product.'); return; }
            const storeName = STORES[currentStoreId] || currentStoreId;
            const prodName = CATALOGUE.find(p => p.sku === prod)?.name || prod;
            // In production: write to Supabase restock_requests table
            console.log('[RESTOCK REQUEST]', { store: storeName, sku: prod, size, qty, prio, staff });
            closeModal('restockModal');
            showToast(`Restock request sent to Warehouse ✓`, 'amber');
        });

        // ── Report: generate + print ──
        document.getElementById('btnGenerateReport')?.addEventListener('click', renderSalesReport);
        document.getElementById('btnPrintReport')?.addEventListener('click', () => window.print());

        // ── Profile dropdown ──
        const pw = document.getElementById('profileWrapper');
        const pb = document.getElementById('profileBtn');
        if (pb) {
            pb.addEventListener('click', e => { e.stopPropagation(); pw?.classList.toggle('open'); });
        }
        document.addEventListener('click', () => pw?.classList.remove('open'));
    }

    /** Called from store.html after Auth.guard(); loads real branch inventory for store_associate (same source as Branch Stocks). */
    window.StoreDashboard = window.StoreDashboard || {};
    window.StoreDashboard.setStoreFromSession = function () {
        if (!window.Session) return;
        const locationId = window.Session.locationId();
        const isStoreAssociate = window.Permissions && window.Permissions.isStoreAssociate();
        if (isStoreAssociate && locationId) {
            currentStoreId = locationId;
            const fullName = window.Session.locationName() || 'My Branch';
            const titleEl = document.getElementById('storeTitle');
            if (titleEl) titleEl.textContent = fullName;
            const pillLabel = document.getElementById('sdSwitcherName');
            if (pillLabel) pillLabel.textContent = (fullName.replace(/^MN\+LA™\s*/i, '') || fullName);
            loadDashboardMetrics();
        }
    };

    // Kick off after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
