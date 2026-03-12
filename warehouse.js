/* ============================================================
   MN+LA Warehouse Dashboard — warehouse.js
   Operationally complete: KPIs, transfer requests, low stock,
   ledger filters, Inventory In/Out improvements, returns/packing placeholders.
   ============================================================ */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  let warehouseLocationId = null;
  let hasWarehouseLocation = false;
  let storesList = [];
  const DEFAULT_MIN_STOCK = 5;
  const CRITICAL_THRESHOLD = 1;
  const LOW_THRESHOLD = 5;
  const BRANCH_STOCKS_LOW = 5;
  let branchStocksAllRows = [];
  let branchStocksFilter = 'all';

  function toast(message, type) {
    if (window.Auth && typeof window.Auth.toast === 'function') {
      window.Auth.toast(message, type || 'success');
    }
  }

  function isMasterAccess() {
    const role = (window.Auth && window.Auth.profile && window.Auth.profile.role) || '';
    return role === 'owner' || role === 'admin';
  }

  function canAccessWarehouse() {
    const role = (window.Auth && window.Auth.profile && window.Auth.profile.role) || '';
    return role === 'warehouse_staff' || role === 'warehouse' || role === 'owner' || role === 'admin';
  }

  async function getWarehouseId() {
    if (warehouseLocationId !== null) return warehouseLocationId;
    if (!window.db) {
      hasWarehouseLocation = false;
      return null;
    }
    try {
      const { data: warehouse, error } = await window.db
        .from('locations')
        .select('id')
        .eq('type', 'warehouse')
        .limit(1)
        .maybeSingle();
      if (!error && warehouse && warehouse.id) {
        warehouseLocationId = warehouse.id;
        hasWarehouseLocation = true;
        return warehouseLocationId;
      }
      hasWarehouseLocation = false;
      return null;
    } catch (e) {
      console.warn('[Warehouse] warehouse location lookup failed:', e);
      hasWarehouseLocation = false;
      return null;
    }
  }

  /** Save received stock into warehouse via RPC only (no direct writes to inventory/inventory_movements). */
  async function receiveIntoWarehouse(productId, receivedQty, note) {
    if (!window.db) throw new Error('Database not connected.');
    const { error } = await window.db.rpc('warehouse_receive_inventory', {
      p_product_id: productId,
      p_quantity: receivedQty || 1,
      p_notes: note || 'Manual warehouse inventory receive'
    });
    if (error) throw new Error(error.message || 'Receive failed');
  }

  function setNoWarehouseBanner(show) {
    const banner = $('noWarehouseBanner');
    if (banner) banner.classList.toggle('open', !!show);
  }

  async function loadMetrics() {
    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    const wid = await getWarehouseId();
    if (!window.db) {
      ['metricUnits', 'metricSkus', 'metricLowStock', 'metricTodayMovements', 'metricPendingTransfers', 'metricIncomingStock', 'metricInventoryValue', 'metricItemsToPack'].forEach(id => set(id, '0'));
      return;
    }
    try {
      const { data: m, error } = await window.db.rpc('get_warehouse_dashboard_metrics');
      const metrics = (error ? {} : m) || {};
      set('metricUnits', (metrics.total_units ?? 0).toLocaleString());
      set('metricSkus', (metrics.total_skus ?? 0).toLocaleString());
      set('metricLowStock', (metrics.low_stock_items ?? 0).toLocaleString());
      set('metricTodayMovements', (metrics.today_movements ?? 0).toLocaleString());
    } catch (e) {
      set('metricUnits', '0'); set('metricSkus', '0'); set('metricLowStock', '0'); set('metricTodayMovements', '0');
    }
    set('metricIncomingStock', '—');
    set('metricItemsToPack', '—');
    try {
      const { count: pendingCount, error: pendingErr } = await window.db.from('inventory_out_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      set('metricPendingTransfers', pendingErr ? '0' : (pendingCount ?? 0).toLocaleString());
    } catch (_) {
      set('metricPendingTransfers', '0');
    }
    if (wid) {
      try {
        const { data: invRows } = await window.db.from('inventory').select('product_id, quantity').eq('location_id', wid);
        const productIds = [...new Set((invRows || []).map(r => r.product_id))];
        if (productIds.length) {
          const { data: products } = await window.db.from('products').select('id, cost_price').in('id', productIds);
          const costMap = {};
          (products || []).forEach(p => { costMap[p.id] = p.cost_price != null ? Number(p.cost_price) : 0; });
          let totalValue = 0;
          (invRows || []).forEach(r => { totalValue += (r.quantity || 0) * (costMap[r.product_id] || 0); });
          set('metricInventoryValue', totalValue > 0 ? '₱' + Math.round(totalValue).toLocaleString() : '—');
        } else set('metricInventoryValue', '—');
      } catch (_) {
        set('metricInventoryValue', '—');
      }
    } else set('metricInventoryValue', '—');
  }

  async function loadLedger() {
    const tbody = $('ledgerBody');
    if (!tbody) return;
    const wid = await getWarehouseId();
    if (!window.db) {
      tbody.innerHTML = '<tr><td colspan="10" class="wh-empty">No database</td></tr>';
      return;
    }
    if (!wid) {
      tbody.innerHTML = '<tr><td colspan="10" class="wh-empty">No warehouse location configured</td></tr>';
      return;
    }
    const dateFrom = ($('ledgerDateFrom') && $('ledgerDateFrom').value) || '';
    const dateTo = ($('ledgerDateTo') && $('ledgerDateTo').value) || '';
    const movementType = ($('ledgerMovementType') && $('ledgerMovementType').value) || '';
    const searchQ = ($('ledgerSearch') && $('ledgerSearch').value) ? ($('ledgerSearch').value).trim().toLowerCase() : '';
    try {
      let query = window.db.from('inventory_movements').select('id, product_id, movement_type, quantity, source_location, destination_location, note, created_at, created_by').or(`source_location.eq.${wid},destination_location.eq.${wid}`).order('created_at', { ascending: false }).limit(200);
      if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00');
      if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');
      if (movementType) query = query.eq('movement_type', movementType);
      const { data, error } = await query;
      if (error) throw error;
      let rows = data || [];
      const productIds = [...new Set(rows.map(r => r.product_id).filter(Boolean))];
      const { data: products } = await window.db.from('products').select('id, name, sku, barcode').in('id', productIds);
      const prodMap = {};
      (products || []).forEach(p => { prodMap[p.id] = p; });
      const locIds = [...new Set([...rows.map(r => r.source_location), ...rows.map(r => r.destination_location)].filter(Boolean))];
      const { data: locs } = await window.db.from('locations').select('id, name').in('id', locIds);
      const locMap = {};
      (locs || []).forEach(l => { locMap[l.id] = l.name; });
      const creatorIds = [...new Set(rows.map(r => r.created_by).filter(Boolean))];
      let profileMap = {};
      if (creatorIds.length) {
        const { data: profiles } = await window.db.from('profiles').select('id, full_name').in('id', creatorIds);
        (profiles || []).forEach(p => { profileMap[p.id] = p.full_name || '—'; });
      }
      rows = rows.map(r => ({
        ...r,
        products: prodMap[r.product_id] || {},
        source_name: r.source_location ? (locMap[r.source_location] || '—') : '—',
        dest_name: r.destination_location ? (locMap[r.destination_location] || '—') : '—',
        created_by_name: (r.created_by && profileMap[r.created_by]) ? profileMap[r.created_by] : '—',
      }));
      if (searchQ) {
        rows = rows.filter(r => {
          const p = r.products;
          return (p.name || '').toLowerCase().includes(searchQ) || (p.sku || '').toLowerCase().includes(searchQ) || (p.barcode || '').toLowerCase().includes(searchQ);
        });
      }
      renderLedger(rows, tbody);
    } catch (e) {
      console.warn('[Warehouse] loadLedger error:', e);
      tbody.innerHTML = '<tr><td colspan="10" class="wh-empty">Error loading ledger</td></tr>';
    }
  }

  function movementTypeBadge(type) {
    const t = (type || '').toLowerCase();
    const cls = t === 'receive' ? 'wh-badge--receive' : t === 'transfer_out' ? 'wh-badge--transfer_out' : t.includes('adjust') || t === 'count_adjustment' ? 'wh-badge--adjustment' : t === 'return' ? 'wh-badge--return' : '';
    return cls ? `<span class="wh-badge ${cls}">${escapeHtml(type || '—')}</span>` : escapeHtml(type || '—');
  }

  function renderLedger(rows, tbody) {
    if (!tbody) return;
    if (!rows || !rows.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="wh-empty">No warehouse movements in this range</td></tr>';
      return;
    }
    const timeStr = r => r.created_at ? new Date(r.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—';
    tbody.innerHTML = rows.map(r => {
      const p = r.products;
      return `<tr>
        <td>${timeStr(r)}</td>
        <td>${escapeHtml(p.name || '—')}</td>
        <td>${escapeHtml(p.sku || '—')}</td>
        <td>${escapeHtml(p.barcode || '—')}</td>
        <td>${movementTypeBadge(r.movement_type)}</td>
        <td>${r.quantity ?? '—'}</td>
        <td>${escapeHtml(r.source_name || '—')}</td>
        <td>${escapeHtml(r.dest_name || '—')}</td>
        <td>${escapeHtml(r.created_by_name || '—')}</td>
        <td>${escapeHtml((r.note || '') + '')}</td>
      </tr>`;
    }).join('');
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function loadStores() {
    if (!window.db) return [];
    try {
      const { data, error } = await window.db.from('locations').select('id, name').eq('type', 'store').order('name');
      if (!error && data) storesList = data;
      return storesList;
    } catch (e) {
      return [];
    }
  }

  function openModal(id) {
    const el = $(id);
    if (el) el.classList.add('open');
  }
  function closeModal(id) {
    const el = $(id);
    if (el) el.classList.remove('open');
  }

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function productByBarcode(barcode) {
    if (!window.db || !barcode || !barcode.trim()) return null;
    try {
      const { data, error } = await window.db.rpc('get_product_by_barcode', { p_barcode: barcode.trim() });
      if (error || !data || !data.length) return null;
      return Array.isArray(data) ? data[0] : data;
    } catch (e) {
      return null;
    }
  }

  async function getWarehouseStock(productId) {
    const wid = await getWarehouseId();
    if (!window.db || !wid || !productId) return 0;
    try {
      const { data, error } = await window.db.from('inventory').select('quantity').eq('product_id', productId).eq('location_id', wid).maybeSingle();
      if (error || !data) return 0;
      return data.quantity || 0;
    } catch (_) {
      return 0;
    }
  }

  function bindInventoryIn() {
    const barcodeIn = $('inBarcode');
    const preview = $('inProductPreview');
    const notFound = $('inProductNotFound');
    const qtyWrap = $('inQtyWrap');
    const qtyIn = $('inQuantity');
    const notesIn = $('inNotes');
    const confirmBtn = $('confirmInventoryIn');
    const quickScan = $('inQuickScanMode');
    let currentProduct = null;

    async function onBarcode() {
      const bc = (barcodeIn && barcodeIn.value) ? barcodeIn.value.trim() : '';
      if (!bc) return;
      if (notFound) notFound.classList.remove('open');
      const product = await productByBarcode(bc);
      currentProduct = product;
      if (!product) {
        if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
        if (qtyWrap) qtyWrap.style.display = 'none';
        if (confirmBtn) confirmBtn.disabled = true;
        if (notFound) notFound.classList.add('open');
        toast('Product not found for barcode', 'error');
        return;
      }
      if (notFound) notFound.classList.remove('open');
      if (preview) {
        preview.innerHTML = `<strong>${escapeHtml(product.name || '')}</strong><br>SKU: ${escapeHtml(product.sku || '')} · Barcode: ${escapeHtml(product.barcode || '')}`;
        preview.style.display = 'block';
      }
      if (qtyWrap) qtyWrap.style.display = 'block';
      if (qtyIn) qtyIn.value = '1';
      if (confirmBtn) confirmBtn.disabled = false;
      if (quickScan && quickScan.checked && qtyIn) {
        qtyIn.focus();
        qtyIn.select();
      }
    }

    function trySubmit() {
      if (!currentProduct || !confirmBtn || confirmBtn.disabled) return;
      confirmBtn.click();
    }

    if (barcodeIn) {
      barcodeIn.addEventListener('keydown', async e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await onBarcode();
        }
      });
      barcodeIn.addEventListener('blur', () => { if (barcodeIn.value.trim()) onBarcode(); });
    }
    if (qtyIn) {
      qtyIn.addEventListener('keydown', e => {
        if (e.key === 'Enter' && quickScan && quickScan.checked) {
          e.preventDefault();
          trySubmit();
        }
      });
    }

    document.querySelectorAll('[data-scroll="modalInventoryIn"]').forEach(el => {
      if (!el) return;
      el.addEventListener('click', e => {
        e.preventDefault();
        currentProduct = null;
        if (barcodeIn) barcodeIn.value = '';
        if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
        if (notFound) notFound.classList.remove('open');
        if (qtyWrap) qtyWrap.style.display = 'none';
        if (notesIn) notesIn.value = '';
        if (confirmBtn) confirmBtn.disabled = true;
        openModal('modalInventoryIn');
        setTimeout(() => barcodeIn && barcodeIn.focus(), 100);
      });
    });

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        if (!currentProduct || !currentProduct.id) { toast('Scan a product first', 'error'); return; }
        const qty = parseInt(qtyIn && qtyIn.value, 10) || 0;
        if (qty < 1) { toast('Enter quantity ≥ 1', 'error'); return; }
        if (!window.db) { toast('Database not connected', 'error'); return; }
        confirmBtn.disabled = true;
        try {
          await receiveIntoWarehouse(currentProduct.id, qty, (notesIn && notesIn.value) ? notesIn.value.trim() : null);
          toast('Received ' + qty + ' unit(s) into warehouse');
          closeModal('modalInventoryIn');
          loadMetrics();
          loadLedger();
          loadBranchStocks();
        } catch (err) {
          toast(err.message || 'Receive failed', 'error');
        }
        confirmBtn.disabled = false;
      });
    }

    ['closeInventoryIn', 'cancelInventoryIn'].forEach(id => {
      const btn = $(id);
      if (btn) btn.addEventListener('click', () => closeModal('modalInventoryIn'));
    });
  }

  function bindInventoryOut() {
    const destSelect = $('outDestination');
    const barcodeOut = $('outBarcode');
    const previewOut = $('outProductPreview');
    const notFoundOut = $('outProductNotFound');
    const qtyWrapOut = $('outQtyWrap');
    const qtyOut = $('outQuantity');
    const notesOut = $('outNotes');
    const confirmOut = $('confirmInventoryOut');
    const availableLabel = $('outAvailableLabel');
    let currentProductOut = null;

    async function loadDestinations() {
      const stores = await loadStores();
      if (!destSelect) return;
      destSelect.innerHTML = '<option value="">Select store…</option>' + (stores.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join(''));
    }

    async function onBarcodeOut() {
      const bc = (barcodeOut && barcodeOut.value) ? barcodeOut.value.trim() : '';
      if (!bc) return;
      if (notFoundOut) notFoundOut.classList.remove('open');
      const product = await productByBarcode(bc);
      currentProductOut = product;
      if (!product) {
        if (previewOut) { previewOut.style.display = 'none'; previewOut.innerHTML = ''; }
        if (qtyWrapOut) qtyWrapOut.style.display = 'none';
        if (confirmOut) confirmOut.disabled = true;
        if (notFoundOut) notFoundOut.classList.add('open');
        toast('Product not found for barcode', 'error');
        return;
      }
      if (notFoundOut) notFoundOut.classList.remove('open');
      if (previewOut) {
        previewOut.innerHTML = `<strong>${escapeHtml(product.name || '')}</strong><br>SKU: ${escapeHtml(product.sku || '')}`;
        previewOut.style.display = 'block';
      }
      if (qtyWrapOut) qtyWrapOut.style.display = 'block';
      if (qtyOut) qtyOut.value = '1';
      const available = await getWarehouseStock(product.id);
      if (availableLabel) availableLabel.textContent = '(Available: ' + available + ')';
      if (qtyOut) qtyOut.max = Math.max(1, available);
      if (confirmOut) confirmOut.disabled = !destSelect || !destSelect.value;
    }

    if (barcodeOut) {
      barcodeOut.addEventListener('keydown', e => { if (e.key === 'Enter') onBarcodeOut(); });
      barcodeOut.addEventListener('blur', () => { if (barcodeOut.value.trim()) onBarcodeOut(); });
    }
    if (destSelect) destSelect.addEventListener('change', () => {
      if (confirmOut) confirmOut.disabled = !currentProductOut || !destSelect.value;
    });
    if (qtyOut) qtyOut.addEventListener('input', () => {
      const max = parseInt(qtyOut.max, 10);
      if (max && parseInt(qtyOut.value, 10) > max) qtyOut.value = max;
    });

    document.querySelectorAll('#cardInventoryOut, [data-scroll="modalInventoryOut"]').forEach(el => {
      if (!el) return;
      el.addEventListener('click', e => {
        e.preventDefault();
        currentProductOut = null;
        loadDestinations();
        if (barcodeOut) barcodeOut.value = '';
        if (previewOut) { previewOut.style.display = 'none'; previewOut.innerHTML = ''; }
        if (notFoundOut) notFoundOut.classList.remove('open');
        if (qtyWrapOut) qtyWrapOut.style.display = 'none';
        if (notesOut) notesOut.value = '';
        if (availableLabel) availableLabel.textContent = '';
        if (confirmOut) confirmOut.disabled = true;
        openModal('modalInventoryOut');
        setTimeout(() => barcodeOut && barcodeOut.focus(), 100);
      });
    });

    if (confirmOut) {
      confirmOut.addEventListener('click', async () => {
        if (!currentProductOut || !currentProductOut.id) { toast('Scan a product first', 'error'); return; }
        const destId = destSelect && destSelect.value;
        if (!destId) { toast('Select destination store', 'error'); return; }
        const qty = parseInt(qtyOut && qtyOut.value, 10) || 0;
        if (qty < 1) { toast('Enter quantity ≥ 1', 'error'); return; }
        const available = await getWarehouseStock(currentProductOut.id);
        if (qty > available) {
          toast('Cannot transfer more than available. Available: ' + available, 'error');
          return;
        }
        if (!window.db) { toast('Database not connected', 'error'); return; }
        confirmOut.disabled = true;
        try {
          const { data, error } = await window.db.rpc('warehouse_transfer_out', {
            p_product_id: currentProductOut.id,
            p_destination_location_id: destId,
            p_quantity: qty,
            p_notes: (notesOut && notesOut.value) ? notesOut.value.trim() : null
          });
          if (error) throw new Error(error.message);
          toast('Transferred ' + qty + ' unit(s) to store');
          closeModal('modalInventoryOut');
          loadMetrics();
          loadLedger();
          loadBranchStocks();
          loadItemAvailability($('itemAvailabilitySearch') && $('itemAvailabilitySearch').value);
        } catch (err) {
          toast(err.message || 'Transfer failed', 'error');
        }
        confirmOut.disabled = false;
      });
    }

    ['closeInventoryOut', 'cancelInventoryOut'].forEach(id => {
      const btn = $(id);
      if (btn) btn.addEventListener('click', () => closeModal('modalInventoryOut'));
    });
  }

  function statusToDisplay(status) {
    const s = (status || '').toLowerCase();
    if (s === 'pending') return 'Pending';
    if (s === 'approved') return 'Approved';
    if (s === 'rejected') return 'Cancelled';
    return status || '—';
  }

  async function loadTransferRequests() {
    const tbody = $('transferRequestsBody');
    if (!tbody) return;
    if (!window.db) {
      tbody.innerHTML = '<tr><td colspan="9" class="wh-empty">No database</td></tr>';
      return;
    }
    try {
      const { data: requests, error } = await window.db.from('inventory_out_requests').select('id, product_id, location_id, quantity, status, created_at, resolved_by').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      if (!requests || !requests.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="wh-empty">No transfer requests</td></tr>';
        return;
      }
      const productIds = [...new Set(requests.map(r => r.product_id))];
      const locIds = [...new Set(requests.map(r => r.location_id))];
      const { data: products } = await window.db.from('products').select('id, name, sku, barcode').in('id', productIds);
      const { data: locs } = await window.db.from('locations').select('id, name').in('id', locIds);
      const prodMap = {}; (products || []).forEach(p => { prodMap[p.id] = p; });
      const locMap = {}; (locs || []).forEach(l => { locMap[l.id] = l.name; });
      const resolverIds = [...new Set(requests.map(r => r.resolved_by).filter(Boolean))];
      let resolverMap = {};
      if (resolverIds.length) {
        const { data: profiles } = await window.db.from('profiles').select('id, full_name').in('id', resolverIds);
        (profiles || []).forEach(p => { resolverMap[p.id] = p.full_name; });
      }
      tbody.innerHTML = requests.map(r => {
        const p = prodMap[r.product_id] || {};
        const locName = locMap[r.location_id] || '—';
        const statusClass = r.status === 'pending' ? 'wh-badge--pending' : r.status === 'approved' ? 'wh-badge--approved' : 'wh-badge--rejected';
        const requestedAt = r.created_at ? new Date(r.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—';
        const approvedBy = (r.resolved_by && resolverMap[r.resolved_by]) ? resolverMap[r.resolved_by] : '—';
        return `<tr>
          <td>${escapeHtml((r.id || '').slice(0, 8))}</td>
          <td>${escapeHtml(locName)}</td>
          <td>${escapeHtml(p.name || '—')}</td>
          <td>${escapeHtml(p.sku || '—')}</td>
          <td>${escapeHtml(p.barcode || '—')}</td>
          <td>${r.quantity}</td>
          <td><span class="wh-badge ${statusClass}">${statusToDisplay(r.status)}</span></td>
          <td>${requestedAt}</td>
          <td>${escapeHtml(approvedBy)}</td>
        </tr>`;
      }).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="9" class="wh-empty">No transfer requests or error loading</td></tr>';
    }
  }

  async function loadLowStockMonitor(search) {
    const tbody = $('lowStockBody');
    if (!tbody) return;
    const wid = await getWarehouseId();
    if (!window.db || !wid) {
      tbody.innerHTML = '<tr><td colspan="6" class="wh-empty">No warehouse or database</td></tr>';
      return;
    }
    try {
      const { data: invRows, error } = await window.db.from('inventory').select('product_id, quantity').eq('location_id', wid);
      if (error) throw error;
      if (!invRows || !invRows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="wh-empty">No warehouse stock</td></tr>';
        return;
      }
      const productIds = invRows.map(r => r.product_id);
      const { data: products } = await window.db.from('products').select('id, name, sku, barcode').in('id', productIds);
      const prodMap = {};
      (products || []).forEach(p => { prodMap[p.id] = { ...p, min_level: (p.reorder_point != null ? p.reorder_point : (p.minimum_stock != null ? p.minimum_stock : DEFAULT_MIN_STOCK)) }; });
      let rows = invRows.map(r => {
        const p = prodMap[r.product_id] || {};
        const minLevel = p.min_level != null ? p.min_level : DEFAULT_MIN_STOCK;
        let status = 'Healthy';
        if (r.quantity <= CRITICAL_THRESHOLD) status = 'Critical';
        else if (r.quantity <= minLevel || r.quantity <= LOW_THRESHOLD) status = 'Low';
        return { ...r, product: p, minLevel, status };
      }).filter(r => r.status !== 'Healthy');
      const q = (search || '').toLowerCase().trim();
      if (q) rows = rows.filter(r => {
        const p = r.product || {};
        return (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q);
      });
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="wh-empty">No low stock items</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(r => {
        const p = r.product || {};
        const statusClass = r.status === 'Critical' ? 'wh-badge--critical' : r.status === 'Low' ? 'wh-badge--low' : 'wh-badge--healthy';
        return `<tr><td>${escapeHtml(p.name || '—')}</td><td>${escapeHtml(p.sku || '—')}</td><td>${escapeHtml(p.barcode || '—')}</td><td>${r.quantity}</td><td>${r.minLevel}</td><td><span class="wh-badge ${statusClass}">${r.status}</span></td></tr>`;
      }).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="6" class="wh-empty">Error loading</td></tr>';
    }
  }

  function filterRowsBranchStocks() {
    const tbody = $('branchStocksBody');
    const searchInput = $('branchStocksSearch');
    const q = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
    let list = branchStocksAllRows.filter(r => {
      const matchSearch = !q ||
        (r.barcode || '').toLowerCase().includes(q) ||
        (r.name || '').toLowerCase().includes(q) ||
        (r.sku || '').toLowerCase().includes(q);
      const matchFilter = branchStocksFilter === 'all' ||
        (branchStocksFilter === 'low' && r.quantity > 0 && r.quantity <= BRANCH_STOCKS_LOW) ||
        (branchStocksFilter === 'out' && r.quantity === 0);
      return matchSearch && matchFilter;
    });
    if (!tbody) return;
    if (list.length === 0) {
      const emptyMsg = branchStocksAllRows.length === 0
        ? 'No inventory in warehouse yet. Receive stock from Inventory In, then click Refresh.'
        : 'No items match your search or filter.';
      tbody.innerHTML = `<tr><td colspan="7" class="wh-empty">${escapeHtml(emptyMsg)}</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(r => {
      const qtyClass = r.quantity === 0 ? 'wh-qty-zero' : (r.quantity <= BRANCH_STOCKS_LOW ? 'wh-qty-low' : '');
      const timeStr = r.last_at ? new Date(r.last_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—';
      return `<tr><td>${escapeHtml(r.barcode || '—')}</td><td>${escapeHtml(r.name || '—')}</td><td>${escapeHtml(r.sku || '—')}</td><td>${escapeHtml(r.size || '—')}</td><td>${escapeHtml(r.color || '—')}</td><td class="${qtyClass}">${r.quantity}</td><td>${timeStr}</td></tr>`;
    }).join('');
  }

  async function loadBranchStocks() {
    const tbody = $('branchStocksBody');
    if (!tbody) return;
    const wid = await getWarehouseId();
    if (!window.db) {
      branchStocksAllRows = [];
      tbody.innerHTML = '<tr><td colspan="7" class="wh-empty">No database</td></tr>';
      return;
    }
    if (!wid) {
      branchStocksAllRows = [];
      tbody.innerHTML = '<tr><td colspan="7" class="wh-empty">No warehouse location configured</td></tr>';
      return;
    }
    tbody.innerHTML = '<tr><td colspan="7" class="wh-loading">Loading…</td></tr>';
    try {
      const { data: invRows, error } = await window.db.from('inventory').select('product_id, quantity').eq('location_id', wid);
      if (error) throw error;
      if (!invRows || !invRows.length) {
        branchStocksAllRows = [];
        filterRowsBranchStocks();
        return;
      }
      const productIds = [...new Set(invRows.map(r => r.product_id).filter(Boolean))];
      let prodMap = {};
      if (productIds.length > 0) {
        let productsRes = await window.db.from('products').select('id, name, sku, barcode, size, color').in('id', productIds);
        if (productsRes.error) productsRes = await window.db.from('products').select('id, name, sku, barcode').in('id', productIds);
        if (!productsRes.error && productsRes.data) productsRes.data.forEach(p => { prodMap[p.id] = p; });
      }
      let lastMap = {};
      try {
        const { data: lastMovements } = await window.db.from('inventory_movements').select('product_id, created_at').or(`source_location.eq.${wid},destination_location.eq.${wid}`).order('created_at', { ascending: false });
        (lastMovements || []).forEach(m => { if (m && m.product_id && !lastMap[m.product_id]) lastMap[m.product_id] = m.created_at; });
      } catch (_) {}
      branchStocksAllRows = invRows.map(r => {
        const p = prodMap[r.product_id] || {};
        return {
          product_id: r.product_id,
          barcode: (p.barcode != null && p.barcode !== '') ? String(p.barcode) : '',
          name: (p.name != null && p.name !== '') ? String(p.name) : '—',
          sku: (p.sku != null && p.sku !== '') ? String(p.sku) : '—',
          size: (p.size != null && p.size !== '') ? String(p.size) : '—',
          color: (p.color != null && p.color !== '') ? String(p.color) : '—',
          quantity: typeof r.quantity === 'number' ? r.quantity : (parseInt(r.quantity, 10) || 0),
          last_at: lastMap[r.product_id] || null
        };
      });
      filterRowsBranchStocks();
    } catch (e) {
      branchStocksAllRows = [];
      tbody.innerHTML = '<tr><td colspan="7" class="wh-empty">Error loading. Click Refresh to retry.</td></tr>';
    }
  }

  async function loadItemAvailability(search) {
    const tbody = $('itemAvailabilityBody');
    if (!tbody) return;
    const wid = await getWarehouseId();
    if (!window.db) {
      tbody.innerHTML = '<tr><td colspan="6" class="wh-empty">No database</td></tr>';
      return;
    }
    tbody.innerHTML = '<tr><td colspan="6" class="wh-loading">Loading…</td></tr>';
    try {
      const { data: invRows, error } = await window.db.from('inventory').select('product_id, location_id, quantity, locations(name, type)').gt('quantity', 0);
      if (error) throw error;
      if (!invRows || !invRows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="wh-empty">No inventory</td></tr>';
        return;
      }
      const productIds = [...new Set(invRows.map(r => r.product_id))];
      const { data: products } = await window.db.from('products').select('id, name, sku, barcode').in('id', productIds);
      const prodMap = {};
      (products || []).forEach(p => { prodMap[p.id] = p; });
      const byProduct = {};
      invRows.forEach(r => {
        const pid = r.product_id;
        if (!byProduct[pid]) byProduct[pid] = { total: 0, byLoc: {} };
        const locName = (r.locations && r.locations.name) ? r.locations.name : r.location_id || '—';
        byProduct[pid].byLoc[locName] = (byProduct[pid].byLoc[locName] || 0) + (r.quantity || 0);
        byProduct[pid].total += (r.quantity || 0);
      });
      let rows = Object.keys(byProduct).map(pid => ({ product_id: pid, product: prodMap[pid], total: byProduct[pid].total, byLoc: byProduct[pid].byLoc }));
      const q = (search || '').toLowerCase().trim();
      if (q) rows = rows.filter(r => {
        const p = r.product || {};
        return (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q);
      });
      const warehouseNameLower = 'warehouse';
      tbody.innerHTML = rows.map(r => {
        const p = r.product || {};
        const whQty = Object.entries(r.byLoc).filter(([name]) => (name || '').toLowerCase().includes(warehouseNameLower)).reduce((s, [, v]) => s + v, 0);
        const branchSummary = Object.entries(r.byLoc).filter(([name]) => !(name || '').toLowerCase().includes(warehouseNameLower)).map(([name, v]) => name + ': ' + v).join(' · ') || '—';
        return `<tr><td>${escapeHtml(p.name || '—')}</td><td>${escapeHtml(p.sku || '—')}</td><td>${escapeHtml(p.barcode || '—')}</td><td>${whQty}</td><td>${escapeHtml(branchSummary)}</td><td>${r.total}</td></tr>`;
      }).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="6" class="wh-empty">Error loading</td></tr>';
    }
  }

  function bindModuleCards() {
    document.querySelectorAll('.wh-action-card[data-scroll]').forEach(card => {
      card.addEventListener('click', e => {
        e.preventDefault();
        const target = card.getAttribute('data-scroll');
        if (!target) return;
        if (target === 'modalInventoryIn') openModal('modalInventoryIn');
        else if (target === 'modalInventoryOut') openModal('modalInventoryOut');
        else scrollToSection(target);
      });
    });
  }

  function bindBranchStocks() {
    const searchBranch = $('branchStocksSearch');
    if (searchBranch) {
      searchBranch.addEventListener('input', () => filterRowsBranchStocks());
      searchBranch.addEventListener('keydown', e => { if (e.key === 'Enter') filterRowsBranchStocks(); });
    }
    document.querySelectorAll('.wh-filter-btn[data-branch-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        branchStocksFilter = btn.getAttribute('data-branch-filter') || 'all';
        document.querySelectorAll('.wh-filter-btn[data-branch-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterRowsBranchStocks();
      });
    });
    const refreshBtn = $('branchStocksRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
      loadBranchStocks();
      toast('Refreshed.', 'success');
    });
  }

  function bindItemAvailability() {
    const searchItem = $('itemAvailabilitySearch');
    if (searchItem) {
      searchItem.addEventListener('input', () => loadItemAvailability(searchItem.value));
    }
  }

  function bindLowStockSearch() {
    const search = $('lowStockSearch');
    if (search) {
      search.addEventListener('input', () => loadLowStockMonitor(search.value));
      search.addEventListener('keydown', e => { if (e.key === 'Enter') loadLowStockMonitor(search.value); });
    }
  }

  function bindLedgerFilters() {
    const apply = $('ledgerApplyFilters');
    if (apply) apply.addEventListener('click', () => loadLedger());
    const ledgerSearch = $('ledgerSearch');
    if (ledgerSearch) ledgerSearch.addEventListener('keydown', e => { if (e.key === 'Enter') loadLedger(); });
  }

  async function init() {
    await window.Auth.guard();
    if (!canAccessWarehouse()) {
      window.location.replace('index.html');
      return;
    }
    await getWarehouseId();
    setNoWarehouseBanner(!hasWarehouseLocation);
    if (isMasterAccess()) {
      const back = $('backToMaster');
      const link = $('linkMasterDashboard');
      if (back) back.style.display = 'inline-flex';
      if (link) link.style.display = 'block';
    }
    const profile = window.Auth.profile;
    if (profile) {
      const initials = (profile.full_name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const avatar = $('profileAvatar');
      if (avatar) avatar.textContent = initials;
      const dropName = $('dropdownName');
      const dropRole = $('dropdownRole');
      if (dropName) dropName.textContent = profile.full_name || 'User';
      if (dropRole) dropRole.textContent = (profile.role || '') + (profile.locations && profile.locations.name ? ' · ' + profile.locations.name : '');
    }
    const logoutBtn = $('logoutBtn');
    const dropdownLogout = $('dropdownLogout');
    if (logoutBtn) logoutBtn.addEventListener('click', () => window.Auth.logout());
    if (dropdownLogout) dropdownLogout.addEventListener('click', e => { e.preventDefault(); window.Auth.logout(); });

    function closeDrawer() {
      document.body.classList.remove('store-drawer-open');
      const o = $('storeDrawerOverlay');
      if (o) o.classList.remove('is-open');
    }
    function openDrawer() {
      document.body.classList.add('store-drawer-open');
      const o = $('storeDrawerOverlay');
      if (o) o.classList.add('is-open');
    }
    const menuBtn = $('storeMenuBtn');
    const overlay = $('storeDrawerOverlay');
    if (menuBtn) menuBtn.addEventListener('click', () => { document.body.classList.contains('store-drawer-open') ? closeDrawer() : openDrawer(); });
    if (overlay) overlay.addEventListener('click', closeDrawer);
    document.querySelectorAll('.store-sidebar__link').forEach(link => { link.addEventListener('click', closeDrawer); });

    loadMetrics();
    loadLedger();
    loadTransferRequests();
    loadLowStockMonitor();
    loadBranchStocks();
    loadItemAvailability();
    bindInventoryIn();
    bindInventoryOut();
    bindModuleCards();
    bindBranchStocks();
    bindItemAvailability();
    bindLowStockSearch();
    bindLedgerFilters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
