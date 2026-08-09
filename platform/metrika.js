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
