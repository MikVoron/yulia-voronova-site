    // ── SYNC FALLBACK HERO + CRUMBS ─────────────────────────────────────────
    // Заполняем верх страницы (название категории и крошки) синхронно, до того
    // как loadContent() сходит в API. Юзер сразу видит «Завтраки», а не пустоту.
    // После loadContent().then() ниже хук перерисует hero/crumbs данными из API
    // (имя/описание/аватар) — позиция и габариты блока совпадают, рывка нет.
    (function renderFallbackHero() {
        var p = new URLSearchParams(location.search);
        var q = (p.get('q') || '').trim();
        var catP = (p.get('cat') || '').trim();
        var allMode = !q && !catP;   // category.html без cat/q = каталог «Все рецепты»
        var id = catP;
        var hero = document.getElementById('cat-hero');
        var crumbs = document.getElementById('cat-crumbs');
        if (q) {
            if (hero) hero.innerHTML =
                '<div class="cat-hero-row">' +
                '<div class="cat-hero-ava">🔍</div>' +
                '<div><div class="cat-hero-name">Поиск</div></div></div>';
            if (crumbs) crumbs.innerHTML =
                '<a href="index.html">Главная</a>' +
                '<span class="crumb-sep">›</span>' +
                '<span class="crumb-current">Поиск</span>';
            return;
        }
        if (allMode) {
            document.title = 'Все рецепты — Конструктор питания';
            if (hero) hero.innerHTML =
                '<div class="cat-hero-row">' +
                '<div class="cat-hero-ava cat-hero-ava--logo">' +
                '<img src="https://voronova.online/images/icons/logo-small.png" alt="Юлия Воронова">' +
                '</div>' +
                '<div><div class="cat-hero-name">Все рецепты</div>' +
                '<div class="cat-hero-desc">Все блюда платформы — завтраки, супы, горячее, намазки и соусы в одном каталоге</div></div></div>';
            if (crumbs) crumbs.innerHTML =
                '<a href="index.html">Главная</a>' +
                '<span class="crumb-sep">›</span>' +
                '<span class="crumb-current">Все рецепты</span>';
            return;
        }
        // Источник истины — таблица categories в БД (поле description).
        // Эти строки должны 1:1 совпадать с тем, что вернёт /content/categories,
        // иначе текст «прыгает» после loadContent(). Менять — синхронно в БД и здесь.
        var FB = {
            breakfasts: { name: 'Завтраки',         desc: 'Каши, омлеты, бутерброды и сырники для энергичного утра' },
            soups:      { name: 'Супы',             desc: 'Супы, борщи, щи и бульонные блюда' },
            mains:      { name: 'Горячее',          desc: 'Сытные горячие блюда для обеда и ужина — плов, паста и другие вторые блюда' },
            pancakes:   { name: 'Блины / Оладьи',   desc: 'Веганские блины и оладьи из цельных продуктов' },
            spreads:    { name: 'Намазки',          desc: 'Хумус и паштеты — для бутербродов и перекусов' },
            sauces:     { name: 'Соусы',            desc: 'Кремовые соусы и заправки — из кешью, бобовых и запечённых овощей' }
        };
        var fb = FB[id];
        if (!fb) return;
        document.title = fb.name + ' — Конструктор питания';
        if (hero) hero.innerHTML =
            '<div class="cat-hero-row">' +
            '<div class="cat-hero-ava cat-hero-ava--logo">' +
            '<img src="https://voronova.online/images/icons/logo-small.png" alt="Юлия Воронова">' +
            '</div>' +
            '<div><div class="cat-hero-name">' + fb.name + '</div>' +
            '<div class="cat-hero-desc">' + fb.desc + '</div></div></div>';
        if (crumbs) crumbs.innerHTML =
            '<a href="index.html">Главная</a>' +
            '<span class="crumb-sep">›</span>' +
            '<span class="crumb-current">' + fb.name + '</span>';
    })();

    loadContent().then(function() {
        if (isContentError()) {
            const dishList = document.getElementById('dish-list');
            dishList.removeAttribute('aria-busy');
            showApiError(dishList);
            return;
        }
        // Editorial header parity: подсвечиваем текущий раздел (или просто «Главная» в режиме поиска).
        renderHeaderNav(searchQuery ? null : catId);
        if (searchQuery) {
            document.title = 'Поиск «' + searchQuery + '» — Конструктор питания';
            var total = (typeof searchRecipes === 'function') ? searchRecipes(searchQuery).length : 0;
            document.getElementById('cat-hero').innerHTML =
                '<div class="cat-hero-row">' +
                '<div class="cat-hero-ava">🔍</div>' +
                '<div><div class="cat-hero-name">Поиск: «' + escHtml(searchQuery) + '»</div>' +
                '<div class="cat-hero-desc">Всего найдено: ' + pluralR(total) + '</div></div></div>';
            var crumbsEl = document.getElementById('cat-crumbs');
            if (crumbsEl) {
                crumbsEl.innerHTML = '<a href="index.html">Главная</a>' +
                    '<span class="crumb-sep">›</span>' +
                    '<span class="crumb-current">Поиск</span>';
            }
        } else {
            cat = getCategory(catId);
            if (cat) {
                document.title = cat.name + ' — Конструктор питания';
                var crumbsEl = document.getElementById('cat-crumbs');
                if (crumbsEl) {
                    crumbsEl.innerHTML = '<a href="index.html">Главная</a>' +
                        '<span class="crumb-sep">›</span>' +
                        '<span class="crumb-current">' + escHtml(String(cat.name)) + '</span>';
                }
                var catAvatars = typeof CAT_AVATARS !== 'undefined' ? CAT_AVATARS : {};
                var avaUrl = (typeof getCategoryPhoto === 'function' ? getCategoryPhoto(catId, catAvatars[catId]) : catAvatars[catId]) || '';
                var avaImg = avaUrl
                    ? '<div class="cat-hero-ava"><img src="' + escHtml(String(avaUrl)) + '" alt="' + escHtml(String(cat.name)) + '" data-category-fallback-emoji="' + escHtml(String(cat.emoji)) + '"></div>'
                    : '<div class="cat-hero-ava">' + escHtml(String(cat.emoji)) + '</div>';
                document.getElementById('cat-hero').innerHTML =
                    '<div class="cat-hero-row">' + avaImg +
                    '<div><div class="cat-hero-name">' + escHtml(String(cat.name)) + '</div>' +
                    '<div class="cat-hero-desc">' + escHtml(String(cat.desc)) + '</div></div></div>';
            }
        }
        Auth.checkAccess({ allowGuest: true }).then(function() {
            if (Auth.isLoggedIn()) {
                Favorites.load().then(function() { if (typeof renderDishes === 'function') renderDishes(); });
                Plate.load();
            } else if (typeof renderDishes === 'function') {
                renderDishes();
            }
        });
    });
    updatePlateIcon();

    // User pill init — для гостя меняем на «Войти», прячем dropdown
    (function() {
        const user = Auth.getUser();
        if (!user) {
            const uAva = document.getElementById('u-ava');
            if (uAva) {
                uAva.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
                uAva.style.color = 'var(--text-2)';
                uAva.style.display = 'flex';
                uAva.style.alignItems = 'center';
                uAva.style.justifyContent = 'center';
            }
            const uName = document.getElementById('u-name');
            if (uName) uName.textContent = 'Войти';
            const dd = document.getElementById('user-dropdown');
            if (dd) dd.remove();
            // Editorial-header: профиль превращается в кнопку «Войти».
            const ub = document.getElementById('user-badge');
            if (ub) ub.classList.add('is-guest');
            return;
        }
        const customName = Auth.getDisplayName();
        const displayName = customName || user.email.split('@')[0];
        Auth.renderAvatar(document.getElementById('u-ava'), customName || user.email);
        document.getElementById('u-name').textContent = displayName;
    })();

    function toggleUserMenu(e) {
        // Гость: ведём на login, не открываем меню.
        if (Auth.isGuest()) {
            e.preventDefault();
            location.href = Auth._loginUrl();
            return;
        }
        e.stopPropagation();
        document.getElementById('user-dropdown').classList.toggle('open');
    }
    document.addEventListener('click', function(e) {
        const wrap = document.getElementById('user-wrap');
        if (wrap && !wrap.contains(e.target)) { const dd = document.getElementById('user-dropdown'); if (dd) dd.classList.remove('open'); }
    });
    function doLogout() {
        document.getElementById('user-dropdown').classList.remove('open');
        const overlay = document.createElement('div');
        overlay.className = 'farewell-overlay';
        overlay.innerHTML = '<div class="farewell-card" role="status" aria-live="polite">' +
            '<div class="farewell-eyebrow">Сеанс завершён</div>' +
            '<h2 class="farewell-title">До встречи!</h2>' +
            '<div class="farewell-divider"></div>' +
            '<p class="farewell-sub">Возвращайтесь — мы ждём вас</p>' +
            '<p class="farewell-caption">Перенаправляем на страницу входа…</p>' +
            '<div class="farewell-progress"><span></span></div>' +
        '</div>';
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('show'));
        setTimeout(() => { Auth.logout(); location.href = 'login.html'; }, 1800);
    }

    // Режим страницы определяется параметрами URL:
    //   ?q=<query>  → результаты поиска
    //   ?cat=<id>   → конкретная категория
    //   (без обоих) → каталог «Все рецепты» (карточки всех категорий)
    const params = new URLSearchParams(location.search);
    const searchQuery = (params.get('q') || '').trim();
    const catParam = (params.get('cat') || '').trim();
    const isAllMode = !searchQuery && !catParam;
    const catId = catParam;   // '' в режимах поиска и «Все рецепты»
    let cat = null;
    const activeFilters = {};

    // Навигация хедера — единый билдер (header-nav.js). «Рецепты» подсвечиваем
    // в конкретной категории и в режиме «Все рецепты»; в поиске — без подсветки.
    function renderHeaderNav(activeCatId) {
        if (window.SP_HEADER && typeof window.SP_HEADER.render === 'function') {
            window.SP_HEADER.render({
                activeCat: activeCatId || null,
                activeNav: (isAllMode && !activeCatId) ? 'recipes' : null
            });
        }
    }
    // Ранний рендер: дропдаун «Ингредиенты» и ссылки не зависят от API.
    renderHeaderNav(catId || null);

    function applyFilters(dishes, filters) {
        let list = dishes;
        if (filters.time) {
            if (filters.time === 'over60') list = list.filter(d => d.time > 60);
            else list = list.filter(d => d.time <= filters.time);
        }
        if (filters.difficulty) list = list.filter(d => d.diff === filters.difficulty);
        if (filters.gluten)  list = list.filter(d => (d.tags||[]).includes('без глютена'));
        if (filters.plant)   list = list.filter(d => (d.tags||[]).includes('растительное'));
        if (filters.fish)    list = list.filter(d => (d.tags||[]).includes('рыбное'));
        if (filters.noSoy)   list = list.filter(d => (d.tags||[]).includes('без сои'));
        if (filters.legumes) list = list.filter(d => (d.tags||[]).includes('бобовые'));
        if (filters.free)    list = list.filter(d => Auth.isFreeRecipe(d));
        return list;
    }
    function getDishesForView() {
        if (searchQuery) {
            const matched = (typeof searchRecipes === 'function') ? searchRecipes(searchQuery) : [];
            return applyFilters(matched, activeFilters);
        }
        if (isAllMode) {
            // Каталог «Все рецепты»: уникальные рецепты из всех категорий (RECIPES
            // ключуется по id, поэтому дубли исключены), фильтры — по полному списку.
            const all = (typeof RECIPES !== 'undefined') ? Object.values(RECIPES).filter(Boolean) : [];
            return applyFilters(all, activeFilters);
        }
        return getCategoryDishes(catId, activeFilters);
    }

    // Restore filters from index.html navigation
    (function restoreFilters() {
        const saved = sessionStorage.getItem('platform_filters');
        if (!saved) return;
        sessionStorage.removeItem('platform_filters');
        try {
            const f = JSON.parse(saved);
            Object.assign(activeFilters, f);
        } catch(e) { return; }
    })();

    const CAT_PHOTOS = {
        breakfasts: SITE_BASE + '/images/blog/random-pic-blog-5..webp',
        soups:      SITE_BASE + '/images/recipes/red-lentil-mushroom-soup/red-lentil-mushroom-soup-cover.webp',
        mains:      SITE_BASE + '/images/cook-healthy-food.webp',
        pancakes:   SITE_BASE + '/images/blog/random-pic-blog-2.webp',
        spreads:    SITE_BASE + '/images/blog/random-pic-blog-3.webp',
        sauces:     SITE_BASE + '/images/recipes/cashew-sauce/cashew-sauce-cover.webp',
        salads:     SITE_BASE + '/images/blog/random-pic-blog-4.webp',
        drinks:     SITE_BASE + '/images/blog/random-pic-blog-1.webp',
    };

    window.addEventListener('scroll', () =>
        document.getElementById('hdr').classList.toggle('scrolled', scrollY > 10));

    const CAT_AVATARS = {
        breakfasts: SITE_BASE + '/images/blog/random-pic-blog-5..webp',
        soups:      SITE_BASE + '/images/recipes/red-lentil-mushroom-soup/red-lentil-mushroom-soup-cover.webp',
        mains:      SITE_BASE + '/images/cook-healthy-food.webp',
        pancakes:   SITE_BASE + '/images/blog/random-pic-blog-2.webp',
        spreads:    SITE_BASE + '/images/blog/random-pic-blog-3.webp',
        sauces:     SITE_BASE + '/images/recipes/cashew-sauce/cashew-sauce-cover.webp',
        salads:     SITE_BASE + '/images/blog/random-pic-blog-4.webp',
        drinks:     SITE_BASE + '/images/blog/random-pic-blog-1.webp',
    };

    // Hero block rendered after loadContent() — see above

    function imgFallback(img, emoji) {
        img.onerror = null;
        img.style.display = 'none';
        var d = document.createElement('div');
        d.className = 'recipe-card-emoji';
        d.textContent = emoji;
        img.parentElement.insertBefore(d, img);
    }

    function ratingPillHtml(recipeId) {
        // Show '—' initially; loadApiRatings() will update with real server data
        const display = '—';
        return `<div class="photo-rating-pill" id="rpill-${escHtml(recipeId)}" role="button" data-card-action="rating" data-recipe-id="${escHtml(recipeId)}">
            <span class="pr-star">★</span>
            <span class="pr-val">${display}</span>
        </div>`;
    }

    function commentBtnHtml(recipeId) {
        return `<div class="photo-comment-btn" id="cbtn-${escHtml(recipeId)}" role="button" data-card-action="comments" data-recipe-id="${escHtml(recipeId)}">
            <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
            Отзыв</div>`;
    }

    function pluralR(n) {
        const m10 = n % 10, m100 = n % 100;
        if (m100 >= 11 && m100 <= 14) return n + ' рецептов';
        if (m10 === 1) return n + ' рецепт';
        if (m10 >= 2 && m10 <= 4) return n + ' рецепта';
        return n + ' рецептов';
    }

    function buildDishCard(d, diff_labels) {
        const _id = String(d.id || '');
        const _name = escHtml(String(d.name || ''));
        const _emoji = escHtml(String(d.emoji || '🍴'));
        const _photo = escHtml(String(d.photo || ''));
        const _imgPos = escHtml(String(d.imgPosition || ''));
        const _diff = escHtml(String(diff_labels[d.diff] || d.diff || ''));
        const _diffIcon = typeof diffIcon === 'function' ? diffIcon(d.diff) : '';
        const _diffColor = d.diff === 'hard' ? 'var(--accent)' : d.diff === 'medium' ? '#d97706' : '#8a7d6f';
        const _timeMeta = formatTimeMeta(d.time, d.timeLabel);
        const _timeStr = escHtml(_timeMeta.short);
        const _timeNote = _timeMeta.note ? escHtml(_timeMeta.note) : '';
        const _kcal = Number(d.kcal) || 0;
        const isSublist = d.isSublist;
        const access = Auth.recipeCardAccess(d);
        const locked = access.locked;
        const lockLevel = locked ? access.level : null;
        const photoHtml = _photo
            ? `<img src="${_photo}" alt="${_name}" loading="lazy" data-fallback-emoji="${_emoji}"${_imgPos ? ` style="object-position:${_imgPos}"` : ''}>`
            : `<div class="recipe-card-emoji">${_emoji}</div>`;
        const canShowFav = Auth.isLoggedIn();
        const isFav = canShowFav && Favorites.has(d.id);
        const lockBadgeClass = lockLevel === 'pro' ? 'locked-badge' : 'trial-badge';
        const lockBadge = locked
            ? '<div class="' + lockBadgeClass + '"><svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>'
              + access.label + '</div>'
            : '';
        // Бейдж «Бесплатно» — показываем только тем, у кого нет полного доступа.
        const freeBadge = !locked && access.isFree && !Auth.hasFullAccess()
            ? '<div class="free-badge">Бесплатно</div>'
            : '';
        const _emptyStars = Array.from({length: 5}, () =>
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#e8400a" stroke-width="2"><polygon points="12 2 15 9 22 10 17 15 18 22 12 18 6 22 7 15 2 10 9 9 12 2"/></svg>'
        ).join('');
        const accessHint = locked ? '. ' + access.label + '. ' + access.actionLabel : '';
        return `<article class="recipe-card${locked ? ' locked' : ''}" role="button" tabindex="0" aria-label="${_name}${escHtml(accessHint)}" data-card-action="${locked ? 'locked' : 'open'}" data-recipe-id="${escHtml(_id)}">
            <div class="recipe-card__media">
                ${photoHtml}
                ${lockBadge}${freeBadge}
                ${(!locked && canShowFav) ? `<button class="recipe-card__bookmark${isFav ? ' active' : ''}" id="fav-${escHtml(_id)}" aria-label="В избранное" data-card-action="favorite" data-recipe-id="${escHtml(_id)}">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="2" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                </button>` : ''}
            </div>
            <div class="recipe-card__body">
                <h3 class="recipe-card__title">${_name}${isSublist ? ' <span class="dish-sublist-badge">Список →</span>' : ''}</h3>
                <div class="recipe-card__details-line">
                <div class="recipe-card__rating" id="rrow-${escHtml(_id)}">
                    <div class="rating-popup" id="rpop-${escHtml(_id)}">
                        ${[1,2,3,4,5].map(i => `<span class="rp-star" data-n="${i}" data-card-action="rate" data-recipe-id="${escHtml(_id)}">★</span>`).join('')}
                    </div>
                    <span class="recipe-card__rating-stars" id="rstars-${escHtml(_id)}" data-card-action="rating" data-recipe-id="${escHtml(_id)}">${_emptyStars}</span>
                    <span class="recipe-card__rating-text" id="rtext-${escHtml(_id)}"></span>
                </div>
                <div class="recipe-card__meta">
                    <span class="recipe-card__meta-item recipe-card__meta-time">${typeof timeIcon === 'function' ? timeIcon() : ''}${_timeStr}</span>
                    <span class="recipe-card__meta-dot"></span>
                    <span class="recipe-card__meta-item recipe-card__meta-diff" title="${_diff}" aria-label="${_diff}" style="color:${_diffColor}">${_diffIcon}<span class="recipe-card__meta-diff-label">${_diff}</span></span>
                </div>
                </div>
                ${_timeNote ? `<div class="recipe-card-time-note"><span class="rcn-arr" aria-hidden="true">↳</span>${_timeNote}</div>` : ''}
                <div class="recipe-card__footer">
                    <span class="recipe-card__kcal-label">калорийность</span>
                    <span class="recipe-card__kcal-value">${_kcal} <small>ккал</small></span>
                </div>
            </div>
        </article>`;
    }

    const dishListEl = document.getElementById('dish-list');
    if (dishListEl) {
        dishListEl.addEventListener('click', function(event) {
            const actionEl = event.target.closest('[data-card-action]');
            if (!actionEl || !dishListEl.contains(actionEl)) return;
            const recipeId = actionEl.dataset.recipeId || '';
            const action = actionEl.dataset.cardAction;
            if (action === 'open') goToRecipe(recipeId);
            else if (action === 'locked') showLockedMsg(recipeId);
            else if (action === 'favorite') toggleFav(recipeId);
            else if (action === 'rating') openRatingPopup(recipeId, actionEl);
            else if (action === 'comments') openComments(recipeId);
            else if (action === 'rate') rateFromPop(recipeId, Number(actionEl.dataset.n));
        });
        dishListEl.addEventListener('keydown', function(event) {
            const card = event.target.closest('article[data-card-action]');
            if (!card || event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            if (card.dataset.cardAction === 'locked') showLockedMsg(card.dataset.recipeId || '');
            else goToRecipe(card.dataset.recipeId || '');
        });
        dishListEl.addEventListener('mouseover', function(event) {
            const star = event.target.closest('.rp-star[data-recipe-id]');
            if (star) hoverPopStar(star.dataset.recipeId || '', Number(star.dataset.n));
        });
        dishListEl.addEventListener('mouseout', function(event) {
            const star = event.target.closest('.rp-star[data-recipe-id]');
            if (star) unhoverPopStar(star.dataset.recipeId || '');
        });
    }

    document.addEventListener('click', function(event) {
        const actionTarget = event.target.closest('[data-category-action]');
        if (!actionTarget) return;
        const action = actionTarget.dataset.categoryAction;
        if (action === 'delete-review') {
            deleteCatReview(Number(actionTarget.dataset.reviewId), actionTarget.dataset.isAdmin === 'true');
        } else if (action === 'select-star') {
            selectStar(Number(actionTarget.dataset.n));
        } else if (action === 'remove-plate-item') {
            removeItemCat(Number(actionTarget.dataset.index));
        }
    });

    document.addEventListener('error', function(event) {
        const image = event.target;
        if (!(image instanceof HTMLImageElement)) return;
        if (image.hasAttribute('data-category-fallback-emoji')) {
            image.parentElement.textContent = image.dataset.categoryFallbackEmoji || '🍴';
            return;
        }
        if (image.hasAttribute('data-fallback-emoji')) {
            imgFallback(image, image.dataset.fallbackEmoji || '🍴');
        }
    }, true);

    function updateRatingRow(recipeId) {
        const ar = _apiRatings[recipeId];
        const starsEl = document.getElementById('rstars-' + recipeId);
        const textEl  = document.getElementById('rtext-' + recipeId);
        if (!starsEl) return;
        const filled = ar ? Math.round(ar.avg) : 0;
        starsEl.innerHTML = Array.from({length: 5}, (_, i) =>
            `<svg width="11" height="11" viewBox="0 0 24 24" fill="${i < filled ? '#e8400a' : 'none'}" stroke="#e8400a" stroke-width="2"><polygon points="12 2 15 9 22 10 17 15 18 22 12 18 6 22 7 15 2 10 9 9 12 2"/></svg>`
        ).join('');
        if (textEl) {
            if (ar && ar.avg > 0) {
                textEl.textContent = ar.avg + (ar.count > 0 ? ' (' + ar.count + ')' : '');
                textEl.style.cursor = 'pointer';
                textEl.onclick = function(e) { e.stopPropagation(); openComments(recipeId); };
            } else {
                textEl.textContent = '';
                textEl.onclick = null;
            }
        }
    }

    // Ожидаемое количество skeleton-карточек по категориям. Подбирается
    // близко к реальному размеру категории, чтобы сетка не схлопывалась
    // с 6 до 3 при подмене скелетона на реальные карточки. Неизвестные → 4.
    const SKELETON_COUNTS = {
        pancakes: 3,
        breakfasts: 6,
        soups: 6,
        mains: 6,
        spreads: 4,
        sauces: 4
    };

    // Skeleton-карточки для состояния загрузки.
    // Геометрия = реальной .recipe-card (классы .recipe-card / __media / __body / __footer),
    // содержимое — .sk-line блоки разной ширины (живее, чем равные полоски).
    function renderRecipeSkeletons(count = 6) {
        const widths = [
            ['92%','78%','58%'],
            ['88%','72%','42%'],
            ['95%','65%','38%'],
            ['86%','80%','50%'],
            ['90%','62%','46%'],
            ['82%','74%','40%']
        ];
        const html = Array.from({length: count}, (_, i) => {
            const [w1, w2, w3] = widths[i % widths.length];
            return '<div class="recipe-card is-skeleton" aria-hidden="true">'
                +   '<div class="recipe-card__media"></div>'
                +   '<div class="recipe-card__body">'
                +     '<div class="recipe-card__title">'
                +       '<span class="sk-line sk-line--title" style="width:' + w1 + '"></span>'
                +       '<span class="sk-line sk-line--title" style="width:' + w2 + ';margin-top:6px"></span>'
                +       '<span class="sk-line sk-line--title" style="width:' + w3 + ';margin-top:6px"></span>'
                +     '</div>'
                +     '<span class="sk-line" style="width:42%;margin-top:14px"></span>'
                +     '<span class="sk-line" style="width:55%;margin-top:10px"></span>'
                +     '<div class="recipe-card__footer">'
                +       '<span class="sk-line" style="width:36%;height:10px"></span>'
                +       '<span class="sk-line" style="width:24%;height:16px"></span>'
                +     '</div>'
                +   '</div>'
                + '</div>';
        }).join('');
        const list = document.getElementById('dish-list');
        list.setAttribute('aria-busy', 'true');
        list.innerHTML = html;
    }

    function renderDishes() {
        const dishes = getDishesForView();
        document.getElementById('dish-list').removeAttribute('aria-busy');
        document.getElementById('count-label').textContent = pluralR(dishes.length);
        if (!dishes.length) {
            const emptyMsg = searchQuery
                ? 'По запросу «' + escHtml(searchQuery) + '» ничего не найдено.'
                : 'Ничего не найдено. Измените фильтры.';
            document.getElementById('dish-list').innerHTML =
                '<div style="grid-column:1/-1;text-align:center;padding:50px 20px;color:var(--text-3)">' + emptyMsg + '</div>';
            return;
        }
        const diff_labels = typeof DIFF_LABELS !== 'undefined' ? DIFF_LABELS : {};
        document.getElementById('dish-list').innerHTML = dishes.map(d => buildDishCard(d, diff_labels)).join('');
        dishes.forEach(d => { updatePopStars(d.id); updateRatingRow(d.id); });
    }
    // Initial render deferred to loadContent().then() — показываем skeleton-карточки,
    // пока данные не пришли. Геометрия = реальной карточке, без layout shift.
    renderRecipeSkeletons(isAllMode ? 8 : (SKELETON_COUNTS[catId] || 4));

    // ── LOAD API RATINGS for Popular filter + accurate pills ────────────
    const _apiRatings = {}; // recipeId → { avg, count }
    let _popularActive = false;

    (async function loadApiRatings() {
        try {
            const res = await fetch(API_BASE + '/content/ratings');
            if (!res.ok) return;
            const data = await res.json();
            Object.assign(_apiRatings, data);
            Object.entries(_apiRatings).forEach(([rid]) => {
                updatePopStars(rid);
                updateRatingRow(rid);
            });
        } catch(e) { console.error('Ratings load error:', e); }
    })();

    function togglePopular(el) {
        _popularActive = !_popularActive;
        el.classList.toggle('on', _popularActive);
        syncFilterControls();
        renderDishes();
    }

    // Patch renderDishes to support popular sort
    const _origRenderDishes = renderDishes;
    renderDishes = function() {
        if (_popularActive) {
            const dishes = getDishesForView();
            dishes.sort((a, b) => {
                const ra = _apiRatings[a.id] || { avg: 0, count: 0 };
                const rb = _apiRatings[b.id] || { avg: 0, count: 0 };
                if (rb.avg !== ra.avg) return rb.avg - ra.avg;
                return rb.count - ra.count;
            });
            // Render sorted list (copy logic from original but with pre-sorted dishes)
            document.getElementById('dish-list').removeAttribute('aria-busy');
            document.getElementById('count-label').textContent = pluralR(dishes.length);
            if (!dishes.length) {
                const emptyMsg = searchQuery
                    ? 'По запросу «' + escHtml(searchQuery) + '» ничего не найдено.'
                    : 'Ничего не найдено. Измените фильтры.';
                document.getElementById('dish-list').innerHTML =
                    '<div style="grid-column:1/-1;text-align:center;padding:50px 20px;color:var(--text-3)">' + emptyMsg + '</div>';
                return;
            }
            const diff_labels = typeof DIFF_LABELS !== 'undefined' ? DIFF_LABELS : {};
            document.getElementById('dish-list').innerHTML = dishes.map(d => buildDishCard(d, diff_labels)).join('');
            dishes.forEach(d => { updatePopStars(d.id); updateRatingRow(d.id); });
        } else {
            _origRenderDishes();
        }
    };

    // Restore filter UI (chips + dropdown labels) if filters were loaded from sessionStorage
    (function syncFilterUI() {
        const tagFilters = ['free','gluten','plant','fish','noSoy','legumes'];
        tagFilters.forEach(function(f) {
            if (activeFilters[f]) {
                const chip = document.querySelector(`.filter-chip[data-f="${f}"]`);
                if (chip) chip.classList.add('on');
            }
        });
        ['time','difficulty'].forEach(function(f) {
            if (activeFilters[f] !== undefined) {
                const v = String(activeFilters[f]);
                const chip = document.querySelector(`.fgroup-drop .filter-chip[data-f="${f}"][data-v="${v}"]`);
                if (!chip) return;
                chip.classList.add('on');
                const btnId = f === 'time' ? 'fg-time-btn' : 'fg-diff-btn';
                const btn = document.getElementById(btnId);
                if (btn) {
                    btn.classList.add('has-value');
                    btn.querySelector('.fg-label').textContent = chip.textContent.trim();
                }
            }
        });
        const hasMoreFilter = ['gluten','plant','fish','noSoy','legumes'].some(f => activeFilters[f]);
        const more = document.getElementById('category-more-filters');
        const moreBtn = document.querySelector('[aria-controls="category-more-filters"]');
        if (hasMoreFilter && more && moreBtn) {
            more.classList.add('is-open');
            moreBtn.setAttribute('aria-expanded', 'true');
        }
        const outer = document.querySelector('.cat-page .filter-outer');
        if (outer) outer.classList.toggle('has-active', Object.keys(activeFilters).length > 0);
    })();

    function goToRecipe(id) {
        if (searchQuery) {
            location.href = `recipe.html?id=${encodeURIComponent(id)}&from=search&q=${encodeURIComponent(searchQuery)}`;
        } else if (isAllMode) {
            location.href = `recipe.html?id=${encodeURIComponent(id)}&from=all`;
        } else {
            location.href = `recipe.html?id=${encodeURIComponent(id)}&from=${encodeURIComponent(catId)}`;
        }
    }

    // showLockedMsg() централизован в data-v2.js (общий для index/category/ingredient)

    function toggleFav(id) {
        // Гость: избранное недоступно — отправляем на login.
        if (Auth.isGuest()) { location.href = Auth._loginUrl(); return; }
        const isNowFav = Favorites.toggle(id);
        const btn = document.getElementById('fav-' + id);
        if (btn) btn.classList.toggle('active', isNowFav);
    }

    // ── RATING POPUP ─────────────────────────────────────────────────────────
    let activePopId = null;
    function openRatingPopup(recipeId, pillEl) {
        if (activePopId && activePopId !== recipeId) {
            document.getElementById('rpop-' + activePopId)?.classList.remove('open');
        }
        const pop = document.getElementById('rpop-' + recipeId);
        if (!pop) return;
        pop.classList.toggle('open');
        activePopId = pop.classList.contains('open') ? recipeId : null;
    }
    document.addEventListener('click', () => {
        if (activePopId) {
            document.getElementById('rpop-' + activePopId)?.classList.remove('open');
            activePopId = null;
        }
    });

    function updatePopStars(recipeId) {
        const ar = _apiRatings[recipeId];
        const filled = ar ? Math.round(ar.avg) : 0;
        document.querySelectorAll(`#rpop-${recipeId} .rp-star`).forEach((s, i) =>
            s.classList.toggle('filled', i < filled));
    }
    function hoverPopStar(recipeId, n) {
        document.querySelectorAll(`#rpop-${recipeId} .rp-star`).forEach((s, i) =>
            s.classList.toggle('filled', i < n));
    }
    function unhoverPopStar(recipeId) { updatePopStars(recipeId); }
    async function rateFromPop(recipeId, stars) {
        // Гость: оценить можно только после логина.
        if (Auth.isGuest()) {
            document.getElementById('rpop-' + recipeId)?.classList.remove('open');
            activePopId = null;
            location.href = Auth._loginUrl();
            return;
        }
        document.getElementById('rpop-' + recipeId)?.classList.remove('open');
        activePopId = null;
        // Отправить оценку на сервер
        try {
            const res = await Auth.api('/content/reviews', {
                method: 'POST',
                body: JSON.stringify({ recipe_id: recipeId, stars, text: '' })
            });
            if (res.ok) {
                showToast('Оценка сохранена ★');
                try {
                    const rr = await fetch(API_BASE + '/content/ratings');
                    if (rr.ok) {
                        const data = await rr.json();
                        Object.assign(_apiRatings, data);
                        updatePopStars(recipeId);
                        updateRatingRow(recipeId);
                    }
                } catch {}

            } else {
                showToast('Не удалось сохранить оценку');
            }
        } catch {
            showToast('Ошибка сети');
        }
    }

    // ── COMMENTS MODAL (API-based, synced with recipe.html) ─────────────────
    let commentsRecipeId = null;
    let _commentStars = 0;
    const _reviewsCache = {}; // recipeId → [reviews]

    function openComments(recipeId) {
        commentsRecipeId = recipeId;
        const r = RECIPES[recipeId] || {};
        document.getElementById('comments-title').textContent = `💬 ${r.name || 'Отзывы'}`;
        document.getElementById('comments-body').innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-3)">Загрузка…</div>';
        document.getElementById('comments-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
        loadCommentsFromAPI(recipeId);
    }
    function closeComments() {
        document.getElementById('comments-overlay').classList.remove('open');
        document.body.style.overflow = '';
        commentsRecipeId = null;
    }
    function closeCommentsIfOutside(e) {
        if (e.target === document.getElementById('comments-overlay')) closeComments();
    }

    async function loadCommentsFromAPI(recipeId) {
        try {
            const res = await fetch(API_BASE + '/content/reviews/' + encodeURIComponent(recipeId));
            if (!res.ok) throw new Error('API error');
            const reviews = await res.json();
            _reviewsCache[recipeId] = reviews;
            renderCommentsBody(reviews);
            updateCommentBadge(recipeId, reviews.length);
        } catch (e) {
            console.error('Reviews load error:', e);
            document.getElementById('comments-body').innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-3)">Не удалось загрузить отзывы</div>';
        }
    }

    function renderCommentsBody(reviews) {
        const user = Auth.getUser();
        const curUserId = user ? user.id : null;
        const isAdmin = user && user.role === 'admin';
        const hasOwnReview = reviews.some(rv => curUserId && rv.userId === curUserId);

        function starsHtml(n) {
            return [1,2,3,4,5].map(i =>
                `<span class="star${i <= n ? ' filled' : ''}" style="font-size:14px;${i <= n ? 'color:#f5a623' : 'color:#ddd'}">★</span>`
            ).join('');
        }
        function fmtDate(ts) {
            const d = new Date(ts);
            return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        }

        const list = reviews.length
            ? `<div class="comments-list">${reviews.map(rv => {
                const canDelete = isAdmin || (curUserId && rv.userId === curUserId);
                const avatarHtml = rv.avatar
                    ? `<img class="review-avatar" src="${escHtml(rv.avatar)}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                      + `<span class="review-avatar-fallback" style="display:none;width:36px;height:36px;border-radius:50%;background:var(--accent);color:#fff;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0">${escHtml(rv.author.charAt(0).toUpperCase())}</span>`
                    : `<span style="width:36px;height:36px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0">${escHtml(rv.author.charAt(0).toUpperCase())}</span>`;
                return `<div class="comment-item" style="display:flex;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border)">
                    <div style="flex-shrink:0">${avatarHtml}</div>
                    <div style="flex:1;min-width:0">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
                            <span style="font-weight:700;font-size:14px;color:var(--text)">${escHtml(rv.author)}</span>
                            <div style="display:flex;align-items:center;gap:6px">
                                <span style="font-size:11px;color:var(--text-3)">${fmtDate(rv.createdAt)}</span>
                                ${canDelete ? `<button style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:13px;padding:2px 4px;border-radius:4px" data-category-action="delete-review" data-review-id="${Number(rv.id)}" data-is-admin="${isAdmin ? 'true' : 'false'}" title="Удалить"><svg class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="5" y1="19" x2="19" y2="5"/></svg></button>` : ''}
                            </div>
                        </div>
                        <div style="margin-bottom:4px">${starsHtml(rv.stars)}</div>
                        ${rv.text ? `<div style="font-size:13px;color:var(--text);line-height:1.5">${escHtml(rv.text)}</div>` : ''}
                    </div>
                </div>`;
            }).join('')}</div>`
            : `<div style="text-align:center;padding:24px 0;color:var(--text-3);font-size:14px">Отзывов ещё нет. Поделитесь своим впечатлением.</div>`;

        _commentStars = 0;
        const formHtml = Auth.isLoggedIn() && !hasOwnReview
            ? `<div class="comments-form" style="margin-top:14px">
                <div class="c-star-row">
                    <label>Оценка:</label>
                    ${[1,2,3,4,5].map(i => `<span class="cstar" data-category-action="select-star" data-n="${i}">★</span>`).join('')}
                </div>
                <textarea class="c-input" id="c-text" placeholder="Ваш отзыв может помочь другим пользователям сделать выбор." rows="3"></textarea>
                <button class="btn btn-orange btn-full" id="c-submit-btn" onclick="submitComment()">Отправить</button>
            </div>`
            : Auth.isLoggedIn() && hasOwnReview
                ? `<div style="text-align:center;padding:16px;color:var(--text-3);font-size:13px">Вы уже оставили отзыв на этот рецепт</div>`
                : `<div style="text-align:center;padding:16px;color:var(--text-3);font-size:13px"><a href="${Auth._loginUrl()}" style="color:var(--accent);text-decoration:underline">Войдите</a>, чтобы оставить отзыв</div>`;

        document.getElementById('comments-body').innerHTML = list + formHtml;
    }

    function selectStar(n) {
        _commentStars = n;
        document.querySelectorAll('#comments-body .cstar').forEach((s, i) =>
            s.classList.toggle('on', i < n));
    }

    window.deleteCatReview = async function(id, isAdmin) {
        const ok = await showAppConfirm({
            title: 'Удалить отзыв?',
            text: 'Это действие нельзя отменить.',
            confirmText: 'Удалить',
            cancelText: 'Отмена',
            danger: true
        });
        if (!ok) return;
        try {
            const endpoint = isAdmin ? '/admin/reviews/' : '/content/reviews/';
            const res = await Auth.api(endpoint + id, { method: 'DELETE' });
            if (!res.ok) { showToast('Не удалось удалить'); return; }
            showToast('Отзыв удалён');
            loadCommentsFromAPI(commentsRecipeId);
        } catch (e) { showToast('Ошибка сети'); }
    };

    async function submitComment() {
        if (!_commentStars) { showToast('Выберите оценку'); return; }
        const text = (document.getElementById('c-text')?.value || '').trim();

        const btn = document.getElementById('c-submit-btn');
        if (btn) { btn.disabled = true; btn.textContent = '...'; }
        try {
            const body = { recipe_id: commentsRecipeId, stars: _commentStars, text: text || '⭐' };
            const res = await Auth.api('/content/reviews', {
                method: 'POST',
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                showToast(err.error || 'Ошибка');
                return;
            }
            showToast('Отзыв сохранён!');
            loadCommentsFromAPI(commentsRecipeId);
        } catch (e) {
            showToast('Ошибка сети');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Отправить'; }
        }
    }

    function updateCommentBadge(recipeId, cnt) {
        const cbtn = document.getElementById('cbtn-' + recipeId);
        if (!cbtn) return;
        let badge = cbtn.querySelector('.photo-comment-badge');
        if (cnt > 0) {
            if (!badge) { badge = document.createElement('div'); badge.className = 'photo-comment-badge'; cbtn.appendChild(badge); }
            badge.textContent = cnt;
        } else if (badge) {
            badge.remove();
        }
    }

    function escHtml(s) {
        return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    // ── FILTER GROUPS ─────────────────────────────────────────────────────────
    let openFGroup = null;

    function toggleFGroup(btn) {
        const dropId = btn.dataset.drop;
        const isOpen = openFGroup === dropId;
        closeFGroups();
        if (!isOpen) {
            const drop = document.getElementById(dropId);
            const rect = btn.getBoundingClientRect();
            drop.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
            drop.style.left = Math.max(8, rect.left) + 'px';
            drop.style.display = 'flex';
            btn.classList.add('open');
            openFGroup = dropId;
        }
    }
    function closeFGroups() {
        document.querySelectorAll('.fgroup-drop').forEach(d => d.style.display = 'none');
        document.querySelectorAll('.fgroup-btn.open').forEach(b => b.classList.remove('open'));
        openFGroup = null;
    }
    document.addEventListener('click', function(e) {
        if (!e.target.closest('[data-drop]') && !e.target.closest('.fgroup-drop')) closeFGroups();
    });

    function pickFilter(el, btnId) {
        const f = el.dataset.f, v = el.dataset.v;
        const btn   = document.getElementById(btnId);
        const drop  = document.getElementById(btn.dataset.drop);
        const alreadyOn = el.classList.contains('on');
        drop.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('on'));
        if (alreadyOn) {
            delete activeFilters[f];
            btn.classList.remove('has-value');
            btn.querySelector('.fg-label').textContent = btn.dataset.label;
        } else {
            el.classList.add('on');
            activeFilters[f] = f === 'time' ? (v === 'over60' ? 'over60' : +v) : v;
            btn.classList.add('has-value');
            btn.querySelector('.fg-label').textContent = el.textContent.trim();
        }
        closeFGroups();
        syncFilterControls();
        renderDishes();
    }

    function toggleTagFilter(el) {
        const f = el.dataset.f;
        if (el.classList.contains('on')) { el.classList.remove('on'); delete activeFilters[f]; }
        else { el.classList.add('on'); activeFilters[f] = true; }
        syncFilterControls();
        renderDishes();
    }

    function toggleMoreFilters(btn) {
        const panel = document.getElementById(btn.getAttribute('aria-controls'));
        const open = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(open));
        if (panel) panel.classList.toggle('is-open', open);
    }

    function syncFilterControls() {
        const outer = document.querySelector('.cat-page .filter-outer');
        if (outer) outer.classList.toggle('has-active', Object.keys(activeFilters).length > 0 || _popularActive);
    }

    function clearFilters() {
        Object.keys(activeFilters).forEach(k => delete activeFilters[k]);
        _popularActive = false;
        const popularChip = document.querySelector('.filter-chip[data-f="popular"]');
        if (popularChip) popularChip.classList.remove('on');
        document.querySelectorAll('.filter-chip.on').forEach(c => c.classList.remove('on'));
        document.querySelectorAll('.fgroup-btn').forEach(b => {
            b.classList.remove('has-value');
            b.querySelector('.fg-label').textContent = b.dataset.label;
        });
        closeFGroups();
        syncFilterControls();
        renderDishes();
    }

    // My plate modal (editorial V1)
    function openPlate() {
        // Гость: тарелка — фича только для зарегистрированных, ведём на login.
        if (Auth.isGuest()) { location.href = Auth._loginUrl(); return; }
        const items = Plate.get();
        const body = document.getElementById('plate-body');
        if (!items.length) {
            body.innerHTML = `<div class="pv1-empty">
                <div class="pv1-eyebrow">Пока пусто</div>
                <h2 class="pv1-headline">Соберите первый приём пищи</h2>
                <div class="pv1-divider"></div>
                <p class="pv1-sub">Выберите рецепт из категории — и он попадёт сюда. КБЖУ пересчитаются автоматически.</p>
                <button class="pv1-cta" onclick="closePlate()">Продолжить выбирать</button>
            </div>`;
        } else {
            const t = Plate.totals();
            const list = items.map((item, i) => {
                const safeName = escHtml(String(item.name || ''));
                const nameHtml = item.recipeId
                    ? `<a class="pv1-item-name is-link" href="recipe.html?id=${encodeURIComponent(item.recipeId)}&from=plate&simple=1">${safeName}</a>`
                    : `<div class="pv1-item-name">${safeName}</div>`;
                return `<div class="pv1-item">
                    ${item.photo
                        ? `<img class="pv1-item-photo" src="${escHtml(String(item.photo))}" alt="">`
                        : `<div class="pv1-item-emoji">${escHtml(String(item.emoji || '🍴'))}</div>`}
                    <div class="pv1-item-main">
                        ${nameHtml}
                        <div class="pv1-item-meta">${Number(item.kcal) || 0} ккал · Б ${Number(item.protein) || 0} · Ж ${Number(item.fat) || 0} · У ${Number(item.carbs) || 0} · Кл ${Number(item.fiber) || 0}</div>
                    </div>
                    <button class="pv1-item-del" data-category-action="remove-plate-item" data-index="${Number(i)}" aria-label="Удалить"><svg class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="5" y1="19" x2="19" y2="5"/></svg></button>
                </div>`;
            }).join('');
            body.innerHTML = `<div class="pv1-items">${list}</div>
                <div class="pv1-totals">
                    <div class="pv1-totals-label">Итого за приём</div>
                    <div class="pv1-totals-grid">
                        <div class="pv1-tot is-kcal"><div class="pv1-tot-num">${Number(t.kcal) || 0}</div><div class="pv1-tot-key">Ккал</div></div>
                        <div class="pv1-tot"><div class="pv1-tot-num">${Number(t.protein) || 0}</div><div class="pv1-tot-key">Белки, г</div></div>
                        <div class="pv1-tot"><div class="pv1-tot-num">${Number(t.fat) || 0}</div><div class="pv1-tot-key">Жиры, г</div></div>
                        <div class="pv1-tot"><div class="pv1-tot-num">${Number(t.carbs) || 0}</div><div class="pv1-tot-key">Углев., г</div></div>
                        <div class="pv1-tot"><div class="pv1-tot-num">${Number(t.fiber) || 0}</div><div class="pv1-tot-key">Клетч., г</div></div>
                    </div>
                </div>
                ${plateMealTypePickerHtml()}
                <div class="pv1-actions">
                    <div class="pv1-actions-row">
                        <button class="pv1-btn" onclick="location.href='index.html'">← На главную</button>
                        <button class="pv1-btn" onclick="shareShoppingList()">Список продуктов</button>
                    </div>
                    <button class="pv1-btn pv1-btn-primary pv1-btn-full" onclick="savePlateCat()">Записать тарелку в журнал</button>
                </div>`;
        }
        document.getElementById('plate-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function closePlate() {
        document.getElementById('plate-overlay').classList.remove('open');
        document.body.style.overflow = '';
    }
    function closePlateIfOutside(e) { if (e.target === document.getElementById('plate-overlay')) closePlate(); }
    function removeItemCat(i) { Plate.remove(i); updatePlateIcon(); openPlate(); }
    function savePlateCat() {
        if (!Plate.count()) return;
        Plate.saveHistory(getSelectedPlateMealType());
        updatePlateIcon();
        closePlate();
        showToast('Тарелка записана в журнал 🎉');
    }

// CSP: static recipe filters migrated from HTML event attributes.
document.querySelectorAll('[data-filter-action]').forEach(function (control) {
    control.addEventListener('click', function () {
        var action = control.dataset.filterAction;
        if (action === 'toggle-group') toggleFGroup(control);
        else if (action === 'toggle-tag') toggleTagFilter(control);
        else if (action === 'toggle-popular') togglePopular(control);
        else if (action === 'toggle-more') toggleMoreFilters(control);
        else if (action === 'clear') clearFilters();
        else if (action === 'pick') pickFilter(control, control.dataset.filterOwner);
    });
});

// CSP: static plate and comments modal controls migrated from HTML attributes.
document.querySelectorAll('[data-modal-action]').forEach(function (control) {
    control.addEventListener('click', function (event) {
        var action = control.dataset.modalAction;
        if (action === 'close-comments-outside') closeCommentsIfOutside(event);
        else if (action === 'close-comments') closeComments();
        else if (action === 'close-plate-outside') closePlateIfOutside(event);
        else if (action === 'close-plate') closePlate();
        else if (action === 'save-plate') savePlate();
    });
});
