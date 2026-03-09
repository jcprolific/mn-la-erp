/* ============================================================
   MN+LA ERP – Reset Password Page Logic  (reset-password.js)
   ============================================================
   Supabase sends the user here after they click the reset link
   in their email. The URL will contain either:
     - A hash fragment with  #access_token=...&type=recovery  (older flow)
     - Query params   ?code=...  (PKCE flow, Supabase v2 default)

   We handle both cases, then let the user set a new password.
   ============================================================ */

(function () {
    'use strict';

    /* ---------- Element refs ---------- */
    const form = document.getElementById('resetForm');
    const newPwInput = document.getElementById('newPassword');
    const confInput = document.getElementById('confirmPassword');
    const submitBtn = document.getElementById('resetSubmit');
    const alertBox = document.getElementById('alertBox');
    const alertText = document.getElementById('alertText');
    const alertIcon = document.getElementById('alertIcon');
    const cardTitle = document.getElementById('cardTitle');
    const cardSub = document.getElementById('cardSubtitle');

    /* ---------- Alert helper ---------- */
    function showAlert(msg, type = 'error') {
        alertText.textContent = msg;
        alertBox.style.display = 'flex';
        alertBox.classList.toggle('login-error--success', type === 'success');
        alertIcon.textContent = type === 'success' ? 'check_circle_outline' : 'error_outline';
    }
    function clearAlert() {
        alertBox.style.display = 'none';
    }

    /* ---------- Loading state ---------- */
    function setLoading(loading) {
        submitBtn.disabled = loading;
        submitBtn.textContent = loading ? 'Saving…' : 'Save Password';
    }

    /* ---------- Validate the recovery session ----------
       Supabase v2 with PKCE delivers a `code` query param.
       We exchange it for a session so the user is authenticated
       before calling updateUser(). The onAuthStateChange listener
       will fire with event = 'PASSWORD_RECOVERY' which also works.
    ---------------------------------------------------- */
    async function bootstrap() {
        // Wait for window.db (supabase-client.js runs first but is async-ish)
        if (typeof window.db === 'undefined') {
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        // --- PKCE flow (Supabase v2 default) ---
        if (code) {
            try {
                const { error } = await window.db.auth.exchangeCodeForSession(code);
                if (error) {
                    showError('Your password reset link is invalid or has expired. Please request a new one.');
                }
            } catch (e) {
                showError('Failed to validate your reset link. Please try again.');
            }
            return; // form is ready to submit
        }

        // --- Implicit / hash flow fallback ---
        const hash = window.location.hash;
        const type = new URLSearchParams(hash.slice(1)).get('type');
        if (type === 'recovery') {
            // Supabase SDK auto-parses the hash and restores the session
            // Give it a moment, then verify
            await new Promise(r => setTimeout(r, 400));
            const { data: { session } } = await window.db.auth.getSession();
            if (!session) {
                showError('Your password reset link is invalid or has expired. Please request a new one.');
            }
            return;
        }

        // No token at all — user landed here directly
        showError('No reset token found. Please use the link from your reset email.');
    }

    function showError(msg) {
        cardTitle.textContent = 'Link Expired';
        cardSub.textContent = 'Please go back and request a new reset email.';
        form.style.display = 'none';
        showAlert(msg, 'error');
    }

    /* ---------- Form submit ---------- */
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAlert();

        const newPw = newPwInput.value;
        const confPw = confInput.value;

        if (!newPw || !confPw) {
            showAlert('Please fill in both password fields.');
            return;
        }
        if (newPw.length < 8) {
            showAlert('Password must be at least 8 characters.');
            return;
        }
        if (newPw !== confPw) {
            showAlert('Passwords do not match.');
            return;
        }

        setLoading(true);

        try {
            const { error } = await window.db.auth.updateUser({ password: newPw });

            if (error) {
                showAlert(error.message || 'Failed to update password. Please try again.');
                setLoading(false);
                return;
            }

            // Success
            showAlert('Password updated! Redirecting you to sign in…', 'success');
            submitBtn.disabled = true;

            setTimeout(() => {
                window.location.replace('login.html');
            }, 2000);

        } catch (err) {
            console.error('[ResetPassword] Unexpected error:', err);
            showAlert('An unexpected error occurred. Please try again.');
            setLoading(false);
        }
    });

    /* ---------- Kick off ---------- */
    bootstrap();

})();
