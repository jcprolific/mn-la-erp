/* ============================================================
   MN+LA Store Dashboard — store.js
   ============================================================ */

(function () {
    'use strict';

    /* ────────────────────────────────────────────────────────
       CONSTANTS
    ──────────────────────────────────────────────────────── */
    const LOW_STOCK_THRESHOLD = 3;
    const SIZES = ['XS', 'S', 'M', 'L', 'XL'];

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
    async function loadDashboardMetrics() {
        if (!window.db || !window.Permissions || !window.Permissions.isStoreAssociate()) return;
        try {
            const { data, error } = await window.db.rpc('get_store_dashboard_metrics');
            if (error) throw error;
            if (!data || data.error) return;
            const m = data;
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            set('sdStatUnits', (m.branch_stock_count ?? 0).toLocaleString());
            set('sdStatSales', peso(m.sales_today ?? 0));
            set('sdStatBestSeller', '—');
            set('sdStatLowStock', String(m.low_stock_items ?? 0));
            set('sdStatCash', peso(m.sales_today ?? 0));
            set('sdStatCod', '₱0');
            const txnEl = document.getElementById('sdStatTxn');
            if (txnEl) txnEl.textContent = (m.transactions_today ?? 0).toLocaleString();
            const pendingEl = document.getElementById('sdStatPendingOut');
            if (pendingEl) pendingEl.textContent = String(m.pending_inventory_out ?? 0);
        } catch (e) {
            console.warn('[Store] get_store_dashboard_metrics failed:', e);
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            set('sdStatSales', peso(0));
            set('sdStatCash', peso(0));
            const txnEl = document.getElementById('sdStatTxn');
            if (txnEl) txnEl.textContent = '0';
        }
    }

    function renderMetrics() {
        if (window.Permissions && window.Permissions.isStoreAssociate()) {
            loadDashboardMetrics();
            return;
        }
        const inv = storeInventory;
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('sdStatUnits', totalUnits(inv).toLocaleString());
        set('sdStatSales', peso(0));
        set('sdStatTxn', '0');
        set('sdStatLowStock', String(lowStockCount(inv)));
        set('sdStatPendingOut', '0');
        set('sdStatCash', peso(0));
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

        const sizeList = (p) => p.category === 'accessories' ? ['OS'] : SIZES;
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
    function switchStore(storeId) {
        currentStoreId = storeId;
        storeInventory = buildStoreInventory(storeId);
        const fullName = STORES[storeId] || (window.Session && window.Session.locationName()) || String(storeId);
        const titleEl = document.getElementById('storeTitle');
        if (titleEl) titleEl.textContent = fullName;
        // Update the pill label: strip the "MN+LA™ " prefix for compactness
        const shortName = fullName.replace(/^MN\+LA™\s*/i, '');
        const pillLabel = document.getElementById('sdSwitcherName');
        if (pillLabel) pillLabel.textContent = shortName;
        renderMetrics();
        renderProductGrid();
    }

    /* ────────────────────────────────────────────────────────
       INIT
    ──────────────────────────────────────────────────────── */
    function init() {
        // Store associate: lock to assigned location only (visibility + write for this branch)
        if (window.Permissions && window.Permissions.isStoreAssociate() && window.Session && window.Session.locationId()) {
            currentStoreId = window.Session.locationId();
        } else {
            const storeSel = document.getElementById('storeSelect');
            if (storeSel && storeSel.value) currentStoreId = storeSel.value;
        }
        switchStore(currentStoreId);

        // Set today's date in report picker
        const rdEl = document.getElementById('reportDate');
        if (rdEl) rdEl.value = today();

        // ── Store selector (only changeable for non–store-associate; store_associate has single locked option) ──
        const storeSel = document.getElementById('storeSelect');
        if (storeSel && !storeSel.disabled) {
            storeSel.addEventListener('change', () => switchStore(storeSel.value));
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

    /** Called from store.html after Auth.guard() so store_associate sees their branch. */
    window.StoreDashboard = window.StoreDashboard || {};
    window.StoreDashboard.setStoreFromSession = function () {
        if (window.Permissions && window.Permissions.isStoreAssociate() && window.Session && window.Session.locationId()) {
            currentStoreId = window.Session.locationId();
            switchStore(currentStoreId);
        }
    };

    // Kick off after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
