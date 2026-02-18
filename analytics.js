window.addEventListener('load', function () {
	// Google Analytics
	var ga = document.createElement('script');
	ga.src = 'https://www.googletagmanager.com/gtag/js?id=G-4KF0TQR0VD';
	ga.async = true;
	document.head.appendChild(ga);
	ga.onload = function () {
		window.dataLayer = window.dataLayer || [];
		function gtag() { dataLayer.push(arguments); }
		gtag('js', new Date());
		gtag('config', 'G-4KF0TQR0VD');
	};

	// Yandex.Metrika
	(function (m, e, t, r, i, k, a) {
		m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments) };
		m[i].l = 1 * new Date();
		k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a)
	})(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=106615581', 'ym');
	ym(106615581, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true });
});
