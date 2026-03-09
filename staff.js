/**
 * MN+LA ERP — Staff Management Module
 */

(function () {
    'use strict';

    let staffData = [];
    let locationsData = [];

    const $ = id => document.getElementById(id);

    async function init() {
        if (!window.Auth || !window.db) {
            showToast("System not initialized.", "error");
            return;
        }

        // Guard login session first
        await Auth.guard();

        // Check if there is a profile and enforce role-based access
        if (!Auth.profile || !['owner', 'admin'].includes(Auth.profile.role)) {
            showToast("You do not have permission to view this page.", "error");
            // Redirect unauthorized users back to the dashboard
            window.location.href = 'index.html';
            return;
        }

        setupEventListeners();

        await Promise.all([
            loadLocations(),
            loadStaff()
        ]);

        renderTable();
    }

    async function loadLocations() {
        try {
            console.log('[Staff] loadLocations: window.db exists?', typeof window !== 'undefined' && !!window.db, 'initialized?', !!(window.db && typeof window.db.from === 'function'));

            const result = await window.db.from('locations').select('id, name, type').order('name');
            console.log('[Staff] loadLocations: query result { data, error }', { data: result.data, error: result.error, errorFull: result.error });

            const { data, error } = result;
            if (error) {
                console.error('[Staff] loadLocations: Supabase error (full)', error);
                const msg = error.message || error.details || JSON.stringify(error);
                showToast('Locations: ' + msg, 'error');
                throw error;
            }

            locationsData = data || [];
            console.log('[Staff] loadLocations: locationsData length after assignment', locationsData.length);

            const locSelect = $('staffLocation');
            if (locSelect) {
                const storeLocations = (locationsData || []).filter(l =>
                    l.type == null || String(l.type).toLowerCase() === 'store'
                );
                let html = '<option value="">-- Select Store (Required) --</option>';
                storeLocations.forEach(l => {
                    html += `<option value="${l.id}">${l.name}</option>`;
                });
                locSelect.innerHTML = html;
                updateLocationRequirementUI();
            }
        } catch (err) {
            console.error('[Staff] loadLocations: catch — full error object', err);
            console.log('[Staff] loadLocations: fetch failed, locationsData unchanged', locationsData.length);
            const msg = (err && (err.message || err.details)) || String(err);
            showToast('Locations: ' + msg, 'error');
        }
    }

    async function loadStaff() {
        try {
            const { data, error } = await window.db.rpc('admin_get_staff');
            if (error) throw error;
            staffData = data || [];
        } catch (err) {
            console.error('Error loading staff:', err);
            showToast("Failed to load staff directory: " + (err.message || 'Unknown error'), "error");
        }
    }

    function renderTable() {
        const tbody = $('staffTableBody');
        if (!tbody) return;

        if (staffData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No staff members found.</td></tr>`;
            return;
        }

        let html = '';
        staffData.forEach((staff) => {
            const isBanned = staff.banned_until !== null && new Date(staff.banned_until).getTime() > Date.now();
            const statusClass = isBanned ? 'status-banned' : 'status-active';
            const statusText = isBanned ? 'Disabled' : 'Active';

            // Cannot edit self, nor can admin edit owner
            const isSelf = staff.id === Auth.user.id;
            const isProtectedOwner = staff.role === 'owner' && Auth.profile.role !== 'owner';
            const canEdit = !isSelf && !isProtectedOwner;

            let actionsHtml = '';
            if (canEdit) {
                actionsHtml = `
                    <button class="btn" style="padding:6px 12px; font-size:.75rem;" onclick="window.editStaff('${staff.id}')">
                        <span class="material-icons-round" style="font-size:14px;">edit</span> Edit
                    </button>
                `;
            } else if (isSelf) {
                actionsHtml = `<span style="font-size:.75rem; color:var(--text-muted); font-style:italic;">(You)</span>`;
            } else if (isProtectedOwner) {
                actionsHtml = `<span style="font-size:.75rem; color:var(--text-muted); font-style:italic;">(Protected)</span>`;
            }

            html += `
                <tr>
                    <td>
                        <div style="font-weight:600; color:var(--text-primary); margin-bottom: 2px;">${staff.full_name || '—'}</div>
                        <div style="font-size:.75rem; color:var(--text-muted);">${staff.email || '—'}</div>
                    </td>
                    <td><span class="role-badge">${staff.role}</span></td>
                    <td><span style="font-weight:500;">${staff.location_name || 'System Wide'}</span></td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td style="text-align:right;">
                        ${actionsHtml}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    // Modal Operations
    async function openStaffModal(mode, staffId = null) {
        // Always load locations first so dropdown is built from current state; only then rebuild UI
        await loadLocations();

        // Reset Modal Form
        $('staffId').value = staffId || '';
        $('staffName').value = '';
        $('staffEmail').value = '';
        $('staffPassword').value = '';
        $('staffRole').value = 'store_associate';
        $('staffLocation').value = '';

        if (mode === 'add') {
            $('modalTitle').innerHTML = '<span class="material-icons-round">person_add</span> Add New Staff';
            $('passwordGroup').style.display = 'block';
            $('staffEmail').disabled = false;
            $('btnToggleStatus').style.display = 'none';
        } else {
            $('modalTitle').innerHTML = '<span class="material-icons-round">edit</span> Edit Staff';
            // Password and Auth-Email are frozen for updates right now
            $('passwordGroup').style.display = 'none';
            $('staffEmail').disabled = true;

            const tgt = staffData.find(s => s.id === staffId);
            if (tgt) {
                $('staffName').value = tgt.full_name || '';
                $('staffEmail').value = tgt.email || '';
                $('staffRole').value = tgt.role || 'store_associate';
                $('staffLocation').value = tgt.location_id || '';

                // Show Ban Toggle if eligible
                const isBanned = tgt.banned_until !== null && new Date(tgt.banned_until).getTime() > Date.now();
                const banBtn = $('btnToggleStatus');
                banBtn.style.display = 'block';
                if (isBanned) {
                    banBtn.textContent = 'Restore Access';
                    banBtn.className = 'btn btn--primary';
                } else {
                    banBtn.textContent = 'Disable Access';
                    banBtn.className = 'btn btn--danger';
                }
            }
        }

        updateLocationRequirementUI();
        $('staffModal').classList.add('open');
    }

    function closeStaffModal() {
        $('staffModal').classList.remove('open');
    }

    // Handle the Save Form button
    async function handleSaveStaff() {
        const id = $('staffId').value;
        const name = $('staffName').value.trim();
        const role = $('staffRole').value;
        const loc = $('staffLocation').value || null;

        if (!name) {
            showToast('Full Name is required.', 'error');
            return;
        }

        const isLocRequired = role === 'store_associate';

        if (isLocRequired && !loc) {
            showToast(`A location must be selected for this role.`, 'error');
            return;
        }

        const btn = $('btnSaveStaff');
        const origText = btn.innerHTML;
        btn.innerHTML = 'Saving...';
        btn.disabled = true;

        try {
            if (!id) {
                // CREATE NEW STAFF
                const email = $('staffEmail').value.trim();
                const pass = $('staffPassword').value;

                const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

                if (!emailValid || !pass || pass.length < 6) {
                    showToast('Valid Email and a 6+ char password are required.', 'error');
                    throw new Error('Validation Failed');
                }

                const payload = {
                    p_email: email,
                    p_password: pass,
                    p_full_name: name,
                    p_role: role,
                    p_location_id: loc
                };
                console.log("6. Final RPC payload sent to Supabase via admin_create_staff:", payload);

                const { data, error } = await window.db.rpc('admin_create_staff', payload);

                if (error) {
                    // Check logic for already existing email
                    if (error.message && error.message.includes('already exists')) {
                        showToast('That email is already registered in the system.', 'error');
                    } else {
                        throw error;
                    }
                } else {
                    showToast('Staff created successfully!', 'success');
                    closeStaffModal();
                    await loadStaff();
                    renderTable();
                }

            } else {
                // UPDATE EXISTING STAFF
                const { data, error } = await window.db.rpc('admin_update_staff', {
                    p_user_id: id,
                    p_full_name: name,
                    p_role: role,
                    p_location_id: loc
                });

                if (error) throw error;

                showToast('Staff profile updated!', 'success');
                closeStaffModal();
                await loadStaff();
                renderTable();
            }
        } catch (err) {
            console.error('Save Error:', err);
            if (err.message !== 'Validation Failed') {
                showToast(err.message || 'An error occurred while saving.', 'error');
            }
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    }

    async function handleToggleStatus() {
        const id = $('staffId').value;
        if (!id) return;

        const tgt = staffData.find(s => s.id === id);
        if (!tgt) return;

        const isBanned = tgt.banned_until !== null && new Date(tgt.banned_until).getTime() > Date.now();
        const nextTargetStatus = !isBanned; // If true, we want to ban. If false, unban.
        const actionStr = nextTargetStatus ? 'Disable' : 'Restore';

        if (!confirm(`Are you sure you want to ${actionStr} access for ${tgt.full_name}?`)) return;

        const btn = $('btnToggleStatus');
        btn.disabled = true;

        try {
            const { error } = await window.db.rpc('admin_toggle_staff_status', {
                p_user_id: id,
                p_ban: nextTargetStatus
            });

            if (error) throw error;

            showToast(`Staff access successfully ${nextTargetStatus ? 'disabled' : 'restored'}.`, 'success');
            closeStaffModal();
            await loadStaff();
            renderTable();
        } catch (err) {
            console.error(err);
            showToast(err.message || 'Error occurred while updating status.', 'error');
        } finally {
            btn.disabled = false;
        }
    }

    function setupEventListeners() {
        const btnAdd = $('btnAddStaff');
        if (btnAdd) btnAdd.addEventListener('click', () => openStaffModal('add'));

        const btnCancel = $('btnCancelStaff');
        if (btnCancel) btnCancel.addEventListener('click', closeStaffModal);

        const btnSave = $('btnSaveStaff');
        if (btnSave) btnSave.addEventListener('click', handleSaveStaff);

        const btnToggle = $('btnToggleStatus');
        if (btnToggle) btnToggle.addEventListener('click', handleToggleStatus);

        const roleSelect = $('staffRole');
        if (roleSelect) {
            roleSelect.addEventListener('change', updateLocationRequirementUI);
        }
    }

    function updateLocationRequirementUI() {
        const role = $('staffRole').value;
        const locSelect = $('staffLocation');
        const locGroup = $('staffLocationGroup');

        console.log('[Staff] updateLocationRequirementUI: role=', role, 'locSelect=', locSelect?.id, 'locGroup=', locGroup?.id);

        if (!locSelect || !locGroup) return;

        if (role !== 'store_associate') {
            locGroup.style.display = 'none';
            locSelect.value = '';
            return;
        }

        locGroup.style.display = 'block';

        const currentVal = locSelect.value;
        const label = locGroup.querySelector('label');

        // Store locations only: type === 'store' (or null/undefined for backwards compatibility)
        const storeLocations = (locationsData || []).filter(l =>
            l.type == null || String(l.type).toLowerCase() === 'store'
        );

        console.log('[Staff] updateLocationRequirementUI: raw locationsData length', locationsData?.length ?? 0, 'filtered storeLocations', storeLocations?.length ?? 0, storeLocations);
        console.log('[Staff] updateLocationRequirementUI: selected dropdown element', locSelect, 'options count before rebuild', locSelect.options?.length);

        if (label) label.textContent = 'Assigned Location *';
        const defaultText = '-- Select Store (Required) --';

        let html = `<option value="">${defaultText}</option>`;
        storeLocations.forEach(l => {
            html += `<option value="${l.id}">${l.name}</option>`;
        });

        locSelect.innerHTML = html;
        console.log('[Staff] updateLocationRequirementUI: final option count in dropdown', locSelect.options?.length);

        // Restore user's selection if it remains valid
        if (storeLocations.some(l => l.id === currentVal)) {
            locSelect.value = currentVal;
        } else {
            locSelect.value = '';
        }
    }

    // Expose wrapper for inline HTML buttons
    window.editStaff = function (id) {
        openStaffModal('edit', id);
    };

    function showToast(msg, type = 'info') {
        if (window.Auth && typeof window.Auth.toast === 'function') {
            window.Auth.toast(msg, type);
        } else {
            console.log("Toast:", msg);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
