(function () {
  'use strict';

  // Keep recipe context across the tariff page and the existing login return URL.
  var returnTo = new URLSearchParams(location.search).get('return');
  if (!returnTo && document.referrer) {
    try {
      var referrer = new URL(document.referrer);
      if (referrer.origin === location.origin && referrer.pathname === new URL('recipe.html', location.href).pathname) {
        returnTo = 'recipe.html' + referrer.search + referrer.hash;
      }
    } catch (e) { /* a missing referrer leaves the ordinary subscription link */ }
  }
  if (returnTo && /^(?:recipe|category|ingredient|index)\.html(?:[?#]|$)/.test(returnTo) && !/[\\\x00-\x1F\x7F]/.test(returnTo)) {
    document.querySelectorAll('a[href^="login.html?return="]').forEach(function (link) {
      var login = new URL(link.href);
      var cabinet = new URL(login.searchParams.get('return'), location.href);
      cabinet.searchParams.set('return', returnTo);
      login.searchParams.set('return', 'cabinet.html' + cabinet.search);
      link.setAttribute('href', 'login.html' + login.search);
    });
  }

  var buttons = document.querySelectorAll('[data-tariff-region]');
  var rublePlans = document.getElementById('tariff-ru');
  var euroPlans = document.getElementById('tariff-world');
  var internationalNote = document.getElementById('international-note');
  var earlyAccessNote = document.getElementById('early-access-note');

  if (!buttons.length || !rublePlans || !euroPlans || !internationalNote || !earlyAccessNote) return;

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      var isRussia = button.dataset.tariffRegion === 'ru';
      rublePlans.hidden = !isRussia;
      euroPlans.hidden = isRussia;
      internationalNote.hidden = isRussia;
      earlyAccessNote.hidden = !isRussia;
      buttons.forEach(function (item) {
        item.setAttribute('aria-selected', String(item === button));
      });
    });
  });
}());
