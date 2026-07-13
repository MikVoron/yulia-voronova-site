(function (window, document) {
	'use strict';

	var CHAT_URL = 'https://tawk.to/chat/699610c27418241c38dd96b3/1js4rtjr9';
	var SUPPORT_EMAIL = 'hello@voronova.online';
	var overlay = null;
	var lastTrigger = null;
	var loadTimer = null;

	function closeChat() {
		if (!overlay) return;
		if (loadTimer) {
			window.clearTimeout(loadTimer);
			loadTimer = null;
		}
		overlay.parentNode.removeChild(overlay);
		overlay = null;
		document.body.classList.remove('tawk-chat-open');
		if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
	}

	function buildChat() {
		overlay = document.createElement('div');
		overlay.className = 'tawk-chat-overlay';
		overlay.setAttribute('role', 'dialog');
		overlay.setAttribute('aria-modal', 'true');
		overlay.setAttribute('aria-label', 'Чат с отделом заботы');

		var panel = document.createElement('div');
		panel.className = 'tawk-chat-panel';

		var header = document.createElement('div');
		header.className = 'tawk-chat-header';

		var title = document.createElement('div');
		title.className = 'tawk-chat-title';
		title.textContent = 'Чат с отделом заботы';

		var email = document.createElement('a');
		email.className = 'tawk-chat-email';
		email.href = 'mailto:' + SUPPORT_EMAIL;
		email.textContent = 'Email';

		var close = document.createElement('button');
		close.className = 'tawk-chat-close';
		close.type = 'button';
		close.setAttribute('aria-label', 'Закрыть чат');
		close.textContent = '\u00d7';
		close.addEventListener('click', closeChat);

		var frame = document.createElement('iframe');
		frame.className = 'tawk-chat-frame';
		frame.title = 'Чат поддержки Tawk';
		frame.src = CHAT_URL;
		frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');

		var stage = document.createElement('div');
		stage.className = 'tawk-chat-stage';

		var loading = document.createElement('div');
		loading.className = 'tawk-chat-loading';
		loading.setAttribute('role', 'status');
		loading.textContent = 'Загружаем чат…';

		var fallback = document.createElement('div');
		fallback.className = 'tawk-chat-fallback';
		fallback.hidden = true;
		fallback.innerHTML = 'Чат загружается дольше обычного.<a href="mailto:' + SUPPORT_EMAIL + '">Написать на email</a>';

		frame.addEventListener('load', function () {
			loading.hidden = true;
			fallback.hidden = true;
			if (loadTimer) window.clearTimeout(loadTimer);
			loadTimer = null;
		});
		stage.appendChild(loading);
		stage.appendChild(fallback);
		stage.appendChild(frame);

		header.appendChild(title);
		header.appendChild(email);
		header.appendChild(close);
		panel.appendChild(header);
		panel.appendChild(stage);
		overlay.appendChild(panel);
		overlay.addEventListener('click', function (event) {
			if (event.target === overlay) closeChat();
		});
		document.body.appendChild(overlay);
		document.body.classList.add('tawk-chat-open');
		close.focus();
		loadTimer = window.setTimeout(function () {
			loading.hidden = true;
			fallback.hidden = false;
		}, 12000);
	}

	window.openTawk = function (event, trigger) {
		if (event && typeof event.preventDefault === 'function') event.preventDefault();
		lastTrigger = trigger || (event && event.currentTarget) || null;
		if (!overlay) buildChat();
		return false;
	};

	(function bindFooterContrast() {
		var fab = document.getElementById('support-fab');
		var footer = document.querySelector('.v-footer');
		if (!fab || !footer || !window.requestAnimationFrame) return;

		var frame = null;
		function update() {
			frame = null;
			var fabRect = fab.getBoundingClientRect();
			var footerRect = footer.getBoundingClientRect();
			var isOverFooter = fabRect.bottom > footerRect.top &&
				fabRect.top < footerRect.bottom &&
				fabRect.right > footerRect.left &&
				fabRect.left < footerRect.right;
			fab.classList.toggle('is-over-footer', isOverFooter);
		}
		function schedule() {
			if (frame) return;
			frame = window.requestAnimationFrame(update);
		}

		update();
		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', schedule);
		window.addEventListener('load', update);
	})();

	document.addEventListener('click', function (event) {
		var target = event.target;
		while (target && target !== document) {
			if (target.nodeType === 1 && target.hasAttribute('data-tawk-open')) {
				window.openTawk(event, target);
				return;
			}
			target = target.parentNode;
		}
	});

	document.addEventListener('keydown', function (event) {
		if (overlay && (event.key === 'Escape' || event.keyCode === 27)) closeChat();
	});
})(window, document);
