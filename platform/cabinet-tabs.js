(function (root, factory) {
	'use strict';
	var api = factory();
	if (typeof module === 'object' && module.exports) module.exports = api;
	if (root && root.document) {
		root.SP_CABINET_TABS = api;
		api.init(root);
	}
})(typeof window !== 'undefined' ? window : null, function () {
	'use strict';

	var DEFAULT_TAB = 'subscription';
	var TABS = ['subscription', 'history', 'favorites', 'notes', 'feedback', 'settings'];

	function isTab(value) {
		return TABS.indexOf(String(value || '')) !== -1;
	}

	function resolve(search, hash) {
		var params = new URLSearchParams(search || '');
		var queryTab = params.get('tab');
		if (isTab(queryTab)) return queryTab;
		var legacyHash = String(hash || '').replace(/^#/, '');
		return isTab(legacyHash) ? legacyHash : DEFAULT_TAB;
	}

	function urlFor(currentUrl, tab) {
		var safeTab = isTab(tab) ? tab : DEFAULT_TAB;
		var url = new URL(currentUrl, 'https://smartplate.local/');
		url.searchParams.set('tab', safeTab);
		if (isTab(String(url.hash || '').replace(/^#/, ''))) url.hash = '';
		return url.pathname.split('/').pop() + url.search + url.hash;
	}

	function init(win) {
		var tab = resolve(win.location.search, win.location.hash);
		win.document.documentElement.dataset.cabinetTab = tab;
		var canonical = urlFor(win.location.href, tab);
		var current = win.location.pathname.split('/').pop() + win.location.search + win.location.hash;
		if (canonical !== current) win.history.replaceState({ cabinetTab: tab }, '', canonical);
		return tab;
	}

	return {
		DEFAULT_TAB: DEFAULT_TAB,
		TABS: TABS.slice(),
		isTab: isTab,
		resolve: resolve,
		urlFor: urlFor,
		init: init
	};
});
