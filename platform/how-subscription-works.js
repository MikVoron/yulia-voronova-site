(function () {
  'use strict';

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
