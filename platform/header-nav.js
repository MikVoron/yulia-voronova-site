/* ───────────────────────────────────────────────────────────────────────────
 * header-nav.js — единый строитель навигации хедера SmartPlate.
 *
 * Зачем: раньше каждая страница дублировала свой renderHeaderNav() с обрезкой
 * категорий. Теперь источник навигации один (этот файл), а данные —
 * существующие: window.CATEGORIES (категории SmartPlate) + SP_INGREDIENTS
 * (справочник ingredients.js).
 *
 * Состав (ТЗ §3): Рецепты ▾ | Ингредиенты ▾ | Избранное | Консультации.
 *   • Рецепты ▾     — «Все рецепты» + все категории (2 колонки).
 *   • Ингредиенты ▾ — ингредиенты по группам (колонки).
 *   • Избранное     — cabinet.html?tab=favorites (гость → login c return).
 *   • Консультации  — единственный внешний пункт, voronova.online/#tariffs.
 *
 * Заполняет #sp-nav (desktop) и, если есть, #sp-drawer-nav (mobile drawer).
 *
 * Использование на странице (после loadContent(), когда CATEGORIES готовы):
 *   SP_HEADER.render({ activeCat: 'mains', activeNav: null });
 *   activeNav ∈ {'recipes','ingredients','favorites', null}.
 *
 * Подключать ПОСЛЕ ingredients.js. Глобал — window.SP_HEADER.
 * ───────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  var CONSULT_URL = 'https://voronova.online/#tariffs';
  var ALL_RECIPES_URL = 'category.html';
  var FAVORITES_TARGET = 'cabinet.html?tab=favorites';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Избранное: гость → login.html?return=<favorites>, иначе прямой переход.
  // return-context соблюдает _safeReturn в login.html (относительный путь).
  function favoritesHref() {
    try {
      // Auth — это `const Auth` в data-v2.js (не на window) → читаем голую ссылку.
      if (typeof Auth !== 'undefined' && Auth && typeof Auth.isGuest === 'function' && Auth.isGuest()) {
        return 'login.html?return=' + encodeURIComponent(FAVORITES_TARGET);
      }
    } catch (e) { /* Auth ещё не готов — отдаём прямой путь, кабинет сам направит на login */ }
    return FAVORITES_TARGET;
  }

  // Категории SmartPlate из единого источника. ВАЖНО: в data-v2.js это
  // `let CATEGORIES` — top-level lexical binding, которого НЕТ на window.
  // Поэтому читаем голую ссылку (резолвится по scope chain между скриптами),
  // а не global.CATEGORIES (был бы undefined). typeof-guard — на случай, если
  // data-v2.js ещё не загрузился.
  function getCategories() {
    var C = (typeof CATEGORIES !== 'undefined') ? CATEGORIES : null;
    if (!C || typeof C !== 'object') return [];
    var arr = Object.keys(C).map(function (k) { return C[k]; })
      .filter(function (c) { return c && c.id; });
    arr.sort(function (a, b) {
      var sa = (a.sort_order != null) ? a.sort_order : 0;
      var sb = (b.sort_order != null) ? b.sort_order : 0;
      if (sa !== sb) return sa - sb;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
    });
    return arr;
  }

  // ── Desktop nav (#sp-nav) ──────────────────────────────────────────────────
  function buildDesktop(opts) {
    var cats = getCategories();
    var recipesActive = !!opts.activeCat || opts.activeNav === 'recipes';
    var ingActive = opts.activeNav === 'ingredients';
    var favActive = opts.activeNav === 'favorites';

    var catLinks = cats.map(function (c) {
      return '<a role="menuitem" href="category.html?cat=' + encodeURIComponent(c.id) + '">' + esc(c.name) + '</a>';
    }).join('');

    var recipesPanel =
      '<div class="sp-nav-panel sp-nav-panel--recipes" role="menu">' +
        '<a class="sp-nav-panel-all" role="menuitem" href="' + ALL_RECIPES_URL + '">Все рецепты</a>' +
        '<div class="sp-nav-cols">' + catLinks + '</div>' +
      '</div>';

    var groups = (global.SP_INGREDIENTS && global.SP_INGREDIENTS.byGroup()) || [];
    var groupsHtml = groups.map(function (g) {
      var items = g.items.map(function (it) {
        return '<a role="menuitem" href="ingredient.html?id=' + encodeURIComponent(it.id) + '">' + esc(it.name) + '</a>';
      }).join('');
      return '<div class="sp-nav-group"><span class="sp-nav-group-title">' + esc(g.name) + '</span>' + items + '</div>';
    }).join('');
    var ingredientsPanel =
      '<div class="sp-nav-panel sp-nav-panel--ingredients" role="menu">' +
        '<div class="sp-nav-groups">' + groupsHtml + '</div>' +
      '</div>';

    return '' +
      '<div class="sp-nav-dd" data-dd="recipes">' +
        '<button class="sp-nav-trigger' + (recipesActive ? ' active' : '') + '" type="button" aria-haspopup="true" aria-expanded="false">Рецепты<span class="sp-nav-caret" aria-hidden="true"></span></button>' +
        recipesPanel +
      '</div>' +
      '<div class="sp-nav-dd" data-dd="ingredients">' +
        '<button class="sp-nav-trigger' + (ingActive ? ' active' : '') + '" type="button" aria-haspopup="true" aria-expanded="false">Ингредиенты<span class="sp-nav-caret" aria-hidden="true"></span></button>' +
        ingredientsPanel +
      '</div>' +
      '<a class="sp-nav-link' + (favActive ? ' active' : '') + '" data-nav="favorites" href="' + favoritesHref() + '">Избранное</a>' +
      '<a class="sp-nav-link" href="' + CONSULT_URL + '">Консультации</a>';
  }

  // ── Mobile drawer (#sp-drawer-nav) ─────────────────────────────────────────
  function buildDrawer(opts) {
    var cats = getCategories();
    var catLinks = cats.map(function (c) {
      return '<a href="category.html?cat=' + encodeURIComponent(c.id) + '">' + esc(c.name) + '</a>';
    }).join('');

    var groups = (global.SP_INGREDIENTS && global.SP_INGREDIENTS.byGroup()) || [];
    var ingHtml = groups.map(function (g) {
      var items = g.items.map(function (it) {
        return '<a href="ingredient.html?id=' + encodeURIComponent(it.id) + '">' + esc(it.name) + '</a>';
      }).join('');
      return '<span class="sp-drawer-subhead">' + esc(g.name) + '</span>' + items;
    }).join('');

    return '' +
      '<span class="sp-drawer-section">Рецепты</span>' +
      '<a href="' + ALL_RECIPES_URL + '">Все рецепты</a>' +
      catLinks +
      '<span class="sp-drawer-section">Ингредиенты</span>' +
      ingHtml +
      '<span class="sp-drawer-section">Ещё</span>' +
      '<a data-nav="favorites" href="' + favoritesHref() + '">Избранное</a>' +
      '<a href="' + CONSULT_URL + '">Консультации</a>';
  }

  // ── Dropdown-взаимодействия (вешаются один раз) ────────────────────────────
  var wired = false;
  function wire(nav) {
    if (wired || !nav) return;
    wired = true;

    function closeAll(except) {
      var open = nav.querySelectorAll('.sp-nav-dd.open');
      for (var i = 0; i < open.length; i++) {
        if (open[i] === except) continue;
        open[i].classList.remove('open');
        var t = open[i].querySelector('.sp-nav-trigger');
        if (t) t.setAttribute('aria-expanded', 'false');
      }
    }

    nav.addEventListener('click', function (e) {
      var trigger = e.target.closest('.sp-nav-trigger');
      if (!trigger) return;
      var dd = trigger.closest('.sp-nav-dd');
      if (!dd) return;
      e.preventDefault();
      var willOpen = !dd.classList.contains('open');
      closeAll(dd);
      dd.classList.toggle('open', willOpen);
      trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.sp-nav-dd')) closeAll(null);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAll(null);
    });
  }

  function render(opts) {
    opts = opts || {};
    var nav = document.getElementById('sp-nav');
    if (nav) {
      nav.innerHTML = buildDesktop(opts);
      wire(nav);
    }
    var drawer = document.getElementById('sp-drawer-nav');
    if (drawer) drawer.innerHTML = buildDrawer(opts);
  }

  // ── Mobile drawer open/close ───────────────────────────────────────────────
  // Общие для всех страниц, где есть #sp-drawer (бургер вызывает onclick="openDrawer()").
  // index.html объявляет свои одноимённые функции инлайн позже и переопределяет эти —
  // логика идентична, поэтому конфликта нет.
  function openDrawer() {
    var dr = document.getElementById('sp-drawer');
    if (!dr) return;
    dr.removeAttribute('hidden');
    requestAnimationFrame(function () { dr.classList.add('open'); });
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    var dr = document.getElementById('sp-drawer');
    if (!dr) return;
    dr.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function () {
      if (!dr.classList.contains('open')) dr.setAttribute('hidden', '');
    }, 300);
  }
  if (!global.openDrawer) global.openDrawer = openDrawer;
  if (!global.closeDrawer) global.closeDrawer = closeDrawer;
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var dr = document.getElementById('sp-drawer');
    if (dr && dr.classList.contains('open') && typeof global.closeDrawer === 'function') {
      global.closeDrawer();
    }
  });

  global.SP_HEADER = { render: render, favoritesHref: favoritesHref };
})(typeof window !== 'undefined' ? window : this);
