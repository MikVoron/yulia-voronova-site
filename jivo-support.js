(function (window, document) {
    'use strict';
    if (window.__jivoSupportInitialized) return;
    window.__jivoSupportInitialized = true;

    var embedded = document.documentElement.hasAttribute('data-support-embed');
    var pending = false;
    var script = null;
    var timer = null;
    var unread = 0;
    var lastTrigger = null;
    var parentOrigin = null;
    if (embedded && document.referrer) {
        try {
            var origin = new URL(document.referrer).origin;
            if (origin === 'https://plate.voronova.online' || origin === window.location.origin) parentOrigin = origin;
        } catch (error) { /* A standalone chat has no parent. */ }
    }

    function notify(type) {
        if (parentOrigin && window.parent !== window) window.parent.postMessage({ type: type }, parentOrigin);
    }
    function badge(count) {
        unread = count;
        ['chatBadge', 'supportBadge'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.textContent = count > 9 ? '9+' : String(count);
            el.classList.toggle('visible', count > 0);
        });
    }
    function clearTimer() {
        if (timer) window.clearTimeout(timer);
        timer = null;
    }
    function status(show) {
        var el = document.getElementById('jivo-support-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'jivo-support-status';
            el.className = 'jivo-support-status';
            el.setAttribute('role', 'status');
            document.body.appendChild(el);
        }
        el.innerHTML = (show === 'loading' ? 'Загружаем чат… ' : 'Не удалось загрузить чат. ') + '<a href="mailto:hello@voronova.online">Напишите нам на email</a>.';
        el.hidden = !show;
    }
    function openReady() {
        document.documentElement.classList.add('jivo-support-open');
        var result = window.jivo_api.open();
        if (result && result.result === 'fail') {
            document.documentElement.classList.remove('jivo-support-open');
            status(true);
            notify('jivo-support-error');
            return;
        }
        pending = false;
        clearTimer();
        status(false);
        document.documentElement.classList.add('jivo-support-open');
        badge(0);
        notify('jivo-support-ready');
    }
    window.jivo_onLoadCallback = function () {
        if (pending) openReady();
    };
    window.jivo_onOpen = function () {
        pending = false;
        clearTimer();
        status(false);
        document.documentElement.classList.add('jivo-support-open');
        badge(0);
        notify('jivo-support-ready');
    };
    window.jivo_onClose = function () {
        document.documentElement.classList.remove('jivo-support-open');
        notify('jivo-support-close');
        if (lastTrigger) lastTrigger.focus();
    };
    window.jivo_onMessageReceived = function () {
        if (!document.documentElement.classList.contains('jivo-support-open')) badge(unread + 1);
    };
    window.openJivo = function (event, trigger) {
        if (event) event.preventDefault();
        lastTrigger = trigger || (event && event.currentTarget) || null;
        pending = true;
        status('loading');
        if (window.jivo_api && typeof window.jivo_api.open === 'function') {
            openReady();
            return false;
        }
        if (!timer) timer = window.setTimeout(function () {
            timer = null;
            status(true);
            notify('jivo-support-error');
        }, 12000);
        if (!script) {
            script = document.createElement('script');
            script.src = 'https://code.jivosite.com/widget/dQilQUP0Lq';
            script.async = true;
            script.onerror = function () {
                clearTimer();
                script.remove();
                script = null;
                status(true);
                notify('jivo-support-error');
            };
            document.head.appendChild(script);
        }
        return false;
    };
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && window.jivo_api) window.jivo_api.close();
    });
    if (embedded) window.openJivo();
})(window, document);
