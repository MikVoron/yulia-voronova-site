(function (window, document) {
	'use strict';

	var CHAT_URL = 'https://tawk.to/chat/699610c27418241c38dd96b3/1js4rtjr9';
	var SUPPORT_EMAIL = 'hello@voronova.online';
	var overlay = null;
	var lastTrigger = null;
	var previousOverflow = '';
	var loadTimer = null;

	function addStyles() {
		if (document.getElementById('tawk-chat-modal-styles')) return;
		var style = document.createElement('style');
		style.id = 'tawk-chat-modal-styles';
		style.textContent =
			'.tawk-chat-overlay{position:fixed;top:0;right:0;bottom:0;left:0;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(17,17,17,.48);}' +
			'.tawk-chat-panel{width:420px;max-width:100%;height:calc(100vh - 32px);max-height:720px;display:flex;flex-direction:column;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.28);}' +
			'.tawk-chat-header{min-height:52px;display:flex;align-items:center;gap:12px;padding:0 12px 0 18px;background:#111;color:#fff;font-family:Montserrat,Arial,sans-serif;}' +
			'.tawk-chat-title{min-width:0;flex:1;font-size:13px;font-weight:700;}' +
			'.tawk-chat-email{color:rgba(255,255,255,.78);font-size:11px;font-weight:600;text-decoration:underline;text-underline-offset:3px;}' +
			'.tawk-chat-close{width:36px;height:36px;border:0;border-radius:50%;display:grid;place-items:center;background:transparent;color:#fff;font:28px/1 Arial,sans-serif;cursor:pointer;}' +
			'.tawk-chat-close:hover,.tawk-chat-close:focus-visible{background:rgba(255,255,255,.14);outline:none;}' +
			'.tawk-chat-stage{position:relative;display:flex;min-height:0;flex:1;background:#fff;}' +
			'.tawk-chat-frame{display:block;width:100%;min-height:0;flex:1;border:0;background:#fff;}' +
			'.tawk-chat-loading,.tawk-chat-fallback{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:28px;text-align:center;background:#fff;color:#333;font:600 13px/1.5 Montserrat,Arial,sans-serif;}' +
			'.tawk-chat-loading::before{content:"";width:34px;height:3px;background:#e8400a;}' +
			'.tawk-chat-fallback[hidden],.tawk-chat-loading[hidden]{display:none;}' +
			'.tawk-chat-fallback a{color:#c93400;text-underline-offset:3px;}' +
			'@media(max-width:600px){.tawk-chat-overlay{padding:0;}.tawk-chat-panel{width:100%;height:100%;max-height:none;border-radius:0;}.tawk-chat-header{padding-left:14px;}.tawk-chat-email{font-size:10px;}}';
		document.head.appendChild(style);
	}

	function closeChat() {
		if (!overlay) return;
		if (loadTimer) {
			window.clearTimeout(loadTimer);
			loadTimer = null;
		}
		overlay.parentNode.removeChild(overlay);
		overlay = null;
		document.body.style.overflow = previousOverflow;
		if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
	}

	function buildChat() {
		addStyles();
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
		previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
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
