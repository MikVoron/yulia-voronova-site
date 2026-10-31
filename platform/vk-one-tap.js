(function () {
    'use strict';
    var group = document.getElementById('lp-oauth');
    var container = document.getElementById('lp-vk-one-tap');
    var fallback = document.querySelector('[data-oauth-provider="vk"]');
    var client = window.SmartPlateOAuth;
    if (!group || !container || !fallback || !client || window._isAdminLogin === true) return;
    var widget;
    var refreshTimer;
    var started = false;

    function rememberLogin() {
        if (!started) { started = true; client.rememberLogin('vk'); }
    }

    function restoreButton() {
        clearTimeout(refreshTimer);
        if (widget) { widget.close(); widget = null; }
        container.replaceChildren();
        container.hidden = true;
        fallback.hidden = false;
        group.removeAttribute('data-onetap-active');
    }

    function loadSdk() {
        if (window.VKIDSDK) return Promise.resolve(window.VKIDSDK);
        return new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            var timer = setTimeout(function () { reject(new Error('VK SDK timeout')); }, 4000);
            script.src = 'vendor/vkid/sdk-2.6.1.js';
            script.async = true;
            script.onload = function () {
                clearTimeout(timer);
                if (window.VKIDSDK) resolve(window.VKIDSDK);
                else reject(new Error('VK SDK unavailable'));
            };
            script.onerror = function () { clearTimeout(timer); reject(new Error('VK SDK unavailable')); };
            document.head.appendChild(script);
        });
    }

    function prepare(VKID) {
        return client.fingerprint().then(function (fingerprint) {
            var controller = new AbortController();
            var timer = setTimeout(function () { controller.abort(); }, 4000);
            var url = API_BASE + '/auth/oauth/vk/config';
            if (fingerprint) url += '?fingerprint=' + encodeURIComponent(fingerprint);
            return fetch(url, { credentials: 'include', cache: 'no-store', signal: controller.signal })
                .then(function (response) { if (!response.ok) throw new Error('VK config unavailable'); return response.json(); })
                .finally(function () { clearTimeout(timer); });
        }).then(function (config) {
            if (!Number.isSafeInteger(config.appId) || config.appId <= 0
                || config.redirectUrl !== API_BASE + '/auth/oauth/vk/callback'
                || !/^[a-f0-9]{48}$/.test(config.state) || !/^[A-Za-z0-9_-]{43}$/.test(config.codeChallenge)) {
                throw new Error('Invalid VK configuration');
            }
            restoreButton();
            started = false;
            VKID.Config.init({
                app: config.appId,
                redirectUrl: config.redirectUrl,
                responseMode: VKID.ConfigResponseMode.Callback,
                mode: VKID.ConfigAuthMode.InNewTab,
                state: config.state,
                codeChallenge: config.codeChallenge,
                scope: 'email'
            });
            widget = new VKID.OneTap();
            widget.on(VKID.WidgetEvents.ERROR, restoreButton);
            widget.on(VKID.WidgetEvents.LOAD, function () {
                container.hidden = false;
                fallback.hidden = true;
                group.setAttribute('data-onetap-active', 'true');
            });
            widget.on(VKID.OneTapInternalEvents.START_AUTHORIZE, rememberLogin);
            widget.on(VKID.OneTapInternalEvents.LOGIN_SUCCESS, function (payload) {
                if (!payload || payload.state !== config.state || typeof payload.code !== 'string' || !payload.code
                    || typeof payload.device_id !== 'string' || !payload.device_id) { restoreButton(); return; }
                rememberLogin();
                var target = new URL(config.redirectUrl);
                target.searchParams.set('code', payload.code);
                target.searchParams.set('device_id', payload.device_id);
                target.searchParams.set('state', payload.state);
                // The same server callback exchanges the code and resolves the account.
                // Provider access and refresh tokens never enter this page.
                location.assign(target.toString());
            });
            // The SDK measures text and decides whether to show provider icons
            // while rendering. Give its local fallback a real width immediately,
            // including when the visitor has no active VK session.
            container.hidden = false;
            fallback.hidden = true;
            group.setAttribute('data-onetap-active', 'true');
            widget.render({ container: container, showAlternativeLogin: true, oauthList: ['mail_ru', 'ok_ru'], styles: { height: 46, borderRadius: 12 } });
            refreshTimer = setTimeout(function () { prepare(VKID).catch(restoreButton); }, 9 * 60000);
        });
    }

    loadSdk().then(prepare).catch(restoreButton);
})();
