/* ============================================================
   MN+LA ERP — Inventory & Warehouse  (inventory.js)
   v3 — Tab navigation, Product Lookup, Filters
   ============================================================ */

(function () {
    'use strict';

    /* ------------------------------------------------------------
       MOCK DATA
    ------------------------------------------------------------ */
    const MOCK_INVENTORY = [
        { sku: 'MON-FERN-S', product: '"MONARCH" S/S DRAPE IN FERN', size: 'S', color: 'Fern', location: 'Warehouse', available: 42, reserved: 5 },
        { sku: 'CCT-BSND-M', product: 'CHOP CHOP TEE IN BLACK SAND', size: 'M', color: 'Black Sand', location: 'Warehouse', available: 28, reserved: 3 },
        { sku: 'APX-LILAC-OS', product: 'APEX RING IN LILAC', size: 'ONE', color: 'Lilac', location: 'Warehouse', available: 7, reserved: 0 },
        { sku: 'APX-STDE-OS', product: 'APEX RING IN STEEL TIDE', size: 'ONE', color: 'Steel Tide', location: 'Warehouse', available: 15, reserved: 2 },
        { sku: 'HIT-WHT-M', product: '"HITTER" V3 LONGSLEEVE TEE IN WHITE', size: 'M', color: 'White', location: 'MN+LA™ BGC', available: 0, reserved: 0 },
        { sku: 'HBX-OAT-L', product: '"HITTER" V3 BOX LITE TEE IN OAT', size: 'L', color: 'Oat', location: 'MN+LA™ ONE AYALA', available: 22, reserved: 4 },
        { sku: 'ART-OLIV-M', product: 'ARTISAN JACKET IN OLIVE', size: 'M', color: 'Olive', location: 'Warehouse', available: 5, reserved: 0 },
        { sku: 'DJP-OBS-30', product: 'DOJO PANTS IN OBSIDIAN', size: '30', color: 'Obsidian', location: 'Warehouse', available: 63, reserved: 8 },
        { sku: 'DKJ-OLIV-S', product: 'DECK JACKET IN OLIVE', size: 'S', color: 'Olive', location: 'MN+LA™ SM NORTH EDSA', available: 3, reserved: 0 },
        { sku: 'DKP-INKF-32', product: 'DOUBLE KNEE PHAT PANTS IN INK FALL', size: '32', color: 'Ink Fall', location: 'MN+LA™ SM MANILA', available: 0, reserved: 0 },
        { sku: 'KDT-NVY-M', product: '"KISS...DON\'T TELL" TEE IN NAVY', size: 'M', color: 'Navy', location: 'Warehouse', available: 19, reserved: 1 },
        { sku: 'MPS-CGRY-30', product: 'M+ PINSTRIPE OVERPOCKET PHAT PANTS IN CHARCOAL GREY', size: '30', color: 'Charcoal Grey', location: 'Warehouse', available: 11, reserved: 0 },
        { sku: 'KDT-CAV-L', product: '"KISS...DON\'T TELL" TEE IN CAVIAR', size: 'L', color: 'Caviar', location: 'MN+LA™ GREENHILLS', available: 34, reserved: 6 },
        { sku: 'PHP-HGRY-30', product: 'PHAT PANTS IN HEATHER GREY', size: '30', color: 'Heather Grey', location: 'MN+LA™ SM MEGA MALL', available: 6, reserved: 0 },
        { sku: 'ITP-GLCR-M', product: '"INCREASE THE PEACE" TEE IN GLACIER', size: 'M', color: 'Glacier', location: 'Warehouse', available: 0, reserved: 0 },
        { sku: 'NWP-DTEL-30', product: 'NEEDLEWORK PANTS IN DEEP TEAL', size: '30', color: 'Deep Teal', location: 'Warehouse', available: 14, reserved: 2 },
        { sku: 'ITP-CAV-L', product: '"INCREASE THE PEACE" TEE IN CAVIAR', size: 'L', color: 'Caviar', location: 'MN+LA™ CIANNAT COMPLEX', available: 8, reserved: 1 },
        { sku: 'MMP-OLIV-30', product: '"MULTI M+" PHAT PANTS IN OLIVE', size: '30', color: 'Olive', location: 'Warehouse', available: 25, reserved: 3 },
        { sku: 'HOE-CAV-M', product: '"HEAVEN ON EARTH" TEE IN CAVIAR', size: 'M', color: 'Caviar', location: 'MN+LA™ ARTISAN CAFE GATEWAY II', available: 17, reserved: 0 },
        { sku: 'DJP-STGRY-32', product: 'DOJO PANTS IN STONE GREY', size: '32', color: 'Stone Grey', location: 'MN+LA™ BGC', available: 0, reserved: 0 },
    ];

    const MOCK_MOVEMENTS = [
        { time: '08:30', type: 'factory-release', product: '"MONARCH" S/S DRAPE IN FERN', qty: 50, from: 'Factory', to: 'Warehouse' },
        { time: '09:10', type: 'factory-release', product: '"HITTER" V3 BOX LITE TEE IN OAT', qty: 30, from: 'Factory', to: 'MN+LA™ ONE AYALA' },
        { time: '09:42', type: 'dispatch', product: 'ARTISAN JACKET IN OLIVE', qty: 10, from: 'Warehouse', to: 'J&T Express' },
        { time: '10:05', type: 'dispatch', product: 'DOJO PANTS IN OBSIDIAN', qty: 8, from: 'Warehouse', to: 'DHL Express' },
        { time: '11:00', type: 'adjustment', product: 'DOUBLE KNEE PHAT PANTS IN INK FALL', qty: -2, from: 'Warehouse', to: '—' },
        { time: '11:30', type: 'factory-release', product: 'NEEDLEWORK PANTS IN DEEP TEAL', qty: 20, from: 'Factory', to: 'Warehouse' },
        { time: '12:15', type: 'dispatch', product: 'M+ PINSTRIPE OVERPOCKET PHAT PANTS IN CHARCOAL GREY', qty: 4, from: 'Warehouse', to: 'Rider' },
        { time: '13:20', type: 'dispatch', product: '"KISS...DON\'T TELL" TEE IN CAVIAR', qty: 12, from: 'Warehouse', to: 'J&T Express' },
        { time: '14:05', type: 'return', product: '"INCREASE THE PEACE" TEE IN GLACIER', qty: 3, from: 'MN+LA™ BGC', to: 'Warehouse' },
        { time: '14:50', type: 'dispatch', product: 'CHOP CHOP TEE IN BLACK SAND', qty: 6, from: 'Warehouse', to: 'DHL Express' },
    ];

    const MOCK_TRANSFERS = [
        { id: 'REL-0041', product: '"MONARCH" S/S DRAPE IN FERN', qty: 50, from: 'Factory', to: 'Warehouse', status: 'Released' },
        { id: 'REL-0040', product: '"HITTER" V3 BOX LITE TEE IN OAT', qty: 30, from: 'Factory', to: 'MN+LA™ ONE AYALA', status: 'Released' },
        { id: 'REL-0039', product: 'NEEDLEWORK PANTS IN DEEP TEAL', qty: 20, from: 'Factory', to: 'Warehouse', status: 'In Transit' },
        { id: 'DSP-0091', product: 'ARTISAN JACKET IN OLIVE', qty: 10, from: 'Warehouse', to: 'J&T Express', status: 'Picked Up' },
        { id: 'DSP-0090', product: 'DOJO PANTS IN OBSIDIAN', qty: 8, from: 'Warehouse', to: 'DHL Express', status: 'In Transit' },
        { id: 'DSP-0089', product: '"KISS...DON\'T TELL" TEE IN CAVIAR', qty: 12, from: 'Warehouse', to: 'J&T Express', status: 'In Transit' },
        { id: 'DSP-0088', product: 'CHOP CHOP TEE IN BLACK SAND', qty: 6, from: 'Warehouse', to: 'DHL Express', status: 'Delivered' },
        { id: 'DSP-0087', product: 'M+ PINSTRIPE OVERPOCKET PHAT PANTS IN CHARCOAL GREY', qty: 4, from: 'Warehouse', to: 'Rider', status: 'Preparing' },
    ];

    /* Simulate per-location breakdown for product lookup */
    const LOCATION_BREAKDOWN = {
        '"MONARCH" S/S DRAPE IN FERN': [
            { location: 'Warehouse', qty: 42, reserved: 5 },
            { location: 'MN+LA™ BGC', qty: 12, reserved: 0 },
            { location: 'MN+LA™ ONE AYALA', qty: 6, reserved: 0 },
            { location: 'MN+LA™ SM MEGA MALL', qty: 3, reserved: 0 },
        ],
        'ARTISAN JACKET IN OLIVE': [
            { location: 'Warehouse', qty: 5, reserved: 0 },
            { location: 'MN+LA™ BGC', qty: 10, reserved: 1 },
            { location: 'MN+LA™ ONE AYALA', qty: 8, reserved: 0 },
        ],
        'DOJO PANTS IN OBSIDIAN': [
            { location: 'Warehouse', qty: 63, reserved: 8 },
            { location: 'MN+LA™ ONE AYALA', qty: 8, reserved: 0 },
        ],
        'DECK JACKET IN OLIVE': [
            { location: 'MN+LA™ SM NORTH EDSA', qty: 3, reserved: 0 },
            { location: 'MN+LA™ SM MANILA', qty: 0, reserved: 0 },
        ],
        '"KISS...DON\'T TELL" TEE IN NAVY': [
            { location: 'Warehouse', qty: 19, reserved: 1 },
            { location: 'MN+LA™ GREENHILLS', qty: 12, reserved: 0 },
        ],
        '"KISS...DON\'T TELL" TEE IN CAVIAR': [
            { location: 'Warehouse', qty: 34, reserved: 6 },
            { location: 'MN+LA™ GREENHILLS', qty: 12, reserved: 0 },
            { location: 'MN+LA™ SM MEGA MALL', qty: 4, reserved: 0 },
        ],
        '"INCREASE THE PEACE" TEE IN GLACIER': [
            { location: 'Warehouse', qty: 0, reserved: 0 },
        ],
        '"INCREASE THE PEACE" TEE IN CAVIAR': [
            { location: 'Warehouse', qty: 14, reserved: 2 },
            { location: 'MN+LA™ CIANNAT COMPLEX', qty: 8, reserved: 1 },
        ],
        'NEEDLEWORK PANTS IN DEEP TEAL': [
            { location: 'Warehouse', qty: 14, reserved: 2 },
            { location: 'MN+LA™ ARTISAN CAFE GATEWAY II', qty: 17, reserved: 0 },
        ],
        'PHAT PANTS IN HEATHER GREY': [
            { location: 'MN+LA™ SM MEGA MALL', qty: 6, reserved: 0 },
        ],
    };

    /* -------------------------------------------------------
       STATE
    ------------------------------------------------------- */
    let allRows = [];
    let activeTab = 'lookup';
    let locationFilter = '';
    let statusFilter = '';
    let lowStockOnly = false;
    let currentPage = 1;
    const pageSize = 50;

    /* -------------------------------------------------------
       HELPERS
    ------------------------------------------------------- */
    const $ = id => document.getElementById(id);

    function stockStatus(qty) {
        if (qty === 0) return { label: 'Out of Stock', cls: 'badge--red' };
        if (qty < 10) return { label: 'Low Stock', cls: 'badge--amber' };
        return { label: 'Healthy', cls: 'badge--green' };
    }

    function movTypeBadge(type) {
        const map = {
            'factory-release': '<span class="mvt" style="background:rgba(52,211,153,.12);color:#34d399;border-color:rgba(52,211,153,.3);">Factory Release</span>',
            'dispatch': '<span class="mvt" style="background:rgba(96,165,250,.12);color:#60a5fa;border-color:rgba(96,165,250,.3);">Dispatch</span>',
            'adjustment': '<span class="mvt mvt-adjustment">Adjust</span>',
            'return': '<span class="mvt mvt-return">Return</span>',
            'pullout': '<span class="mvt mvt-pullout">Pull Out</span>',
            // legacy
            'receive': '<span class="mvt mvt-receive">Receive</span>',
            'transfer': '<span class="mvt mvt-transfer">Transfer</span>',
        };
        return map[type] || `<span class="mvt">${type}</span>`;
    }

    function transferBadge(s) {
        const map = {
            'Preparing': 'badge--gray',
            'In Transit': 'badge--blue',
            'Picked Up': 'badge--blue',
            'Released': 'badge--green',
            'Delivered': 'badge--green',
        };
        return `<span class="badge ${map[s] || 'badge--gray'}">${s}</span>`;
    }

    function qtyDelta(n) {
        const abs = Math.abs(n), sign = n < 0 ? '−' : '+', color = n < 0 ? '#ff4d6a' : '#34d399';
        return `<span style="color:${color};font-weight:600;">${sign}${abs}</span>`;
    }

    /* -------------------------------------------------------
       STAT CARDS
    ------------------------------------------------------- */
    function updateStats(rows) {
        const total = rows.reduce((s, r) => s + r.available, 0);
        const skus = new Set(rows.map(r => r.sku)).size;
        const received = MOCK_MOVEMENTS.filter(m => m.type === 'receive').reduce((s, m) => s + m.qty, 0);
        const sent = MOCK_MOVEMENTS.filter(m => m.type === 'transfer').reduce((s, m) => s + m.qty, 0);
        const transit = MOCK_TRANSFERS.filter(t => t.status === 'In Transit').length;
        const attention = rows.filter(r => r.available < 10).length;

        const set = (id, v) => { const el = $(id); if (el) el.textContent = v.toLocaleString(); };
        set('sc-units', total);
        set('sc-skus', skus);
        set('sc-received', received);
        set('sc-sent', sent);
        set('sc-transit', transit);
        set('sc-attention', attention);

        // Alert tab badge
        const badge = $('alertTabBadge');
        if (badge) badge.textContent = attention;

        const navBadge = $('navNotifBadge');
        if (navBadge) { navBadge.textContent = attention; navBadge.style.display = attention > 0 ? 'flex' : 'none'; }
    }

    /* -------------------------------------------------------
       INVENTORY TABLE (with filters)
    ------------------------------------------------------- */
    function applyFilters(rows) {
        return rows.filter(r => {
            if (locationFilter && r.location !== locationFilter) return false;
            if (statusFilter === 'healthy' && r.available < 10) return false;
            if (statusFilter === 'low' && (r.available === 0 || r.available >= 10)) return false;
            if (statusFilter === 'out' && r.available !== 0) return false;
            if (lowStockOnly && r.available >= 10) return false;
            return true;
        });
    }

    function renderInventoryTable(rows) {
        const filtered = applyFilters(rows);
        const tbody = $('inventoryTableBody');
        const countEl = $('invCount');
        if (!tbody) return;

        if (countEl) countEl.textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;

        if (!filtered.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="table-empty">No items match the selected filters.</td></tr>`;
            removePagination();
            return;
        }

        const totalPages = Math.ceil(filtered.length / pageSize);
        if (currentPage > totalPages) currentPage = totalPages;
        const startIndex = (currentPage - 1) * pageSize;
        const paginated = filtered.slice(startIndex, startIndex + pageSize);

        tbody.innerHTML = paginated.map(r => {
            const st = stockStatus(r.available);
            return `<tr data-sku="${r.sku}" title="Click to edit">
        <td><span class="sku">${r.sku}</span></td>
        <td style="font-weight:500;">${r.product}</td>
        <td style="color:var(--text-secondary);">${r.size}</td>
        <td style="color:var(--text-secondary);">${r.color}</td>
        <td style="color:var(--text-secondary);">${r.location}</td>
        <td style="font-weight:600;">${r.available.toLocaleString()}</td>
        <td style="color:var(--text-secondary);">${r.reserved.toLocaleString()}</td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
      </tr>`;
        }).join('');

        // clickable rows -> edit modal
        tbody.querySelectorAll('tr[data-sku]').forEach(tr => {
            tr.addEventListener('click', () => openEditProduct(tr.dataset.sku));
        });

        renderPaginationControls(totalPages);
    }

    function removePagination() {
        const existing = $('inventoryPagination');
        if (existing) existing.remove();
    }

    function renderPaginationControls(totalPages) {
        removePagination();
        if (totalPages <= 1) return;

        const tableCard = $('inventoryTable').closest('.table-card');
        const pagWrap = document.createElement('div');
        pagWrap.id = 'inventoryPagination';
        pagWrap.style.cssText = 'display:flex; justify-content:center; gap:8px; padding:16px; border-top:1px solid rgba(255,255,255,.05);';

        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            btn.style.cssText = `
                padding: 6px 12px;
                border-radius: 6px;
                border: 1px solid ${i === currentPage ? '#60a5fa' : 'rgba(255,255,255,.1)'};
                background: ${i === currentPage ? 'rgba(96,165,250,.1)' : 'var(--bg-secondary)'};
                color: ${i === currentPage ? '#60a5fa' : 'var(--text-primary)'};
                cursor: pointer;
                font-family: inherit;
                font-weight: 500;
                font-size: 0.8rem;
                transition: all 0.15s;
            `;
            btn.onclick = () => {
                currentPage = i;
                renderInventoryTable(allRows);
            };
            pagWrap.appendChild(btn);
        }
        tableCard.appendChild(pagWrap);
    }

    /* -------------------------------------------------------
       POPULATE LOCATION FILTER
    ------------------------------------------------------- */
    function populateLocationFilter(rows) {
        const sel = $('filterLocation');
        if (!sel) return;
        const locations = [...new Set(rows.map(r => r.location))].sort();
        sel.innerHTML = '<option value="">All Locations</option>' +
            locations.map(l => `< option value = "${l}" > ${l}</option > `).join('');
    }

    /* -------------------------------------------------------
       MOVEMENTS TABLE
    ------------------------------------------------------- */
    function renderMovements(rows) {
        const tbody = $('movementsTableBody');
        const countEl = $('movCount');
        if (!tbody) return;
        if (countEl) countEl.textContent = rows.length;
        if (!rows.length) {
            tbody.innerHTML = `< tr > <td colspan="6" class="table-empty">No movements logged today.</td></tr > `;
            return;
        }
        tbody.innerHTML = rows.map((m, idx) => `< tr data - idx="${idx}" title = "Click to create a related movement" >
      <td style="color:var(--text-secondary);white-space:nowrap;">${m.time}</td>
      <td>${movTypeBadge(m.type)}</td>
      <td style="font-weight:500;">${m.product}</td>
      <td>${qtyDelta(m.qty)}</td>
      <td style="color:var(--text-secondary);">${m.from}</td>
      <td style="color:var(--text-secondary);">${m.to}</td>
    </tr > `).join('');

        // clickable movement rows -> open movement modal pre-filled
        tbody.querySelectorAll('tr[data-idx]').forEach(tr => {
            tr.addEventListener('click', () => {
                const m = rows[parseInt(tr.dataset.idx)];
                openMovementModal({ product: m.product, from: m.to === '—' ? m.from : m.to });
            });
        });
    }

    /* -------------------------------------------------------
       TRANSFERS TABLE
    ------------------------------------------------------- */
    function renderTransfers(rows) {
        const tbody = $('transfersTableBody');
        const countEl = $('trnCount');
        if (!tbody) return;
        if (countEl) countEl.textContent = rows.length;
        if (!rows.length) {
            tbody.innerHTML = `< tr > <td colspan="6" class="table-empty">No active transfers.</td></tr > `;
            return;
        }
        tbody.innerHTML = rows.map(t => `< tr >
      <td><span class="sku">${t.id}</span></td>
      <td style="font-weight:500;">${t.product}</td>
      <td style="font-weight:600;">${t.qty}</td>
      <td style="color:var(--text-secondary);">${t.from}</td>
      <td style="color:var(--text-secondary);">${t.to}</td>
      <td>${transferBadge(t.status)}</td>
    </tr > `).join('');
    }

    /* -------------------------------------------------------
       ALERTS TABLE
    ------------------------------------------------------- */
    function renderAlerts(rows) {
        const tbody = $('alertsTableBody');
        const countEl = $('alertCount');
        if (!tbody) return;
        const low = rows.filter(r => r.available < 10);
        if (countEl) countEl.textContent = low.length;
        if (!low.length) {
            tbody.innerHTML = `< tr > <td colspan="5" class="table-empty" style="color:#34d399;">✓ All items are sufficiently stocked.</td></tr > `;
            return;
        }
        tbody.innerHTML = low.map(r => {
            const st = stockStatus(r.available);
            return `< tr >
        <td style="font-weight:500;">${r.product} <span style="color:var(--text-muted);font-size:.75rem;">${r.size} / ${r.color}</span></td>
        <td><span class="sku">${r.sku}</span></td>
        <td style="color:var(--text-secondary);">${r.location}</td>
        <td style="font-weight:600;color:${r.available === 0 ? '#ff4d6a' : '#f5a623'};">${r.available}</td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
      </tr > `;
        }).join('');
    }

    /* -------------------------------------------------------
       PRODUCT DETAIL CARD
    ------------------------------------------------------- */
    function renderProductDetail(results, query) {
        const pdc = $('productDetailCard');
        const emptyState = $('lookupEmptyState');
        if (!pdc) return;

        if (!results || results.length === 0) {
            pdc.style.display = 'none';
            emptyState.style.display = 'none';
            pdc.innerHTML = '';

            // Show not-found
            const nf = document.createElement('div');
            nf.style.cssText = 'text-align:center;padding:36px 24px;color:var(--text-muted);';
            nf.innerHTML = `< span class="material-icons-round" style = "font-size:2rem;display:block;margin-bottom:10px;color:var(--text-muted);" > search_off</span >
        <div style="font-size:.88rem;color:var(--text-secondary);margin-bottom:4px;">No results for "<strong style="color:var(--text-primary);">${query}</strong>"</div>
        <div style="font-size:.76rem;">Try searching by product name, SKU, or item code.</div>`;
            pdc.innerHTML = '';
            pdc.appendChild(nf);
            pdc.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Group by product name
        const productName = results[0].product;
        const sku = results[0].sku;
        const variants = [...new Set(results.map(r => r.size).filter(Boolean))];
        const colors = [...new Set(results.map(r => r.color).filter(Boolean))];
        const totalAvail = results.reduce((s, r) => s + r.available, 0);
        const overallStatus = stockStatus(totalAvail);

        // Build per-location breakdown (use LOCATION_BREAKDOWN if available, else from rows)
        const breakdown = LOCATION_BREAKDOWN[productName] ||
            results.map(r => ({ location: r.location, qty: r.available, reserved: r.reserved }));
        const locationColors = ['#60a5fa', '#34d399', '#a78bfa', '#f472b6', '#f5a623', '#2dd4bf'];

        pdc.innerHTML = `
                <div class="product-detail-card">
      <div class="pdc-header">
        <div class="pdc-header-info">
          <div class="pdc-code">
            <span class="material-icons-round" style="font-size:.9rem;">qr_code</span>
            ${sku}
          </div>
          <div class="pdc-name">${productName}</div>
          <div class="pdc-variants">
            ${variants.map(s => `<span class="pdc-variant-chip">Size: ${s}</span>`).join('')}
            ${colors.map(c => `<span class="pdc-variant-chip">Color: ${c}</span>`).join('')}
          </div>
        </div>
        <div class="pdc-status" style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <button class="pdc-close-btn" onclick="window.invCloseLookup()">
            <span class="material-icons-round">close</span>
          </button>
          <span class="badge ${overallStatus.cls}" style="font-size:.72rem;">${overallStatus.label}</span>
        </div>
      </div>
      <div class="pdc-body">
        <div class="pdc-section-label">Stock Availability by Location</div>
        <table class="pdc-location-table">
          <tbody>
            ${breakdown.map((loc, i) => {
            const locStatus = stockStatus(loc.qty);
            return `<tr>
                <td class="pdc-location-name">
                  <span class="pdc-location-dot" style="background:${locationColors[i % locationColors.length]};"></span>
                  <span>${loc.location}</span>
                </td>
                <td style="color:var(--text-secondary);font-size:.75rem;">
                  ${loc.reserved > 0 ? `<span style="opacity:.6;">(${loc.reserved} reserved)</span>` : ''}
                </td>
                <td>
                  <span style="font-size:1rem;font-weight:700;color:${loc.qty === 0 ? '#ff4d6a' : loc.qty < 10 ? '#f5a623' : 'var(--text-primary)'};">
                    ${loc.qty.toLocaleString()}
                  </span>
                  <span style="font-size:.72rem;color:var(--text-muted);margin-left:3px;">units</span>
                </td>
              </tr>`;
        }).join('')}
            <tr class="pdc-total-row">
              <td><strong>Total Available</strong></td>
              <td></td>
              <td><strong style="font-size:1.1rem;">${totalAvail.toLocaleString()} units</strong></td>
            </tr>
          </tbody>
        </table>
        ${renderAuditTrail(productName)}
      </div>
      <div style="display:flex;gap:8px;padding:0 24px 20px;border-top:1px solid rgba(255,255,255,.04);padding-top:16px;margin-top:4px;">
        <button onclick="openEditProduct('${results[0].sku}')" class="inv-action-btn" style="flex:1;justify-content:center;font-size:.78rem;padding:8px 10px;">
          <span class="material-icons-round">edit</span> Edit Product
        </button>
        <button onclick="openMovementModal({product:'${productName}',from:'Warehouse'})" class="inv-action-btn inv-action-btn--primary" style="flex:1;justify-content:center;font-size:.78rem;padding:8px 10px;">
          <span class="material-icons-round">swap_horiz</span> Move Stock
        </button>
      </div>
    </div > `;

        pdc.style.display = 'block';
    }

    window.invCloseLookup = function () {
        const pdc = $('productDetailCard');
        const empty = $('lookupEmptyState');
        const inp = $('skuLookup');
        const clr = $('skuLookupClear');
        if (pdc) { pdc.style.display = 'none'; pdc.innerHTML = ''; }
        if (empty) empty.style.display = 'block';
        if (inp) inp.value = '';
        if (clr) clr.style.display = 'none';
    };

    // Expose to global scope for inline onclick handlers in product detail card
    window.openEditProduct = sku => openEditProduct(sku);
    window.openMovementModal = opts => openMovementModal(opts);

    /* -------------------------------------------------------
       PRODUCT LOOKUP SEARCH
    ------------------------------------------------------- */
    function setupLookup(rows) {
        const inp = $('skuLookup');
        const clr = $('skuLookupClear');
        const empty = $('lookupEmptyState');
        if (!inp) return;

        let debounceTimer;

        inp.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const q = inp.value.trim();
            clr.style.display = q ? 'flex' : 'none';

            if (!q) {
                const pdc = $('productDetailCard');
                if (pdc) { pdc.style.display = 'none'; pdc.innerHTML = ''; }
                if (empty) empty.style.display = 'block';
                return;
            }

            debounceTimer = setTimeout(() => {
                const ql = q.toLowerCase();
                const results = rows.filter(r =>
                    (r.sku || '').toLowerCase().includes(ql) ||
                    (r.product || '').toLowerCase().includes(ql) ||
                    (r.color || '').toLowerCase().includes(ql) ||
                    (r.size || '').toLowerCase().includes(ql)
                );
                renderProductDetail(results, q);
            }, 180);
        });

        clr.addEventListener('click', window.invCloseLookup);

        // Allow barcode scanning (Enter key auto-searches)
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                clearTimeout(debounceTimer);
                const q = inp.value.trim();
                if (!q) return;
                const ql = q.toLowerCase();
                const results = rows.filter(r =>
                    (r.sku || '').toLowerCase().includes(ql) ||
                    (r.product || '').toLowerCase().includes(ql)
                );
                renderProductDetail(results, q);
            }
        });

        const scanBtn = $('btnScanBarcode');
        if (scanBtn) {
            scanBtn.addEventListener('click', () => {
                inp.focus();
                window.Auth.toast('Position barcode in front of scanner — field is ready.', 'info');
            });
        }
    }

    /* -------------------------------------------------------
       TAB SWITCHING
    ------------------------------------------------------- */
    function setupTabs() {
        document.querySelectorAll('.inv-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                document.querySelectorAll('.inv-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const panel = document.getElementById('panel-' + tab);
                if (panel) panel.classList.add('active');
                activeTab = tab;
            });
        });
    }

    /* -------------------------------------------------------
       FILTER SETUP
    ------------------------------------------------------- */
    function setupFilters(rows) {
        const locSel = $('filterLocation');
        const stsSel = $('filterStatus');
        const lowBtn = $('filterLowStockOnly');

        if (locSel) locSel.addEventListener('change', () => { locationFilter = locSel.value; currentPage = 1; renderInventoryTable(rows); });
        if (stsSel) stsSel.addEventListener('change', () => { statusFilter = stsSel.value; currentPage = 1; renderInventoryTable(rows); });
        if (lowBtn) {
            lowBtn.addEventListener('click', () => {
                lowStockOnly = !lowStockOnly;
                currentPage = 1;
                lowBtn.classList.toggle('active', lowStockOnly);
                renderInventoryTable(rows);
            });
        }
    }

    /* -------------------------------------------------------
       RECEIVE MODAL
    ------------------------------------------------------- */
    function setupReceiveModal() {
        const modal = $('receiveModal');
        const openBtn = $('btnReceiveInventory');
        const closeBtn = $('btnCloseReceiveModal');
        const form = $('receiveForm');
        const submit = $('btnSubmitReceive');

        if (openBtn) openBtn.addEventListener('click', () => { modal.style.display = 'flex'; });
        if (closeBtn) closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
        if (modal) modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!window.db) { window.Auth.toast('Database not connected in demo mode.', 'info'); modal.style.display = 'none'; return; }
                const productId = $('recvProduct').value;
                const locationId = $('recvLocation').value;
                const qty = parseInt($('recvQuantity').value, 10);
                const notes = $('recvNotes').value.trim();
                if (!productId || !locationId || !qty || qty <= 0) {
                    window.Auth.toast('Please fill all required fields.', 'error'); return;
                }
                submit.disabled = true; submit.textContent = 'Processing…';
                const { error } = await window.db.rpc('receive_stock', {
                    p_product_id: productId, p_location_id: locationId, p_quantity: qty, p_notes: notes || null
                });
                submit.disabled = false; submit.textContent = 'Receive Items';
                if (error) { window.Auth.toast(error.message || 'Error', 'error'); return; }
                window.Auth.toast('Stock received successfully!', 'success');
                modal.style.display = 'none'; form.reset();
            });
        }

        // Secondary action button placeholders
        ['btnTransferStore', 'btnPullOut', 'btnRawMaterials'].forEach(id => {
            const btn = $(id);
            if (btn) btn.addEventListener('click', () => window.Auth.toast(`${btn.textContent.trim()} — coming soon`, 'info'));
        });
    }

    /* -------------------------------------------------------
       LOAD FROM DB (with mock fallback)
    ------------------------------------------------------- */
    async function loadData() {
        if (!window.db) return MOCK_INVENTORY;
        try {
            // Fetch all products, including their inventory and location data
            const { data, error } = await window.db
                .from('products')
                .select(`
            id, sku, name, size, color,
                inventory(quantity, locations(name))
                    `)
                .order('name', { ascending: true });

            if (error || !data) return MOCK_INVENTORY;

            let rows = [];
            data.forEach(p => {
                if (!p.inventory || p.inventory.length === 0) {
                    rows.push({
                        sku: p.sku || '—',
                        product: p.name || 'Unknown',
                        size: p.size || '',
                        color: p.color || '',
                        location: '—',
                        available: 0,
                        reserved: 0
                    });
                } else {
                    p.inventory.forEach(inv => {
                        rows.push({
                            sku: p.sku || '—',
                            product: p.name || 'Unknown',
                            size: p.size || '',
                            color: p.color || '',
                            location: inv.locations?.name || '—',
                            available: inv.quantity || 0,
                            reserved: 0
                        });
                    });
                }
            });
            return rows;
        } catch (_) { return MOCK_INVENTORY; }
    }

    /* -------------------------------------------------------
       AUDIT TRAIL DATA
    ------------------------------------------------------- */
    const MOCK_AUDIT_TRAIL = {
        '"MONARCH" S/S DRAPE IN FERN': [
            { time: 'Mar 7, 09:14', type: 'receive', color: '#34d399', text: '<strong>+50 units</strong> received from <strong>Supplier</strong> → Warehouse' },
            { time: 'Mar 7, 14:50', type: 'transfer', color: '#60a5fa', text: '<strong>6 units</strong> transferred → <strong>MN+LA™ SM MEGA MALL</strong>' },
            { time: 'Mar 6, 10:00', type: 'receive', color: '#34d399', text: '<strong>+30 units</strong> received from <strong>Supplier</strong> → Warehouse' },
            { time: 'Mar 5, 15:30', type: 'transfer', color: '#60a5fa', text: '<strong>12 units</strong> transferred → <strong>MN+LA™ BGC</strong>' },
        ],
        'ARTISAN JACKET IN OLIVE': [
            { time: 'Mar 7, 09:42', type: 'transfer', color: '#60a5fa', text: '<strong>10 units</strong> transferred → <strong>MN+LA™ BGC</strong>' },
            { time: 'Mar 6, 11:00', type: 'receive', color: '#34d399', text: '<strong>+22 units</strong> received from <strong>Supplier</strong> → Warehouse' },
        ],
        'DOJO PANTS IN OBSIDIAN': [
            { time: 'Mar 7, 10:05', type: 'transfer', color: '#60a5fa', text: '<strong>8 units</strong> transferred → <strong>MN+LA™ ONE AYALA</strong>' },
            { time: 'Mar 6, 09:00', type: 'receive', color: '#34d399', text: '<strong>+30 units</strong> received from <strong>Supplier</strong> → Warehouse' },
        ],
        'DOUBLE KNEE PHAT PANTS IN INK FALL': [
            { time: 'Mar 7, 11:00', type: 'adjustment', color: '#f5a623', text: '<strong>−2 units</strong> adjustment at <strong>MN+LA™ SM MANILA</strong>' },
            { time: 'Mar 5, 10:30', type: 'receive', color: '#34d399', text: '<strong>+5 units</strong> received from <strong>Supplier</strong> → Warehouse' },
            { time: 'Mar 5, 14:00', type: 'transfer', color: '#60a5fa', text: '<strong>3 units</strong> transferred → <strong>MN+LA™ SM MANILA</strong>' },
        ],
        '"HITTER" V3 BOX LITE TEE IN OAT': [
            { time: 'Mar 7, 11:30', type: 'receive', color: '#34d399', text: '<strong>+30 units</strong> received from <strong>Supplier</strong> → Warehouse' },
            { time: 'Mar 6, 14:00', type: 'transfer', color: '#60a5fa', text: '<strong>20 units</strong> transferred → <strong>MN+LA™ ARTISAN CAFE GATEWAY II</strong>' },
        ],
        '"KISS...DON\'T TELL" TEE IN CAVIAR': [
            { time: 'Mar 7, 13:20', type: 'dispatch', color: '#60a5fa', text: '<strong>12 units</strong> dispatched via <strong>J&T Express</strong>' },
            { time: 'Mar 6, 09:00', type: 'factory-release', color: '#34d399', text: '<strong>+22 units</strong> released from <strong>Factory</strong> → Warehouse' },
        ],
        '"INCREASE THE PEACE" TEE IN GLACIER': [
            { time: 'Mar 7, 14:05', type: 'return', color: '#a78bfa', text: '<strong>+3 units</strong> returned from <strong>MN+LA™ BGC</strong> → Warehouse' },
            { time: 'Mar 4, 11:00', type: 'factory-release', color: '#34d399', text: '<strong>+10 units</strong> released from <strong>Factory</strong> → Warehouse' },
            { time: 'Mar 4, 15:00', type: 'dispatch', color: '#60a5fa', text: '<strong>13 units</strong> dispatched via <strong>J&T Express</strong>' },
        ],
    };

    /* -------------------------------------------------------
       LOCATION LIST (all known locations)
    ------------------------------------------------------- */
    const ALL_LOCATIONS = [
        // Origin
        'Factory',
        // Storage
        'Warehouse',
        // Stores
        'MN+LA™ ONE AYALA',
        'MN+LA™ BGC',
        'MN+LA™ SM MEGA MALL',
        'MN+LA™ ARTISAN CAFE GATEWAY II',
        'MN+LA™ CIANNAT COMPLEX',
        'MN+LA™ GREENHILLS',
        'MN+LA™ SM NORTH EDSA',
        'MN+LA™ SM MANILA',
        // Delivery Partners
        'J&T Express',
        'DHL Express',
        'Rider',
    ];

    const STORE_LOCATIONS = ALL_LOCATIONS.filter(l => l.startsWith('MN+LA'));
    const DELIVERY_PARTNERS = ['J&T Express', 'DHL Express', 'Rider'];
    const FACTORY_DESTINATIONS = ['Warehouse', ...STORE_LOCATIONS];

    function locOptions(selected = '') {
        return ['', ...ALL_LOCATIONS].map(l =>
            `<option value="${l}" ${l === selected ? 'selected' : ''}>${l || 'Select…'}</option>`
        ).join('');
    }

    /* -------------------------------------------------------
       AUDIT TRAIL RENDERER
    ------------------------------------------------------- */
    function renderAuditTrail(productName) {
        const trail = MOCK_AUDIT_TRAIL[productName] || [];
        if (!trail.length) return '';
        return `
                < div class="pdc-section-label" style = "margin-top:20px;" > Audit Trail</div >
                    <div>${trail.map(e => `
          <div class="audit-row">
            <span class="audit-dot" style="background:${e.color};"></span>
            <div style="flex:1;">
              <div class="audit-desc">${e.desc || e.text}</div>
              <div class="audit-time">${e.time}</div>
            </div>
          </div>`).join('')}
                    </div>`;
    }

    /* -------------------------------------------------------
       OPEN EDIT PRODUCT MODAL
    ------------------------------------------------------- */
    function openEditProduct(sku) {
        const row = allRows.find(r => r.sku === sku);
        if (!row) return;
        $('editSku').value = row.sku;
        $('editSkuDisplay').value = row.sku;
        $('editName').value = row.product;
        $('editSize').value = row.size;
        $('editColor').value = row.color;
        $('editAvailable').value = row.available;
        $('editLocation').innerHTML = locOptions(row.location);
        $('editNotes').value = '';
        $('editProductModal').style.display = 'flex';

        // "Move Stock" button inside edit modal opens the movement modal
        const moveBtn = $('btnMoveFromEdit');
        if (moveBtn) {
            moveBtn.onclick = () => {
                $('editProductModal').style.display = 'none';
                openMovementModal({ product: row.product, from: row.location });
            };
        }
    }

    function buildLocSelect(id, list, selected) {
        const el = $(id);
        el.innerHTML = '<option value="">Select…</option>' +
            list.map(l => `< option value = "${l}" ${l === selected ? 'selected' : ''}> ${l}</option > `).join('');
    }

    function applyMovTypeWorkflow(type, currentFrom, currentTo) {
        const fromEl = $('movFrom'), toEl = $('movTo');
        const cf = currentFrom || fromEl.value;
        const ct = currentTo || toEl.value;
        if (type === 'factory-release') {
            buildLocSelect('movFrom', ['Factory'], 'Factory');
            fromEl.disabled = true;
            buildLocSelect('movTo', FACTORY_DESTINATIONS, FACTORY_DESTINATIONS.includes(ct) ? ct : 'Warehouse');
            toEl.disabled = false;
        } else if (type === 'dispatch') {
            buildLocSelect('movFrom', ['Warehouse'], 'Warehouse');
            fromEl.disabled = true;
            buildLocSelect('movTo', DELIVERY_PARTNERS, DELIVERY_PARTNERS.includes(ct) ? ct : '');
            toEl.disabled = false;
        } else if (type === 'return') {
            buildLocSelect('movFrom', [...STORE_LOCATIONS, ...DELIVERY_PARTNERS], STORE_LOCATIONS.includes(cf) ? cf : '');
            fromEl.disabled = false;
            buildLocSelect('movTo', ['Warehouse'], 'Warehouse');
            toEl.disabled = true;
        } else {
            buildLocSelect('movFrom', ['Factory', 'Warehouse', ...STORE_LOCATIONS], cf);
            fromEl.disabled = false;
            buildLocSelect('movTo', ['Warehouse', ...STORE_LOCATIONS], ct);
            toEl.disabled = false;
        }
    }

    function openMovementModal({ product = '', from = '', type = 'factory-release' } = {}) {
        const productNames = [...new Set(allRows.map(r => r.product))].sort();
        $('movProduct').innerHTML = '<option value="">Select product…</option>' +
            productNames.map(p => `< option value = "${p}" ${p === product ? 'selected' : ''}> ${p}</option > `).join('');

        $('movQty').value = 1;
        $('movNotes').value = '';

        $('movType').value = type;
        document.querySelectorAll('.mov-type-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.type === type)
        );
        applyMovTypeWorkflow(type, from, '');

        // Override 'from' if explicitly provided (e.g. from edit modal)
        if (from) {
            const opt = [...$('movFrom').options].find(o => o.value === from);
            if (opt) $('movFrom').value = from;
        }

        $('movementModal').style.display = 'flex';
    }

    /* -------------------------------------------------------
       SETUP EDIT MODAL
    ------------------------------------------------------- */
    function setupEditModal() {
        const modal = $('editProductModal');
        const closeBtn = $('btnCloseEditModal');
        const form = $('editProductForm');

        if (closeBtn) closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
        if (modal) modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

        if (form) {
            form.addEventListener('submit', e => {
                e.preventDefault();
                const origSku = $('editSku').value;
                const idx = allRows.findIndex(r => r.sku === origSku);
                if (idx < 0) return;

                const noteVal = $('editNotes').value.trim();
                const oldAvail = allRows[idx].available;
                const newAvail = parseInt($('editAvailable').value, 10);
                const diff = newAvail - oldAvail;

                // Apply changes
                allRows[idx] = {
                    ...allRows[idx],
                    sku: $('editSkuDisplay').value.trim(),
                    product: $('editName').value.trim(),
                    size: $('editSize').value.trim(),
                    color: $('editColor').value.trim(),
                    location: $('editLocation').value,
                    available: newAvail,
                };

                // Add audit trail entry
                const productName = allRows[idx].product;
                if (!MOCK_AUDIT_TRAIL[productName]) MOCK_AUDIT_TRAIL[productName] = [];
                const now = new Date();
                const timeStr = now.toLocaleString('en-PH', {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: false
                });
                MOCK_AUDIT_TRAIL[productName].unshift({
                    time: timeStr,
                    type: 'adjustment',
                    color: '#f5a623',
                    text: diff !== 0
                        ? `< strong > ${diff > 0 ? '+' : ''}${diff} units</strong > manual adjustment${noteVal ? ' — ' + noteVal : ''} `
                        : `Product details updated${noteVal ? ' — ' + noteVal : ''} `,
                });

                // Also push to movements if qty changed
                if (diff !== 0) {
                    MOCK_MOVEMENTS.unshift({
                        time: now.toTimeString().slice(0, 5),
                        type: 'adjustment',
                        product: productName,
                        qty: diff,
                        from: allRows[idx].location,
                        to: '—',
                    });
                }

                modal.style.display = 'none';
                updateStats(allRows);
                renderInventoryTable(allRows);
                renderMovements(MOCK_MOVEMENTS);
                renderAlerts(allRows);
                window.Auth.toast(`${productName} updated successfully.`, 'success');
            });
        }
    }

    /* -------------------------------------------------------
       SETUP MOVEMENT MODAL
    ------------------------------------------------------- */
    function setupMovementModal() {
        const modal = $('movementModal');
        const closeBtn = $('btnCloseMovementModal');
        const form = $('movementForm');

        if (closeBtn) closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
        if (modal) modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

        // Movement type selector buttons — update From/To per workflow
        document.querySelectorAll('.mov-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mov-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const t = btn.dataset.type;
                $('movType').value = t;
                applyMovTypeWorkflow(t);
            });
        });

        if (form) {
            form.addEventListener('submit', e => {
                e.preventDefault();
                const type = $('movType').value;
                const product = $('movProduct').value;
                const from = $('movFrom').value;
                const to = $('movTo').value;
                const qty = parseInt($('movQty').value, 10);
                const notes = $('movNotes').value.trim();

                if (!product || !from || qty <= 0) {
                    window.Auth.toast('Please fill all required fields.', 'error'); return;
                }

                const now = new Date();
                const timeStr = now.toTimeString().slice(0, 5);

                // Add to movements
                MOCK_MOVEMENTS.unshift({
                    time: timeStr,
                    type, product,
                    qty: type === 'pullout' || type === 'adjustment' ? -qty : qty,
                    from,
                    to: to || '—',
                });

                // Add audit trail entry
                if (!MOCK_AUDIT_TRAIL[product]) MOCK_AUDIT_TRAIL[product] = [];
                const auditColors = { receive: '#34d399', transfer: '#60a5fa', return: '#a78bfa', adjustment: '#f5a623', pullout: '#ff4d6a' };
                const fromLabel = from || '—';
                const toLabel = to || '—';
                const fullTime = now.toLocaleString('en-PH', {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: false
                });
                MOCK_AUDIT_TRAIL[product].unshift({
                    time: fullTime,
                    type,
                    color: auditColors[type] || '#60a5fa',
                    text: `< strong > ${type.charAt(0).toUpperCase() + type.slice(1)}</strong >: <strong>${qty} units</strong> from < strong > ${fromLabel}</strong > → <strong>${toLabel}</strong>${notes ? ' — ' + notes : ''} `,
                });

                // Update inventory quantities for transfer
                if (type === 'transfer') {
                    const srcRow = allRows.find(r => r.product === product && r.location === from);
                    let dstRow = allRows.find(r => r.product === product && r.location === to);
                    if (srcRow) srcRow.available = Math.max(0, srcRow.available - qty);
                    if (dstRow) { dstRow.available += qty; }
                    else if (to && srcRow) {
                        allRows.push({ ...srcRow, location: to, available: qty, reserved: 0 });
                    }
                }

                modal.style.display = 'none';
                updateStats(allRows);
                populateLocationFilter(allRows);
                renderInventoryTable(allRows);
                renderMovements(MOCK_MOVEMENTS);
                renderAlerts(allRows);
                window.Auth.toast(`Movement logged: ${qty} × ${product} `, 'success');
            });
        }

        // Transfer to Store action button
        const trnBtn = $('btnTransferStore');
        if (trnBtn) {
            trnBtn.onclick = () => openMovementModal({ from: 'Warehouse', type: 'transfer' });
        }
    }

    /* -------------------------------------------------------
       SETUP ADD PRODUCT MODAL — Multi-Variant
    ------------------------------------------------------- */
    function setupAddProductModal() {
        const modal = $('addProductModal');
        const form = $('addProductForm');
        const barcodeInput = $('addBarcode');
        const barcodeWrap = $('addBarcodeWrap');
        const scanBanner = $('addProductScanBanner');
        const barcodeHint = $('addBarcodeHint');
        const savedIndicator = $('addProductSaved');
        const savedText = $('addProductSavedText');
        let variantIdCounter = 0;

        /* ── Variant Row Management ────────── */
        function getVariantRows() {
            return Array.from(document.querySelectorAll('.variant-row'));
        }

        function updateVariantCount() {
            const count = getVariantRows().length;
            const el = $('variantCount');
            if (el) el.textContent = `${count} variant${count !== 1 ? 's' : ''}`;
        }

        function makeVariantRow(defaults = {}) {
            const id = ++variantIdCounter;
            const row = document.createElement('div');
            row.className = 'variant-row';
            row.dataset.id = id;
            row.style.cssText = 'display:grid;grid-template-columns:90px 1fr 1fr 80px 34px;gap:8px;margin-bottom:6px;align-items:center;';

            const skuSuffix = defaults.suffix || '';
            const size = defaults.size || '';
            const color = defaults.color || '';
            const qty = defaults.qty !== undefined ? defaults.qty : 0;

            row.innerHTML = `
              <input type="text" class="vr-suffix form-control" value="${skuSuffix}" placeholder="e.g. S"
                style="padding:8px 10px;font-size:.82rem;" title="SKU Suffix (appended to Base SKU)" />
              <input type="text" class="vr-size form-control" value="${size}" placeholder="Size"
                style="padding:8px 10px;font-size:.82rem;" />
              <input type="text" class="vr-color form-control" value="${color}" placeholder="Color"
                style="padding:8px 10px;font-size:.82rem;" />
              <input type="number" class="vr-qty form-control" value="${qty}" min="0"
                style="padding:8px 10px;font-size:.82rem;" />
              <button type="button" class="vr-remove"
                style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:rgba(255,77,106,.08);border:1px solid rgba(255,77,106,.2);border-radius:7px;color:#ff4d6a;cursor:pointer;flex-shrink:0;transition:all .15s;"
                title="Remove this variant">
                <span class="material-icons-round" style="font-size:.95rem;">close</span>
              </button>`;

            row.querySelector('.vr-remove').addEventListener('click', () => {
                if (getVariantRows().length <= 1) {
                    window.Auth.toast('At least one variant is required.', 'info');
                    return;
                }
                row.remove();
                updateVariantCount();
            });

            // Auto-fill suffix from size when size changes
            row.querySelector('.vr-size').addEventListener('input', (e) => {
                const s = e.target.value.trim().toUpperCase().replace(/\s+/g, '-');
                const suffixEl = row.querySelector('.vr-suffix');
                if (suffixEl && !suffixEl.dataset.manuallyEdited) {
                    suffixEl.value = s;
                }
            });
            row.querySelector('.vr-suffix').addEventListener('input', (e) => {
                e.target.dataset.manuallyEdited = '1';
            });

            return row;
        }

        function renderDefaultVariants() {
            const container = $('variantRowsContainer');
            if (!container) return;
            container.innerHTML = '';
            variantIdCounter = 0;
            // Start with 3 default sizes
            [
                { suffix: 'S', size: 'S', color: '', qty: 0 },
                { suffix: 'M', size: 'M', color: '', qty: 0 },
                { suffix: 'L', size: 'L', color: '', qty: 0 },
            ].forEach(d => container.appendChild(makeVariantRow(d)));
            updateVariantCount();
        }

        /* "+ Add Variant" button */
        const addVariantBtn = $('btnAddVariant');
        if (addVariantBtn) {
            addVariantBtn.addEventListener('click', () => {
                const container = $('variantRowsContainer');
                if (container) container.appendChild(makeVariantRow());
                updateVariantCount();
            });
        }

        /* ── Load Locations from DB ─────── */
        async function loadLocationOptions(selectedName = 'Warehouse') {
            const sel = $('addLocation');
            if (!sel) return;
            if (window.db) {
                try {
                    const { data, error } = await window.db
                        .from('locations')
                        .select('id, name, type');
                    if (!error && data && data.length > 0) {
                        // Sort locally: warehouses first, then stores, then alphabetically
                        data.sort((a, b) => {
                            const typeOrder = { warehouse: 0, store: 1 };
                            const ta = typeOrder[a.type] ?? 2;
                            const tb = typeOrder[b.type] ?? 2;
                            if (ta !== tb) return ta - tb;
                            return a.name.localeCompare(b.name);
                        });
                        sel.innerHTML = '<option value="">Select location…</option>' +
                            data.map(l => `<option value="${l.name}" ${l.name === selectedName ? 'selected' : ''}>${l.name}${l.type === 'store' ? ' (Store)' : ''}</option>`).join('');
                        return;
                    }
                } catch (_) { }
            }
            // Fallback to hardcoded ALL_LOCATIONS array
            sel.innerHTML = locOptions(selectedName);
        }

        /* ── Open modal ──────────────────── */
        window.openAddProductModal = async function () {
            if (!modal) return;
            if (form) form.reset();
            if (savedIndicator) savedIndicator.style.display = 'none';
            if (barcodeHint) { barcodeHint.style.display = 'none'; barcodeHint.textContent = ''; }
            if (barcodeWrap) barcodeWrap.classList.remove('scanner-ready');
            if (scanBanner) scanBanner.style.display = 'none';
            renderDefaultVariants();
            modal.style.display = 'flex';
            // Load locations live
            await loadLocationOptions('Warehouse');
            // Auto-focus barcode field
            setTimeout(() => { if (barcodeInput) { barcodeInput.focus(); activateScanner(); } }, 120);
        };

        /* ── Scanner visual state ──────── */
        function activateScanner() {
            if (barcodeWrap) barcodeWrap.classList.add('scanner-ready');
            if (scanBanner) scanBanner.style.display = 'flex';
        }
        function deactivateScanner() {
            if (barcodeWrap) barcodeWrap.classList.remove('scanner-ready');
            if (scanBanner) scanBanner.style.display = 'none';
        }

        if (barcodeInput) {
            barcodeInput.addEventListener('focus', activateScanner);
            barcodeInput.addEventListener('blur', () => {
                setTimeout(() => { if (document.activeElement !== barcodeInput) deactivateScanner(); }, 150);
            });

            barcodeInput.addEventListener('keydown', async (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const bc = barcodeInput.value.trim();
                if (!bc) return;
                deactivateScanner();
                if (window.db) {
                    const { data } = await window.db.from('products').select('id,sku,name,size,color').eq('barcode', bc).maybeSingle();
                    if (data) {
                        window.Auth.toast(`⚠ "${data.name}" already exists (SKU: ${data.sku}).`, 'info');
                        if ($('addSku') && !$('addSku').value) $('addSku').value = data.sku;
                        if ($('addName') && !$('addName').value) $('addName').value = data.name;
                        if (barcodeHint) { barcodeHint.textContent = `⚠ "${data.name}" already in system.`; barcodeHint.style.color = '#f5a623'; barcodeHint.style.display = 'block'; }
                    } else {
                        if (barcodeHint) { barcodeHint.textContent = '✓ New barcode — fill in details below.'; barcodeHint.style.color = '#34d399'; barcodeHint.style.display = 'block'; }
                    }
                }
                const skuEl = $('addSku');
                if (skuEl && !skuEl.value) skuEl.value = bc;
                const nameEl = $('addName');
                if (nameEl) nameEl.focus();
            });
        }

        const scanBtn = $('btnModalScanBarcode');
        if (scanBtn) {
            scanBtn.addEventListener('click', () => {
                if (barcodeInput) { barcodeInput.value = ''; barcodeInput.focus(); }
                activateScanner();
                if (barcodeHint) barcodeHint.style.display = 'none';
            });
        }

        /* ── Form submit — multi-variant loop ── */
        if (form) {
            form.addEventListener('submit', async e => {
                e.preventDefault();

                const baseSku = $('addSku').value.trim();
                const productName = $('addName').value.trim();
                const barcode = barcodeInput ? barcodeInput.value.trim() : '';
                const notes = $('addNotes') ? $('addNotes').value.trim() : '';
                const location = $('addLocation').value;

                if (!baseSku || !productName) {
                    window.Auth.toast('Please enter a Product Name and Base SKU.', 'error');
                    return;
                }
                if (!location) {
                    window.Auth.toast('Please select a Location.', 'error');
                    return;
                }

                // Collect variants
                const variantRows = getVariantRows();
                const variants = variantRows.map(row => ({
                    suffix: row.querySelector('.vr-suffix').value.trim(),
                    size: row.querySelector('.vr-size').value.trim(),
                    color: row.querySelector('.vr-color').value.trim(),
                    qty: parseInt(row.querySelector('.vr-qty').value, 10) || 0,
                })).filter(v => v.size || v.color || v.suffix); // skip completely empty rows

                if (!variants.length) {
                    window.Auth.toast('Please add at least one variant.', 'error');
                    return;
                }

                const btn = $('btnAddProductSubmit');
                if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

                let savedCount = 0;
                let failCount = 0;
                let locData = null;

                /* ── Resolve location_id once ── */
                if (window.db) {
                    const { data: ld } = await window.db.from('locations').select('id').eq('name', location).single();
                    locData = ld;
                }

                /* ── Loop through each variant ── */
                for (const v of variants) {
                    const sku = v.suffix ? `${baseSku}-${v.suffix}` : baseSku;

                    // Update in-memory regardless
                    const existIdx = allRows.findIndex(r => r.sku === sku);
                    const row = { sku, product: productName, size: v.size, color: v.color, location, available: v.qty, reserved: 0 };
                    if (existIdx >= 0) allRows[existIdx] = { ...allRows[existIdx], ...row };
                    else allRows.push(row);

                    if (v.qty > 0) {
                        MOCK_MOVEMENTS.unshift({ time: new Date().toTimeString().slice(0, 5), type: 'receive', product: `${productName} (${v.size}/${v.color})`, qty: v.qty, from: '—', to: location });
                    }

                    // DB save
                    if (window.db && locData) {
                        try {
                            const { data: prodData, error: prodErr } = await window.db
                                .from('products')
                                .upsert({ sku, name: productName, size: v.size, color: v.color, barcode: barcode || null }, { onConflict: 'sku' })
                                .select('id').single();
                            if (prodErr) throw prodErr;

                            if (v.qty > 0) {
                                const { error: invErr } = await window.db
                                    .from('inventory')
                                    .upsert({ product_id: prodData.id, location_id: locData.id, quantity: v.qty }, { onConflict: 'product_id,location_id' });
                                if (invErr) throw invErr;

                                await window.db.from('inventory_movements').insert({
                                    product_id: prodData.id, movement_type: 'receive', quantity: v.qty,
                                    destination_location: locData.id, note: notes || 'Manual entry — initial stock', source: 'manual',
                                });
                            }
                            savedCount++;
                        } catch (err) {
                            console.warn(`[AddProduct] Failed variant ${sku}:`, err.message);
                            failCount++;
                        }
                    } else {
                        savedCount++;
                    }
                }

                // Show result
                const totalQty = variants.reduce((s, v) => s + v.qty, 0);
                const dbMsg = window.db && locData ? (failCount === 0 ? ` ✓ All ${savedCount} variant(s) saved.` : ` ${savedCount} saved, ${failCount} failed.`) : ' (local only)';
                window.Auth.toast(`${productName} — ${variants.length} variant(s) added.${dbMsg}`, failCount > 0 ? 'error' : 'success');

                if (savedIndicator) {
                    if (savedText) savedText.textContent = `${savedCount}/${variants.length} variant(s) saved to database`;
                    savedIndicator.style.display = 'flex';
                }

                // Reload from DB
                if (window.db) {
                    setTimeout(async () => {
                        const fresh = await loadData();
                        allRows = fresh;
                        updateStats(fresh);
                        populateLocationFilter(fresh);
                        renderInventoryTable(fresh);
                        renderAlerts(fresh);
                        renderMovements(MOCK_MOVEMENTS);
                    }, 500);
                } else {
                    updateStats(allRows);
                    populateLocationFilter(allRows);
                    renderInventoryTable(allRows);
                    renderMovements(MOCK_MOVEMENTS);
                    renderAlerts(allRows);
                }

                setTimeout(() => {
                    modal.style.display = 'none';
                    if (form) form.reset();
                    if (savedIndicator) savedIndicator.style.display = 'none';
                    if (barcodeHint) barcodeHint.style.display = 'none';
                }, 1000);

                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<span class="material-icons-round" style="font-size:.95rem;">add_circle</span> Add Product';
                }
            });
        }
    }

    /* -------------------------------------------------------
       INIT
    ------------------------------------------------------- */
    async function init() {
        await window.Auth.guard();

        const rows = await loadData();
        allRows = rows;

        updateStats(rows);
        populateLocationFilter(rows);
        renderInventoryTable(rows);
        renderMovements(MOCK_MOVEMENTS);
        renderTransfers(MOCK_TRANSFERS);
        renderAlerts(rows);

        setupTabs();
        setupLookup(rows);
        setupFilters(rows);
        setupReceiveModal();
        setupEditModal();
        setupMovementModal();
        setupAddProductModal();

        // Make Total Units card clickable
        const unitsCard = $('sc-units')?.closest('.stat-card');
        if (unitsCard) {
            unitsCard.style.cursor = 'pointer';
            unitsCard.title = 'View All Inventory';
            unitsCard.addEventListener('click', () => {
                const tabBtn = document.querySelector('.inv-tab[data-tab="inventory"]');
                if (tabBtn) tabBtn.click();
            });
        }

        // Refresh button
        const refreshBtn = $('refreshInventory');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                const icon = refreshBtn.querySelector('.material-icons-round');
                if (icon) icon.classList.add('spinning');
                const fresh = await loadData();
                allRows = fresh;
                updateStats(fresh);
                populateLocationFilter(fresh);
                renderInventoryTable(fresh);
                renderAlerts(fresh);
                setTimeout(() => { if (icon) icon.classList.remove('spinning'); }, 600);
            });
        }
    }

    window.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));

})();

