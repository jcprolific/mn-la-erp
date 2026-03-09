/**
 * MN+LA ERP — Direct Inventory Recording Workflow
 */

(function () {
    'use strict';

    let inventoryData = []; // Array of { productId, name, sku, size, color, systemQty, countedQty, dirty }

    const $ = id => document.getElementById(id);

    async function init() {
        if (!window.Auth || !window.db) {
            console.error("Auth or DB not initialized.");
            showToast("System not initialized.", "error");
            return;
        }

        // Guard login session first
        await Auth.guard();

        // Check if there is a profile and enforce role-based access
        if (!Auth.profile || !['owner', 'admin', 'store_associate'].includes(Auth.profile.role)) {
            showToast("You do not have permission to view this page.", "error");
            // Redirect unauthorized users back to the dashboard
            window.location.href = 'index.html';
            return;
        }

        // Update Location Badge
        const locBadge = $('locationBadge');
        if (locBadge && Auth.profile && Auth.profile.locations) {
            locBadge.textContent = Auth.profile.locations.name;
        } else if (locBadge) {
            locBadge.textContent = "Location Unknown";
        }

        if (!Auth.profile.location_id) {
            showToast("No assigned branch location found for this profile.", "error");
            return;
        }

        await loadInventory();
        renderTable();
        setupEventListeners();
    }

    async function loadInventory() {
        // Fetch all products + their branch-scoped inventory via RLS auto-joins
        const { data, error } = await window.db.from('products').select(`
            id, name, sku, size, color, barcode,
            inventory(quantity)
        `).order('name');

        if (error) {
            console.error("Error fetching products:", error);
            showToast("Failed to load inventory data.", "error");
            return;
        }

        inventoryData = data.map(p => {
            // RLS ensures ONLY inventory records for the user's mapped location_id are returned!
            const systemQty = (p.inventory && p.inventory.length > 0) ? p.inventory[0].quantity : 0;

            return {
                productId: p.id,
                name: p.name,
                sku: p.sku || '—',
                size: p.size || 'ONE',
                color: p.color || 'None',
                barcode: p.barcode || '',
                systemQty: systemQty,
                countedQty: null, // Input starts blank
                dirty: false // Tracks if user entered a value
            };
        });
    }

    function checkAnyDirty() {
        const anyDirty = inventoryData.some(item => item.dirty && item.countedQty !== null);
        const btn = $('btnSaveLive');
        if (btn) btn.disabled = !anyDirty;
    }

    function renderTable() {
        const tbody = $('countTableBody');
        if (!tbody) return;

        const query = ($('searchInput') ? $('searchInput').value.toLowerCase() : '');

        const filtered = inventoryData.filter(item => {
            return item.name.toLowerCase().includes(query) ||
                item.sku.toLowerCase().includes(query) ||
                item.color.toLowerCase().includes(query) ||
                item.barcode.toLowerCase().includes(query);
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="sc-empty-state">No products found.</td></tr>`;
            return;
        }

        let html = '';
        filtered.forEach((item, index) => {
            // Because original index is needed for updates, attach its true array index
            const origIndex = inventoryData.indexOf(item);

            const countVal = item.countedQty !== null ? item.countedQty : '';
            const variance = item.countedQty !== null ? (item.countedQty - item.systemQty) : 0;

            let varText = '—';
            let varClass = 'zero';
            if (item.countedQty !== null) {
                if (variance > 0) {
                    varText = `+${variance}`;
                    varClass = 'positive';
                } else if (variance < 0) {
                    varText = `${variance}`;
                    varClass = 'negative';
                } else {
                    varText = '0';
                    varClass = 'zero';
                }
            }

            html += `
                <tr>
                    <td>
                        <div class="sc-product-name">${item.name}</div>
                        <div class="sc-product-meta">SKU: <span style="font-family:monospace">${item.sku}</span> | Size: ${item.size} | Color: ${item.color}</div>
                    </td>
                    <td style="text-align:center;">
                        <span class="sc-system-qty">${item.systemQty}</span>
                    </td>
                    <td style="text-align:center;">
                        <input type="number" 
                               class="sc-qty-input" 
                               value="${countVal}" 
                               min="0"
                               data-index="${origIndex}" />
                    </td>
                    <td style="text-align:right;">
                        <span class="sc-variance ${varClass}">${varText}</span>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // Attach input listeners for live updates
        const inputs = tbody.querySelectorAll('.sc-qty-input');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const val = e.target.value;
                const idx = parseInt(e.target.dataset.index, 10);
                const parsed = parseInt(val, 10);

                inventoryData[idx].countedQty = isNaN(parsed) ? null : parsed;
                // Only mark dirty if the value actually differs from system quantity
                inventoryData[idx].dirty = (!isNaN(parsed) && parsed !== inventoryData[idx].systemQty);

                checkAnyDirty();

                // Live variance update
                const row = e.target.closest('tr');
                const varSpan = row.querySelector('.sc-variance');
                if (isNaN(parsed)) {
                    varSpan.textContent = '—';
                    varSpan.className = 'sc-variance zero';
                } else {
                    const diff = parsed - inventoryData[idx].systemQty;
                    varSpan.textContent = diff > 0 ? `+${diff}` : diff;
                    varSpan.className = `sc-variance ${diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'zero'}`;
                }

                // Visual row highlighting
                if (inventoryData[idx].dirty) {
                    row.classList.add('sc-row-dirty');
                } else {
                    row.classList.remove('sc-row-dirty');
                }
            });
        });
    }

    function openConfirmModal() {
        const dirtyItems = inventoryData.filter(i => i.dirty && i.countedQty !== null && i.countedQty !== i.systemQty);
        if (dirtyItems.length === 0) {
            showToast('No new inventory records to update.', 'info');
            return;
        }

        const modalTbody = $('modalTableBody');
        let html = '';

        dirtyItems.forEach(item => {
            const variance = item.countedQty - item.systemQty;
            const varText = variance > 0 ? `+${variance}` : variance;
            const varClass = variance > 0 ? 'positive' : variance < 0 ? 'negative' : 'zero';

            html += `
                <tr>
                    <td>
                        <div style="font-weight:600;font-size:.8rem;">${item.name}</div>
                        <div style="font-size:.7rem;color:var(--text-muted);font-family:monospace;">${item.sku}</div>
                    </td>
                    <td style="text-align:center;color:var(--text-secondary);">${item.systemQty}</td>
                    <td style="text-align:center;font-weight:700;">${item.countedQty}</td>
                    <td style="text-align:right;">
                        <span class="sc-variance ${varClass}" style="font-size:.8rem;">${varText}</span>
                    </td>
                </tr>
            `;
        });

        modalTbody.innerHTML = html;

        const locName = (Auth.profile && Auth.profile.locations) ? Auth.profile.locations.name : 'Unknown Location';
        $('modalLocationBadge').textContent = locName;

        $('updateReason').value = '';
        $('confirmModal').classList.add('open');
    }

    function closeConfirmModal() {
        $('confirmModal').classList.remove('open');
    }

    async function confirmLiveCounts() {
        const reason = $('updateReason').value;
        if (!reason) {
            showToast('Please select a reason for the update.', 'error');
            return;
        }

        const dirtyItems = inventoryData.filter(i => i.dirty && i.countedQty !== null && i.countedQty !== i.systemQty);
        if (dirtyItems.length === 0) return;

        const btn = $('btnConfirmUpdates');
        const origHTML = btn.innerHTML;
        btn.innerHTML = 'Updating Live Inventory...';
        btn.disabled = true;

        let successCount = 0;
        let failCount = 0;

        try {
            // Process updates sequentially via the secure RPC, passing the reason
            for (const item of dirtyItems) {
                const { data, error } = await window.db.rpc('set_inventory_count', {
                    p_product_id: item.productId,
                    p_counted_quantity: item.countedQty,
                    p_reason: reason
                });

                if (error) {
                    console.error('RPC Error for product ' + item.productId, error);
                    failCount++;
                } else {
                    successCount++;
                }
            }

            if (failCount > 0) {
                showToast(`Updated ${successCount} products, but ${failCount} failed. Check console.`, 'error');
            } else {
                showToast(`Successfully updated live inventory for ${successCount} products.`, 'success');
            }

        } catch (err) {
            console.error(err);
            showToast('An unexpected error occurred.', 'error');
        } finally {
            btn.innerHTML = origHTML;
            btn.disabled = false;

            closeConfirmModal();

            // Reload ground-truth data cleanly to wipe dirty state & sync UI
            await loadInventory();
            $('searchInput').value = ''; // clear search field
            renderTable();
            checkAnyDirty();
        }
    }

    function handleBarcodeScan(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const barcodeVal = e.target.value.trim();
            if (!barcodeVal) return;

            // Search inventory data for the exact barcode
            const matchedItem = inventoryData.find(item => item.barcode === barcodeVal);

            if (matchedItem) {
                // Pre-filter the table to just this item using the search input
                const searchBox = $('searchInput');
                if (searchBox) {
                    searchBox.value = matchedItem.sku !== '—' ? matchedItem.sku : matchedItem.name;
                    renderTable();
                }

                // Find the visible row corresponding to this item and focus its input
                const matchedIndex = inventoryData.indexOf(matchedItem);
                const inputDoms = document.querySelectorAll('.sc-qty-input');
                let foundInput = null;

                for (let input of inputDoms) {
                    if (parseInt(input.dataset.index, 10) === matchedIndex) {
                        foundInput = input;
                        break;
                    }
                }

                if (foundInput) {
                    foundInput.focus();
                    foundInput.select();
                }
                showToast(`Found: ${matchedItem.name}`, 'success');
            } else {
                showToast(`Barcode ${barcodeVal} not found in catalog.`, 'error');
            }

            // Auto clear for the next scan after a small delay
            setTimeout(() => { e.target.value = ''; }, 100);
        }
    }

    function setupEventListeners() {
        const searchInput = $('searchInput');
        if (searchInput) searchInput.addEventListener('input', renderTable);

        const barcodeInput = $('barcodeInput');
        if (barcodeInput) barcodeInput.addEventListener('keydown', handleBarcodeScan);

        const saveBtn = $('btnSaveLive');
        if (saveBtn) saveBtn.addEventListener('click', openConfirmModal);

        const btnClose = $('btnCloseModal');
        if (btnClose) btnClose.addEventListener('click', closeConfirmModal);

        const btnCancel = $('btnCancelModal');
        if (btnCancel) btnCancel.addEventListener('click', closeConfirmModal);

        const btnConfirm = $('btnConfirmUpdates');
        if (btnConfirm) btnConfirm.addEventListener('click', confirmLiveCounts);
    }

    function showToast(msg, type = 'info') {
        if (window.Auth && typeof window.Auth.toast === 'function') {
            window.Auth.toast(msg, type);
        } else {
            console.log("Toast:", msg);
        }
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
