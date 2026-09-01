		const _accessReady = Auth.checkAccess({ allowGuest: true });
		updatePlateIcon();

		// User pill init — для гостя ставим «Войти», прячем dropdown.
		(function () {
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
			// Гость: ведём на login.
			if (Auth.isGuest()) {
				e.preventDefault();
				location.href = Auth._loginUrl();
				return;
			}
			e.stopPropagation();
			document.getElementById('user-dropdown').classList.toggle('open');
		}

		// Навигация хедера — единый билдер (header-nav.js). На странице рецепта
		// активен продуктовый контекст «Рецепты».
		function renderHeaderNav(activeCatId) {
			if (window.SP_HEADER && typeof window.SP_HEADER.render === 'function') {
				window.SP_HEADER.render({ activeCat: activeCatId || null, activeNav: 'recipes' });
			}
		}
		// Ранний рендер: дропдаун «Ингредиенты» и ссылки не зависят от API.
		renderHeaderNav();
		document.addEventListener('click', function (e) {
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

		// Фото-заглушки по категориям (временно — из блога и гайда)
		const PHOTO_BY_CAT = {
			breakfasts: SITE_BASE + '/images/blog/post-290.webp',
			soups: SITE_BASE + '/images/recipes/red-lentil-mushroom-soup/red-lentil-mushroom-soup-cover.webp',
			mains: SITE_BASE + '/images/cook-healthy-food.webp',
			pancakes: SITE_BASE + '/images/blog/random-pic-blog-2.webp',
			spreads: SITE_BASE + '/images/blog/random-pic-blog-3.webp',
			sauces: SITE_BASE + '/images/recipes/cashew-sauce/cashew-sauce-cover.webp',
			salads: SITE_BASE + '/images/blog/random-pic-blog-4.webp',
			drinks: SITE_BASE + '/images/blog/random-pic-blog-1.webp',
			_sides: SITE_BASE + '/images/blog/post-281.webp',
		};
		const PHOTO_FALLBACK = SITE_BASE + '/images/background-guide.webp';

		// Prepend voronova.online to relative image paths. Images live in the main site repo,
		// so editor entries like "images/recipes/foo/bar.webp" must be resolved to the main domain.
		function photoUrl(p) {
			if (!p) return p;
			if (/^(https?:|data:|blob:)/i.test(p)) return p;
			const url = SITE_BASE + '/' + p.replace(/^\/+/, '');
			if (!/\/images\/recipes\//.test(url)) return url;
			return url + (url.includes('?') ? '&' : '?') + 'v=' + RECIPE_IMAGE_VERSION;
		}

		function updateRecipeScrollControls() {
			const header = document.getElementById('hdr');
			if (header) header.classList.toggle('scrolled', scrollY > 10);
			const backToTop = document.getElementById('recipe-back-to-top');
			if (backToTop) backToTop.hidden = scrollY < 600;
		}
		function scrollRecipeElementIntoView(element, block) {
			if (!element) return;
			const root = document.documentElement;
			const previousBehavior = root.style.scrollBehavior;
			root.style.scrollBehavior = 'auto';
			element.scrollIntoView({ behavior: 'auto', block: block || 'start' });
			requestAnimationFrame(() => { root.style.scrollBehavior = previousBehavior; });
		}
		function scrollRecipeToTop() {
			const root = document.documentElement;
			const previousBehavior = root.style.scrollBehavior;
			root.style.scrollBehavior = 'auto';
			window.scrollTo(0, 0);
			requestAnimationFrame(() => { root.style.scrollBehavior = previousBehavior; });
		}
		window.addEventListener('scroll', updateRecipeScrollControls, { passive: true });
		updateRecipeScrollControls();

		(function initRecipeSidebarOffset() {
			const root = document.documentElement;
			function update() {
				const header = document.getElementById('hdr');
				if (!header || window.matchMedia('(max-width: 1024px)').matches) {
					root.style.removeProperty('--recipe-sidebar-top');
					root.style.removeProperty('--recipe-sidebar-max-height');
					return;
				}
				const top = Math.max(96, Math.round(header.getBoundingClientRect().height + 16));
				const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
				const maxHeight = Math.max(120, Math.floor(viewportHeight - top - 16));
				root.style.setProperty('--recipe-sidebar-top', `${top}px`);
				root.style.setProperty('--recipe-sidebar-max-height', `${maxHeight}px`);
			}
			update();
			window.addEventListener('resize', update, { passive: true });
			window.addEventListener('load', update, { passive: true });
			if (window.visualViewport) window.visualViewport.addEventListener('resize', update, { passive: true });
		})();

		// iOS browser chrome changes the visible viewport while scrolling. Keep fixed
		// recipe overlays below its current top edge instead of letting the header hide behind it.
		(function initMobileViewportOffset() {
			const root = document.documentElement;
			let lastOffset = null;
			function update() {
				if (!window.matchMedia('(max-width: 767px)').matches) {
					root.style.removeProperty('--recipe-mobile-viewport-offset');
					lastOffset = null;
					return;
				}
				const offset = window.visualViewport ? Math.max(0, window.visualViewport.offsetTop || 0) : 0;
				if (offset === lastOffset) return;
				root.style.setProperty('--recipe-mobile-viewport-offset', `${offset}px`);
				lastOffset = offset;
			}
			update();
			window.addEventListener('resize', update, { passive: true });
			window.addEventListener('scroll', update, { passive: true });
			if (window.visualViewport) {
				window.visualViewport.addEventListener('resize', update, { passive: true });
				window.visualViewport.addEventListener('scroll', update, { passive: true });
			}
		})();

		const params = new URLSearchParams(location.search);
		const recipeId = params.get('id');
		const fromCat = params.get('from') || '';
		const searchQ = (params.get('q') || '').trim();
		const simpleMode = params.get('simple') === '1';
		const parentRecipeId = params.get('parentRecipeId') || '';
		const sourceParam = params.get('source') || '';
		const isAdminPreview = sourceParam === 'admin-preview';

		// Build a recipe-page URL that preserves the current navigation context
		// (search query, category, plate, simple mode). All internal recipe→recipe
		// links go through this so back-button chains stay coherent.
		function recipeLink(id, opts) {
			opts = opts || {};
			const qs = new URLSearchParams();
			qs.set('id', id);
			if (fromCat === 'search' && searchQ) {
				qs.set('from', 'search');
				qs.set('q', searchQ);
			} else if (fromCat) {
				qs.set('from', fromCat);
			}
			if (opts.asIngredient) qs.set('asIngredient', '1');
			if (opts.parentRecipeId) qs.set('parentRecipeId', opts.parentRecipeId);
			if (opts.simple || simpleMode) qs.set('simple', '1');
			return 'recipe.html?' + qs.toString();
		}
		let r, cat;

		// Must be declared before renderRecipe is called (used inside buildGroup)
		const subItemRegistry = {};

		// Steps UX state (mobile compact + stepper) — reset per-recipe in initStepsUI
		let _stepsHtmlArr = [];
		let _stepsCollapsed = true;
		let _stepperMode = false;
		let _stepperIdx = 0;
		let _stepperDone = [];
		const stepperIcons = {
			step: '<svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M2 12a10 10 0 1 1 20 0c0 3.2-1.5 5.1-3.2 6.7-.9.8-1.8 1.6-2.3 2.3H7.5c-.5-.7-1.4-1.5-2.3-2.3C3.5 17.1 2 15.2 2 12z"/></svg>',
			list: '<svg viewBox="0 0 24 24"><path d="M8 5h12"/><path d="M8 12h12"/><path d="M8 19h12"/><path d="M3.5 5h.01"/><path d="M3.5 12h.01"/><path d="M3.5 19h.01"/></svg>'
		};

		function initStepsUI() {
			_stepsCollapsed = true;
			_stepperMode = false;
			_stepperIdx = 0;
			_stepperDone = _stepsHtmlArr.map(() => false);
			applyStepsUI();
			maybeShowStepsHint();
		}
		function applyStepsUI() {
			const list = document.getElementById('steps-list');
			const stepper = document.getElementById('steps-stepper');
			const expandBtn = document.getElementById('steps-expand-btn');
			const modeBtn = document.getElementById('steps-mode-btn');
			const modeLabel = document.getElementById('steps-mode-label');
			const modeIcon = document.getElementById('steps-mode-icon');
			if (!list) return;
			if (_stepperMode && stepper) {
				list.hidden = true;
				if (expandBtn) expandBtn.hidden = true;
				stepper.hidden = false;
				if (modeLabel) modeLabel.textContent = 'Списком';
				if (modeIcon) modeIcon.innerHTML = stepperIcons.list;
				if (modeBtn) modeBtn.classList.add('on');
				renderStepperCurrent();
			} else {
				list.hidden = false;
				if (stepper) stepper.hidden = true;
				list.classList.toggle('is-collapsed', _stepsCollapsed);
				if (expandBtn) {
					expandBtn.hidden = false;
					const label = document.getElementById('steps-expand-label');
					if (label) {
						label.textContent = _stepsCollapsed
							? 'Показать все шаги (' + _stepsHtmlArr.length + ')'
							: 'Свернуть';
					}
					const arrow = document.getElementById('steps-expand-arrow');
					if (arrow) arrow.textContent = _stepsCollapsed ? '▾' : '▴';
				}
				if (modeLabel) modeLabel.textContent = 'Пошагово';
				if (modeIcon) modeIcon.innerHTML = stepperIcons.step;
				if (modeBtn) modeBtn.classList.remove('on');
			}
		}
		function toggleStepsExpanded() {
			_stepsCollapsed = !_stepsCollapsed;
			applyStepsUI();
		}
		function toggleStepperMode() {
			_stepperMode = !_stepperMode;
			if (_stepperMode) {
				_stepperIdx = 0;
				dismissStepsHint();
			}
			applyStepsUI();
		}
		function dismissStepsHint() {
			const hint = document.getElementById('steps-hint');
			if (hint) hint.hidden = true;
			try { localStorage.setItem('stepsHintDismissed', '1'); } catch (e) { }
		}
		function maybeShowStepsHint() {
			const hint = document.getElementById('steps-hint');
			if (!hint) return;
			let dismissed = false;
			try { dismissed = localStorage.getItem('stepsHintDismissed') === '1'; } catch (e) { }
			hint.hidden = dismissed;
		}
		function renderStepperCurrent() {
			const wrap = document.getElementById('stepper-current');
			if (!wrap || !_stepsHtmlArr.length) return;
			wrap.innerHTML = _stepsHtmlArr[_stepperIdx] || '';
			const cur = document.getElementById('stepper-current-n');
			if (cur) cur.textContent = String(_stepperIdx + 1);
			renderStepperProgress();
			const done = !!_stepperDone[_stepperIdx];
			const cb = document.getElementById('stepper-done-cb');
			if (cb) {
				cb.checked = done;
				cb.setAttribute('aria-label', 'Шаг ' + (_stepperIdx + 1) + (done ? ' выполнен' : ' не выполнен'));
			}
			const item = wrap.querySelector('.step-item');
			if (item) item.classList.toggle('is-done', done);
			const prev = document.getElementById('stepper-prev');
			const next = document.getElementById('stepper-next');
			if (prev) {
				prev.hidden = _stepperIdx === 0;
				prev.disabled = _stepperIdx === 0;
			}
			if (next) next.disabled = _stepperIdx >= _stepsHtmlArr.length - 1;
		}
		function renderStepperProgress() {
			const bar = document.getElementById('stepper-bar');
			if (!bar || !_stepsHtmlArr.length) return;
			bar.innerHTML = _stepsHtmlArr.map((_, i) => {
				const cls = [
					'stepper-bar-segment',
					_stepperDone[i] ? 'is-done' : '',
					i === _stepperIdx ? 'is-current' : ''
				].filter(Boolean).join(' ');
				return '<span class="' + cls + '"></span>';
			}).join('');
		}
		function stepperPrev() {
			if (_stepperIdx > 0) { _stepperIdx--; renderStepperCurrent(); }
		}
		function stepperNext() {
			if (_stepperIdx < _stepsHtmlArr.length - 1) { _stepperIdx++; renderStepperCurrent(); }
		}
		function toggleStepperDone() {
			const cb = document.getElementById('stepper-done-cb');
			if (!cb) return;
			const done = cb.checked;
			_stepperDone[_stepperIdx] = done;
			const wrap = document.getElementById('stepper-current');
			const item = wrap && wrap.querySelector('.step-item');
			if (item) item.classList.toggle('is-done', done);
			renderStepperProgress();
			cb.setAttribute('aria-label', 'Шаг ' + (_stepperIdx + 1) + (done ? ' выполнен' : ' не выполнен'));
		}
		function stepPhotoCarouselMove(btn, dir) {
			const carousel = btn && btn.closest('.step-photo-carousel');
			if (!carousel) return;
			const imgs = Array.from(carousel.querySelectorAll('.step-photo-img'));
			const available = imgs.map((img, index) => img.hidden ? -1 : index).filter(index => index >= 0);
			if (available.length < 2) return;
			let idx = parseInt(carousel.getAttribute('data-index') || '0', 10);
			let position = available.indexOf(idx);
			if (position < 0) position = 0;
			idx = available[(position + dir + available.length) % available.length];
			carousel.setAttribute('data-index', String(idx));
			imgs.forEach((img, i) => img.classList.toggle('is-active', i === idx));
			carousel.querySelectorAll('.step-photo-dot').forEach((dot, i) => {
				dot.classList.toggle('is-active', i === idx);
			});
			const current = carousel.querySelector('[data-carousel-current]');
			if (current) current.textContent = String(idx + 1);
		}
		function markRecipeImageError(image) {
			if (!image) return;
			image.hidden = true;
			const carousel = image.closest('.step-photo-carousel');
			if (carousel) {
				const imgs = Array.from(carousel.querySelectorAll('.step-photo-img'));
				const nextIndex = imgs.findIndex(img => !img.hidden);
				if (nextIndex >= 0) {
					imgs.forEach((img, index) => img.classList.toggle('is-active', index === nextIndex));
					carousel.setAttribute('data-index', String(nextIndex));
					carousel.querySelectorAll('.step-photo-dot').forEach((dot, index) => dot.classList.toggle('is-active', index === nextIndex));
					const current = carousel.querySelector('[data-carousel-current]');
					if (current) current.textContent = String(nextIndex + 1);
				} else {
					carousel.classList.add('is-image-error');
				}
				return;
			}
			const frame = image.closest('.step-photo-wrap, .step-photo-carousel, .recipe-ingredients-photo');
			// The ingredients photo is optional. A number of recipes have a cover/final
			// shot but no separate `-start` frame, so do not leave an error card between
			// the ingredients and the preparation steps.
			if (frame && frame.classList.contains('recipe-ingredients-photo')) {
				frame.remove();
				return;
			}
			if (frame) frame.classList.add('is-image-error');
		}

		// ── SIDEBAR PLACEMENT (mobile ↔ desktop) ────────────────────────
		function placeSidebarForViewport() {
			const m = document.getElementById('sidebar-mobile');
			const d = document.getElementById('sidebar-desktop');
			if (!m || !d) return;
			const isMobile = window.innerWidth <= 1024;
			if (isMobile) {
				// Move children from desktop → mobile (if not already there)
				if (d.firstChild) {
					while (d.firstChild) m.appendChild(d.firstChild);
				}
				m.style.display = m.children.length ? 'block' : 'none';
				d.style.display = 'none';
			} else {
				// Move children from mobile → desktop
				if (m.firstChild) {
					while (m.firstChild) d.appendChild(m.firstChild);
				}
				m.style.display = 'none';
				d.style.display = '';
			}
		}

		// Debounced resize handler
		let _sidebarResizeTimer = null;
		window.addEventListener('resize', function () {
			clearTimeout(_sidebarResizeTimer);
			_sidebarResizeTimer = setTimeout(placeSidebarForViewport, 150);
		});

		function initRecipe() {
			r = RECIPES[recipeId];
			cat = (fromCat && fromCat !== 'plate' && fromCat !== 'search') ? CATEGORIES[fromCat] : null;
			if (window.SmartPlateSEO) {
				if (r) {
					SmartPlateSEO.setRecipe(r);
				} else {
					SmartPlateSEO.setPage({
						title: 'Рецепт не найден — Умная тарелка',
						description: 'Запрошенный рецепт не найден. Откройте каталог полезных рецептов «Умной тарелки».',
						canonical: SmartPlateSEO.origin + '/recipe.html',
						noindex: true
					});
				}
			}

			// Back button. На мобильном хедере стрелка «Назад» заменена бургером
			// (drawer), поэтому элемент #back-btn может отсутствовать — весь блок
			// под guard, чтобы не падать. Контекст «откуда пришли» остаётся в
			// хлебных крошках (mid) ниже.
			const backBtn = document.getElementById('back-btn');
			const parent = (parentRecipeId && parentRecipeId !== recipeId && RECIPES[parentRecipeId]) ? RECIPES[parentRecipeId] : null;
			if (backBtn) {
				const backLabel = document.getElementById('back-label');
				if (isAdminPreview && recipeId) {
					const editorUrl = 'recipe-editor.html?id=' + encodeURIComponent(recipeId);
					backBtn.onclick = () => location.href = editorUrl;
					if (backLabel) backLabel.textContent = 'Редактор';
				} else if (parent) {
					const parentUrl = recipeLink(parentRecipeId);
					backBtn.onclick = () => location.href = parentUrl;
					if (backLabel) backLabel.textContent = parent.name;
				} else if (fromCat === 'plate') {
					backBtn.onclick = () => location.href = 'index.html';
					if (backLabel) backLabel.textContent = 'Тарелка';
				} else if (fromCat === 'search') {
					if (searchQ) {
						const searchUrl = 'category.html?q=' + encodeURIComponent(searchQ);
						backBtn.onclick = () => location.href = searchUrl;
						if (backLabel) backLabel.textContent = 'Поиск';
					} else {
						backBtn.onclick = () => location.href = 'index.html';
					}
				} else if (fromCat === 'all') {
					backBtn.onclick = () => location.href = 'category.html';
					if (backLabel) backLabel.textContent = 'Все рецепты';
				} else {
					backBtn.onclick = () => fromCat ? location.href = 'category.html?cat=' + fromCat : location.href = 'index.html';
					if (cat && backLabel) backLabel.textContent = cat.name;
				}
			}

			if (!r) {
				document.getElementById('page-content').innerHTML =
					'<div style="text-align:center;padding:80px 20px">' +
					'<div style="font-size:48px">😕</div>' +
					'<div style="font-size:16px;color:var(--text-2);margin-top:12px">Рецепт не найден</div>' +
					'<button class="recipe-inline-action" style="margin-top:20px" data-recipe-action="history-back">← Назад</button>' +
					'</div>';
			} else if (!Auth.canViewRecipe(r)) {
				// Нет доступа — preview-state по матрице из docs/guest-mode-mvp.md §6.4
				renderRecipePreview(r);
			} else if (r.isSublist) {
				renderSublist(r);
			} else {
				renderRecipe(r);
				setTimeout(loadReviews, 300);
			}
		} // end initRecipe

		// Preview-режим для locked-рецепта. Никаких пустых блоков ingredients/steps/note —
		// один CTA-блок вместо них.
		function renderRecipePreview(r) {
			document.title = r.name + ' — рецепт | Умная тарелка';
			const cta = Auth.recipePaywallCta(r) || {
				title: 'Доступ к рецепту ограничен',
				btn: 'Оформить подписку',
				href: 'cabinet.html?tab=subscription',
			};
			const photo = r.photo
				? (Array.isArray(r.photo) ? r.photo[0] : (r.photo === true ? '' : r.photo))
				: '';
			const photoSrc = photo ? photoUrl(photo) : '';
			const diffLabel = (typeof DIFF_LABELS !== 'undefined' && DIFF_LABELS[r.diff]) || r.diff || '';
			const timeMeta = formatTimeMeta(r.time, r.timeLabel);
			const quote = String(r.quote || '').replace(/^[«"']|[»"']$/g, '').trim();
			const tagLabels = { gluten: 'Без глютена', plant: 'Растительное', fish: 'Рыбное', noSoy: 'Без сои', legumes: 'Бобовые' };
			const tagsHtml = Array.isArray(r.tags) && r.tags.length
				? '<div class="rp-tags">' + r.tags.map(t => '<span class="rp-tag">' + escHtml(tagLabels[t] || t) + '</span>').join('') + '</div>'
				: '';
			const photoBlock = photoSrc
				? '<div class="rp-photo"><img src="' + escHtml(photoSrc) + '" alt="' + escHtml(r.name) + '" data-recipe-image-fallback="hide"></div>'
				: '';

			document.getElementById('page-content').innerHTML =
				'<div class="recipe-preview">' +
					photoBlock +
					'<h1 class="rp-title">' + escHtml(r.name) + '</h1>' +
					(quote ? '<div class="rp-quote">«' + escHtml(quote) + '»</div>' : '') +
					'<div class="rp-meta">' +
						'<span class="rp-meta-item"><strong>' + (Number(r.kcal) || 0) + '</strong> ккал</span>' +
						'<span class="rp-meta-item">Б ' + (Number(r.protein) || 0) + 'г</span>' +
						'<span class="rp-meta-item">Ж ' + (Number(r.fat) || 0) + 'г</span>' +
						'<span class="rp-meta-item">У ' + (Number(r.carbs) || 0) + 'г</span>' +
					'</div>' +
					'<div class="rp-meta rp-meta-sub">' +
						'<span>⏱ ' + escHtml(timeMeta.short) + '</span>' +
						'<span>· ' + escHtml(diffLabel) + '</span>' +
						(timeMeta.note ? '<span style="flex-basis:100%;margin-top:-3px">↳ ' + escHtml(timeMeta.note) + '</span>' : '') +
					'</div>' +
					tagsHtml +
					'<div class="rp-cta-block">' +
						'<div class="rp-cta-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>' +
						'<div class="rp-cta-title">' + escHtml(cta.title) + '</div>' +
						'<a class="rp-cta-btn" href="' + escHtml(cta.href) + '">' + escHtml(cta.btn) + '</a>' +
						(cta.noteLines && cta.noteLines.length
							? '<div class="rp-cta-note">'
								+ cta.noteLines.map(function(line) { return '<p>' + escHtml(line) + '</p>'; }).join('')
								+ (cta.tariffsHref ? '<a class="rp-cta-tariffs" href="' + escHtml(cta.tariffsHref) + '">Посмотреть все тарифы</a>' : '')
								+ '</div>'
							: '') +
					'</div>' +
				'</div>';
		}

		// Для гостя Favorites/Plate не подгружаем — это серверные синки за токеном.
		const _authedLoaders = Auth.isLoggedIn() ? [Favorites.load(), Plate.load()] : [];
		Promise.all([loadContent(), _accessReady, ..._authedLoaders]).then(function () {
			if (isContentError()) {
				showApiError(document.getElementById('page-content'));
				return;
			}
			initRecipe();
			// Server-rendered recipe metadata is visible before this JS app loads.
			// Remove the temporary article only after the normal recipe UI rendered.
			const seoRecipeContent = document.getElementById('seo-recipe-content');
			if (seoRecipeContent) seoRecipeContent.remove();
			// Editorial header parity: подставляем nav с подсветкой текущего раздела рецепта.
			renderHeaderNav(r && r.cat);
		}).catch(function (err) {
			console.error('Recipe render error:', err);
			var pc = document.getElementById('page-content');
			if (pc) pc.innerHTML = '<div style="text-align:center;padding:40px;color:red">Ошибка: ' + escHtml(err.message) + '</div>';
		});

		// ── SUBLIST (e.g. Здоровые бутерброды → список намазок) ─────────────
		function renderSublist(r) {
			document.title = r.name + ' — рецепт | Умная тарелка';
			const items = (r.subItems || []).map(id => RECIPES[id]).filter(Boolean);
			const html = `
            <div class="anim">
                <div style="font-size:40px;margin-bottom:10px">${escHtml(r.emoji)}</div>
                <h1 class="recipe-title" style="margin-bottom:6px">${escHtml(r.name)}</h1>
                <div class="sublist-note">Выберите намазку — откроется её рецепт</div>
                <div class="sublist-items">
                    ${items.map(item => `
                        <button class="dish-card anim" data-recipe-href="${escHtml(recipeLink(item.id, { parentRecipeId: r.id || recipeId }))}">
                            <div class="dish-emoji-box" style="background:var(--green-l)">${escHtml(item.emoji)}</div>
                            <div class="dish-info">
                                <div class="dish-name">${escHtml(item.name)}</div>
                                <div class="dish-meta">
                                    <span class="pill">${typeof timeIcon === 'function' ? timeIcon() : ''}${item.timeLabel ? escHtml(item.timeLabel) : Number(item.time) + ' мин'}</span>
                                    <span class="pill">${typeof diffIcon === 'function' ? diffIcon(item.diff) : ''}${escHtml(DIFF_LABELS[item.diff] || item.diff)}</span>
                                </div>
                            </div>
                            <div class="dish-kcal">${Number(item.kcal)}<span>ккал</span></div>
                            <div class="dish-arrow">›</div>
                        </button>`).join('')}
                </div>
                ${r.tip ? `<div class="julia-tip anim" style="margin-top:20px">
                    <img src="https://voronova.online/images/YV-small.webp" alt="Юлия" class="julia-tip-ava" data-recipe-image-fallback="hide">
                    <div class="julia-tip-bubble">
                        <div class="julia-tip-text">«${escHtml(r.tip)}»</div>

                    </div>
                </div>` : ''}
            </div>`;
			document.getElementById('page-content').innerHTML = html;
		}

		// ── RECIPE PAGE ───────────────────────────────────────────────────────
		let checkedItems = {};

		// Balance state
		let _balGroups = []; // all shown groups, including optional ones
		let _balRequired = []; // subset of _balGroups that affects balance
		let _wasBalanced = false;
		let _celebrationShown = false;
		let _balBannerObserver = null;

		// Add-on groups: collapse state + per-group config for re-rendering
		let expandedGroups = { p: false, f: false, c: false, fi: false };
		const _groupConfig = {}; // { p: {label, items, icon, title, stepIndex}, ... }
		const GROUP_COLLAPSE_LIMIT = 3;

		// Balance wizard (mobile ≤1024) — current step index into _balGroups
		let _wizardStep = 0;
		let _wizardCollapsed = false;
		// Desktop accordion — per-prefix open/closed. First group open by default.
		let _accordionOpen = { p: true, f: false, c: false, fi: false };
		// Static metadata per group (desktop/mobile title, colors)
		const GROUP_META = {
			p:  { title: 'Добавь белка для сытости',   color: '#1a5fa8', bg: '#edf5ff', border: '#b8d4f8', shortLabel: 'Белок' },
			f:  { title: 'Добавь жиров для баланса',   color: '#2d7a2d', bg: '#eef8ee', border: '#90d090', shortLabel: 'Жиры' },
			c:  { title: 'Добавь углеводов для энергии', color: '#b85e00', bg: '#fff7ec', border: '#f0c080', shortLabel: 'Углеводы' },
			fi: { title: 'Добавь клетчатки',           color: '#6a3db8', bg: '#f5f0ff', border: '#c0a0f0', shortLabel: 'Клетчатка' }
		};

		// Звук готовности включён всегда. Пользовательского переключателя и
		// сохранённой настройки нет; первый жест только разблокирует browser audio.
		const SOUND_ASSETS = {
			balanceReady: ['sounds/plate-is-ready.mp3', 'platform/sounds/plate-is-ready.mp3']
		};
		let _balanceAudio = null;
		let _balanceAudioSrcIndex = 0;
		let _audioCtx = null;
		let _audioMode = 'mp3';
		let _audioPrimeStarted = false;

		// Ingredient swaps — per-ingredient metadata + currently-applied replacements.
		// _swapInfo[i] = { origName, parts: [alt-text...], origAmountG: number|null }
		// _appliedSwaps[i] stores a KBZHU *delta* (replacement − original) that is added to
		// the base recipe totals: { kcal, protein, fat, carbs, fiber, label, hasKbzhu }.
		let _swapInfo = {};
		let _appliedSwaps = {};
		// Ingredients marked swap="можно без него" can be toggled off (_excludedIngredients[i] = true)
		// and hidden from the list, sharing text, and shopping list.
		let _excludedIngredients = {};
		// Optional ingredients may optionally change KBZHU when omitted.
		let _optionalIngredientInfo = {};
		let _excludedIngredientDeltas = {};
		function isOptionalSwap(swap) {
			if (typeof swap !== 'string') return false;
			// Normalize: trim, lowercase, collapse inner whitespace, strip leading punctuation
			const norm = swap.trim().toLowerCase().replace(/\s+/g, ' ');
			if (!norm) return false;
			// Match "можно без него/неё/нее/них" (любой род/число), либо как префикс,
			// за которым идёт пунктуация/пробел (e.g. "можно без неё.", "можно без них, по желанию")
			return /^можно без (?:не(?:го|ё|е)|них)(?:[\s.,!;:—-].*)?$/.test(norm);
		}
		function normalizeNutritionDelta(raw) {
			if (!raw || typeof raw !== 'object') return null;
			const delta = {
				kcal: Number(raw.kcal) || 0,
				protein: Number(raw.protein) || 0,
				fat: Number(raw.fat) || 0,
				carbs: Number(raw.carbs) || 0,
				fiber: Number(raw.fiber) || 0
			};
			const hasKbzhu = delta.kcal !== 0 || delta.protein !== 0 || delta.fat !== 0 || delta.carbs !== 0 || delta.fiber !== 0;
			return { ...delta, hasKbzhu };
		}

		function nutritionToNegativeDelta(raw) {
			const n = normalizeNutritionDelta(raw);
			if (!n) return null;
			const delta = {
				kcal: -n.kcal,
				protein: -n.protein,
				fat: -n.fat,
				carbs: -n.carbs,
				fiber: -n.fiber
			};
			const hasKbzhu = delta.kcal !== 0 || delta.protein !== 0 || delta.fat !== 0 || delta.carbs !== 0 || delta.fiber !== 0;
			return { ...delta, hasKbzhu, isManual: true };
		}

		function normalizeOmitAdjustment(ing) {
			if (!ing || typeof ing !== 'object') return null;
			return nutritionToNegativeDelta(ing.omit_nutrition || ing.omit_delta);
		}

		function normalizeSwapNutritionDelta(raw) {
			if (!raw || typeof raw !== 'object') return null;
			const original = normalizeNutritionDelta(raw.original);
			const replacement = normalizeNutritionDelta(raw.replacement);
			if (!original && !replacement) return null;
			const o = original || { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
			const n = replacement || { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
			const delta = {
				kcal: Math.round((n.kcal || 0) - (o.kcal || 0)),
				protein: Math.round(((n.protein || 0) - (o.protein || 0)) * 10) / 10,
				fat: Math.round(((n.fat || 0) - (o.fat || 0)) * 10) / 10,
				carbs: Math.round(((n.carbs || 0) - (o.carbs || 0)) * 10) / 10,
				fiber: Math.round(((n.fiber || 0) - (o.fiber || 0)) * 10) / 10
			};
			const hasKbzhu = delta.kcal !== 0 || delta.protein !== 0 || delta.fat !== 0 || delta.carbs !== 0 || delta.fiber !== 0;
			return { ...delta, hasKbzhu };
		}

		function normalizeSwapNutritionDeltas(raw) {
			if (!raw || typeof raw !== 'object' || !Array.isArray(raw.replacements)) return [];
			return raw.replacements.map(item => {
				const delta = normalizeSwapNutritionDelta({
					original: raw.original,
					replacement: item && (item.nutrition || item.replacement || item)
				});
				if (!delta) return null;
				return {
					name: item && typeof item.name === 'string' ? item.name.trim() : '',
					delta: delta
				};
			}).filter(Boolean);
		}

		function findSwapManualDelta(info, partText, index) {
			if (!info) return null;
			const list = Array.isArray(info.manualDeltas) ? info.manualDeltas : [];
			const norm = (partText || '').trim().toLowerCase();
			for (const item of list) {
				if ((item.name || '').trim().toLowerCase() === norm) return item.delta;
			}
			if (list[index]) return list[index].delta;
			return (Array.isArray(info.parts) && info.parts.length <= 1) ? (info.manualDelta || null) : null;
		}

		function isInPlate() {
			return Plate.get().some(item => item.recipeId === r.id);
		}

		function refreshAddButtonStateByPlate() {
			const btn = document.getElementById('add-btn');
			if (!btn || !r) return;
			if (isInPlate()) {
				btn.textContent = '✓ В тарелке';
				btn.disabled = true;
				btn.style.opacity = '0.6';
				btn.style.cursor = 'default';
			} else {
				btn.textContent = '+ Добавить в тарелку';
				btn.disabled = false;
				btn.style.opacity = '';
				btn.style.cursor = '';
			}
		}

		function acknowledgeRecipeAdded() {
			const btn = document.getElementById('add-btn');
			if (btn) {
				btn.classList.remove('is-just-added');
				void btn.offsetWidth;
				btn.classList.add('is-just-added');
			}
		}

		const FIRST_PLATE_HINT_KEY = 'plate_first_add_hint_seen_v1';

		function getFirstPlateHintStorageKey() {
			try {
				return (typeof Auth !== 'undefined' && typeof Auth._userKey === 'function')
					? Auth._userKey(FIRST_PLATE_HINT_KEY)
					: FIRST_PLATE_HINT_KEY;
			} catch (e) {
				return FIRST_PLATE_HINT_KEY;
			}
		}

		function showFirstPlateHint() {
			const plateButton = document.getElementById('plate-btn');
			if (!plateButton || document.getElementById('plate-first-add-hint')) return;

			const storageKey = getFirstPlateHintStorageKey();
			try {
				if (localStorage.getItem(storageKey) === '1') return;
			} catch (e) {}

			const hint = document.createElement('div');
			hint.id = 'plate-first-add-hint';
			hint.className = 'plate-first-add-hint';
			hint.setAttribute('role', 'status');
			hint.setAttribute('aria-live', 'polite');

			const title = document.createElement('div');
			title.className = 'plate-first-add-hint-title';
			title.textContent = 'Блюдо добавлено в тарелку';
			const text = document.createElement('div');
			text.className = 'plate-first-add-hint-text';
			text.textContent = 'Нажмите на иконку, чтобы посмотреть свой приём пищи.';
			hint.append(title, text);
			document.body.appendChild(hint);
			plateButton.classList.add('is-first-add-hint');
			const hintPulseTimer = window.setTimeout(function () {
				plateButton.classList.remove('is-first-add-hint');
			}, 1200);

			const positionHint = function () {
				const rect = plateButton.getBoundingClientRect();
				const width = Math.min(300, window.innerWidth - 24);
				hint.style.width = width + 'px';
				const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left));
				hint.style.left = left + 'px';
				hint.style.top = (rect.bottom + 12) + 'px';
			};
			positionHint();

			const dismissHint = function () {
				try { localStorage.setItem(storageKey, '1'); } catch (e) {}
				window.clearTimeout(hintPulseTimer);
				plateButton.classList.remove('is-first-add-hint');
				hint.remove();
				window.removeEventListener('resize', positionHint);
			};
			plateButton.addEventListener('click', dismissHint, { once: true });
			window.addEventListener('resize', positionHint, { passive: true });
		}

		// Экранирование HTML — защита от XSS
		function escHtml(s) {
			return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
		}

		// Product-specific editorial icons for the balance add-ons. They are inline
		// SVG so the set remains crisp, recolours with the selected state, and does
		// not rely on platform-dependent emoji rendering.
		const ADDON_ICON_PATHS = {
			yogurt: '<path d="M17 20h30l-3 31H20l-3-31Z"/><path d="M20 20c4-5 20-5 24 0M22 32c5 3 11 3 18 0"/>',
			cottage: '<path d="M15 34h34c-2 11-8 17-17 17s-15-6-17-17Z"/><circle cx="24" cy="29" r="4"/><circle cx="32" cy="27" r="5"/><circle cx="40" cy="30" r="4"/>',
			meat: '<path d="M19 41c0-13 10-22 23-22 9 0 15 6 15 14 0 11-10 20-23 20-8 0-15-4-15-12Z"/><path d="M25 44c8 3 17 1 24-7"/>',
			fish: '<path d="M16 35c9-11 23-12 33-3l8-7v20l-8-7c-10 9-24 8-33-3Z"/><circle cx="27" cy="34" r="1.8" fill="currentColor" stroke="none"/>',
			tuna: '<path d="M16 23h32v28H16z"/><ellipse cx="32" cy="23" rx="16" ry="5"/><path d="M22 36h20M27 29h10"/>',
			tofu: '<path d="m20 24 12-7 12 7v21l-12 7-12-7V24Z"/><path d="m20 24 12 7 12-7M32 31v21"/><circle cx="27" cy="38" r="1.5"/><circle cx="37" cy="42" r="1.5"/>',
			edamame: '<path d="M17 42c3-17 14-24 31-20-3 17-14 25-31 20Z"/><circle cx="26" cy="36" r="4"/><circle cx="36" cy="33" r="4"/>',
			hummus: '<path d="M15 36h34c-2 10-8 16-17 16s-15-6-17-16Z"/><path d="M22 33c3-8 17-8 20 0-2 4-7 6-10 3-3 3-8 1-10-3Z"/><path d="M32 24v-5"/>',
			beetHummus: '<path d="M16 36h32c-2 10-8 16-16 16s-14-6-16-16Z"/><circle cx="32" cy="30" r="7"/><path d="M32 23v-6m0 0 5-4m-5 4-5-4"/>',
			parmesan: '<path d="m19 47 9-28 24 20-33 8Z"/><circle cx="30" cy="34" r="1.7"/><circle cx="40" cy="39" r="1.7"/><path d="m28 19 24 20"/>',
			yeast: '<path d="M20 20h24v32H20z"/><path d="M24 20v-4h16v4M25 30h14"/><circle cx="27" cy="37" r="1.4" fill="currentColor" stroke="none"/><circle cx="32" cy="40" r="1.4" fill="currentColor" stroke="none"/><circle cx="37" cy="36" r="1.4" fill="currentColor" stroke="none"/>',
			bread: '<path d="M17 48V29c0-8 6-13 13-13 5 0 8 2 10 5 8-1 13 5 13 11v16H17Z"/><path d="M23 29c5-3 9-3 14 0"/>',
			berries: '<circle cx="25" cy="39" r="7"/><circle cx="37" cy="39" r="7"/><circle cx="31" cy="28" r="7"/><path d="M31 20v-5m0 1 6-3"/>',
			greens: '<path d="M32 50V18m0 13c-8-1-12-6-13-12 8 1 12 6 13 12Zm0 10c8-1 12-6 13-12-8 1-12 6-13 12Zm0 4c-7 0-12 4-14 10 8 0 13-4 14-10Z"/>',
			vegetables: '<circle cx="26" cy="34" r="10"/><path d="m26 24 3-6m-3 6-6-3m9-3 5 1M43 25c7 10 5 20-6 27-5-11-2-20 6-27ZM41 31l-3 13"/>',
			dish: '<path d="M15 38h34c-2 8-8 13-17 13s-15-5-17-13Z"/><path d="M20 35c1-10 23-10 24 0M32 18v8m-7-4 3 4m11-4-3 4"/>'
		};

		function addonIconKey(name) {
			const normalized = String(name || '').toLowerCase().replace(/ё/g, 'е');
			if (normalized.includes('йогурт')) return 'yogurt';
			if (normalized.includes('творог')) return 'cottage';
			if (normalized.includes('тунец') || normalized.includes('рыбные консервы')) return 'tuna';
			if (normalized.includes('тофу')) return 'tofu';
			if (normalized.includes('эдамаме')) return 'edamame';
			if (normalized.includes('свеколь') && normalized.includes('хумус')) return 'beetHummus';
			if (normalized.includes('хумус')) return 'hummus';
			if (normalized.includes('мясо')) return 'meat';
			if (normalized.includes('рыб')) return 'fish';
			if (normalized.includes('пармезан')) return 'parmesan';
			if (normalized.includes('дрожжи')) return 'yeast';
			if (normalized.includes('хлеб') || normalized.includes('сухарик')) return 'bread';
			if (normalized.includes('ягод')) return 'berries';
			if (normalized.includes('зелень')) return 'greens';
			if (normalized.includes('овощ')) return 'vegetables';
			return 'dish';
		}

		function addonProductIcon(name) {
			const paths = ADDON_ICON_PATHS[addonIconKey(name)] || ADDON_ICON_PATHS.dish;
			return `<svg class="pv1-item-product-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
		}
		// Сначала escape, потом safe-linkify: [текст](recipeId) → ссылка
		// recipeId валидируется: только буквы, цифры, дефис
		// AUTO_LINKS: ключевые слова в тексте автоматически становятся ссылками на рецепт.
		// Каждая запись — { re: RegExp (с флагом g, без групп захвата), id: 'recipe-id' }.
		const AUTO_LINKS = [
			{ re: /овощн(?:ый|ого|ому|ым|ом|ая|ой|ую|ое|ые|ых|ым|ыми)?\s+концентрат(?:а|у|ом|е|ы|ов|ам|ами|ах)?/gi, id: 'veggie-concentrate' },
			{ re: /соус(?:а|у|ом|е)?\s+из\s+кешью/gi, id: 'cashew-sauce' },
		];
		function _autoLink(html, selfId) {
			const anchor = (label, rid) => '<a href="' + recipeLink(rid, { parentRecipeId: selfId || '' }) + '" style="color:var(--accent);text-decoration:underline;cursor:pointer">' + label + '</a>';
			AUTO_LINKS.forEach(rule => {
				if (rule.id === selfId) return;
				html = html.replace(rule.re, m => anchor(m, rule.id));
			});
			return html;
		}
		function linkify(text) {
			const selfId = window.__currentRecipeId || '';
			let html = escHtml(text).replace(/\[([^\]]+)\]\(([a-zA-Z0-9-]+)\)/g, function (_, label, rid) {
				return '<a href="' + recipeLink(rid, { parentRecipeId: selfId }) + '" style="color:var(--accent);text-decoration:underline;cursor:pointer">' + label + '</a>';
			});
			return _autoLink(html, selfId);
		}
		// The stored "можно без него" wording describes the ingredient. The visible
		// control describes the action, consistently across existing and new recipes.
		function optionalIngredientActionLabel(omitText) {
			const text = String(omitText || '').trim();
			const contextMatch = text.match(/\(([^()]*)\)\s*$/);
			const context = contextMatch && contextMatch[1].trim();
			return '<span class="ing-optout-label">Не добавлять</span>'
				+ (context ? '<span class="ing-optout-context">' + escHtml(context) + '</span>' : '');
		}

		// ── INGREDIENT KBZHU DATABASE ─────────────────────────────────────────
		// Used when an ingredient is NOT a standalone recipe in RECIPES.
		// Stored per 100 g (fixed convention). Aliases — normalized, case-insensitive
		// (ё→е, non-letters → spaces).
		const INGREDIENT_DB = {
			'yogurt-medium-fat': {
				aliases: ['йогурт средней жирности', 'йогурт'],
				per100g: { kcal: 60, protein: 6.67, fat: 6.67, carbs: 6.67, fiber: 0 }
			}
		};

		function _normIng(s) {
			return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim();
		}

		// Find an ingredient entry whose alias matches the start of the normalized text.
		// Prefers the longest alias when several match (e.g. "йогурт средней жирности" > "йогурт").
		function matchIngredientKbzhu(text) {
			const n = _normIng(text);
			if (!n) return null;
			let best = null;
			for (const id in INGREDIENT_DB) {
				const entry = INGREDIENT_DB[id];
				for (const alias of entry.aliases) {
					const an = _normIng(alias);
					if (!an) continue;
					const hit = n === an || n.startsWith(an + ' ') || n.indexOf(' ' + an + ' ') !== -1 || n.startsWith(an);
					if (hit && (!best || an.length > best.aliasLen)) best = { id, entry, aliasLen: an.length };
				}
			}
			return best ? { id: best.id, entry: best.entry } : null;
		}

		// Resolve swap/ingredient text → nutrition source. Recipe takes priority over DB.
		function _resolveNutritionSource(text) {
			const rid = findRecipeForSwapText(text);
			if (rid && typeof RECIPES !== 'undefined' && RECIPES && RECIPES[rid]) {
				return { kind: 'recipe', recipe: RECIPES[rid], name: RECIPES[rid].name };
			}
			const m = matchIngredientKbzhu(text);
			if (m) return { kind: 'ingredient', entry: m.entry };
			return null;
		}

		// KBZHU contribution of a source for a given mass in grams.
		// Returns null if the source can't be scaled (missing portionGrams, zero mass, etc).
		function _contribution(src, amountG) {
			if (!src || !(amountG > 0)) return null;
			let base, factor;
			if (src.kind === 'recipe') {
				const r = src.recipe;
				if (!r.portionGrams || r.portionGrams <= 0) return null;
				base = r;
				factor = amountG / r.portionGrams;
			} else {
				base = src.entry.per100g;
				factor = amountG / 100;
			}
			return {
				kcal:    (base.kcal    || 0) * factor,
				protein: (base.protein || 0) * factor,
				fat:     (base.fat     || 0) * factor,
				carbs:   (base.carbs   || 0) * factor,
				fiber:   (base.fiber   || 0) * factor
			};
		}

		// ── INGREDIENT SWAPS ──────────────────────────────────────────────────
		// Split swap text like "Дайкон или зелёная редька" into ["Дайкон", "зелёная редька"].
		// Respects parentheses (doesn't split inside them).
		function splitSwapAlternatives(text) {
			if (!text) return [];
			const parts = [];
			let depth = 0, buf = '', i = 0;
			while (i < text.length) {
				const ch = text[i];
				if (ch === '(') { depth++; buf += ch; i++; continue; }
				if (ch === ')') { depth = Math.max(0, depth - 1); buf += ch; i++; continue; }
				if (depth === 0) {
					if ((ch === ',' && !(/\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || ''))) || ch === ';' || ch === '/') {
						if (buf.trim()) parts.push(buf.trim());
						buf = ''; i++; continue;
					}
					const orMatch = text.substr(i).match(/^\s+или\s+/);
					if (orMatch) {
						if (buf.trim()) parts.push(buf.trim());
						buf = ''; i += orMatch[0].length; continue;
					}
				}
				buf += ch; i++;
			}
			if (buf.trim()) parts.push(buf.trim());
			return parts;
		}

		// Find a recipe id matching a swap alternative text (e.g. "Соус из кешью" → "cashew-sauce")
		function findRecipeForSwapText(text) {
			if (!text) return null;
			// 1. Explicit markdown link [label](id)
			const md = text.match(/\[([^\]]+)\]\(([a-zA-Z0-9-]+)\)/);
			if (md) return md[2];
			// 2. AUTO_LINKS regex patterns (case-insensitive)
			for (const rule of AUTO_LINKS) {
				rule.re.lastIndex = 0;
				const hit = rule.re.test(text);
				rule.re.lastIndex = 0;
				if (hit) return rule.id;
			}
			// 3. Fuzzy match against loaded recipe names
			if (typeof RECIPES === 'undefined' || !RECIPES) return null;
			const norm = text.toLowerCase().replace(/[.,!?()«»"']/g, '').trim();
			for (const id in RECIPES) {
				const rname = (RECIPES[id].name || '').toLowerCase().trim();
				if (!rname) continue;
				if (rname === norm || norm.startsWith(rname) || rname.startsWith(norm)) return id;
			}
			return null;
		}

		// Parse amount in grams from an ingredient string, e.g. "Йогурт — 2 ст. л. (~30 г)" → 30
		function parseAmountGrams(text) {
			if (!text) return null;
			const gr = text.match(/(\d+(?:[.,]\d+)?)\s*г\b/);
			if (gr) return parseFloat(gr[1].replace(',', '.'));
			const ml = text.match(/(\d+(?:[.,]\d+)?)\s*мл\b/);
			if (ml) return parseFloat(ml[1].replace(',', '.'));
			const tb = text.match(/(\d+(?:[.,]\d+)?)(?:\s*[–\-]\s*\d+(?:[.,]\d+)?)?\s*ст\.?\s*л/);
			if (tb) return parseFloat(tb[1].replace(',', '.')) * 15;
			const ts = text.match(/(\d+(?:[.,]\d+)?)(?:\s*[–\-]\s*\d+(?:[.,]\d+)?)?\s*ч\.?\s*л/);
			if (ts) return parseFloat(ts[1].replace(',', '.')) * 5;
			return null;
		}

		// Display label for a swap alternative: use linked recipe name if matched,
		// otherwise capitalize the first letter of the raw text.
		function swapDisplayLabel(part, rid) {
			if (rid && typeof RECIPES !== 'undefined' && RECIPES[rid] && RECIPES[rid].name) {
				return RECIPES[rid].name;
			}
			const t = (part || '').trim();
			if (!t) return t;
			return t.charAt(0).toUpperCase() + t.slice(1);
		}

		// Keep an explicitly specified amount from a replacement. This matters most
		// for linked recipes: their card title replaces the raw swap text, but must
		// not bring the original ingredient's amount along with it.
		function swapAmountSuffix(part) {
			if (!part) return '';
			const separatedAmount = part.match(/(?:\s[—–\-]\s|:\s)(\d+(?:[.,]\d+)?\s*(?:г|гр|грамм|кг|мл|л|ст\.?\s*л\.?|ч\.?\s*л\.?|шт\.?).*)$/i);
			if (separatedAmount) return separatedAmount[0];
			const parenthesizedAmount = part.match(/\s*(\([^)]*\d+(?:[.,]\d+)?\s*(?:г|гр|грамм|кг|мл|л|ст\.?\s*л\.?|ч\.?\s*л\.?|шт\.?).*\))\s*$/i);
			if (parenthesizedAmount) return ' ' + parenthesizedAmount[1];
			const trailingAmount = part.match(/\s+(\d+(?:[.,]\d+)?\s*(?:г|гр|грамм|кг|мл|л|ст\.?\s*л\.?|ч\.?\s*л\.?|шт\.?)\.?)\s*$/i);
			return trailingAmount ? ' — ' + trailingAmount[1] : '';
		}

		function renderSwapOptions(swapText, i, origName, ing) {
			const parts = splitSwapAlternatives(swapText);
			const origAmountG = parseAmountGrams(origName);
			const structuredSwapNames = Array.isArray(ing && ing.swap_options)
				? ing.swap_options.map(option => option && typeof option.name === 'string' ? option.name : '')
				: [];
			_swapInfo[i] = {
				origName: origName,
				parts: parts,
				structuredSwapNames: structuredSwapNames,
				origAmountG: origAmountG,
				manualDelta: normalizeSwapNutritionDelta(ing && typeof ing === 'object' ? ing.swap_nutrition : null),
				manualDeltas: normalizeSwapNutritionDeltas(ing && typeof ing === 'object' ? ing.swap_nutrition : null)
			};
			if (parts.length === 0) {
				return linkify(swapText);
			}
			const btns = parts.map((part, j) => {
				const rid = findRecipeForSwapText(part);
				const label = swapDisplayLabel(part, rid);
				return '<button class="ing-swap-option" data-recipe-action="apply-swap" data-index="' + Number(i) + '" data-option-index="' + Number(j) + '">'
					+ escHtml(label) + '</button>';
			}).join('');
			return '<div class="ing-swap-label">Выберите замену:</div>'
				+ '<div class="ing-swap-grid">' + btns + '</div>';
		}

		window.applySwap = function(i, j) {
			const info = _swapInfo[i];
			if (!info || !info.parts[j]) return;
			const partText = info.parts[j];
			const rid = findRecipeForSwapText(partText);
			const displayPart = swapDisplayLabel(partText, rid);

			// Build new display name, preserving the amount suffix after the first separator.
			// Separator is " — " (legacy) or ": " (new editorial format, name-first).
			const origText = info.origName || '';
			const dashMatch = origText.match(/\s[—–\-]\s|:\s/);
			const amountPart = dashMatch ? origText.substring(origText.indexOf(dashMatch[0])) : '';
			// A replacement's explicit measure always takes precedence over the original
			// one. For example, 100 g yogurt can become 50 g cashew sauce.
			const structuredSwapName = info.structuredSwapNames && info.structuredSwapNames[j];
			const replacementAmount = swapAmountSuffix(structuredSwapName) || swapAmountSuffix(partText);
			// Skip appending amountPart if the replacement text already carries a measure
			// (e.g. "Консервированная фасоль — 300 г", "Тамари: 1 ст. л.", "Тофу (50 г)", "Йогурт 100 г").
			const displayPartHasAmount =
				/\s[—–\-]\s/.test(displayPart) ||
				/:\s*\d/.test(displayPart) ||
				/\([^)]*\d[^)]*\)/.test(displayPart) ||
				/\d+\s*(г|мл|кг|ст\.?\s*л\.?|ч\.?\s*л\.?)\b/i.test(displayPart);
			const effectiveAmount = replacementAmount || (displayPartHasAmount ? '' : amountPart);
			const newLabel = displayPart + effectiveAmount;

			const nameEl = document.getElementById('ing-name-' + i);
			if (nameEl) {
				// If swap points to a linked recipe, render a custom link with asIngredient=1
				// so the target recipe page knows to hide the "Add to plate" button.
				let labelHtml;
				if (rid) {
					labelHtml = '<a href="' + recipeLink(rid, { asIngredient: true, parentRecipeId: recipeId || '' }) + '" style="color:var(--accent);text-decoration:underline;cursor:pointer">'
						+ escHtml(displayPart) + '</a>' + escHtml(effectiveAmount);
				} else {
					labelHtml = linkify(newLabel);
				}
				nameEl.innerHTML = labelHtml
					+ ' <button class="ing-swap-revert" data-recipe-action="revert-swap" data-index="' + Number(i) + '" aria-label="Вернуть исходный ингредиент">↺ <span>Вернуть исходный ингредиент</span></button>';
				nameEl.classList.add('ing-name-swapped');
			}
			const tipEl = document.getElementById('swap-' + i);
			if (tipEl) tipEl.classList.remove('open');
			const btn = document.getElementById('ing-swap-btn-' + i);
			if (btn) btn.style.display = 'none';

			const replSrc = _resolveNutritionSource(partText);
			const replLabel = (replSrc && replSrc.kind === 'recipe') ? replSrc.name : displayPart;
			const manualDelta = findSwapManualDelta(info, partText, j);
			let delta = manualDelta
				? { ...manualDelta, label: replLabel }
				: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, label: replLabel, hasKbzhu: false };
			if (!manualDelta && !delta.hasKbzhu) {
				// Fallback for older recipes: compute KBZHU delta = replacement − original.
				// Source priority: RECIPES (linked recipe) → INGREDIENT_DB. If either side
				// can't be resolved or the amount is unknown, skip delta (rename-only).
				const origSrc = _resolveNutritionSource(info.origName || '');
				const origAmountG = info.origAmountG || 0;
				const replacementAmountG = parseAmountGrams(structuredSwapName) || parseAmountGrams(partText) || origAmountG;
				if (origSrc && replSrc && origAmountG > 0 && replacementAmountG > 0) {
					const o = _contribution(origSrc, origAmountG);
					const n = _contribution(replSrc, replacementAmountG);
					if (o && n) {
						delta = {
							kcal:    Math.round(n.kcal    - o.kcal),
							protein: Math.round(n.protein - o.protein),
							fat:     Math.round(n.fat     - o.fat),
							carbs:   Math.round(n.carbs   - o.carbs),
							fiber:   Math.round(n.fiber   - o.fiber),
							label:   replLabel,
							hasKbzhu: true
						};
					}
				}
			}
			_appliedSwaps[i] = delta;
			updateAddTotal();
			if (delta.hasKbzhu) {
				const sign = delta.kcal >= 0 ? '+' : '';
				showToast('🔄 Замена учтена: ' + sign + delta.kcal + ' ккал');
			}
		};

		window.revertSwap = function(i) {
			const info = _swapInfo[i];
			if (!info) return;
			const nameEl = document.getElementById('ing-name-' + i);
			if (nameEl) {
				nameEl.innerHTML = linkify(info.origName);
				nameEl.classList.remove('ing-name-swapped');
			}
			const btn = document.getElementById('ing-swap-btn-' + i);
			if (btn) btn.style.display = '';
			delete _appliedSwaps[i];
			updateAddTotal();
		};

		window.optOutIngredient = function(i) {
			_excludedIngredients[i] = true;
			const info = _optionalIngredientInfo[i];
			if (info && info.omitDelta && info.omitDelta.hasKbzhu) {
				_excludedIngredientDeltas[i] = info.omitDelta;
			}
			const row = document.getElementById('ing-row-' + i);
			const ph = document.getElementById('ing-placeholder-' + i);
			if (row) row.style.display = 'none';
			if (ph) ph.style.display = '';
			updateAddTotal();
			renderStepsOmitHints();
		};

		window.restoreIngredient = function(i) {
			delete _excludedIngredients[i];
			delete _excludedIngredientDeltas[i];
			const row = document.getElementById('ing-row-' + i);
			const ph = document.getElementById('ing-placeholder-' + i);
			if (row) row.style.display = '';
			if (ph) ph.style.display = 'none';
			updateAddTotal();
			renderStepsOmitHints();
		};

		function renderStepsOmitHints() {
			const wrap = document.getElementById('steps-omit-hints');
			if (!wrap) return;
			const seen = new Set();
			const hints = [];
			Object.keys(_excludedIngredients).forEach(idx => {
				const info = _optionalIngredientInfo[idx];
				if (!info || !info.omitHint) return;
				const key = info.omitHint;
				if (seen.has(key)) return;
				seen.add(key);
				hints.push(key);
			});
			if (!hints.length) {
				wrap.hidden = true;
				wrap.innerHTML = '';
				return;
			}
			const body = hints.length === 1
				? `<div class="steps-omit-hints-text">${escHtml(hints[0])}</div>`
				: `<ul class="steps-omit-hints-list">${hints.map(h => `<li>${escHtml(h)}</li>`).join('')}</ul>`;
			wrap.innerHTML = `<span class="steps-omit-hints-icon" aria-hidden="true">💡</span><div class="steps-omit-hints-body">${body}</div>`;
			wrap.hidden = false;
		}

		function renderRecipe(r) {
			const portionDetail = r.portionGrams ? ('1 порция ≈ ' + Number(r.portionGrams) + ' г') : '';
			const quantityBadge = r.yieldLabel
				? escHtml(r.yieldLabel)
				: r.id === 'veggie-concentrate'
				? '750 грамм'
				: `🍽 ${Number(r.servings || 4)} ${(()=>{const n=Number(r.servings||4),m10=n%10,m100=n%100;if(m10===1&&m100!==11)return 'порция';if([2,3,4].includes(m10)&&![12,13,14].includes(m100))return 'порции';return 'порций';})()}${portionDetail ? ` <span style="font-weight:500;color:var(--text-2)">(${escHtml(portionDetail)})</span>` : ''}`;
			const preparationNote = typeof r.note === 'string' ? r.note.trim() : '';
			window.__currentRecipeId = r.id;
			document.title = r.name + ' — рецепт | Умная тарелка';
			const _asIngredient = new URLSearchParams(location.search).get('asIngredient') === '1';
			document.getElementById('sticky-add').style.display = _asIngredient ? 'none' : 'block';
			const fab = document.getElementById('support-fab');
			if (fab) fab.classList.add('above-sticky');

			// Reset per-recipe balance/collapse state
			expandedGroups = { p: false, f: false, c: false, fi: false };
			_wasBalanced = false;
			_celebrationShown = false;

			const diff = DIFF_LABELS[r.diff] || r.diff;
			const catObj = r.cat ? CATEGORIES[r.cat] : null;
			const catColor = catObj ? catObj.color : '#9ab89e';

			const DEFAULT_ADD = {
				protein: [
					{ name: 'Нут отварной (3 ст.л.)', kcal: 120, protein: 7, fat: 2, carbs: 18, fiber: 4 },
					{ name: 'Тофу (50 г)', kcal: 40, protein: 5, fat: 2, carbs: 1, fiber: 0 },
					{ name: 'Красная чечевица (2 ст.л. сухой)', kcal: 110, protein: 8, fat: 0, carbs: 18, fiber: 3 },
				],
				fat: [
					{ name: 'Тыквенные семечки (1 ст.л.)', kcal: 55, protein: 3, fat: 4, carbs: 1, fiber: 0 },
					{ name: 'Льняные семечки (1 ч.л.)', kcal: 35, protein: 1, fat: 3, carbs: 2, fiber: 1 },
					{ name: 'Авокадо (¼ шт.)', kcal: 80, protein: 1, fat: 7, carbs: 4, fiber: 3 },
				],
				carbs: [
					{ name: 'Цельнозерновой хлеб (1 кусок)', kcal: 70, protein: 3, fat: 0, carbs: 15, fiber: 3 },
					{ name: 'Бурый рис (3 ст.л. готового)', kcal: 75, protein: 2, fat: 0, carbs: 16, fiber: 1 },
					{ name: 'Гречка отварная (3 ст.л.)', kcal: 80, protein: 3, fat: 1, carbs: 17, fiber: 2 },
				],
				fiber: [
					{ name: 'Свежая зелень — укроп, петрушка (горсть)', kcal: 5, protein: 0, fat: 0, carbs: 1, fiber: 1 },
					{ name: 'Листья шпината (горсть)', kcal: 15, protein: 2, fat: 0, carbs: 2, fiber: 2 },
					{ name: 'Огурец свежий (½ шт.)', kcal: 10, protein: 0, fat: 0, carbs: 2, fiber: 1 },
				],
			};
			// Resolve auto-addons (recipe-level overrides category-level per slot)
			// Rule shape: { fromCategory: "salads" } → pulls all published recipes from that category
			function _resolveAutoAddons(recipe) {
				const slots = ['protein', 'fat', 'carbs', 'fiber'];
				const resolved = { protein: [], fat: [], carbs: [], fiber: [] };
				const orderRules = { protein: [], fat: [], carbs: [], fiber: [] };
				const optionalRules = { protein: false, fat: false, carbs: false, fiber: false };
				const rules = {};
				const recipeCats = recipe.categories || (recipe.cat ? [recipe.cat] : []);
				function normalizeAddonOrder(order) {
					if (Array.isArray(order)) return order.map(id => String(id || '').trim()).filter(Boolean);
					if (typeof order === 'string') return order.split(/[\n,;]+/).map(id => id.trim()).filter(Boolean);
					return [];
				}
				function addonOrderKeys(item) {
					const keys = [];
					if (item && item.recipeId) {
						keys.push('recipe:' + item.recipeId);
						keys.push(String(item.recipeId));
					}
					if (item && item.name) {
						keys.push('item:' + String(item.name).trim());
						keys.push(String(item.name).trim());
					}
					return keys.filter(Boolean);
				}
				function sortAddonItems(items, order) {
					const ids = normalizeAddonOrder(order);
					if (!ids.length) return items;
					const rank = new Map();
					ids.forEach((id, index) => { if (!rank.has(id)) rank.set(id, index); });
					return items
						.map((item, index) => {
							const ranks = addonOrderKeys(item).map(key => rank.has(key) ? rank.get(key) : Number.POSITIVE_INFINITY);
							return { item, index, rank: Math.min(...ranks) };
						})
						.sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
						.map(entry => entry.item);
				}
				function collectCategoryAddons(sourceId) {
					if (!sourceId || typeof RECIPES === 'undefined') return [];
					const pulled = [];
					Object.values(RECIPES).forEach(rx => {
						if (rx.id === recipe.id) return;
						const rxCats = rx.categories || (rx.cat ? [rx.cat] : []);
						if (rxCats.indexOf(sourceId) === -1) return;
						pulled.push({
							name: rx.name,
							kcal: rx.kcal || 0,
							protein: rx.protein || 0,
							fat: rx.fat || 0,
							carbs: rx.carbs || 0,
							fiber: rx.fiber || 0,
							recipeId: rx.id,
							_auto: true
						});
					});
					return pulled;
				}
				function resolveExactAddonItem(it) {
					if (!it) return null;
					if (it.recipeId && typeof RECIPES !== 'undefined') {
						const rx = RECIPES[it.recipeId];
						if (rx && rx.id !== recipe.id) {
							return {
								name: rx.name,
								kcal: rx.kcal || 0,
								protein: rx.protein || 0,
								fat: rx.fat || 0,
								carbs: rx.carbs || 0,
								fiber: rx.fiber || 0,
								recipeId: rx.id,
								_auto: true
							};
						}
					}
					if (!it.name) return null;
					return Object.assign({}, it, { _auto: true });
				}
				// Category-level rules (union across recipe's categories, first-win per slot)
				recipeCats.forEach(catId => {
					const cat = (typeof CATEGORIES !== 'undefined' && CATEGORIES[catId]) || null;
					const aa = cat && cat.autoAddons || {};
					slots.forEach(s => { if (!rules[s] && aa[s]) rules[s] = aa[s]; });
				});
				// Recipe-level overrides
				const rAA = recipe.autoAddons || {};
				slots.forEach(s => { if (rAA[s]) rules[s] = rAA[s]; });
				slots.forEach(s => { optionalRules[s] = !!(rules[s] && rules[s].optional); });
				// Materialize: find published recipes in target category + static items
				slots.forEach(s => {
					const rule = rules[s];
					if (!rule) return;
					let autoItems = [];
					orderRules[s] = normalizeAddonOrder(rule.order);
					// fromCategory: pull all recipes from target category
					if (rule.fromCategory) autoItems = autoItems.concat(collectCategoryAddons(rule.fromCategory));
					// items: static add-ons (name/amount/kbju, no recipeId)
					if (Array.isArray(rule.items)) {
						rule.items.forEach(it => {
							const item = resolveExactAddonItem(it);
							if (item) autoItems.push(item);
						});
					}
					resolved[s].push(...sortAddonItems(autoItems, rule.order));
				});
				// Name-based rule: every recipe with "Плов" gets salads as Fiber add-ons.
				if (/\bплов\b/i.test(recipe.name || '')) resolved.fiber.push(...collectCategoryAddons('salads'));
				// Category-based soup rule. isSoup stays as legacy fallback until all stored data is migrated.
				// Do not use fromCategory here: soups need a precise bread + oregano-croutons set, not all breads.
				const hasManagedSoupCarbs = !!(rules.carbs && (
					rules.carbs.fromCategory ||
					(Array.isArray(rules.carbs.items) && rules.carbs.items.length)
				));
				if ((recipeCats.indexOf('soups') !== -1 || recipe.isSoup) && !hasManagedSoupCarbs) {
					resolved.carbs.push({
						name: 'Цельнозерновой хлеб',
						amount: '1 ломтик',
						kcal: 70, protein: 3, fat: 0, carbs: 15, fiber: 3,
						_auto: true
					});
					if (typeof RECIPES !== 'undefined') {
						const rx = RECIPES['oregano-croutons'];
						if (rx && rx.id !== recipe.id) {
							resolved.carbs.push({
								name: rx.name,
								kcal: rx.kcal || 0,
								protein: rx.protein || 0,
								fat: rx.fat || 0,
								carbs: rx.carbs || 0,
								fiber: rx.fiber || 0,
								recipeId: rx.id,
								_auto: true
							});
						}
					}
				}
				resolved._order = orderRules;
				resolved._optional = optionalRules;
				return resolved;
			}
			function _normAddonName(s) {
				if (!s) return '';
				let out = String(s);
				// Убираем парный хвост амаунта в скобках: "(1 кусок)", "(½ шт.)"
				out = out.replace(/\s*\([^)]*\)\s*$/, '');
				// Убираем хвост через тире: "— 1 ломтик", "- 50 г", "– 100 мл"
				out = out.replace(/\s*[—–-]\s*[^—–-]+$/, '');
				return out.toLowerCase().trim();
			}
			function _addonKeys(it) {
				if (!it) return [];
				const keys = [];
				// Сильный ключ: recipeId. Если есть — этого достаточно для дедупа.
				if (it.recipeId) keys.push('r:' + it.recipeId);
				// Слабый ключ для статических добавок (без recipeId): нормализованное имя + kcal.
				// Срезаем только хвост амаунта в имени («Хлеб — 1 ломтик» = «Хлеб»).
				// Добавляем kcal в ключ, чтобы НЕ слить разные сущности с похожим корнем имени:
				//   «Хлеб ржаной» 70 ккал и «Хлеб ржаной» 110 ккал → разные ключи → обе остаются.
				//   «Цельнозерновой хлеб — 1 ломтик» 70 ккал (explicit) и «Цельнозерновой хлеб» 70 ккал
				//   (auto, is_soup) → одинаковый ключ → дедуп.
				const norm = _normAddonName(it.name);
				if (norm) {
					const k = Math.round(it.kcal || 0);
					keys.push('n:' + norm + '|k' + k);
				}
				return keys;
			}
			function _mergeAddItems(explicit, auto) {
				const all = (explicit || []).concat(auto || []);
				const seen = new Set();
				const out = [];
				for (const it of all) {
					if (!it) continue;
					const keys = _addonKeys(it);
					if (keys.some(k => seen.has(k))) continue;
					keys.forEach(k => seen.add(k));
					out.push(it);
				}
				return out;
			}
			function _sortAddItemsByOrder(items, order) {
				if (!Array.isArray(order) || !order.length) return items;
				const rank = new Map();
				order.forEach((id, index) => { if (!rank.has(id)) rank.set(id, index); });
				function keys(it) {
					const out = [];
					if (it && it.recipeId) {
						out.push('recipe:' + it.recipeId);
						out.push(String(it.recipeId));
					}
					if (it && it.name) {
						out.push('item:' + String(it.name).trim());
						out.push(String(it.name).trim());
					}
					return out;
				}
				return items
					.map((item, index) => {
						const ranks = keys(item).map(key => rank.has(key) ? rank.get(key) : Number.POSITIVE_INFINITY);
						return { item, index, rank: Math.min(...ranks) };
					})
					.sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
					.map(entry => entry.item);
			}
			const _autoAdd = _resolveAutoAddons(r);
			const addProtein = _sortAddItemsByOrder(_mergeAddItems(r.addProtein, _autoAdd.protein), _autoAdd._order && _autoAdd._order.protein);
			const addFat = _sortAddItemsByOrder(_mergeAddItems(r.addFat, _autoAdd.fat), _autoAdd._order && _autoAdd._order.fat);
			const addCarbs = _sortAddItemsByOrder(_mergeAddItems(r.addCarbs, _autoAdd.carbs), _autoAdd._order && _autoAdd._order.carbs);
			const addFiber = _sortAddItemsByOrder(_mergeAddItems(r.addFiber, _autoAdd.fiber), _autoAdd._order && _autoAdd._order.fiber);
			// Сайдбар показывается ТОЛЬКО если хотя бы одно add* поле (после резолва) содержит данные
			const _hasOwn = (arr) => Array.isArray(arr) && arr.length > 0;
			const _hasAnyAdd = _hasOwn(addProtein) || _hasOwn(addFat) || _hasOwn(addCarbs) || _hasOwn(addFiber);
			const hasAdditions = !simpleMode && _hasAnyAdd;

			// Reset swap state for this recipe render
			_swapInfo = {};
			_appliedSwaps = {};
			_excludedIngredients = {};
			_optionalIngredientInfo = {};
			_excludedIngredientDeltas = {};
			const ingHtml = (r.ingredients || []).map((ing, i) => {
				const name = typeof ing === 'string' ? ing : ing.name;
				const swap = typeof ing === 'object' ? ing.swap : null;
				const omit = typeof ing === 'object' && typeof ing.omit === 'string' ? ing.omit.trim() : '';
				const optional = !!omit || isOptionalSwap(swap);
				const swapText = isOptionalSwap(swap) ? null : swap;
				const omitText = omit || swap;
				if (optional) {
					const rawHint = ing && typeof ing === 'object' && typeof ing.omit_hint === 'string' ? ing.omit_hint.trim() : '';
					_optionalIngredientInfo[i] = {
						omitDelta: normalizeOmitAdjustment(ing),
						omitHint: rawHint || null
					};
				}
				const actionBtn = [
					optional ? `<button class="ing-optout-btn" id="ing-optout-btn-${i}" data-recipe-action="opt-out" data-index="${Number(i)}">${optionalIngredientActionLabel(omitText)}</button>` : '',
					swapText ? `<button class="ing-swap-btn" id="ing-swap-btn-${i}" data-recipe-action="toggle-swap" data-index="${Number(i)}">чем заменить?</button>` : ''
				].join('');
				const swapTip = swapText
					? `<div class="ing-swap-tip" id="swap-${i}">${renderSwapOptions(swapText, i, name, ing)}</div>`
					: '';
				const placeholder = optional
					? `<div class="ing-item ing-item-excluded" id="ing-placeholder-${i}" style="display:none">
                    <div class="ing-dot ing-dot-muted"></div>
                    <div class="ing-name ing-name-excluded">${linkify(name)}</div>
                    <button class="ing-restore-btn" data-recipe-action="restore-ingredient" data-index="${Number(i)}">вернуть</button>
                </div>`
					: '';
				return `<div>
                <div class="ing-item" id="ing-row-${i}">
                    <div class="ing-dot"></div>
                    <div class="ing-name" id="ing-name-${i}">${linkify(name)}</div>
                    ${actionBtn}
                </div>
                ${swapTip}
                ${placeholder}
            </div>`;
			}).join('');

			// Контракт step.photo:
			//   string      → 1 фото
			//   string[]    → N фото по порядку (карусель)
			//   true        → плейсхолдер-заглушка
			//   null/""/нет → без блока фото
			// Нормализация URL (photoUrl) применяется к каждой строке, не к массиву целиком.
			const stepsArr = (r.steps || []).map((s, i) => {
				const text = escHtml(typeof s === 'string' ? s : s.text);
				const photo = typeof s === 'object' && s.photo ? s.photo : null;
				let photoHtml = '';
				if (photo === true) {
					photoHtml = `<div class="step-photo-placeholder"><span>📷</span><span>Фото шага ${i + 1}</span></div>`;
				} else if (Array.isArray(photo)) {
					const imgs = photo.filter(p => typeof p === 'string' && p);
					if (imgs.length === 1) {
						photoHtml = `<img class="step-photo-img" src="${escHtml(photoUrl(imgs[0]))}" alt="Фото шага ${i + 1}" loading="lazy" decoding="async" data-recipe-image-fallback="step">`;
					} else if (imgs.length > 1) {
						photoHtml = `<div class="step-photo-carousel" data-index="0">` +
							imgs.map((p, idx) =>
								`<img class="step-photo-img${idx === 0 ? ' is-active' : ''}" src="${escHtml(photoUrl(p))}" alt="Фото шага ${i + 1} (${idx + 1})" loading="lazy" decoding="async" data-recipe-image-fallback="step">`
							).join('') +
							`<button type="button" class="step-photo-nav step-photo-prev" data-recipe-action="step-photo-move" data-direction="-1" aria-label="Предыдущее фото">‹</button>` +
							`<button type="button" class="step-photo-nav step-photo-next" data-recipe-action="step-photo-move" data-direction="1" aria-label="Следующее фото">›</button>` +
							`<div class="step-photo-hint">Листайте фото</div>` +
							`<div class="step-photo-dots">` + imgs.map((_, idx) => `<span class="step-photo-dot${idx === 0 ? ' is-active' : ''}"></span>`).join('') + `</div>` +
							`<div class="step-photo-counter"><span data-carousel-current>1</span> / ${imgs.length}</div>` +
							`</div>`;
					}
				} else if (typeof photo === 'string' && photo) {
					photoHtml = `<img class="step-photo-img" src="${escHtml(photoUrl(photo))}" alt="Шаг ${i + 1}" loading="lazy" decoding="async" data-recipe-image-fallback="step">`;
				}
				return `<div class="step-item" id="recipe-step-${i + 1}">
                <div class="step-num">${i + 1}</div>
                <div class="step-body">
                    <div class="step-text">${text}</div>
                    ${photoHtml ? `<div class="step-photo-wrap">${photoHtml}</div>` : ''}
                </div>
            </div>`;
			});
			// Helper: derive start/final photo path from cover photo
			function derivePhoto(base, suffix) {
				if (!base) return '';
				// Replace known suffixes (-cover, -final, -start) or append before extension
				return base.replace(/-(cover|final|start)(\.[^.]+)$/, '-' + suffix + '$2')
					|| base.replace(/(\.[^.]+)$/, '-' + suffix + '$1');
			}
			// Final step: finished dish photo
			const finalPhoto = r.photoFinal || (r.photo ? derivePhoto(r.photo, 'final') : '');
			if (finalPhoto) {
				const n = stepsArr.length + 1;
				stepsArr.push(`<div class="step-item step-final">
                <div class="step-num">${n}</div>
                <div class="step-body">
                    <div class="step-text">Наслаждайтесь! Приятного вам аппетита 😋</div>
					<div class="step-photo-wrap"><img class="step-photo-img" src="${escHtml(photoUrl(finalPhoto))}" alt="Готовое блюдо" loading="lazy" decoding="async" data-recipe-image-fallback="step"></div>
                </div>
            </div>`);
			}
			const stepsHtml = stepsArr.join('');
			_stepsHtmlArr = stepsArr;
			const _stepsCount = stepsArr.length;

			// Balance: show every add-on group, but only non-optional groups are required.
			const _balCats = [];
			if (addProtein.length) _balCats.push({ key: 'p', label: 'Белок',    prefix: 'p', optional: !!(_autoAdd._optional && _autoAdd._optional.protein) });
			if (addFat.length)     _balCats.push({ key: 'f', label: 'Жиры',     prefix: 'f' });
			if (addCarbs.length)   _balCats.push({ key: 'c', label: 'Углеводы', prefix: 'c' });
			if (addFiber.length)   _balCats.push({ key: 'fi', label: 'Клетчатка', prefix: 'fi' });
			// Required groups are completed before any optional group. This keeps the
			// balance flow clear for soups and recipes such as Grechotto: fiber first,
			// then optional protein.
			const balanceGroupOrder = { p: 0, f: 1, c: 2, fi: 3 };
			_balCats.sort((a, b) =>
				(Number(a.optional) - Number(b.optional)) ||
				(balanceGroupOrder[a.prefix] - balanceGroupOrder[b.prefix])
			);
			_balCats.forEach((c, i) => { c.stepIndex = i; });
			_balGroups = _balCats;
			_balRequired = _balCats.filter(c => !c.optional);
			_wizardStep = 0;
			_wizardCollapsed = false;
			_accordionOpen = { p: false, f: false, c: false, fi: false };
			if (_balCats[0]) _accordionOpen[_balCats[0].prefix] = true;

			const balProgressHtml = _balRequired.map(c => {
				return `<div class="bal-progress-item" id="bal-pill-${c.key}">
                    <span class="bal-progress-check" id="bal-chk-${c.key}"></span>
                    <span class="bal-progress-label">${escHtml(c.label)}</span>
                    <span class="bal-progress-status" id="bal-pst-${c.key}">требуется</span>
                </div>`;
			}).join('');

			// Group lookups for stepIndex
			const stepOf = {};
			_balCats.forEach(c => { stepOf[c.prefix] = c.stepIndex; });
			const addItemsByPrefix = { p: addProtein, f: addFat, c: addCarbs, fi: addFiber };

			const hasRequiredBalanceGroups = _balRequired.length > 0;
			const balanceBannerHtml = hasRequiredBalanceGroups
				? `<div class="bal-banner-label">Баланс блюда</div>
					<div class="bal-banner-title">Сделайте приём пищи полноценным</div>
					<div class="bal-banner-sub">Добавьте недостающие группы — КБЖУ пересчитается автоматически.</div>
					<div class="bal-progress">${balProgressHtml}</div>`
				: `<div class="bal-banner-label">Добавки к блюду</div>
					<div class="bal-banner-title">Настройте блюдо под себя</div>
					<div class="bal-banner-sub">Белок — по желанию: выберите его, если хотите больше сытости.</div>`;
			const sidebarHtml = hasAdditions ? `
            <div class="bal-sidebar anim anim-d2" id="bal-sidebar" data-wizard-step="0">
                <div id="bal-banner" class="bal-banner bal-banner-warn">
                    ${balanceBannerHtml}
                </div>
                <div class="bal-wizard-head" id="bal-wizard-head">
                    <div class="bal-wizard-step-row">
                        <span class="bal-wizard-step-counter" id="bal-wizard-counter">Шаг 1 из ${_balCats.length}</span>
                        <div class="bal-wizard-dots" id="bal-wizard-dots"></div>
                    </div>
                    <div class="bal-wizard-title-row">
                        <span class="bal-wizard-icon" id="bal-wizard-icon">01</span>
                        <div>
                            <div class="bal-wizard-label" id="bal-wizard-label">Белок</div>
                            <div class="bal-wizard-hint" id="bal-wizard-hint">Добавь белка для сытости</div>
                        </div>
                    </div>
                </div>
				${_balCats.map(c => buildGroup(c.prefix, addItemsByPrefix[c.prefix], stepOf[c.prefix])).join('')}
                <div class="bal-wizard-nav">
                    <button type="button" class="bal-wizard-prev" id="bal-wizard-prev" data-recipe-action="balance-wizard" data-delta="-1">← Назад</button>
                    <button type="button" class="bal-wizard-next" id="bal-wizard-next" data-recipe-action="balance-wizard" data-delta="1">Далее →</button>
                </div>
                <div class="bal-total" id="bal-total-bar">
                    <div class="bal-total-header">
                        <span class="bal-total-label" id="bal-total-label">Итого · блюдо + добавки</span>
                        <span class="bal-total-balanced-note">✓ Сбалансировано</span>
                    </div>
                    <div class="bal-total-kcal-row">
                        <span class="bal-total-kcal" id="bal-total-kcal">${Number(r.kcal)}</span>
                        <span class="bal-total-kcal-unit">Ккал</span>
                    </div>
                    <div class="bal-total-cells">
                        <div class="bal-total-cell"><b id="add-macro-p">${Number(r.protein)}г</b><span>Белки</span></div>
                        <div class="bal-total-cell"><b id="add-macro-f">${Number(r.fat)}г</b><span>Жиры</span></div>
                        <div class="bal-total-cell"><b id="add-macro-c">${Number(r.carbs)}г</b><span>Углев.</span></div>
                        <div class="bal-total-cell"><b id="add-macro-fi">${Number(r.fiber || 0)}г</b><span>Клетч.</span></div>
                    </div>
                    <div class="bal-total-disclaimer">Расчёт примерный: значения могут немного отличаться в зависимости от продукта, бренда и жирности</div>
                </div>
            </div>` : '';

			const alreadyInPlate = isInPlate();
			const fiberCell = (r.fiber !== undefined)
				? `<div class="kbzhu-cell"><div class="kbzhu-val" id="kbzhu-fiber">~${Number(r.fiber)}г</div><div class="kbzhu-lbl">Клетчатка</div></div>`
				: '';

			const tipHtml = r.tip ? `<div class="julia-tip">
            <img src="https://voronova.online/images/YV-small.webp" alt="Юлия" class="julia-tip-ava" data-recipe-image-fallback="hide">
            <div class="julia-tip-bubble">
                <div class="julia-tip-text">«${escHtml(r.tip)}»</div>
            </div>
        </div>` : '';

			// Recipe meta: rating stars + date
			// Stars and count will be filled from API by loadReviews()
			const isFav = Favorites.has(r.id);
			const starsRow = [1, 2, 3, 4, 5].map(i =>
				`<button class="star r-star${i <= 0 ? ' filled' : ''}" type="button" aria-label="Открыть отзывы и оценку" data-recipe-action="scroll-to-reviews">★</button>`).join('');
			const voterCount = 0;
			const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
			const dateStr = r.added || '';

			// Breadcrumbs: Главная › <mid> › <recipe name>
			// `mid` is derived from URL context (parent → search → fromCat → r.cat),
			// not hardcoded. Falls back to single-level when no category is known.
			const crumbsHtml = (() => {
				const parts = ['<a href="index.html">Главная</a>'];
				const parent = (parentRecipeId && parentRecipeId !== r.id && RECIPES[parentRecipeId]) ? RECIPES[parentRecipeId] : null;
				if (parent) {
					parts.push('<a href="' + escHtml(recipeLink(parent.id)) + '">' + escHtml(parent.name) + '</a>');
				} else if (fromCat === 'search' && searchQ) {
					parts.push('<a href="category.html?q=' + encodeURIComponent(searchQ) + '">Поиск</a>');
				} else {
					// Real category from URL takes priority; fallback to recipe's own cat
					// (so plate/search without query degrade gracefully).
					const catId = (fromCat && fromCat !== 'plate' && fromCat !== 'search' && CATEGORIES[fromCat])
						? fromCat
						: (r.cat && CATEGORIES[r.cat] ? r.cat : (Array.isArray(r.categories) && r.categories.find(c => CATEGORIES[c]) || ''));
					if (catId && CATEGORIES[catId]) {
						parts.push('<a href="category.html?cat=' + encodeURIComponent(catId) + '">' + escHtml(CATEGORIES[catId].name) + '</a>');
					}
				}
				parts.push('<span class="crumb-current">' + escHtml(r.name) + '</span>');
				return parts.join('<span class="crumb-sep">›</span>');
			})();

			const guestHelpParams = new URLSearchParams(location.search);
			const guestHelpRequested = guestHelpParams.get('guestHelp') === '1';
			const guestHelpForced = guestHelpParams.get('guestTour') === '1';
			let guestTourCompleted = false;
			try {
				guestTourCompleted = localStorage.getItem('smartplate_guest_tour_completed_v1') === '1';
			} catch (_) {}
			const guestHelpHtml = guestHelpRequested && (guestHelpForced || !guestTourCompleted)
				? `<section class="recipe-guest-helper" aria-label="Подсказка по рецепту">
					<button class="recipe-guest-helper-dismiss" type="button" data-recipe-action="dismiss-guest-helper" aria-label="Больше не показывать">×</button>
					<div>
						<h2>Посмотрите, как работает «Баланс блюда»</h2>
						<p>Система подскажет, чего не хватает рецепту до полноценного приёма пищи. Здесь же можно посмотреть рейтинг, прочитать отзывы и проголосовать за съёмку видеорецепта.</p>
					</div>
					<div class="recipe-guest-helper-actions">
						<button class="recipe-guest-helper-btn" type="button" data-recipe-action="scroll-to-balance">Перейти к балансу</button>
						<a class="recipe-guest-helper-back" href="index.html?guestTour=1">Все возможности платформы →</a>
					</div>
				</section>`
				: '';

			const guestFreeRecipeCtaHtml = (() => {
				if (_asIngredient || !Auth.isGuest() || !Auth.isFreeRecipe(r)) return '';
				const trialRecipeCount = Object.values(RECIPES).filter(recipe =>
					Auth.recipeAccessLevel(recipe) === 'trial'
				).length;
				if (!trialRecipeCount) return '';
				const recipeWord = trialRecipeCount === 1 ? 'рецепту' : 'рецептам';
				return `<section class="recipe-preview free-recipe-cta" aria-label="Пробный доступ">
					<div class="rp-cta-block">
						<div class="rp-cta-icon" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
						</div>
						<div class="rp-cta-title">Хотите больше рецептов?</div>
						<div class="free-recipe-cta-copy">Получите 7 дней доступа ещё к ${trialRecipeCount} ${recipeWord} — бесплатно и без привязки карты.</div>
						<a class="rp-cta-btn" href="${escHtml(Auth._loginUrl())}" data-recipe-action="track-registration-cta">Получить доступ на 7 дней</a>
						<div class="rp-cta-note"><p>Регистрация по email. После пробного периода подписка — только по вашему желанию.</p></div>
					</div>
				</section>`;
			})();

			document.getElementById('page-content').innerHTML = `
            ${guestHelpHtml}
            <div class="recipe-layout">
                <div class="recipe-main anim">
                    <nav class="recipe-crumbs" aria-label="Хлебные крошки">${crumbsHtml}</nav>
                    <div class="recipe-title-row">
                        <h1 class="recipe-title">${escHtml(r.name)}</h1>
                        <button class="recipe-title-share" type="button" data-recipe-action="share-recipe" aria-label="Поделиться рецептом" title="Поделиться">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7"/>
                                <path d="M16 6l-4-4-4 4"/>
                                <path d="M12 2v13"/>
                            </svg>
                        </button>
                    </div>
                    <div class="recipe-meta-row" id="recipe-stars-row">
                        <span class="recipe-meta-stars">
                            ${starsRow}
                            <span id="recipe-voter-count" style="color:var(--text-3)">(${voterCount})</span>
                        </span>
                    </div>
                    <div class="recipe-badges">
                        <span class="recipe-badge">${typeof timeIcon === 'function' ? timeIcon() : ''}${r.timeLabel ? escHtml(r.timeLabel) : Number(r.time) + ' мин'}</span>
                        <span class="recipe-badge">${typeof diffIcon === 'function' ? diffIcon(r.diff) : ''}${escHtml(diff)}</span>
                        <span class="recipe-badge">${quantityBadge}</span>
                        ${dateStr ? `<span class="recipe-badge" style="color:var(--text-3);font-weight:500">Рецепт добавлен: ${escHtml(dateStr)}</span>` : ''}
                    </div>
					<div class="recipe-hero-img">
						<img src="${escHtml(photoUrl(r.photo) || PHOTO_BY_CAT[r.cat] || PHOTO_FALLBACK)}"
							 alt="${escHtml(r.name)}"
							 loading="eager" fetchpriority="high" decoding="async"
                             style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"
                             data-fallback-emoji="${escHtml(r.emoji)}">
                        ${!r.photo ? `<div class="recipe-hero-emoji" style="position:relative;font-size:64px;z-index:1;text-shadow:0 2px 8px rgba(0,0,0,.3)">${escHtml(r.emoji)}</div>` : ''}
						<button class="card-fav-btn${isFav ? ' active' : ''}" id="recipe-fav-btn" type="button"
							aria-label="${isFav ? 'Убрать рецепт из избранного' : 'Добавить рецепт в избранное'}" aria-pressed="${isFav ? 'true' : 'false'}"
							data-recipe-action="toggle-favorite">
							<svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
						</button>
                        <div class="photo-overlay">
							<button class="photo-rating-pill" id="recipe-rpill" type="button"
								data-recipe-action="scroll-to-reviews">
								<span class="pr-label">Рейтинг</span>
								<span class="pr-star">★</span>
								<span class="pr-val" id="recipe-rating-val">—</span>
							</button>
							<button class="photo-comment-btn" id="review-action-btn" type="button" data-recipe-action="scroll-to-review-form">
								<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
								<span id="review-action-label">${Auth.isLoggedIn() ? 'Оставить отзыв' : 'Отзывы'}</span>
							</button>
                        </div>
                    </div>
                    ${r.quote ? `<div class="julia-tip" style="margin-top:0;margin-bottom:18px">
                        <div class="julia-tip-bubble">
                            <div class="julia-tip-byline">
                                <img src="https://voronova.online/images/YV-small.webp" alt="Юлия Воронова" class="julia-tip-ava" data-recipe-image-fallback="hide">
                                <div class="julia-tip-author">
                                    <span class="julia-tip-author-name">Юлия Воронова</span>
                                    <span class="julia-tip-author-role">Автор Умной Тарелки</span>
                                </div>
                            </div>
                            <div class="julia-tip-text">«${escHtml(r.quote)}»</div>
                        </div>
                    </div>` : ''}
                    <div class="v-section-title" style="margin-bottom:8px">В одной порции блюда:</div>
                    <div class="kbzhu" id="kbzhu-block">
                        <div class="kbzhu-cell main"><div class="kbzhu-val" id="kbzhu-kcal">~${Number(r.kcal)}</div><div class="kbzhu-lbl">Ккал</div></div>
                        <div class="kbzhu-cell"><div class="kbzhu-val" id="kbzhu-protein">~${Number(r.protein)}г</div><div class="kbzhu-lbl">Белки</div></div>
                        <div class="kbzhu-cell"><div class="kbzhu-val" id="kbzhu-fat">~${Number(r.fat)}г</div><div class="kbzhu-lbl">Жиры</div></div>
                        <div class="kbzhu-cell"><div class="kbzhu-val" id="kbzhu-carbs">~${Number(r.carbs)}г</div><div class="kbzhu-lbl">Углеводы</div></div>
                        ${fiberCell}
                    </div>
                    <div class="kbzhu-disclaimer">Расчёт примерный: значения могут немного отличаться в зависимости от продукта, бренда и жирности</div>

                    <div class="recipe-section-head recipe-ingredients-head">
                        <div class="v-section-title">Ингредиенты</div>
                        <div class="recipe-section-actions">
                            <button class="recipe-share-btn" type="button" data-recipe-action="open-grocery-list">Список покупок</button>
                        </div>
                    </div>
                    <div class="ing-list">${ingHtml}</div>
                    ${preparationNote ? `<section class="recipe-preparation-note" aria-labelledby="preparation-note-title">
                        <h2 class="recipe-preparation-note-title" id="preparation-note-title">Важно при приготовлении</h2>
                        <div class="recipe-preparation-note-text">${escHtml(preparationNote)}</div>
                    </section>` : ''}
                    ${(() => {
                        const startPhoto = r.photo ? derivePhoto(r.photo, 'start') : (r.id ? `images/recipes/${r.id}/${r.id}-start.webp` : '');
						return startPhoto ? `<div class="recipe-ingredients-photo"><img class="step-photo-img" src="${escHtml(photoUrl(startPhoto))}" alt="Ингредиенты" loading="lazy" decoding="async" data-recipe-image-fallback="step"></div>` : '';
                    })()}

                    <div class="steps-head">
                        <div class="v-section-title">Приготовление</div>
                        ${_stepsCount > 1 ? `<button class="steps-mode-btn" id="steps-mode-btn" type="button" data-recipe-action="toggle-stepper-mode">
                            <span class="steps-mode-icon" id="steps-mode-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5h12"/><path d="M8 12h12"/><path d="M8 19h12"/><path d="M3.5 5h.01"/><path d="M3.5 12h.01"/><path d="M3.5 19h.01"/></svg></span>
                            <span id="steps-mode-label">Пошагово</span>
                        </button>` : ''}
                    </div>
                    ${_stepsCount > 8 ? `<div class="steps-hint" id="steps-hint" hidden>
                        <span class="steps-hint-icon">💡</span>
                        <span class="steps-hint-text">Совет: включите <b>«Пошагово»</b> — так удобнее готовить длинный рецепт.</span>
                        <button class="steps-hint-close" type="button" data-recipe-action="dismiss-steps-hint" aria-label="Закрыть подсказку"><svg class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="5" y1="19" x2="19" y2="5"/></svg></button>
                    </div>` : ''}
                    <div class="steps-omit-hints" id="steps-omit-hints" hidden></div>
                    <div class="steps-list" id="steps-list">${stepsHtml}</div>
                    ${_stepsCount > 3 ? `<button class="steps-expand-btn" id="steps-expand-btn" type="button" data-recipe-action="toggle-steps-expanded">
                        <span id="steps-expand-label">Показать все шаги (${_stepsCount})</span>
                        <span class="steps-expand-arrow" id="steps-expand-arrow">▾</span>
                    </button>` : ''}
                    ${_stepsCount > 1 ? `<div class="steps-stepper" id="steps-stepper" hidden>
                        <div class="stepper-progress">
                            <span class="stepper-progress-text">Шаг <span id="stepper-current-n">1</span> из <span id="stepper-total-n">${_stepsCount}</span></span>
                            <div class="stepper-bar" id="stepper-bar" aria-hidden="true"></div>
                        </div>
                        <div class="stepper-current" id="stepper-current"></div>
                        <label class="stepper-done">
                            <input type="checkbox" id="stepper-done-cb" data-recipe-change="toggle-stepper-done">
                            <span>Выполнено</span>
                        </label>
                        <div class="stepper-nav">
                            <button class="stepper-nav-btn" id="stepper-prev" type="button" data-recipe-action="stepper-prev">← Назад</button>
                            <button class="stepper-nav-btn stepper-nav-next" id="stepper-next" type="button" data-recipe-action="stepper-next">Далее →</button>
                        </div>
                    </div>` : ''}

                    ${!simpleMode && (r.ytVideo || r.vkVideo || r.dzenVideo) ? (() => {
					const vids = [];
					if (r.vkVideo) vids.push({ key: 'vk', label: 'VK Видео', icon: '<svg viewBox="0 0 24 24"><path d="M21.6 7.2s.2-1.1-.4-1.6c-.5-.5-1-.5-1.3-.5C17.3 5 12 5 12 5s-5.3 0-7.9.1c-.3 0-.8 0-1.3.5-.6.5-.4 1.6-.4 1.6S2 8.5 2 9.9v1.3c0 1.3.4 2.7.4 2.7s.2 1.1.7 1.6c.7.7 1.6.7 2 .7 1.4.1 6 .2 6 .2s5.3 0 7.9-.2c.3 0 .8 0 1.3-.5.6-.5.4-1.6.4-1.6s.3-1.3.3-2.7V9.9c0-1.3-.4-2.7-.4-2.7zM9.5 15V8.5l6.5 3.3L9.5 15z" fill="currentColor"/></svg>', color: '#0077FF', url: r.vkVideo });
					if (r.ytVideo) vids.push({ key: 'yt', label: 'YouTube', icon: '<svg viewBox="0 0 24 24"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2 31.4 31.4 0 000 12a31.4 31.4 0 00.5 5.8 3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1A31.4 31.4 0 0024 12a31.4 31.4 0 00-.5-5.8zM9.5 15.6V8.4l6.3 3.6-6.3 3.6z" fill="currentColor"/></svg>', color: '#FF0000', url: r.ytVideo });
					if (r.dzenVideo) vids.push({ key: 'dzen', label: 'Дзен', icon: '<svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8z" fill="currentColor"/><path d="M11 7.5L16 12l-5 4.5V7.5z" fill="currentColor"/></svg>', color: '#000', url: r.dzenVideo });
					return `
                        <div class="video-recipe-section">
                            <div class="v-section-title" style="margin-top:20px">Видеорецепт</div>
                            <div class="video-platform-tabs" id="video-tabs">
                                ${vids.map((v, i) => `<button class="video-tab${i === 0 ? ' active' : ''}" data-key="${v.key}" style="--tab-color:${v.color}">
                                    <span class="video-tab-icon">${v.icon}</span>
                                    <span class="video-tab-label">${escHtml(v.label)}</span>
                                </button>`).join('')}
                            </div>
                            <div class="video-player-wrap" id="video-player">
								${vids.map((v, i) => `<div class="video-frame${i === 0 ? ' active' : ''}" data-key="${v.key}" data-label="${escHtml(v.label)}" data-url="${escHtml(v.url)}" data-poster="${escHtml(photoUrl(r.photo) || '')}">
                                </div>`).join('')}
                            </div>
                        </div>`;
				})() : ''}

				${!simpleMode && !(r.ytVideo || r.vkVideo || r.dzenVideo) ? `
					<div class="video-request-section" id="video-request-section" aria-live="polite">
						<div id="video-request-content" class="video-request-loading">Загружаем голоса за видеорецепт…</div>
					</div>` : ''}

					${tipHtml}
					${guestFreeRecipeCtaHtml}

					<!-- On mobile: sidebar appears here, after recipe content, before reviews -->
                    <div id="sidebar-mobile" style="margin-top:20px;display:none"></div>

                    <!-- Reviews section -->
					<section class="reviews-section" id="reviews-section" aria-labelledby="reviews-title">
						<h2 class="reviews-title" id="reviews-title" tabindex="-1">Отзывы</h2>
                        <div id="reviews-list" style="margin-bottom:16px"></div>
						<div class="review-form-wrap" id="review-form-wrap" data-recipe-action="close-review-outside">
							${Auth.isLoggedIn() ? `
							<div class="review-form">
								<button class="review-form-modal-close" type="button" data-recipe-action="close-review-form" aria-label="Закрыть">×</button>
								<h3 class="review-form-modal-title">Оставить отзыв</h3>
                                <div class="review-form-stars" id="review-form-stars">
									${[1, 2, 3, 4, 5].map(i => `<button class="star review-star" type="button" data-recipe-action="set-review-stars" data-n="${i}" aria-label="Оценка ${i} из 5" aria-pressed="false">★</button>`).join('')}
								</div>
                                <textarea id="review-text" class="review-textarea" placeholder="Ваш отзыв может помочь другим пользователям сделать выбор." maxlength="1000" rows="3"></textarea>
                                <div style="display:flex;align-items:center;justify-content:space-between">
                                    <span class="review-char-count" id="review-char-count">0 / 1000</span>
                                    <button class="recipe-review-submit" id="review-submit-btn" type="button" data-recipe-action="submit-review">Отправить</button>
                                </div>
                            </div>` : `<div style="font-size:13px;color:var(--text-3);margin-bottom:12px"><a href="${Auth._loginUrl()}" style="color:var(--accent);text-decoration:underline">Войдите</a>, чтобы оставить отзыв</div>`}
						</div>
					</section>
                </div>

                <!-- Desktop sidebar -->
                <div class="recipe-sidebar" id="sidebar-desktop">
                    ${sidebarHtml}
                </div>
            </div>`;

			// Place sidebar in correct container for current viewport
			placeSidebarForViewport();

			// Initial wizard UI (fills step counter, dots, icon, label, buttons)
			if (_balGroups.length) updateWizardUI();

			// Sticky mini balance status: init observer + initial state
			updateMiniBalanceStatus();
			setupBalBannerObserver();

			// Stars: animate when entering viewport
			const starsRowEl = document.getElementById('recipe-stars-row');
			if (starsRowEl && 'IntersectionObserver' in window) {
				const io = new IntersectionObserver(function (entries) {
					if (entries[0].isIntersecting) {
						starsRowEl.classList.add('stars-animate');
						io.disconnect();
					}
				}, { threshold: 0.5 });
				io.observe(starsRowEl);
			}

			refreshAddButtonStateByPlate();

			// Init steps UI (mobile compact + stepper)
			initStepsUI();

			// Init first video tab immediately after DOM insert
			initVideoTabs();
			loadVideoRequest();
		}

		// subItemRegistry declared above (before renderRecipe call)

		function _renderBalItem(item, prefix, i) {
			const key = prefix + '-' + i;
			const hasRecipe = item.recipeId;
			const hasCat = item.catLink;
			const isChecked = !!checkedItems[key];
			const checkedCls = isChecked ? ' checked' : '';
			const amountHtml = item.amount ? ` <span class="bal-item-amount">· ${escHtml(item.amount)}</span>` : '';
			const linkedAmountHtml = item.amount ? `<span class="bal-item-amount bal-item-linked-amount">${escHtml(item.amount)}</span>` : '';
			if (hasRecipe || hasCat) {
				if (hasRecipe) subItemRegistry[key] = item;
				const targetUrl = hasRecipe
					? recipeLink(item.recipeId, { asIngredient: true, parentRecipeId: r.id })
					: 'category.html?cat=' + encodeURIComponent(item.catLink);
				const targetLabel = hasRecipe ? '' : 'Выбрать из списка';
				return `<div class="bal-item bal-item-linked${checkedCls}" id="ai-${key}" style="position:relative">
							<button class="bal-item-select" type="button" data-balance-key="${escHtml(key)}" data-item-name="${escHtml(item.name)}" data-kcal="${Number(item.kcal || 0)}" data-protein="${Number(item.protein || 0)}" data-fat="${Number(item.fat || 0)}" data-carbs="${Number(item.carbs || 0)}" data-fiber="${Number(item.fiber || 0)}" aria-pressed="${isChecked ? 'true' : 'false'}" aria-label="${isChecked ? 'Убрать' : 'Добавить'} ${escHtml(item.name)}">
								<span class="bal-item-check" id="chk-${key}" aria-hidden="true"></span>
							</button>
							<div class="bal-item-linked-content">
								<a class="bal-item-recipe-link bal-item-text" href="${escHtml(targetUrl)}">
									<span class="bal-item-link-title"><span class="bal-item-name">${escHtml(item.name)}</span><svg class="bal-item-link-icon" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 5h5v5"/><path d="m10 14 9-9"/><path d="M19 13v6H5V5h6"/></svg></span>
									${targetLabel ? `<span class="bal-item-recipe-label">${targetLabel}</span>` : ''}
								</a>
								${linkedAmountHtml}
							</div>
							<div class="bal-item-kcal">+${Number(item.kcal)}</div>
						</div>`;
			} else {
				return `<button class="bal-item${checkedCls}" id="ai-${key}" data-balance-key="${escHtml(key)}" data-kcal="${Number(item.kcal || 0)}" data-protein="${Number(item.protein || 0)}" data-fat="${Number(item.fat || 0)}" data-carbs="${Number(item.carbs || 0)}" data-fiber="${Number(item.fiber || 0)}" style="position:relative">
                            <div class="bal-item-check" id="chk-${key}"></div>
                            <div class="bal-item-text">
								<span class="bal-item-name">${escHtml(item.name)}${amountHtml}</span>
                            </div>
                            <div class="bal-item-kcal">+${Number(item.kcal)}</div>
                        </button>`;
			}
		}

		function _hasHiddenSelected(prefix, items) {
			return Object.keys(checkedItems).some(k => {
				if (!k.startsWith(prefix + '-')) return false;
				const idx = parseInt(k.slice(prefix.length + 1), 10);
				return idx >= GROUP_COLLAPSE_LIMIT && idx < items.length;
			});
		}

		function buildGroup(prefix, items, stepIndex) {
			if (!items || !items.length) return '';
			const meta = GROUP_META[prefix] || {};
			const group = _balGroups.find(c => c.prefix === prefix) || {};
			const optional = !!group.optional;
			const title = optional ? (group.label || meta.shortLabel || meta.title) : meta.title;
			_groupConfig[prefix] = { items, stepIndex, title, optional };
			const shouldCollapse = items.length > GROUP_COLLAPSE_LIMIT;
			const expanded = !!expandedGroups[prefix];
			const visible = (shouldCollapse && !expanded) ? items.slice(0, GROUP_COLLAPSE_LIMIT) : items;
			const openCls = _accordionOpen[prefix] ? ' open' : '';
			const toggleHtml = shouldCollapse
				? `<div class="bal-group-toggle-wrap">
                    <button type="button" class="bal-group-toggle${expanded ? ' is-expanded' : ''}" data-recipe-action="toggle-group" data-prefix="${escHtml(prefix)}">
                        ${expanded ? 'Свернуть' : 'Показать ещё ' + (items.length - GROUP_COLLAPSE_LIMIT)}
                        ${(!expanded && _hasHiddenSelected(prefix, items)) ? '<span class="bal-group-toggle-dot" title="В скрытой части есть выбранное"></span>' : ''}
                        <span class="bal-group-toggle-caret" aria-hidden="true"></span>
                    </button>
                </div>`
				: '';
			const numStr = String(stepIndex + 1).padStart(2, '0');
			return `<div class="bal-group${openCls}" id="bal-group-${prefix}" data-prefix="${prefix}" data-step="${stepIndex}">
            <button type="button" class="bal-group-head" data-recipe-action="toggle-accordion" data-prefix="${escHtml(prefix)}">
                <span class="bal-group-num">${numStr}</span>
                <span class="bal-group-label">${escHtml(title || '')}</span>
                <span class="bal-group-status"><span class="bal-group-status-todo">${optional ? 'по желанию' : '+ выбрать'}</span><span class="bal-group-status-done">✓ выбрано</span></span>
                <span class="bal-group-caret">▾</span>
            </button>
            <div class="bal-group-body">
				${optional ? '<div class="bal-group-optional-note">Добавьте, если хотите больше сытости.</div>' : ''}
                <div class="bal-group-items" id="bal-group-items-${prefix}">
                    ${visible.map((item, i) => _renderBalItem(item, prefix, i)).join('')}
                </div>
                ${toggleHtml}
            </div>
        </div>`;
		}

		function toggleGroupExpand(prefix) {
			const cfg = _groupConfig[prefix];
			if (!cfg) return;
			expandedGroups[prefix] = !expandedGroups[prefix];
			const oldEl = document.getElementById('bal-group-' + prefix);
			if (!oldEl) return;
			const wrap = document.createElement('div');
			wrap.innerHTML = buildGroup(prefix, cfg.items, cfg.stepIndex).trim();
			const newEl = wrap.firstChild;
			if (newEl) {
				oldEl.parentNode.replaceChild(newEl, oldEl);
				// Rebuild stripped class state from current selection — .done (group has a checked item)
				// and .open (desktop accordion state). Otherwise the visual indicator disappears
				// until the next toggleAddItem → checkBalance.
				const hasChecked = Object.keys(checkedItems).some(k => k.replace(/-\d+$/, '') === prefix);
				newEl.classList.toggle('done', hasChecked);
				newEl.classList.toggle('open', !!_accordionOpen[prefix]);
			}
		}

		// Desktop accordion: toggle one group open/closed (multiple can be open at once)
		function balToggleAccordion(prefix) {
			// Mobile keeps group headings visible as a quick way to move through the
			// wizard. The active heading also works as an accordion toggle.
			if (window.innerWidth <= 1024) {
				const step = _balGroups.findIndex(group => group.prefix === prefix);
				if (step < 0) return;
				if (step === _wizardStep) {
					_wizardCollapsed = !_wizardCollapsed;
					updateWizardUI();
				} else {
					balWizardSetStep(step);
				}
				return;
			}
			_accordionOpen[prefix] = !_accordionOpen[prefix];
			const el = document.getElementById('bal-group-' + prefix);
			if (el) el.classList.toggle('open', !!_accordionOpen[prefix]);
		}

		// Mobile wizard: step navigation
		function balWizardGo(delta) {
			const total = _balGroups.length;
			if (!total) return;
			const next = _wizardStep + delta;
			if (next < 0 || next >= total) return;
			balWizardSetStep(next);
		}
		function balWizardSetStep(i) {
			const total = _balGroups.length;
			if (!total || i < 0 || i >= total) return;
			_wizardStep = i;
			_wizardCollapsed = false;
			updateWizardUI();
		}
		function updateWizardUI() {
			const root = document.getElementById('bal-sidebar');
			if (!root) return;
			const total = _balGroups.length;
			if (!total) return;
			const cat = _balGroups[_wizardStep];
			if (!cat) return;
			const meta = GROUP_META[cat.prefix] || {};
			root.dataset.wizardStep = String(_wizardStep);
			root.dataset.wizardCollapsed = String(_wizardCollapsed);

			// Editorial: clear any legacy per-group color vars so the wizard head
			// stays in the neutral palette (--accent / --text) regardless of step.
			const head = document.getElementById('bal-wizard-head');
			if (head) {
				head.style.removeProperty('--g-bg');
				head.style.removeProperty('--g-border');
				head.style.removeProperty('--g-color');
			}
			const counterEl = document.getElementById('bal-wizard-counter');
			if (counterEl) counterEl.textContent = `Шаг ${_wizardStep + 1} из ${total}`;
			const iconEl = document.getElementById('bal-wizard-icon');
			if (iconEl) iconEl.textContent = String(_wizardStep + 1).padStart(2, '0');
			const labelEl = document.getElementById('bal-wizard-label');
			if (labelEl) labelEl.textContent = cat.optional ? ((meta.shortLabel || cat.label) + ' · по желанию') : (meta.shortLabel || cat.label);
			const hintEl = document.getElementById('bal-wizard-hint');
			if (hintEl) hintEl.textContent = cat.optional ? 'Добавьте, если хотите больше сытости.' : (meta.title || '');

			// Dots — single accent palette (active/done = accent, idle = border)
			const dotsEl = document.getElementById('bal-wizard-dots');
			if (dotsEl) {
				const checkedPrefixes = new Set(Object.keys(checkedItems).map(k => k.replace(/-\d+$/, '')));
				dotsEl.innerHTML = _balGroups.map((c, i) => {
					const done = checkedPrefixes.has(c.prefix);
					const cls = i === _wizardStep ? 'bal-wizard-dot active' : (done ? 'bal-wizard-dot done' : 'bal-wizard-dot');
					return `<div class="${cls}" data-recipe-action="wizard-step" data-index="${Number(i)}"></div>`;
				}).join('');
			}

			// Next / Prev buttons — accent only, no group color
			const prevBtn = document.getElementById('bal-wizard-prev');
			if (prevBtn) prevBtn.disabled = _wizardStep === 0;
			const nextBtn = document.getElementById('bal-wizard-next');
			if (nextBtn) {
				const checkedPrefixes = new Set(Object.keys(checkedItems).map(k => k.replace(/-\d+$/, '')));
				const groupDone = checkedPrefixes.has(cat.prefix);
				const isLast = _wizardStep >= total - 1;
				const allDone = _balRequired.every(c => checkedPrefixes.has(c.prefix));
				if (isLast) {
					nextBtn.textContent = allDone ? '✓ Готово!' : 'Заполни все группы';
					nextBtn.disabled = !allDone;
				} else {
					nextBtn.textContent = 'Далее →';
					// Блокируем переход пока пользователь не выбрал добавку в текущей группе
					nextBtn.disabled = !cat.optional && !groupDone;
				}
				// Clear any inline colors from the colored era — CSS now drives styling.
				nextBtn.style.removeProperty('background');
				nextBtn.style.removeProperty('color');
				nextBtn.style.cursor = nextBtn.disabled ? 'default' : 'pointer';
			}
		}

		function addSubToPlate(key, event) {
			event.stopPropagation();
			const btn = document.getElementById('sub-add-' + key);
			if (btn && btn.disabled) return;
			const item = subItemRegistry[key];
			if (!item) return;
			const linked = (item.recipeId && typeof RECIPES !== 'undefined') ? RECIPES[item.recipeId] : null;
			const added = Plate.add({
				name: item.name,
				emoji: item.emoji || '🍴',
				photo: item.photo || (linked && linked.photo) || '',
				kcal: item.kcal || 0,
				protein: item.protein || 0,
				fat: item.fat || 0,
				carbs: item.carbs || 0,
				fiber: item.fiber || 0,
				recipeId: item.recipeId,
				ingredients: []
			});
			if (!added) {
				showToast((item.emoji || '🍴') + ' Это блюдо уже в тарелке');
				return;
			}
			if (btn) {
				btn.textContent = '✓ В тарелке';
				btn.disabled = true;
				btn.className = 'recipe-inline-action recipe-inline-action-muted';
				btn.style.opacity = '.6';
				btn.style.cursor = 'default';
			}
			updatePlateIcon();
			showToast((item.emoji || '') + ' Добавлено в тарелку!');
		}

		function addonNameKey(name) {
			return String(name || '').split('·')[0].toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
		}

		function plateItemFromSelectedAddon(addon) {
			const linked = (addon.recipeId && typeof RECIPES !== 'undefined') ? RECIPES[addon.recipeId] : null;
			return {
				name: addon.name,
				emoji: (linked && linked.emoji) || addon.emoji || '🥗',
				photo: (linked && linked.photo) || '',
				kcal: addon.kcal || 0,
				protein: addon.protein || 0,
				fat: addon.fat || 0,
				carbs: addon.carbs || 0,
				fiber: addon.fiber || 0,
				recipeId: addon.recipeId || null,
				ingredients: (linked && linked.ingredients) || [],
				parentRecipeId: r.id
			};
		}

		function syncCurrentRecipeAddons() {
			if (!r || !isInPlate()) return;
			const items = Plate.get();
			const mainIndex = items.findIndex(item => item && item.recipeId === r.id);
			if (mainIndex < 0) return;

			// Entries created from now on carry parentRecipeId. For the old simple
			// add-ons, recognise only the adjacent names supplied by this recipe;
			// never touch a separate recipe already present in the plate.
			const availableNames = new Set(Object.values(_groupConfig)
				.flatMap(group => (group.items || []).map(item => addonNameKey(item.name))));
			const legacyIndexes = new Set();
			for (let i = mainIndex + 1; i < items.length; i++) {
				const item = items[i] || {};
				if (item.parentRecipeId || item.recipeId || !availableNames.has(addonNameKey(item.name))) break;
				legacyIndexes.add(i);
			}
			const kept = items.filter((item, index) =>
				!(item && item.parentRecipeId === r.id) && !legacyIndexes.has(index)
			);
			const occupiedRecipeIds = new Set(kept.map(item => item && item.recipeId).filter(Boolean));
			const replacements = Object.values(checkedItems)
				.map(plateItemFromSelectedAddon)
				.filter(item => !item.recipeId || !occupiedRecipeIds.has(item.recipeId));
			const insertAt = kept.findIndex(item => item && item.recipeId === r.id) + 1;
			kept.splice(insertAt, 0, ...replacements);
			Plate.set(kept);
			if (typeof Plate._syncToServer === 'function') Plate._syncToServer();
			showToast('Добавка в тарелке обновлена');
		}

		function toggleSwap(i) {
			const el = document.getElementById('swap-' + i);
			if (el) el.classList.toggle('open');
		}

		function toggleAddItem(key, kcal, protein, fat, carbs, fiber) {
			const btn = document.getElementById('ai-' + key);
			if (!btn) return;
			const setSelected = function (el, selected) {
				if (!el) return;
				el.classList.toggle('checked', selected);
				const control = el.querySelector('.bal-item-select');
				if (control) {
					control.setAttribute('aria-pressed', String(selected));
					control.setAttribute('aria-label', (selected ? 'Убрать ' : 'Добавить ') + (control.dataset.itemName || 'вариант'));
				}
			};
			if (checkedItems[key]) {
				delete checkedItems[key];
				setSelected(btn, false);
			} else {
				// Only one addon per category (prefix p/f/c/fi): clear siblings first
				const prefix = key.replace(/-\d+$/, '');
				Object.keys(checkedItems).forEach(k => {
					if (k.replace(/-\d+$/, '') === prefix) {
						delete checkedItems[k];
						const prev = document.getElementById('ai-' + k);
						setSelected(prev, false);
					}
				});
				const nameEl = btn.querySelector('.bal-item-name') || btn.querySelector('.bal-item-text');
				const name = nameEl ? (nameEl.textContent.trim() || key) : key;
				const src = subItemRegistry[key] || {};
				checkedItems[key] = {
					name,
					kcal,
					protein,
					fat,
					carbs,
					fiber: fiber || 0,
					recipeId: src.recipeId || null,
					emoji: src.emoji || ''
				};
				setSelected(btn, true);
			}
			if (isInPlate()) syncCurrentRecipeAddons();
			updateAddTotal();
		}

		function checkBalance() {
			const checkedPrefixes = new Set(Object.keys(checkedItems).map(k => k.replace(/-\d+$/, '')));
			let allDone = true;
			_balGroups.forEach(cat => {
				const done = checkedPrefixes.has(cat.prefix);
				const pill = document.getElementById('bal-pill-' + cat.key);
				if (pill) pill.classList.toggle('done', done);
				const pst = document.getElementById('bal-pst-' + cat.key);
				if (pst) pst.textContent = done ? 'выбрано' : (cat.optional ? 'по желанию' : 'требуется');
				// Paint the group head (desktop accordion) state
				const groupEl = document.getElementById('bal-group-' + cat.prefix);
				if (groupEl) groupEl.classList.toggle('done', done);
				if (!cat.optional && !done) allDone = false;
			});
			if (!_balRequired.length) {
				updateWizardUI();
				updateMiniBalanceStatus();
				return true;
			}
			// Toggle global "balanced" state on the sidebar root (lights up the ИТОГО block)
			const sidebarRoot = document.getElementById('bal-sidebar');
			if (sidebarRoot) sidebarRoot.classList.toggle('balanced', allDone);
			// Refresh mobile wizard UI (step dots + next button)
			updateWizardUI();
			// Just balanced — collapse all add-on accordions so финальное состояние
			// выглядит компактно. Делаем это один раз, в момент перехода unbalanced → balanced.
			if (allDone && !_wasBalanced) {
				Object.keys(_accordionOpen).forEach(prefix => { _accordionOpen[prefix] = false; });
				document.querySelectorAll('.bal-group.open').forEach(el => el.classList.remove('open'));
			}
			// Update banner
			const banner = document.getElementById('bal-banner');
			if (banner) {
				if (allDone) {
					banner.className = 'bal-banner bal-banner-success';
					banner.innerHTML = `<div class="bal-banner-label">Баланс блюда</div><div class="bal-banner-title">Блюдо сбалансировано</div><div class="bal-banner-sub">Добавьте его в тарелку — это полноценный приём пищи.</div>`;
					if (!_celebrationShown) {
						_celebrationShown = true;
						playBalanceSound();
						showBalanceSuccessModal();
					}
				} else {
					if (_wasBalanced) {
						// was balanced, now not — reset banner (editorial checklist)
						banner.className = 'bal-banner bal-banner-warn';
						const checkedSet = new Set(Object.keys(checkedItems).map(k => k.replace(/-\d+$/, '')));
						const items = _balRequired.map(c => {
							const done = checkedSet.has(c.prefix);
							return `<div class="bal-progress-item${done ? ' done' : ''}" id="bal-pill-${c.key}">
                                <span class="bal-progress-check" id="bal-chk-${c.key}"></span>
                                <span class="bal-progress-label">${escHtml(c.label)}</span>
                                <span class="bal-progress-status" id="bal-pst-${c.key}">${done ? 'выбрано' : 'требуется'}</span>
                            </div>`;
						}).join('');
						banner.innerHTML = `<div class="bal-banner-label">Баланс блюда</div><div class="bal-banner-title">Сделайте приём пищи полноценным</div><div class="bal-banner-sub">Добавьте недостающие группы — КБЖУ пересчитается автоматически.</div><div class="bal-progress">${items}</div>`;
						_celebrationShown = false;
					}
				}
				_wasBalanced = allDone;
			}
			updateMiniBalanceStatus(allDone);
			return allDone;
		}

		// ── Mini balance status (sticky) ───────────────────────────────
		function updateMiniBalanceStatus(allDone) {
			const el = document.getElementById('bal-mini-status');
			if (!el) return;
			if (!_balRequired.length) {
				el.classList.remove('show');
				return;
			}
			const checkedPrefixes = new Set(Object.keys(checkedItems).map(k => k.replace(/-\d+$/, '')));
			const done = _balRequired.filter(c => checkedPrefixes.has(c.prefix)).length;
			const total = _balRequired.length;
			const balanced = (typeof allDone === 'boolean') ? allDone : done === total;
			const progressEl = document.getElementById('bal-mini-progress');
			const labelEl = document.getElementById('bal-mini-label');
			if (balanced) {
				el.classList.add('success');
				if (progressEl) progressEl.textContent = '✓';
				if (labelEl) labelEl.textContent = 'Сбалансировано';
			} else {
				el.classList.remove('success');
				if (progressEl) progressEl.textContent = done + ' / ' + total;
				if (labelEl) labelEl.textContent = 'Добавки';
			}
		}

		function scrollToBalanceBanner() {
			const banner = document.getElementById('bal-banner');
			hideRecipeGuestHelper(false);
			if (!banner) return;
			const rect = banner.getBoundingClientRect();
			if (rect.top >= 12 && rect.bottom <= window.innerHeight - 12) return;
			const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			banner.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
		}

		function hideRecipeGuestHelper(markTourCompleted) {
			if (markTourCompleted) {
				try {
					localStorage.setItem('smartplate_guest_tour_completed_v1', '1');
				} catch (_) {}
			}
			const helper = document.querySelector('.recipe-guest-helper');
			if (helper) helper.remove();
			const url = new URL(location.href);
			url.searchParams.delete('guestHelp');
			url.searchParams.delete('guestTour');
			history.replaceState(null, '', url.pathname + url.search + url.hash);
		}

		function dismissRecipeGuestHelper() {
			hideRecipeGuestHelper(true);
		}

		function handleMiniStatusKey(e) {
			if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
				e.preventDefault();
				scrollToBalanceBanner();
			}
		}

		function ensureBalanceAudio() {
			if (_balanceAudio) return;
			const paths = SOUND_ASSETS.balanceReady;
			_balanceAudioSrcIndex = 0;
			_balanceAudio = new Audio(paths[0]);
			_balanceAudio.preload = 'auto';
			_balanceAudio.addEventListener('error', function () {
				_balanceAudioSrcIndex += 1;
				if (_balanceAudioSrcIndex < paths.length && _balanceAudio) {
					_balanceAudio.src = paths[_balanceAudioSrcIndex];
				}
			});
		}

		function playBalanceFallbackPolyphony() {
			try {
				const AC = window.AudioContext || window.webkitAudioContext;
				if (!AC) return false;
				if (!_audioCtx) _audioCtx = new AC();
				if (_audioCtx.state === 'suspended') _audioCtx.resume();
				const ctx = _audioCtx;
				const now = ctx.currentTime;
				const master = ctx.createGain();
				master.gain.setValueAtTime(0.0001, now);
				master.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
				master.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
				master.connect(ctx.destination);
				[523.25, 659.25, 783.99].forEach(function (frequency, index) {
					const oscillator = ctx.createOscillator();
					oscillator.type = 'triangle';
					oscillator.frequency.setValueAtTime(frequency, now + index * 0.015);
					oscillator.connect(master);
					oscillator.start(now + index * 0.015);
					oscillator.stop(now + 0.34);
				});
				return true;
			} catch (error) {
				if (console && console.debug) console.debug('[balance-sound fallback]', error && error.message);
				return false;
			}
		}

		async function primeBalanceAudio() {
			if (_audioPrimeStarted) return;
			_audioPrimeStarted = true;
			let mp3Ready = false;
			try {
				ensureBalanceAudio();
				_balanceAudio.muted = true;
				_balanceAudio.currentTime = 0;
				await _balanceAudio.play();
				_balanceAudio.pause();
				_balanceAudio.currentTime = 0;
				_balanceAudio.muted = false;
				mp3Ready = true;
			} catch (error) {
				try { if (_balanceAudio) _balanceAudio.muted = false; } catch (_) { }
			}
			if (mp3Ready) {
				_audioMode = 'mp3';
				return;
			}
			try {
				const AC = window.AudioContext || window.webkitAudioContext;
				if (AC) {
					if (!_audioCtx) _audioCtx = new AC();
					if (_audioCtx.state === 'suspended') await _audioCtx.resume();
					if (_audioCtx.state === 'running') _audioMode = 'fallback';
				}
			} catch (_) { }
		}

		function playBalanceSound() {
			if (_audioMode === 'fallback') {
				playBalanceFallbackPolyphony();
				return;
			}
			ensureBalanceAudio();
			_balanceAudio.currentTime = 0;
			let playback;
			try { playback = _balanceAudio.play(); } catch (error) { playback = Promise.reject(error); }
			if (playback && playback.catch) {
				playback.catch(function () {
					_audioMode = 'fallback';
					playBalanceFallbackPolyphony();
				});
			}
		}

		document.addEventListener('pointerdown', primeBalanceAudio, { once: true, capture: true });
		document.addEventListener('keydown', primeBalanceAudio, { once: true, capture: true });
		document.addEventListener('keydown', function (event) {
			if (event.key === 'Escape' && document.getElementById('review-form-wrap')?.classList.contains('is-modal')) closeReviewForm();
		});

		// ── Balance success modal ──────────────────────────────────────────
		let _balSuccessAutoHideTimer = null;
		let _balSuccessPrevFocus = null;
		let _balSuccessStickyPrevVisibility = '';

		function showBalanceSuccessModal() {
			const asIng = new URLSearchParams(location.search).get('asIngredient') === '1';
			if (asIng) return;
			if (typeof isInPlate === 'function' && isInPlate()) return;
			const overlay = document.getElementById('bal-success-modal');
			if (!overlay) return;
			_balSuccessPrevFocus = document.activeElement;
			overlay.classList.add('show');
			overlay.addEventListener('click', _balSuccessBackdropHandler);
			document.addEventListener('keydown', _balSuccessKeyHandler);
			const stickyAdd = document.getElementById('sticky-add');
			if (stickyAdd) {
				_balSuccessStickyPrevVisibility = stickyAdd.style.visibility || '';
				stickyAdd.style.visibility = 'hidden';
			}
			spawnSparkles();
			const primary = document.getElementById('bal-success-primary');
			if (primary) setTimeout(() => { try { primary.focus(); } catch (e) { } }, 50);
			clearTimeout(_balSuccessAutoHideTimer);
		}

		function hideBalanceSuccessModal(reason) {
			const overlay = document.getElementById('bal-success-modal');
			if (!overlay) return;
			if (!overlay.classList.contains('show')) return;
			overlay.classList.remove('show');
			overlay.removeEventListener('click', _balSuccessBackdropHandler);
			document.removeEventListener('keydown', _balSuccessKeyHandler);
			clearTimeout(_balSuccessAutoHideTimer);
			_balSuccessAutoHideTimer = null;
			const stickyAdd = document.getElementById('sticky-add');
			if (stickyAdd) stickyAdd.style.visibility = _balSuccessStickyPrevVisibility;
			const sparkleHost = document.getElementById('bal-sparkle-container');
			if (sparkleHost) sparkleHost.innerHTML = '';
			if (_balSuccessPrevFocus && typeof _balSuccessPrevFocus.focus === 'function') {
				try { _balSuccessPrevFocus.focus(); } catch (e) { }
			}
			_balSuccessPrevFocus = null;
		}

		function _balSuccessBackdropHandler(e) {
			if (e.target && e.target.id === 'bal-success-modal') {
				hideBalanceSuccessModal('backdrop');
			}
		}

		function _balSuccessKeyHandler(e) {
			if (e.key === 'Escape') {
				e.preventDefault();
				hideBalanceSuccessModal('esc');
				return;
			}
			if (e.key === 'Tab') {
				const overlay = document.getElementById('bal-success-modal');
				if (!overlay) return;
				const focusable = overlay.querySelectorAll('button');
				if (!focusable.length) return;
				const first = focusable[0];
				const last = focusable[focusable.length - 1];
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		}

		function confirmBalanceSuccessAdd() {
			hideBalanceSuccessModal('primary');
			addToPlate();
		}

		function setupBalBannerObserver() {
			if (_balBannerObserver) { _balBannerObserver.disconnect(); _balBannerObserver = null; }
			const mini = document.getElementById('bal-mini-status');
			const banner = document.getElementById('bal-banner');
			if (!mini || !banner || !_balRequired.length) {
				if (mini) mini.classList.remove('show');
				return;
			}
			// On mobile this status is persistent: it must stay reachable while reading/cooking.
			if (window.matchMedia && window.matchMedia('(max-width: 767px)').matches) {
				mini.classList.add('show');
				return;
			}
			if (!('IntersectionObserver' in window)) {
				mini.classList.add('show');
				return;
			}
			_balBannerObserver = new IntersectionObserver(function (entries) {
				const visible = entries[0] && entries[0].isIntersecting;
				mini.classList.toggle('show', !visible);
			}, { threshold: 0.15 });
			_balBannerObserver.observe(banner);
		}

		function spawnSparkles() {
			const container = document.getElementById('bal-sparkle-container');
			if (!container) return;
			const emojis = ['✨', '🌟', '⭐', '💚', '🎉', '🌿'];
			for (let i = 0; i < 8; i++) {
				const s = document.createElement('span');
				s.className = 'bal-sparkle';
				s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
				s.style.left = (Math.random() * 90 + 5) + '%';
				s.style.animationDelay = (Math.random() * .3) + 's';
				s.style.animationDuration = (.6 + Math.random() * .4) + 's';
				container.appendChild(s);
			}
			setTimeout(() => { container.innerHTML = ''; }, 1200);
		}

		function updateAddTotal() {
			if (!r) return;
			let total = { kcal: r.kcal, protein: r.protein, fat: r.fat, carbs: r.carbs, fiber: r.fiber || 0 };
			Object.values(checkedItems).forEach(v => {
				total.kcal += v.kcal || 0;
				total.protein += v.protein || 0;
				total.fat += v.fat || 0;
				total.carbs += v.carbs || 0;
				total.fiber += v.fiber || 0;
			});
			// Ingredient-swap adjustments: only those with known KBZHU replacements contribute.
			Object.values(_appliedSwaps).forEach(s => {
				if (!s || !s.hasKbzhu) return;
				total.kcal += s.kcal || 0;
				total.protein += s.protein || 0;
				total.fat += s.fat || 0;
				total.carbs += s.carbs || 0;
				total.fiber += s.fiber || 0;
			});
			Object.values(_excludedIngredientDeltas).forEach(d => {
				if (!d || !d.hasKbzhu) return;
				total.kcal += d.kcal || 0;
				total.protein += d.protein || 0;
				total.fat += d.fat || 0;
				total.carbs += d.carbs || 0;
				total.fiber += d.fiber || 0;
			});
			// Round protein/fat/carbs/fiber to 1 decimal to avoid floating-point drift in display.
			total.protein = Math.round(total.protein * 10) / 10;
			total.fat = Math.round(total.fat * 10) / 10;
			total.carbs = Math.round(total.carbs * 10) / 10;
			total.fiber = Math.round(total.fiber * 10) / 10;
			const tEl = document.getElementById('bal-total-kcal');
			if (tEl) tEl.textContent = String(total.kcal);
			const cellP  = document.getElementById('add-macro-p');
			const cellF  = document.getElementById('add-macro-f');
			const cellC  = document.getElementById('add-macro-c');
			const cellFi = document.getElementById('add-macro-fi');
			if (cellP)  cellP.textContent  = total.protein + 'г';
			if (cellF)  cellF.textContent  = total.fat + 'г';
			if (cellC)  cellC.textContent  = total.carbs + 'г';
			if (cellFi) cellFi.textContent = total.fiber + 'г';
			// Restart Playfair number flip animation on change
			if (tEl) { tEl.style.animation = 'none'; void tEl.offsetWidth; tEl.style.animation = ''; }
			// Also update KBZHU block
			const ke = document.getElementById('kbzhu-kcal');
			const kp = document.getElementById('kbzhu-protein');
			const kf = document.getElementById('kbzhu-fat');
			const kc = document.getElementById('kbzhu-carbs');
			const kfi = document.getElementById('kbzhu-fiber');
			if (ke) ke.textContent = '~' + total.kcal;
			if (kp) kp.textContent = '~' + total.protein + 'г';
			if (kf) kf.textContent = '~' + total.fat + 'г';
			if (kc) kc.textContent = '~' + total.carbs + 'г';
			if (kfi) kfi.textContent = '~' + total.fiber + 'г';
			// Check balance
			checkBalance();
		}

		function resetRecipeAddonSidebar() {
			// Add-ons are a one-time choice for the current plate. Once the main
			// recipe is removed, do not leave its previous choices in the card.
			checkedItems = {};
			expandedGroups = { p: false, f: false, c: false, fi: false };
			_wizardStep = 0;
			_wizardCollapsed = false;
			_accordionOpen = { p: false, f: false, c: false, fi: false };
			if (_balGroups[0]) _accordionOpen[_balGroups[0].prefix] = true;

			// Rebuild groups so hidden options return to their default state too.
			_balGroups.forEach(group => {
				const cfg = _groupConfig[group.prefix];
				const oldEl = document.getElementById('bal-group-' + group.prefix);
				if (!cfg || !oldEl) return;
				const wrap = document.createElement('div');
				wrap.innerHTML = buildGroup(group.prefix, cfg.items, cfg.stepIndex).trim();
				const newEl = wrap.firstChild;
				if (newEl) oldEl.parentNode.replaceChild(newEl, oldEl);
			});

			updateAddTotal();
			updateWizardUI();
		}

		// ── VIDEO PLATFORM SWITCH ────────────────────────────────────────────
		function extractEmbedSrc(raw) {
			if (!raw) return null;
			var text = String(raw).trim();
			var m = text.match(/<iframe[^>]*\s+src=(["'])(.*?)\1/i);
			return m ? m[2] : text;
		}
		function toEmbedUrl(url) {
			url = extractEmbedSrc(url);
			if (!url) return null;
			var parsed;
			try { parsed = new URL(url); } catch (e) { return null; }
			if (parsed.protocol !== 'https:') return null;
			var host = parsed.hostname.toLowerCase().replace(/^www\./, '');
			var videoId = '';

			if (host === 'youtu.be') {
				videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
			} else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
				if (parsed.pathname === '/watch') videoId = parsed.searchParams.get('v') || '';
				else if (parsed.pathname === '/attribution_link') {
					var nestedUrl = parsed.searchParams.get('u') || '';
					try {
						var nested = new URL(nestedUrl, 'https://www.youtube.com');
						if (nested.pathname === '/watch') videoId = nested.searchParams.get('v') || '';
					} catch (e) {}
				}
				else {
					var youtubeMatch = parsed.pathname.match(/^\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]+)/);
					videoId = youtubeMatch ? youtubeMatch[1] : '';
				}
			}
			if (/^[a-zA-Z0-9_-]+$/.test(videoId)) {
				return 'https://www.youtube.com/embed/' + videoId + '?rel=0&modestbranding=1';
			}

			if (host === 'vk.com' || host === 'vkvideo.ru') {
				if (parsed.pathname === '/video_ext.php') return parsed.href;
				var vkMatch = (parsed.pathname + parsed.search).match(/video(-?\d+)_(\d+)/);
				if (vkMatch) return 'https://vkvideo.ru/video_ext.php?oid=' + vkMatch[1] + '&id=' + vkMatch[2] + '&hd=2';
				return null;
			}

			if (host === 'dzen.ru' || host === 'zen.yandex.ru') {
				var dzenEmbed = parsed.pathname.match(/^\/(?:embed|video\/embed)\/([a-zA-Z0-9_-]+)/);
				if (dzenEmbed) {
					return 'https://dzen.ru/embed/' + dzenEmbed[1] + '?from_block=partner&from=zen&mute=0&autoplay=0&tv=0';
				}
				if (/^\/video\/watch\//.test(parsed.pathname)) return 'dzen:' + parsed.href;
			}

			return null;
		}
		function showVideoFallback(frame, url) {
			frame.innerHTML = '<a class="video-external-link" href="' + escHtml(url) + '" target="_blank" rel="noopener noreferrer">'
				+ '<div class="video-play-btn" style="background:rgba(255,255,255,.15)"><svg viewBox="0 0 24 24" width="32" height="32"><path d="M8 5v14l11-7z" fill="#fff"/></svg></div>'
				+ '<div class="video-open-label">Открыть видео в новой вкладке <span class="external-link-icon" aria-hidden="true">↗</span></div>'
				+ '</a>';
		}
		function showVideoUnavailable(frame) {
			frame.innerHTML = '<div class="video-unavailable" role="status"><strong>Видео временно недоступно</strong><span>Ссылка повреждена или не поддерживается.</span></div>';
		}
		function showDzenFallback(frame, url) {
			var poster = frame.dataset.poster || '';
			var posterHtml = poster
				? '<div class="dzen-link-poster" style="background-image:url(&quot;' + escHtml(poster) + '&quot;)"></div>'
				: '';
			frame.innerHTML = '<a class="dzen-link-card" href="' + escHtml(url) + '" target="_blank" rel="noopener noreferrer">'
				+ posterHtml
				+ '<div class="dzen-link-overlay"></div>'
				+ '<div class="dzen-link-content">'
				+ '<div class="dzen-link-icon"><svg viewBox="0 0 24 24" width="48" height="48"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8z" fill="#fff"/><path d="M11 7.5L16 12l-5 4.5V7.5z" fill="#fff"/></svg></div>'
				+ '<div class="dzen-link-text">Смотреть на Дзене <span class="external-link-icon" aria-hidden="true">↗</span></div>'
				+ '</div>'
				+ '</a>';
		}
		function loadVideoFrame(frame) {
			if (frame.querySelector('iframe') || frame.querySelector('.dzen-link-card') || frame.querySelector('.video-external-link')) return;
			var url = extractEmbedSrc(frame.dataset.url);
			var embed = toEmbedUrl(url);
			if (!embed) {
				showVideoUnavailable(frame);
				return;
			}
			if (embed.startsWith('vk-fallback:')) {
				showVideoFallback(frame, embed.slice(12));
				return;
			}
			if (embed.startsWith('dzen:')) {
				var realUrl = embed.slice(5);
				showDzenFallback(frame, realUrl);
				return;
			}
			var iframe = document.createElement('iframe');
			iframe.src = embed;
			iframe.title = 'Видеорецепт' + (frame.dataset.label ? ': ' + frame.dataset.label : '');
			// loadVideoFrame() вызывается только для активной вкладки. Загружаем её
			// сразу: lazy iframe находится ниже первого экрана и может не начать
			// загрузку до прокрутки, из-за чего VK ошибочно выглядел недоступным.
			iframe.loading = 'eager';
			iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;';
			iframe.setAttribute('allow', 'accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;fullscreen');
			iframe.allowFullscreen = true;
			iframe.onerror = function () { showVideoFallback(frame, url); };
			frame.appendChild(iframe);
		}
		window.switchVideo = function (key) {
			document.querySelectorAll('.video-tab').forEach(t => t.classList.toggle('active', t.dataset.key === key));
			document.querySelectorAll('.video-frame').forEach(f => {
				var isActive = f.dataset.key === key;
				f.classList.toggle('active', isActive);
				if (isActive) loadVideoFrame(f);
			});
		};
		// Init first active video tab (called from renderRecipe after DOM insert)
		function initVideoTabs() {
			var wrap = document.getElementById('video-player');
			if (!wrap || wrap.dataset.initialized === '1') return;
			var active = wrap.querySelector('.video-frame.active');
			if (!active) {
				// No active frame — activate the first one
				var firstFrame = wrap.querySelector('.video-frame');
				var firstTab = document.querySelector('.video-tab');
				if (firstFrame) { firstFrame.classList.add('active'); active = firstFrame; }
				if (firstTab) firstTab.classList.add('active');
			}
			if (active) loadVideoFrame(active);
			wrap.dataset.initialized = '1';
		}

		// ── VIDEO REQUEST VOTING ───────────────────────────────────────────────
		function videoVoteHintKey() {
			try { return Auth._userKey('video_vote_hint_seen'); }
			catch (e) { return 'smartplate.video_vote_hint_seen'; }
		}

		function renderVideoRequest(data) {
			var section = document.getElementById('video-request-section');
			var el = document.getElementById('video-request-content');
			if (!section || !el) return;
			if (!data || data.hasVideo || data.status === 'published') {
				section.style.display = 'none';
				return;
			}

			var votes = Number(data.votes) || 0;
			var goal = Math.max(1, Number(data.goal) || 10);
			var progress = Math.min(100, Math.round(votes / goal * 100));
			var title = 'Снять видео к этому рецепту?';
			var copy = 'Если этот рецепт наберёт ' + goal + ' голосов, Юля снимет для него видео.';
			var kicker = 'Вы выбираете следующие видео';
			if (data.status === 'goal_reached') {
				title = 'Видео будет снято';
				copy = 'Рецепт набрал нужную поддержку и добавлен в очередь на съёмку.';
				kicker = 'Цель достигнута';
			} else if (data.status === 'planned') {
				title = 'Видео уже в плане съёмок';
				copy = 'Юля запланировала видеоверсию этого рецепта.';
				kicker = 'Запланировано';
			} else if (data.status === 'filming') {
				title = 'Видеорецепт снимается';
				copy = 'Скоро здесь появится готовое видео.';
				kicker = 'В работе';
			}

			var showNew = false;
			try { showNew = !localStorage.getItem(videoVoteHintKey()); }
			catch (e) { /* private mode */ }
			var newBadge = showNew ? '<span class="video-request-new">Новое</span>' : '';
			var actions;
			if (!Auth.isLoggedIn()) {
				actions = '<button class="video-vote-btn" type="button" data-recipe-action="video-login">Войти и проголосовать</button>';
			} else if (data.voted) {
				actions = '<button class="video-vote-btn is-voted" type="button" disabled>Ваш голос учтён ✓</button>'
					+ '<button class="video-vote-cancel" type="button" data-recipe-action="remove-video-vote">Отменить голос</button>';
			} else {
				actions = '<button class="video-vote-btn" type="button" data-recipe-action="submit-video-vote">Хочу видеорецепт</button>';
			}

			el.className = '';
			el.innerHTML = '<div class="video-request-kicker">' + newBadge + escHtml(kicker) + '</div>'
				+ '<h3 class="video-request-title">' + escHtml(title) + '</h3>'
				+ '<p class="video-request-copy">' + escHtml(copy) + '</p>'
				+ '<div class="video-request-progress-row">'
				+ '<div class="video-request-progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + votes + '"><span style="width:' + progress + '%"></span></div>'
				+ '<div class="video-request-count">' + votes + ' из ' + goal + ' голосов</div>'
				+ '</div><div class="video-request-actions">' + actions + '</div>';
			try { localStorage.setItem(videoVoteHintKey(), '1'); } catch (e) { /* private mode */ }
		}

		async function loadVideoRequest() {
			var section = document.getElementById('video-request-section');
			if (!section || !r) return;
			try {
				var res = await Auth.api('/content/video-requests/' + encodeURIComponent(r.id));
				if (!res.ok) throw new Error('Не удалось загрузить голоса');
				renderVideoRequest(await res.json());
			} catch (e) {
				var el = document.getElementById('video-request-content');
				if (el) el.textContent = 'Голосование временно недоступно.';
			}
		}

		function setVideoVoteBusy(busy) {
			document.querySelectorAll('.video-vote-btn, .video-vote-cancel').forEach(function(btn) {
				btn.disabled = busy;
			});
		}

		async function submitVideoVote() {
			if (!Auth.isLoggedIn()) { location.href = Auth._loginUrl(); return; }
			if (!r) return;
			setVideoVoteBusy(true);
			try {
				var res = await Auth.api('/content/video-requests/' + encodeURIComponent(r.id) + '/vote', { method: 'POST' });
				var data = await res.json().catch(function() { return {}; });
				if (!res.ok) throw new Error(data.error || 'Не удалось учесть голос');
				renderVideoRequest(data);
				showToast(data.status === 'goal_reached' ? 'Цель достигнута — видео добавлено в очередь!' : 'Ваш голос учтён');
			} catch (e) {
				showToast(e.message || 'Не удалось учесть голос');
				setVideoVoteBusy(false);
			}
		}

		async function removeVideoVote() {
			if (!r) return;
			setVideoVoteBusy(true);
			try {
				var res = await Auth.api('/content/video-requests/' + encodeURIComponent(r.id) + '/vote', { method: 'DELETE' });
				var data = await res.json().catch(function() { return {}; });
				if (!res.ok) throw new Error(data.error || 'Не удалось отменить голос');
				renderVideoRequest(data);
				showToast('Голос отменён');
			} catch (e) {
				showToast(e.message || 'Не удалось отменить голос');
				setVideoVoteBusy(false);
			}
		}

		window.submitVideoVote = submitVideoVote;
		window.removeVideoVote = removeVideoVote;

		// ── ADD TO PLATE ──────────────────────────────────────────────────────
		function addToPlate() {
			if (!r) return;
			// Гость: сначала показываем мягкий prompt, чтобы не уводить со страницы сразу.
			if (Auth.isGuest()) { showGuestLoginModal(); return; }
			if (isInPlate()) return;

			const isBalanced = checkBalance();
			const hasAdds = _balRequired.length > 0;

			if (hasAdds && !isBalanced) {
				showBalanceWarnModal();
				return;
			}

			_executePlateAdd(false);
		}

		function _executePlateAdd(unbalanced) {
			// Main dish: own KBZHU only — selected addons go in as separate Plate entries below.
			const _plateIngredients = (r.ingredients || []).filter((_, i) => !_excludedIngredients[i]);
			const plateTotals = {
				kcal: r.kcal,
				protein: r.protein,
				fat: r.fat,
				carbs: r.carbs,
				fiber: r.fiber || 0
			};
			Object.values(_appliedSwaps).forEach(s => {
				if (!s || !s.hasKbzhu) return;
				plateTotals.kcal += s.kcal || 0;
				plateTotals.protein += s.protein || 0;
				plateTotals.fat += s.fat || 0;
				plateTotals.carbs += s.carbs || 0;
				plateTotals.fiber += s.fiber || 0;
			});
			Object.values(_excludedIngredientDeltas).forEach(d => {
				if (!d || !d.hasKbzhu) return;
				plateTotals.kcal += d.kcal || 0;
				plateTotals.protein += d.protein || 0;
				plateTotals.fat += d.fat || 0;
				plateTotals.carbs += d.carbs || 0;
				plateTotals.fiber += d.fiber || 0;
			});
			plateTotals.protein = Math.round(plateTotals.protein * 10) / 10;
			plateTotals.fat = Math.round(plateTotals.fat * 10) / 10;
			plateTotals.carbs = Math.round(plateTotals.carbs * 10) / 10;
			plateTotals.fiber = Math.round(plateTotals.fiber * 10) / 10;
			const added = Plate.add({
				name: r.name,
				emoji: r.emoji,
				photo: r.photo || '',
				kcal: plateTotals.kcal,
				protein: plateTotals.protein,
				fat: plateTotals.fat,
				carbs: plateTotals.carbs,
				fiber: plateTotals.fiber,
				recipeId: r.id,
				ingredients: _plateIngredients,
				additions: []
			});
			if (!added) {
				updatePlateIcon();
				refreshAddButtonStateByPlate();
				showToast(r.emoji + ' Это блюдо уже в тарелке');
				return;
			}

			// Deferred add-ons stay separate in the plate and retain their source recipe
			// so a later checkbox change can replace only these entries.
			Object.values(checkedItems).forEach(v => {
				if (v.recipeId && Plate.get().some(p => p.recipeId === v.recipeId)) return;
				Plate.add(plateItemFromSelectedAddon(v));
			});

			updatePlateIcon();
			refreshAddButtonStateByPlate();
			acknowledgeRecipeAdded();
			showFirstPlateHint();

			showToast(r.emoji + (unbalanced ? ' Добавлено в текущую тарелку без балансировки' : ' Добавлено в текущую тарелку'));
			// Остаёмся на рецепте: пользователь видит обновлённые кнопку, счётчик и toast.
		}

		// ── Balance warning modal (unbalanced add confirmation) ────────────
		let _balWarnPrevFocus = null;

		function getMissingBalanceGroups() {
			const checkedPrefixes = new Set(Object.keys(checkedItems).map(k => k.replace(/-\d+$/, '')));
			return _balRequired.filter(c => !checkedPrefixes.has(c.prefix));
		}

		function showBalanceWarnModal() {
			const overlay = document.getElementById('bal-warn-modal');
			if (!overlay) return;
			// Build dynamic missing-groups list from _balRequired vs checkedItems
			const missing = getMissingBalanceGroups();
			const listEl = document.getElementById('bal-warn-missing');
			if (listEl) {
				listEl.innerHTML = missing.length
					? 'Добавить: ' + missing.map(c => '<b>' + escHtml(c.label) + '</b>').join(', ') + '.'
					: '';
			}
			_balWarnPrevFocus = document.activeElement;
			overlay.classList.add('show');
			overlay.addEventListener('click', _balWarnBackdropHandler);
			document.addEventListener('keydown', _balWarnKeyHandler);
			const primary = document.getElementById('bal-warn-primary');
			if (primary) setTimeout(() => { try { primary.focus(); } catch (e) {} }, 50);
		}

		function hideBalanceWarnModal() {
			const overlay = document.getElementById('bal-warn-modal');
			if (!overlay) return;
			if (!overlay.classList.contains('show')) return;
			overlay.classList.remove('show');
			overlay.removeEventListener('click', _balWarnBackdropHandler);
			document.removeEventListener('keydown', _balWarnKeyHandler);
			if (_balWarnPrevFocus && typeof _balWarnPrevFocus.focus === 'function') {
				try { _balWarnPrevFocus.focus(); } catch (e) {}
			}
			_balWarnPrevFocus = null;
		}

		function _balWarnBackdropHandler(e) {
			if (e.target && e.target.id === 'bal-warn-modal') hideBalanceWarnModal();
		}

		function _balWarnKeyHandler(e) {
			if (e.key === 'Escape') {
				e.preventDefault();
				hideBalanceWarnModal();
			} else if (e.key === 'Tab') {
				const overlay = document.getElementById('bal-warn-modal');
				if (!overlay) return;
				const focusable = overlay.querySelectorAll('button');
				if (!focusable.length) return;
				const first = focusable[0];
				const last = focusable[focusable.length - 1];
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		}

		function confirmBalanceWarnAdd() {
			hideBalanceWarnModal();
			_executePlateAdd(true);
		}

		function guideToBalanceAdditions() {
			const missing = getMissingBalanceGroups();
			hideBalanceWarnModal();
			if (!missing.length) return;

			const first = missing[0];
			const firstStep = _balGroups.findIndex(group => group.prefix === first.prefix);
			if (window.innerWidth <= 1024 && firstStep >= 0) {
				balWizardSetStep(firstStep);
			} else {
				_accordionOpen[first.prefix] = true;
				document.getElementById('bal-group-' + first.prefix)?.classList.add('open');
			}

			const groups = missing.map(group => document.getElementById('bal-group-' + group.prefix)).filter(Boolean);
			groups.forEach(group => group.classList.add('is-guided'));
			setTimeout(() => groups.forEach(group => group.classList.remove('is-guided')), 2200);

			const target = document.getElementById('bal-group-' + first.prefix) || document.getElementById('bal-sidebar');
			if (!target) return;
			target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
			setTimeout(() => {
				const control = target.querySelector('.bal-item-select, button.bal-item, .bal-group-head');
				if (control && typeof control.focus === 'function') control.focus({ preventScroll: true });
			}, 350);
		}

		// ── MY PLATE MODAL ────────────────────────────────────────────────────
		let _guestLoginPrevFocus = null;

		function showGuestLoginModal() {
			const overlay = document.getElementById('guest-login-modal');
			if (!overlay) return;
			_guestLoginPrevFocus = document.activeElement;
			overlay.classList.add('show');
			overlay.addEventListener('click', _guestLoginBackdropHandler);
			document.addEventListener('keydown', _guestLoginKeyHandler);
			const primary = document.getElementById('guest-login-primary');
			if (primary) setTimeout(() => { try { primary.focus(); } catch (e) { } }, 50);
		}

		function hideGuestLoginModal() {
			const overlay = document.getElementById('guest-login-modal');
			if (!overlay) return;
			if (!overlay.classList.contains('show')) return;
			overlay.classList.remove('show');
			overlay.removeEventListener('click', _guestLoginBackdropHandler);
			document.removeEventListener('keydown', _guestLoginKeyHandler);
			if (_guestLoginPrevFocus && typeof _guestLoginPrevFocus.focus === 'function') {
				try { _guestLoginPrevFocus.focus(); } catch (e) { }
			}
			_guestLoginPrevFocus = null;
		}

		function goToGuestLogin() {
			const loginUrl = Auth._loginUrl();
			hideGuestLoginModal();
			location.href = loginUrl;
		}

		function _guestLoginBackdropHandler(e) {
			if (e.target && e.target.id === 'guest-login-modal') hideGuestLoginModal();
		}

		function _guestLoginKeyHandler(e) {
			if (e.key === 'Escape') {
				e.preventDefault();
				hideGuestLoginModal();
				return;
			}
			if (e.key === 'Tab') {
				const overlay = document.getElementById('guest-login-modal');
				if (!overlay) return;
				const focusable = overlay.querySelectorAll('button');
				if (!focusable.length) return;
				const first = focusable[0];
				const last = focusable[focusable.length - 1];
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		}

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
                <button class="pv1-cta" data-recipe-action="close-plate">Вернуться к рецепту</button>
            </div>`;
			} else {
				const t = Plate.totals();
				const ingCount = items.reduce((n, item) => n + (Array.isArray(item.ingredients) ? item.ingredients.length : 0), 0);
				const list = items.map((item, i) => {
					const adds = item.additions || [];
					const additionsHtml = adds.length
						? `<ul class="pv1-additions">${adds.map(a =>
							`<li class="pv1-addition">
                                <span class="pv1-addition-dot">+</span>
                                <span class="pv1-addition-name">${escHtml(String(a.name))}</span>
                                <span class="pv1-addition-kcal">${Number(a.kcal) || 0} ккал</span>
                            </li>`).join('')}</ul>`
						: '';
					const nameHtml = item.recipeId
						? `<a class="pv1-item-name is-link" href="recipe.html?id=${encodeURIComponent(item.recipeId)}&from=plate&simple=1">${escHtml(String(item.name))}</a>`
						: `<div class="pv1-item-name">${escHtml(String(item.name))}</div>`;
					return `<div class="pv1-item">
                        ${item.photo
							? `<img class="pv1-item-photo" src="${escHtml(String(item.photo))}" alt="">`
						: addonProductIcon(item.name)}
                        <div class="pv1-item-main">
                            ${nameHtml}
                            <div class="pv1-item-meta">${Number(item.kcal) || 0} ккал · Б ${Number(item.protein) || 0} · Ж ${Number(item.fat) || 0} · У ${Number(item.carbs) || 0} · Кл ${Number(item.fiber) || 0}</div>
                            ${additionsHtml}
                        </div>
                        <button class="pv1-item-del" data-recipe-action="remove-plate-item" data-index="${Number(i)}" aria-label="Удалить"><svg class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="5" y1="19" x2="19" y2="5"/></svg></button>
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
                <div class="shop" id="recipe-plate-shop-block">
                    <div class="shop-head">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
                        Список покупок${ingCount ? ` · ${ingCount} шт` : ''}
                    </div>
                    <div class="shop-actions">
                        <button class="shop-btn shop-btn-primary" id="recipe-plate-shop-mode-btn" type="button" data-recipe-action="toggle-plate-shop-mode" aria-pressed="false">В магазине</button>
                        <button class="shop-btn shop-btn-ghost" type="button" data-recipe-action="copy-plate-shopping-list">Скопировать</button>
                    </div>
                    <div class="plate-shop-list" id="recipe-plate-shop-list" hidden></div>
                </div>
                ${plateMealTypePickerHtml()}
                <div class="pv1-actions">
                    <div class="pv1-actions-row">
                        <button class="pv1-btn" data-recipe-action="go-home">← Вернуться</button>
                        <button class="pv1-btn" data-recipe-action="share-shopping-list">Поделиться</button>
                    </div>
                    <button class="pv1-btn pv1-btn-primary pv1-btn-full" data-recipe-action="save-plate">Записать тарелку в журнал</button>
				</div>`;
				renderRecipePlateShopMode();
			}
			document.getElementById('plate-overlay').classList.add('open');
			document.body.style.overflow = 'hidden';
		}
		function closePlate() {
			document.getElementById('plate-overlay').classList.remove('open');
			document.body.style.overflow = '';
		}
		function closePlateIfOutside(e) { if (e.target === document.getElementById('plate-overlay')) closePlate(); }
		function removeItemR(i) {
			const removed = Plate.get()[i];
			Plate.remove(i);
			if (removed && r && removed.recipeId === r.id) resetRecipeAddonSidebar();
			updatePlateIcon();
			refreshAddButtonStateByPlate();
			openPlate();
		}
		let recipePlateShopMode = false;
		let recipePlateShopChecked = new Set();
		function recipePlateShopItems() {
			const out = [];
			Plate.get().forEach((item, itemIndex) => {
				const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
				ingredients.forEach((ing, ingIndex) => {
					const name = typeof ing === 'string' ? ing : (ing && (ing.name || ing.title || ing.text)) || '';
					const label = String(name || '').trim();
					if (label) out.push({ key: itemIndex + '-' + ingIndex + '-' + label, dish: String(item.name || 'Блюдо'), label });
				});
			});
			return out;
		}
		function toggleRecipePlateShopMode() { recipePlateShopMode = !recipePlateShopMode; renderRecipePlateShopMode(); }
		function toggleRecipePlateShopItem(index) {
			if (!recipePlateShopMode) return;
			const item = recipePlateShopItems()[Number(index)];
			if (!item) return;
			if (recipePlateShopChecked.has(item.key)) recipePlateShopChecked.delete(item.key);
			else recipePlateShopChecked.add(item.key);
			renderRecipePlateShopMode();
		}
		function renderRecipePlateShopMode() {
			const listEl = document.getElementById('recipe-plate-shop-list');
			const btn = document.getElementById('recipe-plate-shop-mode-btn');
			if (!listEl || !btn) return;
			const items = recipePlateShopItems();
			const validKeys = new Set(items.map(item => item.key));
			recipePlateShopChecked = new Set(Array.from(recipePlateShopChecked).filter(key => validKeys.has(key)));
			btn.setAttribute('aria-pressed', String(recipePlateShopMode));
			btn.classList.toggle('is-active', recipePlateShopMode);
			listEl.hidden = !recipePlateShopMode;
			if (!recipePlateShopMode) { listEl.innerHTML = ''; return; }
			if (!items.length) { listEl.innerHTML = '<div class="plate-shop-empty">В выбранных блюдах нет ингредиентов.</div>'; return; }
			let currentDish = ''; let html = '';
			items.forEach((item, index) => {
				if (item.dish !== currentDish) { currentDish = item.dish; html += '<div class="plate-shop-dish">' + escHtml(currentDish) + '</div>'; }
				const checked = recipePlateShopChecked.has(item.key);
				html += '<button class="plate-shop-check' + (checked ? ' is-checked' : '') + '" type="button" data-recipe-action="toggle-plate-shop-item" data-index="' + Number(index) + '" aria-pressed="' + checked + '"><span class="plate-shop-box" aria-hidden="true"></span><span class="plate-shop-label">' + escHtml(item.label) + '</span></button>';
			});
			listEl.innerHTML = html;
		}
		function copyRecipePlateShoppingList() {
			navigator.clipboard.writeText(buildShoppingList()).then(() => showToast('📋 Список скопирован!')).catch(() => showToast('Не удалось скопировать'));
		}
		function savePlateR() {
			if (!Plate.count()) return;
			Plate.saveHistory(getSelectedPlateMealType());
			recipePlateShopMode = false;
			recipePlateShopChecked.clear();
			updatePlateIcon();
			refreshAddButtonStateByPlate();
			closePlate();
			showToast('Тарелка записана в журнал 🎉');
		}

		// ── FAV + RATING ON PHOTO ─────────────────────────────────────────────
		function toggleRecipeFav() {
			if (!r) return;
			// Гость: избранное — фича только для зарегистрированных, ведём на login.
			if (Auth.isGuest()) { location.href = Auth._loginUrl(); return; }
			const isNow = Favorites.toggle(r.id);
			const button = document.getElementById('recipe-fav-btn');
			if (button) {
				button.classList.toggle('active', isNow);
				button.setAttribute('aria-pressed', String(isNow));
				button.setAttribute('aria-label', isNow ? 'Убрать рецепт из избранного' : 'Добавить рецепт в избранное');
			}
		}

		function scrollToReviews() {
			const el = document.getElementById('reviews-section');
			if (el) {
				scrollRecipeElementIntoView(el, 'start');
				const heading = document.getElementById('reviews-title');
				if (heading) requestAnimationFrame(() => heading.focus({ preventScroll: true }));
			}
		}

		function scrollToReviewForm() {
			if (!Auth.isLoggedIn()) { scrollToReviews(); return; }
			const wrap = document.getElementById('review-form-wrap');
			if (!wrap || !wrap.querySelector('.review-form')) { scrollToReviews(); return; }
			wrap.classList.add('is-modal');
			wrap.setAttribute('role', 'dialog');
			wrap.setAttribute('aria-modal', 'true');
			document.body.style.overflow = 'hidden';
			const field = document.getElementById('review-text');
			if (field) requestAnimationFrame(() => field.focus());
		}

		function closeReviewForm() {
			const wrap = document.getElementById('review-form-wrap');
			if (!wrap) return;
			wrap.classList.remove('is-modal');
			wrap.removeAttribute('role');
			wrap.removeAttribute('aria-modal');
			document.body.style.overflow = '';
			const trigger = document.getElementById('review-action-btn');
			if (trigger) trigger.focus({ preventScroll: true });
		}

		function closeReviewFormIfOutside(event) {
			if (event.target === event.currentTarget) closeReviewForm();
		}

		// ── INLINE STARS ──────────────────────────────────────────────────────
		function hoverInlineStar(n) {
			document.querySelectorAll('.r-star').forEach((s, i) =>
				s.classList.toggle('filled', i < n));
		}

		let _inlineAvg = 0;

		function unhoverInlineStar() {
			document.querySelectorAll('.r-star').forEach((s, i) =>
				s.classList.toggle('filled', i < Math.round(_inlineAvg)));
		}

		async function rateInline(n) {
			if (n < 1) return;
			// Гость: оценить можно только после логина.
			if (Auth.isGuest()) { location.href = Auth._loginUrl(); return; }
			// Отправить оценку на сервер
			try {
				const res = await Auth.api('/content/reviews', {
					method: 'POST',
					body: JSON.stringify({ recipe_id: r.id, stars: n, text: '' })
				});
				if (!res.ok) { showToast('Не удалось сохранить оценку'); return; }
				_inlineAvg = n;
				document.querySelectorAll('.r-star').forEach((s, i) =>
					s.classList.toggle('filled', i < n));
				const valEl = document.getElementById('recipe-rating-val');
				if (valEl) valEl.textContent = n;
				const starsWrap = document.querySelector('.recipe-meta-stars');
				if (starsWrap) starsWrap.classList.add('user-rated');
				showToast('Оценка сохранена ★');
				// Обновить список отзывов
				loadReviews();
			} catch {
				showToast('Ошибка сети');
			}
		}

		let _groceryRemovedIndexes = new Set();
		let _groceryCollapsed = false;
		let _groceryShopMode = false;
		let _groceryCheckedIndexes = new Set();

		function recipeGroceryStorageKey() {
			return 'sp_grocery_checked_' + String((r && r.id) || recipeId || 'current');
		}

		function loadRecipeGroceryChecked() {
			try {
				const raw = localStorage.getItem(recipeGroceryStorageKey());
				const list = raw ? JSON.parse(raw) : [];
				_groceryCheckedIndexes = new Set(Array.isArray(list) ? list.map(Number).filter(Number.isFinite) : []);
			} catch (_) {
				_groceryCheckedIndexes = new Set();
			}
		}

		function saveRecipeGroceryChecked() {
			try {
				localStorage.setItem(recipeGroceryStorageKey(), JSON.stringify(Array.from(_groceryCheckedIndexes)));
			} catch (_) { }
		}

		function recipeServingsLabel() {
			if (r && r.yieldLabel) return r.yieldLabel;
			const servings = Number(r && r.servings || 4);
			const m10 = servings % 10, m100 = servings % 100;
			let word = 'порций';
			if (m10 === 1 && m100 !== 11) word = 'порция';
			else if ([2, 3, 4].includes(m10) && ![12, 13, 14].includes(m100)) word = 'порции';
			return `${servings} ${word}`;
		}

		function recipeGroceryItems() {
			if (!r) return [];
			return (r.ingredients || [])
				.map((ing, i) => {
					if (_excludedIngredients[i]) return null;
					if (_groceryRemovedIndexes.has(i)) return null;
					const name = typeof ing === 'string' ? ing : ing.name;
					return name ? { index: i, name: String(name) } : null;
				})
				.filter(Boolean);
		}

		function recipeGroceryText() {
			const items = recipeGroceryItems();
			return [
				'УМНАЯ ТАРЕЛКА Юлии Вороновой',
				'Список покупок',
				'────────────',
				'',
				`Рецепт: ${r.name}`,
				`На ${recipeServingsLabel()}`,
				'',
				'Что купить:',
				...items.map(item => `${_groceryCheckedIndexes.has(item.index) ? '☑' : '□'} ${item.name}`),
				'',
				'Приятных покупок!'
			].join('\n');
		}

		function recipeShareUrl() {
			const url = new URL('recipe.html', window.location.href);
			url.searchParams.set('id', (r && r.id) || recipeId || '');
			return url.toString();
		}

		function shareRecipe() {
			if (!r) return;
			const title = r.name || 'Рецепт';
			const url = recipeShareUrl();
			const text = 'Рецепт: ' + title;
			if (navigator.share) {
				navigator.share({ title, text, url }).catch(() => {});
				return;
			}
			navigator.clipboard.writeText(url)
				.then(() => showToast('Ссылка на рецепт скопирована'))
				.catch(() => showToast('Не удалось скопировать ссылку'));
		}

		function renderRecipeGroceryList() {
			const title = document.getElementById('recipe-grocery-title');
			const body = document.getElementById('recipe-grocery-body');
			const overlay = document.getElementById('recipe-grocery-overlay');
			const toggle = document.querySelector('.grocery-modal-chevron');
			const modeBtn = document.getElementById('grocery-shop-mode-btn');
			if (!title || !body || !r) return;
			const items = recipeGroceryItems();
			if (overlay) overlay.classList.toggle('is-collapsed', _groceryCollapsed);
			if (overlay) overlay.classList.toggle('is-shop-mode', _groceryShopMode);
			if (toggle) {
				toggle.setAttribute('aria-expanded', String(!_groceryCollapsed));
				toggle.setAttribute('aria-label', _groceryCollapsed ? 'Развернуть список' : 'Свернуть список');
			}
			if (modeBtn) {
				modeBtn.textContent = _groceryShopMode ? 'Редактировать' : 'В магазине';
				modeBtn.setAttribute('aria-pressed', String(_groceryShopMode));
			}
			title.innerHTML = `${escHtml(r.name)}<span>${recipeServingsLabel()}</span>`;
			body.innerHTML = items.length
				? items.map(item => `<div class="grocery-modal-item">
					<button type="button" class="grocery-modal-check" data-recipe-action="toggle-grocery" data-index="${Number(item.index)}" aria-pressed="${_groceryCheckedIndexes.has(item.index) ? 'true' : 'false'}" aria-label="${_groceryCheckedIndexes.has(item.index) ? 'Отметить как не куплено' : 'Отметить как куплено'}">
						<span class="grocery-modal-checkmark" aria-hidden="true"></span>
						<span class="grocery-modal-check-label">${escHtml(item.name)}</span>
					</button>
					<button type="button" class="grocery-modal-remove" data-recipe-action="remove-grocery" data-index="${Number(item.index)}" aria-label="Убрать из списка"><svg class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg></button>
				</div>`).join('')
				: '<div class="grocery-modal-empty">Все ингредиенты убраны из списка.</div>';
		}

		function openRecipeGroceryList() {
			if (!r) return;
			_groceryRemovedIndexes = new Set();
			_groceryCollapsed = false;
			_groceryShopMode = false;
			loadRecipeGroceryChecked();
			renderRecipeGroceryList();
			const overlay = document.getElementById('recipe-grocery-overlay');
			if (!overlay) return;
			overlay.classList.add('open');
			document.body.style.overflow = 'hidden';
		}

		function closeRecipeGroceryList() {
			const overlay = document.getElementById('recipe-grocery-overlay');
			if (overlay) overlay.classList.remove('open');
			document.body.style.overflow = '';
		}

		function closeRecipeGroceryIfOutside(e) {
			if (e.target === document.getElementById('recipe-grocery-overlay')) closeRecipeGroceryList();
		}

		function toggleRecipeGroceryList() {
			_groceryCollapsed = !_groceryCollapsed;
			renderRecipeGroceryList();
		}

		function toggleGroceryShopMode() {
			_groceryShopMode = !_groceryShopMode;
			renderRecipeGroceryList();
		}

		function toggleRecipeGroceryChecked(i) {
			if (!_groceryShopMode) return;
			const index = Number(i);
			if (_groceryCheckedIndexes.has(index)) _groceryCheckedIndexes.delete(index);
			else _groceryCheckedIndexes.add(index);
			saveRecipeGroceryChecked();
			renderRecipeGroceryList();
		}

		function removeRecipeGroceryItem(i) {
			const index = Number(i);
			_groceryRemovedIndexes.add(index);
			_groceryCheckedIndexes.delete(index);
			saveRecipeGroceryChecked();
			renderRecipeGroceryList();
		}

		function removeAllRecipeGroceryItems() {
			(r.ingredients || []).forEach((_, i) => _groceryRemovedIndexes.add(i));
			_groceryCheckedIndexes.clear();
			saveRecipeGroceryChecked();
			renderRecipeGroceryList();
		}

		function copyRecipeGroceryList() {
			if (!r) return;
			navigator.clipboard.writeText(recipeGroceryText())
				.then(() => showToast('Список покупок скопирован'))
				.catch(() => showToast('Не удалось скопировать'));
		}

		// ── REVIEWS ──────────────────────────────────────────────────────────
		let _reviewStars = 0;
		let _reviewFormMarkup = null;
		let _editingReviewReplyId = null;

		function setReviewStars(n) {
			_reviewStars = n;
			document.querySelectorAll('.review-star').forEach((s, i) => {
				s.classList.toggle('filled', i < n);
				s.setAttribute('aria-pressed', String(i < n));
			});
		}

		async function loadReviews() {
			if (!r) return;
			try {
				const res = await Auth.api('/content/reviews/' + encodeURIComponent(r.id));
				if (!res.ok) return;
				const reviews = await res.json();
				const list = document.getElementById('reviews-list');
				if (!list) return;

				// Update voter count, star fill, and rating pill from API data
				const cSpan = document.getElementById('recipe-voter-count');
				if (cSpan) cSpan.textContent = '(' + reviews.length + ')';
				const ratingVal = document.getElementById('recipe-rating-val');
				const curUser = Auth.getUser();
				const curUserId = curUser && curUser.id;
				const isAdmin = curUser && curUser.role === 'admin';
				const canReactToReply = Auth.isLoggedIn();
				const hasOwnReview = reviews.some(rv => curUserId && rv.userId === curUserId);
				const reviewActionLabel = document.getElementById('review-action-label');
				if (reviewActionLabel) reviewActionLabel.textContent = Auth.isLoggedIn() && !hasOwnReview ? 'Оставить отзыв' : 'Отзывы';
				const formWrap = document.getElementById('review-form-wrap');
				if (formWrap && _reviewFormMarkup === null && formWrap.querySelector('.review-form')) {
					_reviewFormMarkup = formWrap.innerHTML;
				}
				if (formWrap && hasOwnReview) {
					closeReviewForm();
					formWrap.innerHTML = '<div style="font-size:13px;color:var(--text-3);padding:12px 16px;text-align:center">Вы уже оставили отзыв. Удалите его, чтобы написать новый.</div>';
				} else if (formWrap && _reviewFormMarkup !== null && !formWrap.querySelector('.review-form')) {
					formWrap.innerHTML = _reviewFormMarkup;
				}
				if (reviews.length) {
					const apiAvg = reviews.reduce((s, rv) => s + rv.stars, 0) / reviews.length;
					if (window.SmartPlateSEO) {
						SmartPlateSEO.setRecipeRating(r.id, { value: apiAvg, count: reviews.length });
					}
					document.querySelectorAll('#recipe-stars-row .r-star').forEach((s, i) =>
						s.classList.toggle('filled', i < Math.round(apiAvg)));
					if (ratingVal) ratingVal.textContent = apiAvg.toFixed(1);
					// Mark as rated so hint animation stops
					const starsRow = document.getElementById('recipe-stars-row');
					if (starsRow) starsRow.querySelector('.recipe-meta-stars')?.classList.add('user-rated');
				}

				if (!reviews.length) {
					if (window.SmartPlateSEO) SmartPlateSEO.setRecipeRating(r.id, null);
					list.innerHTML = '<div style="font-size:13px;color:var(--text-3)">Отзывов ещё нет. Поделитесь своим впечатлением.</div>';
					return;
				}

				list.innerHTML = reviews.map(rv => {
					const d = new Date(rv.createdAt);
					const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
					const starsHtml = [1, 2, 3, 4, 5].map(i => `<span class="star${i <= rv.stars ? ' filled' : ''}" style="font-size:14px">★</span>`).join('');
					const avatarHtml = rv.avatar
						? `<img class="review-avatar" src="${escHtml(rv.avatar)}" alt="" data-review-avatar-fallback>`
						+ `<span class="review-avatar-fallback" style="display:none">${escHtml(rv.author.charAt(0).toUpperCase())}</span>`
						: `<span class="review-avatar-fallback">${escHtml(rv.author.charAt(0).toUpperCase())}</span>`;
					const canDelete = isAdmin || (curUserId && rv.userId === curUserId);
					const deleteBtn = canDelete
						? `<button class="review-delete-btn" data-recipe-action="delete-review" data-review-id="${Number(rv.id)}" data-is-admin="${isAdmin ? 'true' : 'false'}" aria-label="Удалить отзыв" title="Удалить отзыв"><svg class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="5" y1="19" x2="19" y2="5"/></svg></button>`
						: '';
					const helpfulCount = Math.max(0, Number(rv.reply?.helpfulCount) || 0);
					const helpfulActive = rv.reply?.helpfulByCurrentUser === true;
					const helpfulReaction = rv.reply
						? `<button class="review-reply-helpful${helpfulActive ? ' is-active' : ''}" type="button" data-recipe-action="toggle-review-reply-helpful" data-review-id="${Number(rv.id)}" aria-pressed="${helpfulActive}" aria-label="${canReactToReply ? (helpfulActive ? 'Убрать реакцию «Полезный ответ»' : 'Отметить ответ как полезный') : 'Войти, чтобы отметить ответ как полезный'}"><span class="review-reply-helpful-mark" aria-hidden="true">${helpfulActive ? '✓' : '🍴'}</span><span>Полезный ответ</span>${helpfulCount ? `<span class="review-reply-helpful-count">${helpfulCount}</span>` : ''}</button>`
						: '';
					const authorReply = rv.reply
						? `<div class="review-author-reply">
							<div class="review-author-wrap">
								<img class="review-avatar" src="images/YV-blog.webp" alt="Юлия Воронова" data-review-avatar-fallback>
								<span class="review-avatar-fallback" style="display:none">Ю</span>
								<div class="review-author-reply-meta">
									<span class="review-author">Юлия Воронова</span>
									<span class="review-author-badge"><span class="review-author-badge-full">Автор Умной Тарелки</span><span class="review-author-badge-short">Автор</span></span>
								</div>
							</div>
							<div class="review-author-reply-text">${escHtml(rv.reply.text)}</div>
							${helpfulReaction}
						</div>`
						: '';
					const replyEditor = isAdmin && _editingReviewReplyId === Number(rv.id)
						? `<div style="margin-top:12px">
							<textarea class="review-textarea" id="review-reply-${Number(rv.id)}" placeholder="Публичный ответ от имени Юлии" maxlength="1000" rows="3">${escHtml(rv.reply ? rv.reply.text : '')}</textarea>
							<div style="display:flex;gap:8px;margin-top:7px">
								<button class="btn btn-orange" type="button" data-recipe-action="submit-review-reply" data-review-id="${Number(rv.id)}" style="padding:8px 12px;font-size:12px">Сохранить ответ</button>
								<button class="btn" type="button" data-recipe-action="cancel-review-reply-editor" data-review-id="${Number(rv.id)}" style="padding:8px 12px;font-size:12px">Отмена</button>
							</div>
						</div>`
						: '';
					const replyAction = isAdmin && !replyEditor
						? `<button class="btn" type="button" data-recipe-action="open-review-reply-editor" data-review-id="${Number(rv.id)}" style="margin-top:12px;padding:8px 12px;font-size:12px">${rv.reply ? 'Редактировать ответ' : 'Ответить как Юлия'}</button>`
						: '';
					return `<div class="review-item">
                    <div class="review-header">
                        <div class="review-author-wrap">
                            ${avatarHtml}
                            <span class="review-author">${escHtml(rv.author)}</span>${rv.isEarlyBird ? '<span style="font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--accent);border:1px solid var(--accent);padding:2px 5px">Друг Умной тарелки</span>' : ''}
                        </div>
                        <div style="display:flex;align-items:center;gap:8px">
                            <span class="review-date">${escHtml(dateStr)}</span>
                            ${deleteBtn}
                        </div>
                    </div>
                    <div class="review-stars-row">${starsHtml}</div>
                    <div class="review-text">${escHtml(rv.text)}</div>
                    ${authorReply}
                    ${replyAction}
                    ${replyEditor}
                </div>`;
				}).join('');
			} catch (e) {
				console.error('Reviews load error:', e);
				const list = document.getElementById('reviews-list');
				if (list && !list.innerHTML) list.innerHTML = '<div style="font-size:12px;color:red">Ошибка загрузки отзывов: ' + escHtml(e.message) + '</div>';
			}
		}

		async function submitReview() {
			if (!r || !Auth.isLoggedIn()) return;
			if (!_reviewStars) { showToast('Выберите оценку'); return; }
			const textEl = document.getElementById('review-text');
			const text = (textEl?.value || '').trim();

			const btn = document.getElementById('review-submit-btn');
			if (btn) { btn.disabled = true; btn.textContent = '...'; }
			try {
				const res = await Auth.api('/content/reviews', {
					method: 'POST',
					body: JSON.stringify({ recipe_id: r.id, stars: _reviewStars, text: text || null })
				});
				if (!res.ok) {
					const err = await res.json().catch(() => ({}));
					showToast(err.error || 'Ошибка');
					return;
				}
				showToast('Отзыв сохранён!');
				closeReviewForm();
				if (textEl) textEl.value = '';
				_reviewStars = 0;
				document.querySelectorAll('.review-star').forEach(s => {
					s.classList.remove('filled');
					s.setAttribute('aria-pressed', 'false');
				});
				const countEl = document.getElementById('review-char-count');
				if (countEl) countEl.textContent = '0 / 1000';
				loadReviews();
			} catch (e) {
				showToast('Ошибка сети');
			} finally {
				if (btn) { btn.disabled = false; btn.textContent = 'Отправить'; }
			}
		}

		window.deleteReview = async function (id, isAdmin) {
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
				await loadReviews();
				showToast('Отзыв удалён. Можно оставить новый.');
			} catch (e) { showToast('Ошибка сети'); }
		};

		async function submitReviewReply(id) {
			const input = document.getElementById('review-reply-' + id);
			const text = (input?.value || '').trim();
			if (!text) { showToast('Напишите ответ'); return; }

			const btn = document.querySelector('[data-recipe-action="submit-review-reply"][data-review-id="' + id + '"]');
			const originalLabel = btn ? btn.textContent : '';
			if (btn) { btn.disabled = true; btn.textContent = '...'; }
			try {
				const res = await Auth.api('/admin/reviews/' + id + '/reply', {
					method: 'POST',
					body: JSON.stringify({ text: text })
				});
				if (!res.ok) {
					const err = await res.json().catch(() => ({}));
					showToast(err.error || 'Не удалось сохранить ответ');
					return;
				}
				_editingReviewReplyId = null;
				await loadReviews();
				showToast('Ответ опубликован');
			} catch (e) { showToast('Ошибка сети');
			} finally {
				if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
			}
		}

		function openReviewReplyEditor(id) {
			_editingReviewReplyId = id;
			loadReviews();
		}

		function cancelReviewReplyEditor() {
			_editingReviewReplyId = null;
			loadReviews();
		}

		async function toggleReviewReplyHelpful(id) {
			if (!Auth.isLoggedIn()) { location.href = Auth._loginUrl(); return; }
			const btn = document.querySelector('[data-recipe-action="toggle-review-reply-helpful"][data-review-id="' + id + '"]');
			if (btn?.disabled) return;
			if (btn) btn.disabled = true;
			try {
				const res = await Auth.api('/content/reviews/' + id + '/reply-helpful', { method: 'POST' });
				if (!res.ok) {
					const err = await res.json().catch(() => ({}));
					showToast(err.error || 'Не удалось сохранить реакцию');
					return;
				}
				await loadReviews();
			} catch (e) { showToast('Ошибка сети');
			} finally {
				if (btn?.isConnected) btn.disabled = false;
			}
		}

		// Char counter
		document.addEventListener('input', function (e) {
			if (e.target.id === 'review-text') {
				const cnt = document.getElementById('review-char-count');
				if (cnt) cnt.textContent = e.target.value.length + ' / 1000';
			}
		});

		document.addEventListener('click', function (event) {
			const actionTarget = event.target.closest('[data-recipe-action]');
			if (actionTarget) {
				event.stopPropagation();
				const action = actionTarget.dataset.recipeAction;
				const index = Number(actionTarget.dataset.index);
				if (action === 'apply-swap') applySwap(index, Number(actionTarget.dataset.optionIndex));
				else if (action === 'revert-swap') revertSwap(index);
				else if (action === 'opt-out') optOutIngredient(index);
				else if (action === 'toggle-swap') toggleSwap(index);
				else if (action === 'restore-ingredient') restoreIngredient(index);
				else if (action === 'set-review-stars') setReviewStars(Number(actionTarget.dataset.n));
				else if (action === 'toggle-group') toggleGroupExpand(actionTarget.dataset.prefix || '');
				else if (action === 'toggle-accordion') balToggleAccordion(actionTarget.dataset.prefix || '');
				else if (action === 'wizard-step') balWizardSetStep(index);
				else if (action === 'remove-plate-item') removeItemR(index);
				else if (action === 'toggle-grocery') toggleRecipeGroceryChecked(index);
				else if (action === 'remove-grocery') removeRecipeGroceryItem(index);
				else if (action === 'delete-review') deleteReview(Number(actionTarget.dataset.reviewId), actionTarget.dataset.isAdmin === 'true');
				else if (action === 'submit-review-reply') submitReviewReply(Number(actionTarget.dataset.reviewId));
				else if (action === 'open-review-reply-editor') openReviewReplyEditor(Number(actionTarget.dataset.reviewId));
				else if (action === 'cancel-review-reply-editor') cancelReviewReplyEditor();
				else if (action === 'toggle-review-reply-helpful') toggleReviewReplyHelpful(Number(actionTarget.dataset.reviewId));
				else if (action === 'history-back') history.back();
				else if (action === 'step-photo-move') stepPhotoCarouselMove(actionTarget, Number(actionTarget.dataset.direction));
				else if (action === 'balance-wizard') balWizardGo(Number(actionTarget.dataset.delta));
				else if (action === 'scroll-to-reviews') scrollToReviews();
				else if (action === 'dismiss-guest-helper') dismissRecipeGuestHelper();
				else if (action === 'scroll-to-balance') scrollToBalanceBanner();
				else if (action === 'share-recipe') shareRecipe();
				else if (action === 'toggle-favorite') toggleRecipeFav();
				else if (action === 'scroll-to-review-form') scrollToReviewForm();
				else if (action === 'track-registration-cta') {
					if (window.SmartPlateMetrika && typeof SmartPlateMetrika.goal === 'function') {
						SmartPlateMetrika.goal('registration_cta_clicked');
					}
				}
				else if (action === 'open-grocery-list') openRecipeGroceryList();
				else if (action === 'toggle-stepper-mode') toggleStepperMode();
				else if (action === 'dismiss-steps-hint') dismissStepsHint();
				else if (action === 'toggle-steps-expanded') toggleStepsExpanded();
				else if (action === 'stepper-prev') stepperPrev();
				else if (action === 'stepper-next') stepperNext();
				else if (action === 'close-review-outside') {
					if (event.target === actionTarget) closeReviewForm();
				}
				else if (action === 'close-review-form') closeReviewForm();
				else if (action === 'submit-review') submitReview();
				else if (action === 'video-login') location.href = Auth._loginUrl();
				else if (action === 'remove-video-vote') removeVideoVote();
				else if (action === 'submit-video-vote') submitVideoVote();
				else if (action === 'close-plate') closePlate();
				else if (action === 'go-home') location.href = 'index.html';
				else if (action === 'toggle-plate-shop-mode') toggleRecipePlateShopMode();
				else if (action === 'toggle-plate-shop-item') toggleRecipePlateShopItem(index);
				else if (action === 'copy-plate-shopping-list') copyRecipePlateShoppingList();
				else if (action === 'share-shopping-list') shareShoppingList();
				else if (action === 'save-plate') savePlateR();
				return;
			}

			const recipeTarget = event.target.closest('[data-recipe-href]');
			if (recipeTarget) {
				location.href = recipeTarget.dataset.recipeHref;
				return;
			}

			const videoTab = event.target.closest('.video-tab[data-key]');
			if (videoTab) {
				switchVideo(videoTab.dataset.key);
				return;
			}

			const balanceItem = event.target.closest('[data-balance-key]');
			if (!balanceItem || event.target.closest('.bal-item-recipe-link')) return;
			toggleAddItem(
				balanceItem.dataset.balanceKey,
				Number(balanceItem.dataset.kcal),
				Number(balanceItem.dataset.protein),
				Number(balanceItem.dataset.fat),
				Number(balanceItem.dataset.carbs),
				Number(balanceItem.dataset.fiber)
			);
		});

		document.addEventListener('change', function (event) {
			const changeTarget = event.target.closest('[data-recipe-change]');
			if (changeTarget && changeTarget.dataset.recipeChange === 'toggle-stepper-done') toggleStepperDone();
		});

		document.addEventListener('error', function (event) {
			const image = event.target;
			if (!(image instanceof HTMLImageElement)) return;
			if (image.dataset.recipeImageFallback === 'step') {
				markRecipeImageError(image);
				return;
			}
			if (image.dataset.recipeImageFallback === 'hide') {
				image.style.display = 'none';
				return;
			}
			if (image.hasAttribute('data-review-avatar-fallback')) {
				image.style.display = 'none';
				if (image.nextElementSibling) image.nextElementSibling.style.display = 'flex';
				return;
			}
			if (image.hasAttribute('data-fallback-emoji')) {
				image.style.display = 'none';
				const fallback = document.createElement('div');
				fallback.className = 'recipe-hero-emoji';
				fallback.style.cssText = 'position:relative;font-size:64px;z-index:1;text-shadow:0 2px 8px rgba(0,0,0,.3)';
				fallback.textContent = image.dataset.fallbackEmoji || '🍴';
				image.parentElement.insertBefore(fallback, image);
				image.removeAttribute('data-fallback-emoji');
			}
		}, true);

		// loadReviews is now called inside initRecipe() after renderRecipe(r)

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

// CSP: static recipe controls migrated from HTML event attributes.
document.querySelectorAll('[data-recipe-static-action]').forEach(function (control) {
    control.addEventListener('click', function (event) {
        var action = control.dataset.recipeStaticAction;
        if (action === 'scroll-to-balance') scrollToBalanceBanner();
        else if (action === 'scroll-to-top') scrollRecipeToTop();
        else if (action === 'add-to-plate') addToPlate();
        else if (action === 'confirm-balance-success-add') confirmBalanceSuccessAdd();
        else if (action === 'hide-balance-success') hideBalanceSuccessModal('secondary');
        else if (action === 'confirm-balance-warn-add') confirmBalanceWarnAdd();
		else if (action === 'guide-to-balance-additions') guideToBalanceAdditions();
        else if (action === 'hide-balance-warn') hideBalanceWarnModal();
        else if (action === 'go-to-guest-login') goToGuestLogin();
        else if (action === 'hide-guest-login') hideGuestLoginModal();
        else if (action === 'close-grocery-outside') closeRecipeGroceryIfOutside(event);
        else if (action === 'toggle-grocery-list') toggleRecipeGroceryList();
        else if (action === 'remove-all-grocery-items') removeAllRecipeGroceryItems();
        else if (action === 'copy-grocery-list') copyRecipeGroceryList();
        else if (action === 'toggle-grocery-shop-mode') toggleGroceryShopMode();
        else if (action === 'close-grocery-list') closeRecipeGroceryList();
    });
    if (control.dataset.recipeStaticAction === 'scroll-to-balance') {
        control.addEventListener('keydown', handleMiniStatusKey);
    }
});
