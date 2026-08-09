/* SmartPlate Google Analytics 4 bootstrap. Do not send personal or health data. */
(function (window, document) {
    'use strict';

    var measurementId = 'G-L6V1GTCEHS';
    if (window.__smartPlateGoogleAnalyticsLoaded) return;
    window.__smartPlateGoogleAnalyticsLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
        window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
        allow_google_signals: false
    });

    window.SmartPlateGoogleAnalytics = {
        event: function (eventName) {
            if (typeof eventName !== 'string' || !/^[a-z_]+$/.test(eventName)) return;
            window.gtag('event', eventName);
        }
    };

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.appendChild(script);
}(window, document));
