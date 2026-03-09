/**
 * MN+LA ERP — Session & Permissions Helper
 *
 * Depends on: auth.js (window.Auth, Auth.profile)
 *
 * Exposes:
 *   window.Session  — user id, role, location_id, full_name, location_name
 *   window.Permissions — visibility (can view location?) and write (can perform actions at location?)
 *
 * For store_associate:
 *   Visibility: all locations (read-only for non-assigned).
 *   Write: only assigned location_id.
 */

(function () {
    'use strict';

    const Session = {
        /** Current user UUID or null */
        userId() {
            const p = window.Auth && window.Auth.profile;
            const uid = window.Auth && window.Auth.session && window.Auth.session.user && window.Auth.session.user.id;
            return uid || (p && p.id) || null;
        },

        /** role string: owner | admin | warehouse_staff | store_associate | accountant | viewer */
        role() {
            const p = window.Auth && window.Auth.profile;
            return (p && p.role) || null;
        },

        /** Assigned branch/location UUID; null for non-branch roles (e.g. owner, accountant) */
        locationId() {
            const p = window.Auth && window.Auth.profile;
            return (p && p.location_id) || null;
        },

        /** User's full name */
        fullName() {
            const p = window.Auth && window.Auth.profile;
            return (p && p.full_name) || (window.Auth && window.Auth.session && window.Auth.session.user && window.Auth.session.user.email) || '';
        },

        /** Assigned location display name (from profile.locations.name) */
        locationName() {
            const p = window.Auth && window.Auth.profile;
            const loc = p && p.locations;
            return (loc && loc.name) || '';
        },

        /** Raw profile object (role, full_name, location_id, locations) */
        profile() {
            return (window.Auth && window.Auth.profile) || null;
        }
    };

    /**
     * Visibility = can the user SEE data for this location?
     * - store_associate: all locations (warehouse + all branches).
     * - warehouse_staff, owner, admin, accountant, viewer: all locations.
     */
    function canViewLocation(/* locationId - optional, for future per-location rules */) {
        const role = Session.role();
        if (!role) return false;
        return ['owner', 'admin', 'warehouse_staff', 'store_associate', 'accountant', 'viewer'].includes(role);
    }

    /**
     * Write = can the user perform inventory (or other) ACTIONS for this location?
     * - store_associate: only their assigned location_id.
     * - warehouse_staff: typically warehouse + possibly transfers (handled elsewhere).
     * - owner, admin: all locations.
     * - accountant, viewer: no write (or restrict in backend).
     */
    function canWriteLocation(locationId) {
        const role = Session.role();
        if (!role) return false;
        if (['owner', 'admin'].includes(role)) return true;
        if (role === 'warehouse_staff') {
            // Warehouse staff write to warehouse; exact rules can be refined (e.g. by location type)
            return true;
        }
        if (role === 'store_associate') {
            const assigned = Session.locationId();
            if (!assigned) return false;
            return String(assigned) === String(locationId);
        }
        if (['accountant', 'viewer'].includes(role)) return false;
        return false;
    }

    const Permissions = {
        /** Can user view inventory/data for all locations? (read-only for non-assigned when store_associate) */
        canViewAllLocations: canViewLocation,

        /** Can user perform inventory (or other) actions for the given location_id? */
        canWriteLocation,

        /** Is current user a store associate (has assigned branch, write only there)? */
        isStoreAssociate() {
            return Session.role() === 'store_associate';
        },

        /** Is current user warehouse staff? */
        isWarehouseStaff() {
            return Session.role() === 'warehouse_staff';
        },

        /** Is current user owner or admin (full access)? */
        isOwnerOrAdmin() {
            const r = Session.role();
            return r === 'owner' || r === 'admin';
        }
    };

    window.Session = Session;
    window.Permissions = Permissions;
})();
