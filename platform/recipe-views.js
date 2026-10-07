/* One event per visible, successfully rendered recipe page. Analytics failures
   must never interrupt the recipe. Account identity is resolved by the API. */
(function (window, document) {
    'use strict';
    var started = false;
    var storageKey = 'sp_recipe_visitor_v1';
    var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    function uuid() {
        if (window.crypto.randomUUID) return window.crypto.randomUUID();
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        var hex = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
    }

    window.SmartPlateRecipeViews = {
        track: function (recipe, mode) {
            if (started || !recipe || recipe.isSublist || !['full', 'preview'].includes(mode)) return;
            var user = Auth.getUser();
            if (user && user.role === 'admin') return;
            started = true;
            function send() {
                if (document.visibilityState !== 'visible') return;
                document.removeEventListener('visibilitychange', send);
                try {
                    var body = { recipe_id: recipe.id, view_mode: mode, event_id: uuid() };
                    if (!Auth.getToken()) {
                        // Without persistent storage, skip guest counting: a new
                        // identity on every reload would inflate unique visitors.
                        var visitor = window.localStorage.getItem(storageKey);
                        if (!uuidPattern.test(visitor || '')) {
                            visitor = uuid();
                            window.localStorage.setItem(storageKey, visitor);
                        }
                        body.visitor_id = visitor;
                    }
                    Auth.api('/content/recipe-views', { method: 'POST', body: body }).catch(function () {});
                } catch (_) { /* Storage/crypto can be unavailable. */ }
            }
            if (document.visibilityState === 'visible') send();
            else document.addEventListener('visibilitychange', send);
        }
    };
}(window, document));
