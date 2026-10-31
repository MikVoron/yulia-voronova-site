(function () {
    'use strict';
    var storageKey = 'smartplate.oauth.pending.v1';
    var providers = ['vk', 'yandex'];

    function safeReturn(value) {
        if (typeof value !== 'string' || !value || value.length > 2048
            || /[\x00-\x20\x7f\\]/.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)
            || value.indexOf('//') === 0) return null;
        try {
            var target = new URL(value, location.origin + '/');
            return target.origin === location.origin ? target.pathname + target.search + target.hash : null;
        } catch (error) { return null; }
    }

    function consumePending() {
        try {
            var raw = sessionStorage.getItem(storageKey);
            sessionStorage.removeItem(storageKey);
            var pending = JSON.parse(raw);
            if (!pending || providers.indexOf(pending.provider) < 0 || !Number.isFinite(pending.startedAt)
                || pending.startedAt > Date.now() + 60000 || Date.now() - pending.startedAt > 10 * 60000) return null;
            pending.returnUrl = safeReturn(pending.returnUrl) || '/index.html';
            return pending;
        } catch (error) { return null; }
    }

    function goal(name) {
        try { if (window.SmartPlateMetrika) window.SmartPlateMetrika.goal(name); } catch (error) { }
    }

    function rememberLogin(provider) {
        if (providers.indexOf(provider) < 0) return;
        var target = safeReturn(new URLSearchParams(location.search).get('return')) || '/index.html';
        try {
            sessionStorage.setItem(storageKey, JSON.stringify({ provider: provider, returnUrl: target, startedAt: Date.now() }));
        } catch (error) { }
        goal('oauth_' + provider + '_started');
    }

    window.SmartPlateOAuth = { safeReturn: safeReturn, consumePending: consumePending, goal: goal, rememberLogin: rememberLogin, fingerprint: fingerprint };
    var group = document.getElementById('lp-oauth');
    var slot = document.getElementById('lp-oauth-slot');
    var loading = document.getElementById('lp-oauth-loading');
    function reveal() {
        group.classList.remove('is-preparing');
        if (loading) loading.hidden = true;
    }
    if (!group || window._isAdminLogin === true || typeof API_BASE !== 'string') {
        if (slot) slot.hidden = true;
        return;
    }
    if (new URLSearchParams(location.search).get('error') === 'oauth_email_required' && typeof window.showError === 'function') {
        window.showError('email-error', 'Сервис не передал вашу почту. Введите email ниже и войдите по коду — так вы попадёте в свой аккаунт.');
    }
    var buttons = Array.from(group.querySelectorAll('[data-oauth-provider]'));
    var navigating = false;

    function fingerprint() {
        // Reuse the same signal as the existing email-code flow.
        return new Promise(function (resolve) {
            var attempts = 0;
            function check() {
                var value = window._fingerprint;
                if (typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)) return resolve(value);
                if (++attempts >= 10) return resolve(null);
                setTimeout(check, 50);
            }
            check();
        });
    }

    buttons.forEach(function (button) {
        button.addEventListener('click', function () {
            if (navigating || button.hidden || button.disabled) return;
            var provider = button.getAttribute('data-oauth-provider');
            if (providers.indexOf(provider) < 0) return;
            navigating = true;
            buttons.forEach(function (item) { item.disabled = true; });
            rememberLogin(provider);
            fingerprint().then(function (value) {
                var url = API_BASE + '/auth/oauth/' + provider;
                if (value) url += '?fingerprint=' + encodeURIComponent(value);
                location.assign(url);
            });
        });
    });

    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 4000);
    fetch(API_BASE + '/auth/oauth/providers', { credentials: 'include', cache: 'no-store', signal: controller.signal })
        .then(function (response) { if (!response.ok) throw new Error('providers unavailable'); return response.json(); })
        .then(function (ready) {
            var visible = 0;
            buttons.forEach(function (button) {
                button.hidden = !ready || ready[button.getAttribute('data-oauth-provider')] !== true;
                if (!button.hidden) visible++;
            });
            group.hidden = visible === 0;
            if (slot) slot.hidden = visible === 0;
            if (ready && ready.vk === true && ready.vkOneTap === true) {
                group.classList.add('is-preparing');
                var widgetScript = document.createElement('script');
                widgetScript.src = 'vk-one-tap.js?v=20261031-stable-layout';
                widgetScript.async = true;
                widgetScript.onerror = reveal;
                document.head.appendChild(widgetScript);
                // A stalled optional script must not hide the ordinary buttons.
                setTimeout(reveal, 4500);
            } else reveal();
        })
        .catch(function () { group.hidden = true; if (slot) slot.hidden = true; })
        .finally(function () { clearTimeout(timeout); });
})();
