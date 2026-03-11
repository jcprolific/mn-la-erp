/* ============================================================
   MN+LA ERP – Auth Module  (auth.js)
   ============================================================
   Exposes window.Auth with:
     .session  – raw Supabase session (or null)
     .profile  – { role, full_name, location_id } (or null)
     .init()   – call on every protected page to load session & profile
     .guard()  – redirect to login.html if no session
     .logout() – sign out + redirect to login.html
   ============================================================ */

(function () {
    'use strict';

    /* ----------------------------------------------------------
       Demo mode key
    ---------------------------------------------------------- */
    const DEMO_KEY = 'mnla_demo';

    function _isDemo() {
        return localStorage.getItem(DEMO_KEY) === 'true';
    }

    /* ----------------------------------------------------------
       Role → destination page map
       All roles land on index.html for now; easy to expand later.
    ---------------------------------------------------------- */
    /* Accepted roles: owner, admin, store_associate, warehouse_staff, warehouse, accountant */
    const ROLE_ROUTES = {
        owner: 'index.html',
        admin: 'index.html',
        store_associate: 'store.html',
        warehouse_staff: 'warehouse.html',
        warehouse: 'warehouse.html',
        accountant: 'index.html',
    };
    const DEFAULT_ROUTE = 'index.html';
    const LOGIN_PAGE = 'login.html';

    /* ----------------------------------------------------------
       Internal helpers
    ---------------------------------------------------------- */
    function isOnLoginPage() {
        return window.location.pathname.endsWith('login.html');
    }

    function redirectTo(page) {
        window.location.replace(page);
    }

    /* ----------------------------------------------------------
       Fetch the user's profile row from Supabase
    ---------------------------------------------------------- */
    async function fetchProfile(userId) {
        if (!window.db) {
            console.error('[Auth] window.db not available – load supabase-client.js first');
            return null;
        }
        var rpcRes = await window.db.rpc('get_my_profile');
        var data = (rpcRes.data && typeof rpcRes.data === 'object' && rpcRes.data.role != null) ? rpcRes.data : null;
        if (data && data.location_id) {
            var locRes = await window.db.from('locations').select('name').eq('id', data.location_id).maybeSingle();
            if (locRes.data && locRes.data.name) data.locations = { name: locRes.data.name };
        }
        return data;
    }

    /* ----------------------------------------------------------
       Public Auth object
    ---------------------------------------------------------- */
    const Auth = {
        session: null,
        profile: null,

        /* ---- init -----------------------------------------------
           Call at the top of EVERY protected page.
           Loads session + profile, then sets up onAuthStateChange.
        ---------------------------------------------------------- */
        async init() {
            if (!window.db) {
                console.error('[Auth] window.db not ready');
                return;
            }

            // Restore session from storage
            const { data: { session } } = await window.db.auth.getSession();
            Auth.session = session;

            if (session) {
                // Load profile if not cached yet
                const cached = _loadCachedProfile();
                Auth.profile = cached || await fetchProfile(session.user.id);
                _saveProfile(Auth.profile);
                _renderUserChip();
            }

            // Keep session in sync with Supabase (token refresh, sign-out events)
            window.db.auth.onAuthStateChange(async (event, newSession) => {
                if (_isDemo()) return; // demo sessions are not managed by Supabase
                Auth.session = newSession;
                if (event === 'SIGNED_OUT') {
                    _clearProfile();
                    Auth.profile = null;
                    if (!isOnLoginPage()) redirectTo(LOGIN_PAGE);
                }
                if (event === 'SIGNED_IN' && newSession) {
                    Auth.profile = await fetchProfile(newSession.user.id);
                    _saveProfile(Auth.profile);
                    _renderUserChip();
                }
            });
        },

        /* ---- guard ----------------------------------------------
           Call on protected pages. Redirects to login if no session.
           Demo mode bypasses the real session check.
        ---------------------------------------------------------- */
        async guard() {
            if (_isDemo()) {
                // Restore demo profile if not already set
                if (!Auth.profile) {
                    Auth.profile = _loadCachedProfile();
                }
                Auth.isDemoMode = true;
                return; // allow through
            }
            await this.init();
            if (!Auth.session) {
                redirectTo(LOGIN_PAGE);
            }
        },

        isDemoMode: false,

        /* ---- roleRedirect ---------------------------------------
           Role-based navigation after successful sign-in.
        ---------------------------------------------------------- */
        roleRedirect(role) {
            const dest = ROLE_ROUTES[role] || DEFAULT_ROUTE;
            redirectTo(dest);
        },

        /* ---- logout ---------------------------------------------
           Signs out the user and redirects to login page.
        ---------------------------------------------------------- */
        async logout() {
            if (_isDemo()) {
                localStorage.removeItem(DEMO_KEY);
                _clearProfile();
                redirectTo(LOGIN_PAGE);
                return;
            }
            try {
                if (window.db && window.db.auth && typeof window.db.auth.signOut === 'function') {
                    await window.db.auth.signOut();
                }
            } catch (err) {
                console.warn('[Auth] signOut error (continuing):', err);
            }
            _clearProfile();
            redirectTo(LOGIN_PAGE);
        },
    };

    /* ----------------------------------------------------------
       Profile local cache  (survives page navigations)
    ---------------------------------------------------------- */
    const PROFILE_KEY = 'mnla_profile';

    function _saveProfile(profile) {
        if (profile) {
            localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
        }
    }
    function _loadCachedProfile() {
        try {
            const raw = localStorage.getItem(PROFILE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }
    function _clearProfile() {
        localStorage.removeItem(PROFILE_KEY);
        try { sessionStorage.removeItem('mnla_welcome'); } catch (_) {}
    }

    /* ----------------------------------------------------------
       User chip renderer  – injects user info into the nav header
       Works on any page that has #userChip element.
    ---------------------------------------------------------- */
    function _renderUserChip() {
        const chip = document.getElementById('userChip');
        if (!chip || !Auth.profile) return;
        const { full_name, role, locations } = Auth.profile;
        const locationName = locations?.name || '';
        const displayRole = (role || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        const label = locationName ? displayRole + ' · ' + locationName : displayRole;
        chip.innerHTML = `
      <span class="user-chip__name">${full_name || 'User'}</span>
      <span class="user-chip__role">${label}</span>
    `;
        chip.style.display = 'flex';
    }

    /* ----------------------------------------------------------
       Toast utility  – usable from any page
       Usage: window.Auth.toast('Hello!', 'success' | 'error' | 'info')
    ---------------------------------------------------------- */
    Auth.toast = function (message, type = 'success') {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            document.body.appendChild(container);
        }
        const t = document.createElement('div');
        t.className = `toast toast--${type}`;
        t.textContent = message;
        container.appendChild(t);

        // Trigger animation
        requestAnimationFrame(() => t.classList.add('toast--visible'));

        setTimeout(() => {
            t.classList.remove('toast--visible');
            t.addEventListener('transitionend', () => t.remove());
        }, 4000);
    };

    window.Auth = Auth;

})();
