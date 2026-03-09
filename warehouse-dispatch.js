/* ============================================================
   warehouse-dispatch.js — MN+LA ERP
   Warehouse → Store / Courier operational workflow
   ============================================================ */
(function () {
    'use strict';

    const $ = id => document.getElementById(id);

    /* ── PRODUCT LOOKUP ── */
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

    /* ── DESTINATION TYPE → store select options ── */
    const STORE_OPTIONS = [
        'MN+LA™ ONE AYALA', 'MN+LA™ BGC', 'MN+LA™ SM MEGA MALL',
        'MN+LA™ ARTISAN CAFE GATEWAY II', 'MN+LA™ CIANNAT COMPLEX',
        'MN+LA™ GREENHILLS', 'MN+LA™ SM NORTH EDSA', 'MN+LA™ SM MANILA',
    ];

    /* ── MOCK DISPATCH QUEUE ── */
    const today = new Date();
    function ts(h, m, daysAgo = 0) {
        const d = new Date(today);
        d.setDate(d.getDate() - daysAgo);
        d.setHours(h, m, 0, 0);
        return d;
    }

    let DISPATCH_QUEUE = [
        { id: 'DSP-0095', sku: 'DJP-OBS-30', product: 'DOJO PANTS IN OBSIDIAN', qty: 8, destType: 'DHL', destination: 'DHL Express', packedBy: 'Carlo B.', status: 'In Transit', timestamp: ts(9, 10) },
        { id: 'DSP-0094', sku: 'ART-OLIV-M', product: 'ARTISAN JACKET IN OLIVE', qty: 10, destType: 'J&T', destination: 'J&T Express', packedBy: 'Liza R.', status: 'Dispatched', timestamp: ts(9, 42) },
        { id: 'DSP-0093', sku: 'KDT-CAV-L', product: '"KISS...DON\'T TELL" TEE IN CAVIAR', qty: 12, destType: 'J&T', destination: 'J&T Express', packedBy: 'Carlo B.', status: 'In Transit', timestamp: ts(13, 20) },
        { id: 'DSP-0092', sku: 'CCT-BSND-M', product: 'CHOP CHOP TEE IN BLACK SAND', qty: 6, destType: 'DHL', destination: 'DHL Express', packedBy: 'Liza R.', status: 'Delivered', timestamp: ts(14, 50) },
        { id: 'DSP-0091', sku: 'MPS-CGRY-30', product: 'M+ PINSTRIPE OVERPOCKET PHAT PANTS IN CHARCOAL GREY', qty: 4, destType: 'Rider', destination: 'Rider', packedBy: 'Carlo B.', status: 'Packing', timestamp: ts(15, 5) },
        { id: 'DSP-0090', sku: 'HOE-CAV-M', product: '"HEAVEN ON EARTH" TEE IN CAVIAR', qty: 17, destType: 'Store', destination: 'MN+LA™ ARTISAN CAFE GATEWAY II', packedBy: 'Liza R.', status: 'Ready', timestamp: ts(8, 0, 1) },
        { id: 'DSP-0089', sku: 'HBX-OAT-L', product: '"HITTER" V3 BOX LITE TEE IN OAT', qty: 20, destType: 'Store', destination: 'MN+LA™ ONE AYALA', packedBy: 'Carlo B.', status: 'Delivered', timestamp: ts(11, 0, 1) },
        { id: 'DSP-0088', sku: 'ITP-CAV-L', product: '"INCREASE THE PEACE" TEE IN CAVIAR', qty: 8, destType: 'Store', destination: 'MN+LA™ CIANNAT COMPLEX', packedBy: 'Liza R.', status: 'Delivered', timestamp: ts(14, 0, 2) },
    ];

    let currentFilter = 'today';
    let currentDestType = 'Store';

    /* ── HELPERS ── */
    function formatTs(d) {
        return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    }
    function isToday(d) { return d.toDateString() === today.toDateString(); }
    function isTransit(r) { return r.status === 'In Transit' || r.status === 'Packing' || r.status === 'Ready' || r.status === 'Dispatched'; }
    function isDone(r) { return r.status === 'Delivered'; }
    function nextId() {
        const nums = DISPATCH_QUEUE.map(r => parseInt(r.id.split('-')[1]));
        return 'DSP-' + String(Math.max(...nums) + 1).padStart(4, '0');
    }
    function destTypeChip(type) {
        const map = { 'Store': 'dest-chip--store', 'J&T': 'dest-chip--jnt', 'DHL': 'dest-chip--dhl', 'Rider': 'dest-chip--rider' };
        return `<span class="dest-chip ${map[type] || ''}">${type}</span>`;
    }
    function statusHtml(s) {
        const map = {
            'Packing': 'wd-status--packing',
            'Ready': 'wd-status--ready',
            'Dispatched': 'wd-status--dispatched',
            'In Transit': 'wd-status--in-transit',
            'Delivered': 'wd-status--delivered',
        };
        return `<span class="wd-status ${map[s] || ''}">${s}</span>`;
    }

    /* ── STAT CARDS ── */
    function updateStats() {
        const todayRows = DISPATCH_QUEUE.filter(r => isToday(r.timestamp));
        $('statPacking').textContent = DISPATCH_QUEUE.filter(r => r.status === 'Packing').length;
        $('statReady').textContent = DISPATCH_QUEUE.filter(r => r.status === 'Ready').length;
        $('statDispatched').textContent = todayRows.filter(r => r.status === 'Dispatched' || r.status === 'In Transit' || r.status === 'Delivered').length;
        $('statTransit').textContent = DISPATCH_QUEUE.filter(r => r.status === 'In Transit').length;
    }

    /* ── TABLE RENDER ── */
    function filteredRows() {
        if (currentFilter === 'today') return DISPATCH_QUEUE.filter(r => isToday(r.timestamp));
        if (currentFilter === 'transit') return DISPATCH_QUEUE.filter(isTransit);
        if (currentFilter === 'completed') return DISPATCH_QUEUE.filter(isDone);
        return DISPATCH_QUEUE;
    }
    function renderTable() {
        const rows = filteredRows();
        $('tableCount').textContent = `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`;
        $('dispatchTableBody').innerHTML = rows.length === 0
            ? `<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted);">No dispatches found for this period.</td></tr>`
            : rows.map(r => `
                <tr>
                  <td class="ref-id">${r.id}</td>
                  <td class="product-name" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.product}">${r.product}</td>
                  <td class="sku-code">${r.sku}</td>
                  <td style="font-weight:600;">${r.qty}</td>
                  <td>${destTypeChip(r.destType)}</td>
                  <td>${r.destination}</td>
                  <td>${r.packedBy}</td>
                  <td>${statusHtml(r.status)}</td>
                  <td class="timestamp">${formatTs(r.timestamp)}</td>
                </tr>`).join('');
    }

    /* ── FILTERS ── */
    function setupFilters() {
        document.querySelectorAll('.wd-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.wd-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filter;
                renderTable();
            });
        });
    }

    /* ── DESTINATION TYPE SELECTOR (inside modal) ── */
    function updateDestField(type) {
        currentDestType = type;
        $('dspDestType').value = type;
        const destEl = $('dspDestination');
        if (type === 'Store') {
            destEl.innerHTML = '<option value="">Select store…</option>' +
                STORE_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join('');
        } else if (type === 'Rider') {
            destEl.innerHTML = '<option value="Rider">Rider (Company)</option><option value="">Enter name below…</option>';
        } else if (type === 'J&T') {
            destEl.innerHTML = '<option value="J&T Express">J&T Express</option>';
        } else if (type === 'DHL') {
            destEl.innerHTML = '<option value="DHL Express">DHL Express</option>';
        }
    }
    function setupDestTypeButtons() {
        document.querySelectorAll('.dest-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.dest-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updateDestField(btn.dataset.destType);
            });
        });
    }

    /* ── BARCODE LOOKUP ── */
    function lookupSku(sku) { return PRODUCT_MAP[sku.trim().toUpperCase()] || null; }
    function setupBarcodeInputs() {
        $('barcodeInput').addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const product = lookupSku(e.target.value);
                if (product) {
                    openModal();
                    $('dspSku').value = e.target.value.trim();
                    $('dspProductName').value = product;
                    $('dspQty').focus();
                }
                e.target.value = '';
            }
        });
        $('modalScan').addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const sku = e.target.value.trim();
                const product = lookupSku(sku);
                $('dspSku').value = sku;
                $('dspProductName').value = product || '';
                e.target.value = '';
                $('dspQty').focus();
            }
        });
        $('dspSku').addEventListener('blur', () => {
            if (!$('dspProductName').value) {
                const p = lookupSku($('dspSku').value);
                if (p) $('dspProductName').value = p;
            }
        });
    }

    /* ── MODAL ── */
    function openModal() {
        $('dspSku').value = '';
        $('dspProductName').value = '';
        $('dspQty').value = 1;
        $('dspReference').value = '';
        $('dspPackedBy').value = '';
        $('dspNotes').value = '';
        document.querySelectorAll('.dest-type-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.dest-type-btn[data-dest-type="Store"]').classList.add('active');
        updateDestField('Store');
        $('dispatchModal').classList.add('open');
        setTimeout(() => $('dspSku').focus(), 100);
    }
    function closeModal() { $('dispatchModal').classList.remove('open'); }

    function showToast(msg) {
        const t = $('wdToast');
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    }

    function setupModal() {
        $('btnCreateDispatch').addEventListener('click', openModal);
        $('btnCloseModal').addEventListener('click', closeModal);
        $('btnCancelModal').addEventListener('click', closeModal);
        $('dispatchModal').addEventListener('click', e => { if (e.target === $('dispatchModal')) closeModal(); });

        $('dispatchForm').addEventListener('submit', e => {
            e.preventDefault();
            const sku = $('dspSku').value.trim();
            const product = $('dspProductName').value.trim() || lookupSku(sku) || sku;
            const qty = parseInt($('dspQty').value) || 1;
            const destType = $('dspDestType').value;
            const dest = $('dspDestination').value;
            const ref = $('dspReference').value.trim();
            const by = $('dspPackedBy').value.trim();

            const entry = {
                id: nextId(),
                sku: sku || '—',
                product: product,
                qty: qty,
                destType: destType,
                destination: dest,
                packedBy: by,
                status: 'Dispatched',
                timestamp: new Date(),
                reference: ref,
            };

            DISPATCH_QUEUE.unshift(entry);
            updateStats();
            renderTable();
            closeModal();
            showToast(`✓ Dispatch ${entry.id} logged — ${qty} units via ${destType} → ${dest}`);
        });
    }

    /* ── INIT ── */
    function init() {
        updateStats();
        updateDestField('Store');
        renderTable();
        setupFilters();
        setupDestTypeButtons();
        setupBarcodeInputs();
        setupModal();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
