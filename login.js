/* ============================================================
   MN+LA ERP – Login Page Logic  (login.js)
   ============================================================ */

(function () {
    'use strict';

    /* ---------- Element refs ---------- */
    const form = document.getElementById('loginForm');
    const emailInput = document.getElementById('loginEmail');
    const passInput = document.getElementById('loginPassword');
    const submitBtn = document.getElementById('loginSubmit');
    const errorBox = document.getElementById('loginError');      // outer wrapper
    const errorText = document.getElementById('loginErrorText'); // inner text span
    const forgotLink = document.getElementById('forgotPassword');

    /* ---------- Helpers ---------- */
    function setError(msg, success = false) {
        errorText.textContent = msg;
        errorBox.style.display = msg ? 'flex' : 'none';
        errorBox.classList.toggle('login-error--success', success);
        var fixWrap = document.getElementById('loginFixStepsWrap');
        if (fixWrap) fixWrap.style.display = msg ? 'block' : 'none';
    }

    function setLoading(loading) {
        submitBtn.disabled = loading;
        submitBtn.textContent = loading ? 'Signing in…' : 'Sign In';
    }

    /* Map Supabase error messages to user-friendly text */
    function friendlyError(message) {
        const m = (message || '').toLowerCase();
        if (m.includes('invalid login') || m.includes('invalid credentials'))
            return 'Incorrect email or password. Please try again.';
        if (m.includes('email not confirmed'))
            return 'Your email address hasn\'t been confirmed yet.';
        if (m.includes('too many requests'))
            return 'Too many attempts. Please wait a moment and try again.';
        if (m.includes('row-level security') || m.includes('policy') || m.includes('permission denied') || m.includes('rls'))
            return 'Profile read blocked. In Supabase: Table Editor → profiles → RLS. Add policy: allow SELECT where id = auth.uid().';
        if (m.includes('querying schema') || m.includes('database error') || m.includes('relation') || m.includes('does not exist'))
            return 'Sign-in hit a database error. Run the Fix Login SQL in Supabase. Raw error: ' + (message || 'unknown');
        return message || 'Something went wrong. Please try again.';
    }

    /* ---------- Sign In ---------- */
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setError('');

        const email = emailInput.value.trim();
        const password = passInput.value;

        if (!email || !password) {
            setError('Please enter your email and password.');
            return;
        }

        setLoading(true);

        try {
            const { data, error } = await window.db.auth.signInWithPassword({ email, password });

            if (error) {
                console.error('[Login] Auth error:', error.message, error);
                var msg = friendlyError(error.message);
                setError(msg);
                setLoading(false);
                return;
            }

            /* Success – fetch profile via RPC only */
            var rpcRes = await window.db.rpc('get_my_profile');
            if (rpcRes.error) {
                console.error('[Login] get_my_profile RPC error:', rpcRes.error.message, rpcRes.error);
                setError('Could not load profile. Run the Fix Login SQL in Supabase (get_my_profile + profiles table). See browser console for details.');
                setLoading(false);
                return;
            }
            var profile = (rpcRes.data && typeof rpcRes.data === 'object' && rpcRes.data.role != null) ? rpcRes.data : null;

            if (!profile) {
                setError('No profile found for this user. In Supabase: run FIX_LOGIN_PROFILES_RUN_IN_SUPABASE.sql to add your user to the profiles table.');
                setLoading(false);
                return;
            }
            if (profile.location_id && !profile.locations) {
                var locRes = await window.db.from('locations').select('name').eq('id', profile.location_id).maybeSingle();
                if (locRes.data && locRes.data.name) profile.locations = { name: locRes.data.name };
            }

            /* Save to localStorage so Auth module picks it up */
            localStorage.setItem('mnla_profile', JSON.stringify(profile));

            /* Smoke-test welcome toast — shown after redirect loads */
            sessionStorage.setItem('mnla_welcome', JSON.stringify({
                full_name: profile.full_name,
                role: profile.role,
            }));

            /* Role-based redirect */
            window.Auth.roleRedirect(profile.role);

        } catch (err) {
            console.error('[Login] Unexpected error:', err);
            setError('An unexpected error occurred. Please try again.');
            setLoading(false);
        }
    });

    /* ---------- Forgot Password ---------- */
    forgotLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();

        if (!email) {
            setError('Enter your email address above, then click "Forgot password?".');
            return;
        }

        forgotLink.textContent = 'Sending…';
        forgotLink.style.pointerEvents = 'none';

        const { error } = await window.db.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password.html',
        });

        forgotLink.textContent = 'Forgot password?';
        forgotLink.style.pointerEvents = '';

        if (error) {
            setError('Could not send reset email: ' + error.message);
        } else {
            setError('Password reset email sent! Check your inbox.', true);
        }
    });

    /* ---------- Demo Login ---------- */
    const demoBtn = document.getElementById('demoLogin');
    demoBtn.addEventListener('click', () => {
        // Mark demo session
        localStorage.setItem('mnla_demo', 'true');

        // Fake profile for the demo user
        const demoProfile = {
            full_name: 'Demo User',
            role: 'owner',
            location_id: null,
        };
        localStorage.setItem('mnla_profile', JSON.stringify(demoProfile));

        // Set a welcome message
        sessionStorage.setItem('mnla_welcome', JSON.stringify({
            full_name: 'Demo User',
            role: 'Demo Mode',
        }));

        window.location.replace('index.html');
    });

    /* ---------- If already signed in, skip login ---------- */
    (async () => {
        const { data: { session } } = await window.db.auth.getSession();
        if (session) {
            const cached = localStorage.getItem('mnla_profile');
            const profile = cached ? JSON.parse(cached) : null;
            window.Auth.roleRedirect(profile?.role || 'admin');
        }
    })();

})();
