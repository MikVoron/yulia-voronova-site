// tawk.to — скрываем стандартную кнопку, открываем через свой виджет
var Tawk_API = Tawk_API || {};
Tawk_LoadStart = new Date();

// Уровень 1: CSS — скрываем контейнер кнопки tawk.to ДО его отрисовки
(function () {
	var s = document.createElement('style');
	s.id = 'tawk-flash-prevent';
	s.textContent = '.tawk-min-container, [id^="tawk-bubble"], .tawk-bubble { opacity: 0 !important; pointer-events: none !important; transition: none !important; }';
	document.head.appendChild(s);
})();

// Уровень 2: onBeforeLoad — hideWidget() до первого рендера
Tawk_API.onBeforeLoad = function () {
	Tawk_API.hideWidget();
};

// Уровень 3: onLoad — финальный hideWidget() + убираем временный CSS
Tawk_API.onLoad = function () {
	Tawk_API.hideWidget();
	var s = document.getElementById('tawk-flash-prevent');
	if (s) s.parentNode.removeChild(s);
};

// После закрытия/сворачивания чата — снова скрываем стандартный виджет
Tawk_API.onChatMinimized = function () {
	Tawk_API.hideWidget();
};

// Показываем бейдж на главной кнопке И на кнопке «Оператор»
Tawk_API.onUnreadCountChanged = function (count) {
	var label = count > 9 ? '9+' : count;
	var badge = document.getElementById('chatBadge');
	var tawkBadge = document.getElementById('tawkBadge');
	if (count > 0) {
		if (badge) { badge.textContent = label; badge.classList.add('visible'); }
		if (tawkBadge) { tawkBadge.textContent = label; tawkBadge.classList.add('visible'); }
	} else {
		if (badge) badge.classList.remove('visible');
		if (tawkBadge) tawkBadge.classList.remove('visible');
	}
};

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

	// tawk.to
	var tawk = document.createElement('script');
	tawk.src = 'https://embed.tawk.to/699610c27418241c38dd96b3/1jhp32uj0';
	tawk.charset = 'UTF-8';
	tawk.setAttribute('crossorigin', '*');
	tawk.async = true;
	document.head.appendChild(tawk);
});
