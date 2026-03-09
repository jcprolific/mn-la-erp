/* ============================================================
   factory-release.js — MN+LA ERP
   Factory → Warehouse / Store operational workflow
   ============================================================ */
(function () {
    'use strict';

    const $ = id => document.getElementById(id);

    /* ── PRODUCT LOOKUP (shared SKU map) ── */
    const PRODUCT_MAP = {
        'MON-FERN-S': '"MONARCH" S/S DRAPE IN FERN',
        'CCT-BSND-M': 'CHOP CHOP TEE IN BLACK SAND',
        'APX-LILAC-OS': 'APEX RING IN LILAC',
        'APX-STDE-OS': 'APEX RING IN STEEL TIDE',
        'HIT-WHT-M': '"HITTER" V3 LONGSLEEVE TEE IN WHITE',
        'HBX-OAT-L': '"HITTER" V3 BOX LITE TEE IN OAT',
        'ART-OLIV-M': 'ARTISAN JACKET IN OLIVE',
        'DJP-OBS-30': 'DOJO PANTS IN OBSIDIAN',
        'DKJ-OLIV-S': 'DECK JACKET IN OLIVE',
        'DKP-INKF-32': 'DOUBLE KNEE PHAT PANTS IN INK FALL',
        'KDT-NVY-M': '"KISS...DON\'T TELL" TEE IN NAVY',
        'MPS-CGRY-30': 'M+ PINSTRIPE OVERPOCKET PHAT PANTS IN CHARCOAL GREY',
        'KDT-CAV-L': '"KISS...DON\'T TELL" TEE IN CAVIAR',
        'PHP-HGRY-30': 'PHAT PANTS IN HEATHER GREY',
        'ITP-GLCR-M': '"INCREASE THE PEACE" TEE IN GLACIER',
        'NWP-DTEL-30': 'NEEDLEWORK PANTS IN DEEP TEAL',
        'ITP-CAV-L': '"INCREASE THE PEACE" TEE IN CAVIAR',
        'MMP-OLIV-30': '"MULTI M+" PHAT PANTS IN OLIVE',
        'HOE-CAV-M': '"HEAVEN ON EARTH" TEE IN CAVIAR',
        'DJP-STGRY-32': 'DOJO PANTS IN STONE GREY',
        'BRL-CAV-M': '"BRAWLERS" TEE IN CAVIAR',
        'DJP-SAGE-30': 'DOJO PANTS IN SAGE',
        'ROD-WOD-M': '"RIDE OR DIE" TEE IN WOOD',
        'ROD-CAV-L': '"RIDE OR DIE" TEE IN CAVIAR',
        'CRF-OLIV-M': 'CRAFTSMAN SHIRT IN OLIVE',
        'FLW-STLTH-M': '"FLOW" BOMBER JACKET IN STEALTH',
        'VBJ-M': '"VAPOR BLUE" CHORE JACKET',
    };

    /* ── MOCK RELEASE QUEUE ── */
    const today = new Date();
    function ts(h, m, daysAgo = 0) {
        const d = new Date(today);
        d.setDate(d.getDate() - daysAgo);
        d.setHours(h, m, 0, 0);
        return d;
    }

    let RELEASE_QUEUE = [
        { id: 'REL-0045', sku: 'DJP-OBS-30', product: 'DOJO PANTS IN OBSIDIAN', qty: 60, destination: 'Warehouse', releasedBy: 'Raffy M.', status: 'Pending', timestamp: ts(7, 30) },
        { id: 'REL-0044', sku: 'MON-FERN-S', product: '"MONARCH" S/S DRAPE IN FERN', qty: 50, destination: 'Warehouse', releasedBy: 'Raffy M.', status: 'Released', timestamp: ts(8, 15) },
        { id: 'REL-0043', sku: 'HBX-OAT-L', product: '"HITTER" V3 BOX LITE TEE IN OAT', qty: 30, destination: 'MN+LA™ ONE AYALA', releasedBy: 'Jun D.', status: 'Released', timestamp: ts(9, 10) },
        { id: 'REL-0042', sku: 'NWP-DTEL-30', product: 'NEEDLEWORK PANTS IN DEEP TEAL', qty: 20, destination: 'Warehouse', releasedBy: 'Jun D.', status: 'Confirmed by Warehouse', timestamp: ts(11, 30) },
        { id: 'REL-0041', sku: 'KDT-CAV-L', product: '"KISS...DON\'T TELL" TEE IN CAVIAR', qty: 24, destination: 'MN+LA™ BGC', releasedBy: 'Raffy M.', status: 'Confirmed by Warehouse', timestamp: ts(13, 45) },
        { id: 'REL-0040', sku: 'ITP-GLCR-M', product: '"INCREASE THE PEACE" TEE IN GLACIER', qty: 18, destination: 'Warehouse', releasedBy: 'Jun D.', status: 'Released', timestamp: ts(8, 0, 1) },
        { id: 'REL-0039', sku: 'BRL-CAV-M', product: '"BRAWLERS" TEE IN CAVIAR', qty: 40, destination: 'MN+LA™ GREENHILLS', releasedBy: 'Raffy M.', status: 'Released', timestamp: ts(10, 0, 1) },
        { id: 'REL-0038', sku: 'ART-OLIV-M', product: 'ARTISAN JACKET IN OLIVE', qty: 12, destination: 'MN+LA™ SM MEGA MALL', releasedBy: 'Jun D.', status: 'Confirmed by Warehouse', timestamp: ts(14, 0, 2) },
        { id: 'REL-0037', sku: 'MMP-OLIV-30', product: '"MULTI M+" PHAT PANTS IN OLIVE', qty: 30, destination: 'Warehouse', releasedBy: 'Raffy M.', status: 'Released', timestamp: ts(9, 30, 3) },
    ];

    let currentFilter = 'today';

    /* ── HELPERS ── */
    function formatTs(d) {
        return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    }
    function isToday(d) {
        return d.toDateString() === today.toDateString();
    }
    function isThisWeek(d) {
        const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
        return d >= weekAgo;
    }
    function nextId() {
        const nums = RELEASE_QUEUE.map(r => parseInt(r.id.split('-')[1]));
        return 'REL-' + String(Math.max(...nums) + 1).padStart(4, '0');
    }
    function statusHtml(s) {
        const map = { 'Pending': 'fr-status--pending', 'Released': 'fr-status--released', 'Confirmed by Warehouse': 'fr-status--confirmed' };
        return `<span class="fr-status ${map[s] || ''}">${s}</span>`;
    }

    /* ── STAT CARDS ── */
    function updateStats() {
        const todayRows = RELEASE_QUEUE.filter(r => isToday(r.timestamp));
        $('statPending').textContent = RELEASE_QUEUE.filter(r => r.status === 'Pending').length;
        $('statReleasedToday').textContent = todayRows.filter(r => r.status === 'Released' || r.status === 'Confirmed by Warehouse').length;
        $('statUnitsToday').textContent = todayRows.reduce((s, r) => s + r.qty, 0).toLocaleString();
        $('statAwaiting').textContent = RELEASE_QUEUE.filter(r => r.status === 'Released').length;
    }

    /* ── TABLE RENDER ── */
    function filteredRows() {
        if (currentFilter === 'today') return RELEASE_QUEUE.filter(r => isToday(r.timestamp));
        if (currentFilter === 'week') return RELEASE_QUEUE.filter(r => isThisWeek(r.timestamp));
        return RELEASE_QUEUE;
    }
    function renderTable() {
        const rows = filteredRows();
        $('tableCount').textContent = `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`;
        $('releaseTableBody').innerHTML = rows.length === 0
            ? `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">No releases found for this period.</td></tr>`
            : rows.map(r => `
                <tr>
                  <td class="ref-id">${r.id}</td>
                  <td class="product-name" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.product}">${r.product}</td>
                  <td class="sku-code">${r.sku}</td>
                  <td style="font-weight:600;">${r.qty}</td>
                  <td class="dest">${r.destination}</td>
                  <td>${r.releasedBy}</td>
                  <td>${statusHtml(r.status)}</td>
                  <td class="timestamp">${formatTs(r.timestamp)}</td>
                </tr>`).join('');
    }

    /* ── FILTERS ── */
    function setupFilters() {
        document.querySelectorAll('.fr-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.fr-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filter;
                renderTable();
            });
        });
    }

    /* ── BARCODE LOOKUP ── */
    function lookupSku(sku) {
        const s = sku.trim().toUpperCase();
        return PRODUCT_MAP[s] || null;
    }
    function setupBarcodeInputs() {
        // Page-level scanner
        $('barcodeInput').addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const product = lookupSku(e.target.value);
                if (product) {
                    openModal();
                    $('relSku').value = e.target.value.trim();
                    $('relProductName').value = product;
                    $('relQty').focus();
                }
                e.target.value = '';
            }
        });
        // Modal scanner
        $('modalScan').addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const sku = e.target.value.trim();
                const product = lookupSku(sku);
                $('relSku').value = sku;
                $('relProductName').value = product || '';
                e.target.value = '';
                $('relQty').focus();
            }
        });
        // SKU field auto-fill
        $('relSku').addEventListener('blur', () => {
            if (!$('relProductName').value) {
                const p = lookupSku($('relSku').value);
                if (p) $('relProductName').value = p;
            }
        });
    }

    /* ── MODAL ── */
    function openModal(prefillSku = '', prefillProduct = '') {
        $('relSku').value = prefillSku;
        $('relProductName').value = prefillProduct;
        $('relQty').value = 1;
        $('relDestination').value = '';
        $('relBatch').value = '';
        $('relReleasedBy').value = '';
        $('relNotes').value = '';
        $('releaseModal').classList.add('open');
        setTimeout(() => $('relSku').focus(), 100);
    }
    function closeModal() { $('releaseModal').classList.remove('open'); }

    function showToast(msg) {
        const t = $('frToast');
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    }

    function setupModal() {
        $('btnCreateRelease').addEventListener('click', () => openModal());
        $('btnCloseModal').addEventListener('click', closeModal);
        $('btnCancelModal').addEventListener('click', closeModal);
        $('releaseModal').addEventListener('click', e => { if (e.target === $('releaseModal')) closeModal(); });

        $('releaseForm').addEventListener('submit', e => {
            e.preventDefault();
            const sku = $('relSku').value.trim();
            const product = $('relProductName').value.trim() || lookupSku(sku) || sku;
            const qty = parseInt($('relQty').value) || 1;
            const dest = $('relDestination').value;
            const batch = $('relBatch').value.trim();
            const by = $('relReleasedBy').value.trim();

            const entry = {
                id: nextId(),
                sku: sku || '—',
                product: product,
                qty: qty,
                destination: dest,
                releasedBy: by,
                status: 'Released',
                timestamp: new Date(),
                batch: batch,
            };

            RELEASE_QUEUE.unshift(entry);
            updateStats();
            renderTable();
            closeModal();
            showToast(`✓ Release ${entry.id} logged — ${qty} units → ${dest}`);
        });
    }

    /* ── INIT ── */
    function init() {
        updateStats();
        renderTable();
        setupFilters();
        setupBarcodeInputs();
        setupModal();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
