/* SmartPlate Yandex Metrica bootstrap. Do not send personal or health data. */
(function (window, document) {
    'use strict';

    var counterId = 111434385;
    if (window.__smartPlateMetrikaLoaded) return;
    window.__smartPlateMetrikaLoaded = true;

    window.ym = window.ym || function () {
        (window.ym.a = window.ym.a || []).push(arguments);
    };
    window.ym.l = window.ym.l || (new Date()).getTime();
    function getClientId(timeoutMs) {
        return new Promise(function (resolve) {
            var settled = false;
            var timeout = setTimeout(function () {
                if (!settled) { settled = true; resolve(null); }
            }, typeof timeoutMs === 'number' ? timeoutMs : 1500);
            try {
                window.ym(counterId, 'getClientID', function (clientId) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    resolve(typeof clientId === 'string' ? clientId : null);
                });
            } catch (e) {
                clearTimeout(timeout);
                if (!settled) { settled = true; resolve(null); }
            }
        });
    }

    window.SmartPlateMetrika = {
        goal: function (goalId) {
            if (typeof goalId !== 'string' || !/^[a-z_]+$/.test(goalId)) return;
            window.ym(counterId, 'reachGoal', goalId);
        },
        getClientId: getClientId
    };
    window.ym(counterId, 'init', {
        accurateTrackBounce: true,
        clickmap: true,
        trackLinks: true,
        webvisor: true
    });

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    document.head.appendChild(script);
}(window, document));
