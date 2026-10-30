(function (window, document) {
	'use strict';

	// A duplicate script evaluation registers another document-level click handler.
	// Its private overlay then stacks above the first one, so keep this modal singleton.
	if (window.__smartplateJivoModalInitialized) return;
	window.__smartplateJivoModalInitialized = true;

	var CHAT_URL = 'https://voronova.online/support-chat.html';
	var SUPPORT_EMAIL = 'hello@voronova.online';
	var CHAT_ORIGIN = 'https://voronova.online';
	var chatFrame = null;
	var chatLoading = null;
	var chatFallback = null;
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
		chatFrame = chatLoading = chatFallback = null;
		document.body.classList.remove('support-chat-open');
		if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
	}

	function buildChat() {
		overlay = document.createElement('div');
		overlay.className = 'support-chat-overlay';
		overlay.setAttribute('role', 'dialog');
		overlay.setAttribute('aria-modal', 'true');
		overlay.setAttribute('aria-label', 'Чат с отделом заботы');

		var panel = document.createElement('div');
		panel.className = 'support-chat-panel';

		var header = document.createElement('div');
		header.className = 'support-chat-header';

		var title = document.createElement('div');
		title.className = 'support-chat-title';
		title.textContent = 'Чат с отделом заботы';

		var email = document.createElement('a');
		email.className = 'support-chat-email';
		email.href = 'mailto:' + SUPPORT_EMAIL;
		email.textContent = 'Email';

		var close = document.createElement('button');
		close.className = 'support-chat-close';
		close.type = 'button';
		close.setAttribute('aria-label', 'Закрыть чат');
		close.textContent = '\u00d7';
		close.addEventListener('click', closeChat);

		var frame = document.createElement('iframe');
		frame.className = 'support-chat-frame';
		frame.title = 'Чат поддержки Jivo';
		frame.src = CHAT_URL;
		frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
		chatFrame = frame;
		frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');

		var stage = document.createElement('div');
		stage.className = 'support-chat-stage';

		var loading = document.createElement('div');
		loading.className = 'support-chat-loading';
		loading.setAttribute('role', 'status');
		loading.textContent = 'Загружаем чат…';

		var fallback = document.createElement('div');
		fallback.className = 'support-chat-fallback';
		fallback.hidden = true;
		fallback.innerHTML = 'Чат загружается дольше обычного.<a href="mailto:' + SUPPORT_EMAIL + '">Написать на email</a>';

		chatLoading = loading;
		chatFallback = fallback;
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
		document.body.classList.add('support-chat-open');
		close.focus();
		loadTimer = window.setTimeout(function () {
			loading.hidden = true;
			fallback.hidden = false;
		}, 12000);
	}

	window.openJivo = function (event, trigger) {
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
			if (target.nodeType === 1 && target.hasAttribute('data-support-open')) {
				window.openJivo(event, target);
				return;
			}
			target = target.parentNode;
		}
	});

	window.addEventListener('message', function (event) {
		if (!chatFrame || event.origin !== CHAT_ORIGIN || event.source !== chatFrame.contentWindow || !event.data) return;
		if (event.data.type === 'jivo-support-close') { closeChat(); return; }
		if (event.data.type !== 'jivo-support-ready' && event.data.type !== 'jivo-support-error') return;
		chatLoading.hidden = true;
		chatFallback.hidden = event.data.type === 'jivo-support-ready';
		if (loadTimer) window.clearTimeout(loadTimer);
		loadTimer = null;
	});

	document.addEventListener('keydown', function (event) {
		if (overlay && (event.key === 'Escape' || event.keyCode === 27)) closeChat();
	});
})(window, document);
