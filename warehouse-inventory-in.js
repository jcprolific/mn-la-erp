/* Warehouse Inventory In — same flow as Store Inventory In, receive into warehouse only */
(function () {
  'use strict';

  var inList = [];
  var searchTimeout = null;
  var warehouseLocation = null; // { id, name }
  var lastNotFoundBarcode = '';
  var isSaving = false;
  function genTraceId() { return 'wh-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9); }

  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  async function getWarehouse() {
    if (warehouseLocation !== null) return warehouseLocation;
    if (!window.db) return null;
    try {
      var res = await window.db.from('locations').select('id,name').eq('type', 'warehouse').limit(1).maybeSingle();
      if (res.error || !res.data) return null;
      warehouseLocation = { id: res.data.id, name: res.data.name || 'Warehouse' };
      return warehouseLocation;
    } catch (e) {
      console.warn('[Warehouse Inv In] getWarehouse failed', e);
      return null;
    }
  }

  async function getWarehouseStock(productId) {
    var wh = await getWarehouse();
    if (!wh || !window.db) return 0;
    try {
      var res = await window.db.from('inventory').select('quantity').eq('product_id', productId).eq('location_id', wh.id).maybeSingle();
      return (res.data && res.data.quantity != null) ? res.data.quantity : 0;
    } catch (e) { return 0; }
  }

  /** Save received stock into warehouse via RPC only. Uses warehouse_receive_inventory_v2. */
  async function receiveIntoWarehouse(productId, receivedQty, note, requestId) {
    if (!window.db) throw new Error('Database not connected.');
    var qty = (typeof receivedQty === 'number' && !isNaN(receivedQty)) ? receivedQty : (parseInt(receivedQty, 10) || 0);
    var res = await window.db.rpc('warehouse_receive_inventory_v2', {
      p_product_id: productId,
      p_quantity: qty,
      p_notes: note || 'Manual warehouse inventory receive',
      p_request_id: requestId || null
    });
    if (res.error) throw new Error(res.error.message || 'Receive failed');
  }

  async function addToList(product) {
    var existing = inList.find(function (p) { return p.id === product.id; });
    var whStock = await getWarehouseStock(product.id);
    if (existing) {
      existing.quantity = Math.max(1, (existing.quantity || 1) + 1);
      existing.whStock = whStock;
    } else {
      inList.push({
        id: product.id,
        name: product.name || '—',
        sku: product.sku || '—',
        barcode: product.barcode != null ? product.barcode : (product.sku || '—'),
        size: product.size || '—',
        color: product.color || '—',
        quantity: 1,
        whStock: whStock
      });
    }
    renderList();
  }

  function removeFromList(index) {
    inList.splice(index, 1);
    renderList();
  }

  function renderList() {
    var tbody = $('inventoryListBody');
    var table = $('inventoryListTable');
    var empty = $('inventoryListEmpty');
    var btn = $('btnSubmitReceive');
    if (inList.length === 0) {
      if (table) table.style.display = 'none';
      if (empty) empty.style.display = 'block';
      if (btn) btn.disabled = true;
      return;
    }
    if (empty) empty.style.display = 'none';
    if (table) table.style.display = 'table';
    if (btn) btn.disabled = false;
    tbody.innerHTML = inList.map(function (row, i) {
      var whStock = row.whStock != null ? Number(row.whStock) : '—';
      var qty = Math.max(1, parseInt(row.quantity, 10) || 1);
      return '<tr data-index="' + i + '">' +
        '<td>' + escapeHtml(row.name) + '</td>' +
        '<td>' + escapeHtml(row.sku) + '</td>' +
        '<td>' + escapeHtml(row.barcode) + '</td>' +
        '<td>' + escapeHtml(row.size || '—') + '</td>' +
        '<td>' + escapeHtml(row.color || '—') + '</td>' +
        '<td>' + whStock + '</td>' +
        '<td><div class="sd-list-qty-wrap">' +
        '<button type="button" class="sd-list-qty-btn" data-index="' + i + '" data-dir="-1" aria-label="Decrease">−</button>' +
        '<input type="number" class="sd-list-qty" min="1" value="' + qty + '" data-index="' + i + '" />' +
        '<button type="button" class="sd-list-qty-btn" data-index="' + i + '" data-dir="1" aria-label="Increase">+</button>' +
        '</div></td>' +
        '<td><button type="button" class="sd-list-remove" data-index="' + i + '" aria-label="Remove"><span class="material-icons-round">close</span></button></td></tr>';
    }).join('');
    tbody.querySelectorAll('.sd-list-qty').forEach(function (input) {
      input.addEventListener('change', function () {
        var idx = parseInt(this.dataset.index, 10);
        var q = parseInt(this.value, 10);
        if (inList[idx]) inList[idx].quantity = isNaN(q) || q < 1 ? 1 : q;
        renderList();
      });
    });
    tbody.querySelectorAll('.sd-list-qty-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var idx = parseInt(this.dataset.index, 10);
        var dir = parseInt(this.dataset.dir, 10);
        if (!inList[idx]) return;
        inList[idx].quantity = Math.max(1, (inList[idx].quantity || 1) + dir);
        renderList();
      });
    });
    tbody.querySelectorAll('.sd-list-remove').forEach(function (b) {
      b.addEventListener('click', function () { removeFromList(parseInt(this.dataset.index, 10)); });
    });
  }

  async function findProductByBarcode(bc) {
    if (!bc || !window.db) return { status: 'not_found', product: null, matches: [] };
    var trimmed = (bc || '').trim();
    var res = await window.db.rpc('get_product_by_barcode_safe', { p_barcode: trimmed });
    if (res.error || !res.data || !res.data.length) return { status: 'not_found', product: null, matches: [] };
    var rows = Array.isArray(res.data) ? res.data : [res.data];
    var first = rows[0] || {};
    var count = Number(first.match_count || rows.length || 0);
    if (count > 1 || rows.length > 1) return { status: 'ambiguous', product: null, matches: rows };
    if (first.scanner_enabled === false || first.barcode_status === 'duplicate_conflict') {
      return { status: 'blocked', product: null, matches: rows };
    }
    return { status: 'ok', product: first, matches: rows };
  }

  function pickProductCandidate(matches, barcode) {
    if (!Array.isArray(matches) || matches.length === 0) return null;
    var lines = matches.slice(0, 10).map(function (m, i) {
      return (i + 1) + '. ' + (m.name || 'Unnamed') + ' | ' + (m.sku || '—') + ' | ' + (m.size || '—') + ' | ' + (m.color || '—');
    });
    var picked = window.prompt('Barcode ' + barcode + ' matches multiple variants.\nPick variant number:\n' + lines.join('\n'));
    var idx = parseInt(picked, 10);
    if (isNaN(idx) || idx < 1 || idx > Math.min(matches.length, 10)) return null;
    return matches[idx - 1];
  }

  async function handleBarcodeScan(barcode) {
    if (!barcode || !window.db) return;
    var trimmed = (barcode || '').trim();
    var lookup = await findProductByBarcode(trimmed);
    var product = lookup && lookup.product ? lookup.product : null;
    if (lookup && lookup.status === 'ambiguous') {
      if (window.Auth && window.Auth.toast) window.Auth.toast('Duplicate barcode detected. Choose a variant manually.', 'info');
      product = pickProductCandidate(lookup.matches, trimmed);
    } else if (lookup && lookup.status === 'blocked') {
      if (window.Auth && window.Auth.toast) window.Auth.toast('Barcode is blocked due to conflict. Choose a variant manually.', 'error');
      product = pickProductCandidate(lookup.matches, trimmed);
    }
    if (!product) {
      lastNotFoundBarcode = trimmed;
      var notFoundWrap = $('barcodeNotFoundWrap');
      if (notFoundWrap) notFoundWrap.style.display = 'block';
      if (window.Auth && window.Auth.toast) window.Auth.toast('Barcode not resolved in product catalog.', 'error');
      return;
    }
    var notFoundWrap = $('barcodeNotFoundWrap');
    if (notFoundWrap) notFoundWrap.style.display = 'none';
    var normalized = {
      id: product.id,
      name: product.name || product.sku || 'Unnamed product',
      sku: product.sku || '',
      barcode: product.barcode || '',
      size: product.size || '',
      color: product.color || ''
    };
    await addToList(normalized);
    if (window.Auth && window.Auth.toast) window.Auth.toast('Added: ' + (product.name || product.sku), 'success');
  }

  async function searchProducts(q) {
    if (!q || !window.db) return [];
    q = q.trim();
    if (q.length < 2) return [];
    var part = 'name.ilike.%' + q + '%,sku.ilike.%' + q + '%,barcode.ilike.%' + q + '%';
    var res = await window.db.from('products').select('id, sku, name, barcode, size, color').or(part);
    return (res.data) || [];
  }

  async function guard() {
    await window.Auth.guard();
    var profile = window.Auth.profile;
    var allowed = ['warehouse_staff', 'warehouse', 'owner', 'admin'];
    if (!profile || !allowed.includes(profile.role)) {
      window.location.replace('index.html');
      return;
    }
    document.getElementById('dropdownName').textContent = profile.full_name || 'User';
    document.getElementById('dropdownRole').textContent = (profile.role || '') + (profile.locations && profile.locations.name ? ' • ' + profile.locations.name : '');
    document.getElementById('profileAvatar').textContent = (profile.full_name || 'U').split(' ').map(function (w) { return w[0]; }).join('').toUpperCase().slice(0, 2);

    var wh = await getWarehouse();
    var noWh = $('noWarehouseMessage');
    var badge = $('branchBadge');
    var branchNameEl = $('branchName');
    var formEl = $('inventoryInForm');
    var btnSubmit = $('btnSubmitReceive');

    if (!wh) {
      if (noWh) noWh.style.display = 'block';
      if (badge) badge.style.display = 'none';
      if (formEl) formEl.style.display = 'block';
      if (btnSubmit) btnSubmit.disabled = true;
      if (window.Auth && window.Auth.toast) window.Auth.toast('No warehouse location configured.', 'error');
      return;
    }
    if (noWh) noWh.style.display = 'none';
    if (badge && branchNameEl) {
      branchNameEl.textContent = wh.name;
      badge.style.display = 'inline-flex';
    }
    if (btnSubmit) btnSubmit.disabled = inList.length === 0;
  }

  var barcodeInput = $('barcodeInput');
  var searchInput = $('searchInput');
  var searchResults = $('searchResults');

  function setBarcodeStatus(ready) {
    var el = $('barcodeStatus');
    if (!el) return;
    if (ready) {
      el.textContent = '✓ Ready — type or scan barcode, then press Enter or tap Search';
      el.className = 'ready';
    } else {
      el.textContent = 'Click the icon or box above to focus, then scan.';
      el.className = '';
    }
  }

  if (barcodeInput) {
    barcodeInput.addEventListener('focus', function () { setBarcodeStatus(true); });
    barcodeInput.addEventListener('blur', function () { setBarcodeStatus(false); });
    barcodeInput.addEventListener('keydown', async function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        var barcode = (barcodeInput.value || '').trim().replace(/\r?\n/g, '');
        if (barcode) {
          await handleBarcodeScan(barcode);
          barcodeInput.value = '';
        }
        setTimeout(function () { barcodeInput.focus(); }, 0);
      }
    });
  }
  var barcodeScannerIcon = $('barcodeScannerIcon');
  if (barcodeScannerIcon && barcodeInput) {
    barcodeScannerIcon.addEventListener('click', function () {
      barcodeInput.focus();
      setBarcodeStatus(true);
      if (window.Auth && window.Auth.toast) window.Auth.toast('Barcode scanner ready — scan or type here', 'success');
    });
  }
  var barcodeSearchBtn = $('barcodeSearchBtn');
  if (barcodeSearchBtn && barcodeInput) {
    barcodeSearchBtn.addEventListener('click', function () {
      var barcode = (barcodeInput.value || '').trim();
      if (!barcode) {
        if (window.Auth && window.Auth.toast) window.Auth.toast('Type or scan a barcode first', 'info');
        barcodeInput.focus();
        return;
      }
      handleBarcodeScan(barcode).then(function () {
        barcodeInput.value = '';
        barcodeInput.focus();
      });
    });
  }

  var manualProductCreationDisabled = true;
  var barcodeNotFoundWrap = $('barcodeNotFoundWrap');
  var btnAddProductManually = $('btnAddProductManually');
  var manualProductModal = $('manualProductModal');
  var manualProductForm = $('manualProductForm');
  var manualProductModalClose = $('manualProductModalClose');
  var manualProductCancel = $('manualProductCancel');
  var manualProductSave = $('manualProductSave');

  function openManualProductModal() {
    $('manualBarcode').value = lastNotFoundBarcode || '';
    $('manualProductName').value = '';
    $('manualSku').value = '';
    $('manualColor').value = '';
    $('manualQuantityReceived').value = '1';
    $('manualNotes').value = '';
    $('manualSizeOther').value = '';
    document.querySelectorAll('input[name="manualSize"]').forEach(function (cb) { cb.checked = false; });
    $('manualProductFormError').textContent = '';
    $('manualProductFormErrorWrap').style.display = 'none';
    var noWhWarn = $('manualProductNoWarehouseWarn');
    if (noWhWarn) noWhWarn.style.display = warehouseLocation ? 'none' : 'block';
    if (manualProductSave) {
      manualProductSave.disabled = !warehouseLocation;
      manualProductSave.textContent = 'Save & Receive';
    }
    if (manualProductModal) { manualProductModal.style.display = 'flex'; manualProductModal.setAttribute('aria-hidden', 'false'); }
  }

  function closeManualProductModal() {
    if (manualProductModal) { manualProductModal.style.display = 'none'; manualProductModal.setAttribute('aria-hidden', 'true'); }
  }

  if (btnAddProductManually) {
    btnAddProductManually.style.display = 'none';
    btnAddProductManually.addEventListener('click', function () {
      if (window.Auth && window.Auth.toast) window.Auth.toast('Manual product creation is disabled. Add products in Shopify and run catalog sync.', 'info');
    });
  }
  var btnAddManuallyAlways = $('btnAddManuallyAlways');
  if (btnAddManuallyAlways) {
    btnAddManuallyAlways.style.display = 'none';
    btnAddManuallyAlways.addEventListener('click', function () {
      if (window.Auth && window.Auth.toast) window.Auth.toast('Manual product creation is disabled. Add products in Shopify and run catalog sync.', 'info');
    });
  }
  if (manualProductModal) manualProductModal.style.display = 'none';
  if (manualProductModalClose) manualProductModalClose.addEventListener('click', closeManualProductModal);
  if (manualProductCancel) manualProductCancel.addEventListener('click', closeManualProductModal);
  if (manualProductModal) manualProductModal.addEventListener('click', function (e) { if (e.target === manualProductModal) closeManualProductModal(); });

  if (manualProductForm) {
    manualProductForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (manualProductCreationDisabled) {
        $('manualProductFormError').textContent = 'Manual product creation is disabled. Create or update products in Shopify, then run catalog sync.';
        $('manualProductFormErrorWrap').style.display = 'block';
        if (window.Auth && window.Auth.toast) window.Auth.toast('Manual product creation is disabled. Use Shopify catalog sync.', 'error');
        return;
      }
      var wh = await getWarehouse();
      if (!wh) {
        $('manualProductFormError').textContent = 'No warehouse configured.';
        $('manualProductFormErrorWrap').style.display = 'block';
        return;
      }
      var name = ($('manualProductName').value || '').trim();
      var sku = ($('manualSku').value || '').trim();
      var barcode = ($('manualBarcode').value || '').trim();
      var color = ($('manualColor').value || '').trim();
      var qty = parseInt($('manualQuantityReceived').value, 10);
      if (isNaN(qty) || qty < 1) qty = 1;
      var notes = ($('manualNotes').value || '').trim();
      var sizeParts = [];
      document.querySelectorAll('input[name="manualSize"]:checked').forEach(function (cb) { sizeParts.push(cb.value); });
      var sizeOther = ($('manualSizeOther').value || '').trim();
      if (sizeOther) sizeParts.push(sizeOther);
      var size = sizeParts.length ? sizeParts.join(', ') : '';

      var errEl = $('manualProductFormError');
      var errWrap = $('manualProductFormErrorWrap');
      function showErr(txt) { errEl.textContent = txt || 'Failed.'; errWrap.style.display = 'block'; }
      function hideErr() { errEl.textContent = ''; errWrap.style.display = 'none'; }

      if (!name) { showErr('Product name is required.'); return; }
      if (!sku) { showErr('SKU is required.'); return; }
      if (!barcode) { showErr('Barcode is required.'); return; }
      if (qty < 1) { showErr('Quantity must be at least 1.'); return; }
      hideErr();
      if (manualProductSave) { manualProductSave.disabled = true; manualProductSave.textContent = 'Saving…'; }

      try {
        var productId = null;
        var bySku = await window.db.from('products').select('id').eq('sku', sku).maybeSingle();
        if (bySku.data && bySku.data.id) productId = bySku.data.id;
        if (!productId) {
          var byBarcode = await window.db.from('products').select('id').eq('barcode', barcode).maybeSingle();
          if (byBarcode.data && byBarcode.data.id) productId = byBarcode.data.id;
        }
        if (!productId) {
          var ins = await window.db.from('products').insert({
            name: name,
            sku: sku,
            barcode: barcode,
            size: size || null,
            color: color || null
          }).select('id').single();
          if (ins.error) throw new Error(ins.error.message || 'Failed to save product');
          productId = ins.data && ins.data.id ? ins.data.id : null;
        }
        if (!productId) throw new Error('Could not get product id');

        var manualRequestId = 'wh-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        await receiveIntoWarehouse(productId, qty, notes || 'Manual product add — warehouse inventory in', manualRequestId);

        if (barcodeNotFoundWrap) barcodeNotFoundWrap.style.display = 'none';
        lastNotFoundBarcode = '';
        if (barcodeInput) barcodeInput.value = '';
        closeManualProductModal();
        if (window.Auth && window.Auth.toast) window.Auth.toast('Product saved and received into warehouse.', 'success');
      } catch (err) {
        showErr(err.message || 'Failed to save product.');
        if (window.Auth && window.Auth.toast) window.Auth.toast(err.message, 'error');
      }
      if (manualProductSave) { manualProductSave.disabled = false; manualProductSave.textContent = 'Save & Receive'; }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      var q = (searchInput.value || '').trim();
      clearTimeout(searchTimeout);
      if (q.length < 2) {
        searchResults.style.display = 'none';
        searchResults.innerHTML = '';
        return;
      }
      searchTimeout = setTimeout(function () {
        searchProducts(q).then(function (products) {
          if (products.length === 0) {
            searchResults.innerHTML = '<div class="sd-search-item">No products found.</div>';
          } else {
            searchResults.innerHTML = products.slice(0, 10).map(function (p) {
              var barcode = (p.barcode != null && p.barcode !== '') ? escapeHtml(p.barcode) : escapeHtml(p.sku || '');
              var sizeStr = (p.size != null && String(p.size).trim() !== '') ? String(p.size).trim() : '';
              var colorStr = (p.color != null && String(p.color).trim() !== '') ? String(p.color).trim() : '';
              var extra = [sizeStr, colorStr].filter(Boolean).join(' · ');
              var label = escapeHtml(p.name || p.sku) + (extra ? ' <span style="color:var(--text-muted);">— ' + escapeHtml(extra) + '</span>' : '') + ' <span style="color:var(--text-muted);">' + escapeHtml(p.sku) + '</span>';
              return '<div class="sd-search-item" data-id="' + p.id + '" data-name="' + escapeHtml(p.name || '') + '" data-sku="' + escapeHtml(p.sku || '') + '" data-barcode="' + barcode + '" data-size="' + escapeHtml(p.size || '') + '" data-color="' + escapeHtml(p.color || '') + '">' + label + '</div>';
            }).join('');
            searchResults.querySelectorAll('.sd-search-item[data-id]').forEach(function (el) {
              el.addEventListener('click', function () {
                var p = { id: el.dataset.id, name: el.dataset.name, sku: el.dataset.sku, barcode: el.dataset.barcode || el.dataset.sku, size: el.dataset.size || '—', color: el.dataset.color || '—' };
                addToList(p).then(function () {
                  searchInput.value = '';
                  searchResults.style.display = 'none';
                  if (barcodeInput) barcodeInput.focus();
                });
              });
            });
          }
          searchResults.style.display = 'block';
        });
      }, 250);
    });
    searchInput.addEventListener('blur', function () {
      setTimeout(function () { if (searchResults) searchResults.style.display = 'none'; }, 200);
    });
  }

  var btnSubmit = $('btnSubmitReceive');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', async function (e) {
      if (e) e.preventDefault();
      if (isSaving) return;
      if (inList.length === 0 || !window.db) return;
      var requestId = 'wh-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      isSaving = true;
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Receiving…';
      var errEl = $('receiveError');
      if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
      var errCount = 0;
      var lastError = '';
      try {
        var wh = await getWarehouse();
        if (!wh) {
          if (window.Auth && window.Auth.toast) window.Auth.toast('No warehouse configured.', 'error');
          return;
        }
        for (var i = 0; i < inList.length; i++) {
          var row = inList[i];
          var qty = parseInt(row.quantity, 10);
          if (isNaN(qty) || qty < 1) qty = 1;
          var lineRequestId = requestId + '-' + i;
          try {
            await receiveIntoWarehouse(row.id, qty, 'warehouse_inventory_in', lineRequestId);
          } catch (err) {
            errCount++;
            lastError = err.message || err.code || 'Error receiving stock';
            if (window.Auth && window.Auth.toast) window.Auth.toast(lastError, 'error');
          }
        }
        if (errCount > 0 && errEl) {
          errEl.textContent = lastError + (errCount > 1 ? ' (' + errCount + ' items failed)' : '');
          errEl.style.display = 'block';
        }
        if (errCount === 0) {
          if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
          if (window.Auth && window.Auth.toast) window.Auth.toast('Stock received successfully.', 'success');
          inList = [];
          renderList();
          if (barcodeInput) { barcodeInput.value = ''; barcodeInput.focus(); }
        }
      } finally {
        isSaving = false;
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Receive stock';
      }
    });
  }

  guard().then(function () {
    var formEl = $('inventoryInForm');
    var b = $('barcodeInput');
    if (formEl && formEl.style.display !== 'none' && b) {
      setTimeout(function () { b.focus(); }, 150);
    }
  });

  function closeDrawer() {
    document.body.classList.remove('store-drawer-open');
    var o = $('storeDrawerOverlay');
    if (o) o.classList.remove('is-open');
  }
  function openDrawer() {
    document.body.classList.add('store-drawer-open');
    var o = $('storeDrawerOverlay');
    if (o) o.classList.add('is-open');
  }
  var menuBtn = $('storeMenuBtn');
  var overlay = $('storeDrawerOverlay');
  if (menuBtn) menuBtn.addEventListener('click', function () { document.body.classList.contains('store-drawer-open') ? closeDrawer() : openDrawer(); });
  if (overlay) overlay.addEventListener('click', closeDrawer);
  document.querySelectorAll('.store-sidebar__link').forEach(function (link) {
    link.addEventListener('click', closeDrawer);
  });

  document.getElementById('logoutBtn').addEventListener('click', function (e) { e.preventDefault(); window.Auth.logout(); });
  var sl = $('storeLogout');
  if (sl) sl.addEventListener('click', function (e) { e.preventDefault(); window.Auth.logout(); });
})();
