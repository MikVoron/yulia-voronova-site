		function escHtml(s) {
			return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
		}

		// The plate modal uses product contours rather than emoji for add-ons that
		// do not have their own recipe photo.
		const PLATE_ADDON_ICON_PATHS = {
			yogurt: '<path d="M17 20h30l-3 31H20l-3-31Z"/><path d="M20 20c4-5 20-5 24 0M22 32c5 3 11 3 18 0"/>', cottage: '<path d="M15 34h34c-2 11-8 17-17 17s-15-6-17-17Z"/><circle cx="24" cy="29" r="4"/><circle cx="32" cy="27" r="5"/><circle cx="40" cy="30" r="4"/>', meat: '<path d="M19 41c0-13 10-22 23-22 9 0 15 6 15 14 0 11-10 20-23 20-8 0-15-4-15-12Z"/><path d="M25 44c8 3 17 1 24-7"/>', fish: '<path d="M16 35c9-11 23-12 33-3l8-7v20l-8-7c-10 9-24 8-33-3Z"/><circle cx="27" cy="34" r="1.8" fill="currentColor" stroke="none"/>', tuna: '<path d="M16 23h32v28H16z"/><ellipse cx="32" cy="23" rx="16" ry="5"/><path d="M22 36h20M27 29h10"/>', tofu: '<path d="m20 24 12-7 12 7v21l-12 7-12-7V24Z"/><path d="m20 24 12 7 12-7M32 31v21"/><circle cx="27" cy="38" r="1.5"/><circle cx="37" cy="42" r="1.5"/>', edamame: '<path d="M17 42c3-17 14-24 31-20-3 17-14 25-31 20Z"/><circle cx="26" cy="36" r="4"/><circle cx="36" cy="33" r="4"/>', hummus: '<path d="M15 36h34c-2 10-8 16-17 16s-15-6-17-16Z"/><path d="M22 33c3-8 17-8 20 0-2 4-7 6-10 3-3 3-8 1-10-3Z"/><path d="M32 24v-5"/>', beetHummus: '<path d="M16 36h32c-2 10-8 16-16 16s-14-6-16-16Z"/><circle cx="32" cy="30" r="7"/><path d="M32 23v-6m0 0 5-4m-5 4-5-4"/>', parmesan: '<path d="m19 47 9-28 24 20-33 8Z"/><circle cx="30" cy="34" r="1.7"/><circle cx="40" cy="39" r="1.7"/><path d="m28 19 24 20"/>', yeast: '<path d="M20 20h24v32H20z"/><path d="M24 20v-4h16v4M25 30h14"/><circle cx="27" cy="37" r="1.4" fill="currentColor" stroke="none"/><circle cx="32" cy="40" r="1.4" fill="currentColor" stroke="none"/><circle cx="37" cy="36" r="1.4" fill="currentColor" stroke="none"/>', bread: '<path d="M17 48V29c0-8 6-13 13-13 5 0 8 2 10 5 8-1 13 5 13 11v16H17Z"/><path d="M23 29c5-3 9-3 14 0"/>', berries: '<circle cx="25" cy="39" r="7"/><circle cx="37" cy="39" r="7"/><circle cx="31" cy="28" r="7"/><path d="M31 20v-5m0 1 6-3"/>', greens: '<path d="M32 50V18m0 13c-8-1-12-6-13-12 8 1 12 6 13 12Zm0 10c8-1 12-6 13-12-8 1-12 6-13 12Zm0 4c-7 0-12 4-14 10 8 0 13-4 14-10Z"/>', vegetables: '<circle cx="26" cy="34" r="10"/><path d="m26 24 3-6m-3 6-6-3m9-3 5 1M43 25c7 10 5 20-6 27-5-11-2-20 6-27ZM41 31l-3 13"/>', dish: '<path d="M15 38h34c-2 8-8 13-17 13s-15-5-17-13Z"/><path d="M20 35c1-10 23-10 24 0M32 18v8m-7-4 3 4m11-4-3 4"/>'
		};
		function plateAddonIconKey(name) {
			const normalized = String(name || '').toLowerCase().replace(/ё/g, 'е');
			if (normalized.includes('йогурт')) return 'yogurt'; if (normalized.includes('творог')) return 'cottage'; if (normalized.includes('тунец') || normalized.includes('рыбные консервы')) return 'tuna'; if (normalized.includes('тофу')) return 'tofu'; if (normalized.includes('эдамаме')) return 'edamame'; if (normalized.includes('свеколь') && normalized.includes('хумус')) return 'beetHummus'; if (normalized.includes('хумус')) return 'hummus'; if (normalized.includes('мясо')) return 'meat'; if (normalized.includes('рыб')) return 'fish'; if (normalized.includes('пармезан')) return 'parmesan'; if (normalized.includes('дрожжи')) return 'yeast'; if (normalized.includes('хлеб') || normalized.includes('сухарик')) return 'bread'; if (normalized.includes('ягод')) return 'berries'; if (normalized.includes('зелень')) return 'greens'; if (normalized.includes('овощ')) return 'vegetables'; return 'dish';
		}
		function plateAddonIcon(name) {
			const paths = PLATE_ADDON_ICON_PATHS[plateAddonIconKey(name)] || PLATE_ADDON_ICON_PATHS.dish;
			return `<svg class="pv1-item-product-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
		}

		// Объявляем здесь, а не внизу: _renderRecommendedSkeleton() использует
		// _spRecCount синхронно, а let остаётся в TDZ до строки объявления.
		let _spRecCount = 8;
		const GUEST_TOUR_COMPLETED_KEY = 'smartplate_guest_tour_completed_v1';
		let _guestTourPreview = new URLSearchParams(location.search).get('guestTour') === '1';
		let _guestTourDismissedInMemory = false;
		if (_guestTourPreview) document.body.classList.add('sp-guest-tour-preview');
		function isGuestTourCompleted() {
			if (_guestTourDismissedInMemory) return true;
			try {
				return localStorage.getItem(GUEST_TOUR_COMPLETED_KEY) === '1';
			} catch (_) {
				return false;
			}
		}
		function replaceGuestTourUrl(isOpen) {
			const url = new URL(location.href);
			if (isOpen) url.searchParams.set('guestTour', '1');
			else url.searchParams.delete('guestTour');
			history.replaceState(history.state, '', url.pathname + url.search + url.hash);
		}
		function revealGuestTourAfterManualOpen() {
			const guestTourEl = document.getElementById('guest-onboarding');
			requestAnimationFrame(() => {
				if (guestTourEl) {
					const header = document.querySelector('.sp-header');
					const headerOffset = header ? header.getBoundingClientRect().height : 0;
					const top = window.scrollY + guestTourEl.getBoundingClientRect().top - headerOffset - 12;
					const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
					window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
				}
			});
		}
		function scrollToPageTop() {
			const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
		}
		function openGuestTour() {
			_guestTourPreview = true;
			document.body.classList.remove('sp-guest-tour-preview');
			updateGuestOnboardingVisibility();
			replaceGuestTourUrl(true);
			revealGuestTourAfterManualOpen();
		}
		function completeGuestTour() {
			try {
				localStorage.setItem(GUEST_TOUR_COMPLETED_KEY, '1');
			} catch (_) {}
			_guestTourDismissedInMemory = true;
			_guestTourPreview = false;
			document.body.classList.remove('sp-guest-tour-preview', 'sp-guest-onboarding-active');
			replaceGuestTourUrl(false);
			const trigger = document.getElementById('guest-tour-trigger');
			if (trigger) requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
			scrollToPageTop();
		}
		function updateGuestOnboardingVisibility() {
			document.body.classList.toggle('sp-guest-onboarding-active', _guestTourPreview || !isGuestTourCompleted());
		}
		window.addEventListener('popstate', function () {
			_guestTourPreview = new URLSearchParams(location.search).get('guestTour') === '1';
			document.body.classList.remove('sp-guest-tour-preview');
			updateGuestOnboardingVisibility();
		});
		// Условие зависит только от localStorage/URL, поэтому применяем его до
		// сетевых запросов. Иначе сначала мелькает hero, а после loadContent()
		// страница резко заменяет его вводным блоком.
		updateGuestOnboardingVisibility();
		document.documentElement.classList.remove('sp-guest-tour-preview');

		// Skeleton в #recommended-block СРАЗУ — место зарезервировано до того,
		// как loadContent() резолвится. Реальные карточки заполнит renderRecommended().
		_renderRecommendedSkeleton();

		// Ранний рендер навигации: Ингредиенты/Избранное/Консультации не зависят
		// от API — показываем сразу. loadContent().then() ниже перерисует с
		// категориями. Так меню работает даже если контент не загрузился.
		renderHeaderNav();

		loadContent().then(function () {
			if (isContentError()) {
				// Контент не загрузился — прячем динамические блоки, чтобы не висели над ошибкой.
				const nb = document.getElementById('new-block');
				if (nb) nb.style.display = 'none';
				const rb = document.getElementById('recommended-block');
				if (rb) rb.style.display = 'none';
				showApiError(document.getElementById('cat-grid'));
				return;
			}
			Auth.checkAccess({ allowGuest: true }).finally(function () {
				updateGuestOnboardingVisibility();
				// Сначала заполняем #new-block синхронно (featured из RECIPES + skeleton
				// новостей справа), чтобы он занял место ДО renderCats() — иначе
				// категории прыгают вниз после loadNewsFeed().
				renderNewsFeedInitial();
				renderCats();
				updateRecipeCount();
				// renderSeasonal(); — отключено: роль перешла к #new-block (см. renderNewsFeed)
				renderHero();
				renderHeaderNav();
				renderRecommended();
				renderCtaStrip();
				loadNewsFeed();
				if (Auth.isLoggedIn()) Plate.load();
			});
		});
		const user = Auth.getUser();

		// Quote bank — rotates without repeating
		(function () {
			const quotes = [
				'Каждый приём пищи — возможность дать телу то, что ему нужно.',
				'Сбалансированная тарелка — это не ограничения, а инструмент заботы о себе.',
				'Не нужно есть идеально. Нужно есть осознанно.',
				'Растительный белок так же полноценен, если сочетать источники правильно.',
				'Клетчатка — лучшая еда для вашего микробиома. Чем разнообразнее — тем лучше.',
				'Голод — сигнал тела, а не слабость характера. Учитесь его слышать.',
				'Хорошее питание не требует сложных расчётов — нужна привычка и осознанность.',
				'Ешьте радугу: чем больше цветов в тарелке, тем больше нутриентов.',
			];
			const KEY = 'julia_quote_day';
			const today = new Date().toDateString();
			const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
			let pick;
			if (saved && saved.date === today) {
				pick = saved.idx;
			} else {
				const shown = saved ? (saved.shown || []) : [];
				const remaining = quotes.map((_, i) => i).filter(i => !shown.includes(i));
				const pool = remaining.length ? remaining : quotes.map((_, i) => i);
				pick = pool[Math.floor(Math.random() * pool.length)];
				const nextShown = [...shown, pick].slice(-quotes.length);
				localStorage.setItem(KEY, JSON.stringify({ date: today, idx: pick, shown: nextShown }));
			}
			const el = document.getElementById('julia-quote');
			if (el) el.textContent = '«' + quotes[pick] + '»';
		})();

		// Фото для карточек категорий
		const CAT_PHOTOS = {
			breakfasts: SITE_BASE + '/images/blog/random-pic-blog-5..webp',
			soups: SITE_BASE + '/images/recipes/red-lentil-mushroom-soup/red-lentil-mushroom-soup-cover.webp',
			mains: SITE_BASE + '/images/cook-healthy-food.webp',
			pancakes: SITE_BASE + '/images/blog/random-pic-blog-2.webp',
			spreads: SITE_BASE + '/images/blog/random-pic-blog-3.webp',
			sauces: SITE_BASE + '/images/recipes/cashew-sauce/cashew-sauce-cover.webp',
			salads: SITE_BASE + '/images/blog/random-pic-blog-4.webp',
			drinks: SITE_BASE + '/images/blog/random-pic-blog-1.webp',
		};

		// Init header
		const greetingEl = document.getElementById('greeting-hi'); // legacy: may не быть на editorial-главной
		const heroEyebrow = document.getElementById('sp-hero-eyebrow');
		const heroTitle = document.getElementById('sp-hero-title');
		const heroSub = document.getElementById('sp-hero-sub');
		const userBadge = document.getElementById('user-badge');

		// Приветствие по локальному времени браузера.
		// 05:00–11:59 → утро, 12:00–17:59 → день, 18:00–23:59 → вечер, 00:00–04:59 → ночь.
		function _spTimeGreeting() {
			const h = new Date().getHours();
			if (h >= 5 && h < 12) return 'Доброе утро';
			if (h >= 12 && h < 18) return 'Добрый день';
			if (h >= 18) return 'Добрый вечер';
			return 'Доброй ночи';
		}
		// Имя для приветствия: getDisplayName → user.name → email до @ → пусто.
		function _spHeroName() {
			try {
				const dn = (Auth.getDisplayName && Auth.getDisplayName()) || '';
				if (dn) return dn;
				const u = (Auth.getUser && Auth.getUser()) || null;
				if (u && u.name) return u.name;
				if (u && u.email && u.email.indexOf('@') > 0) return u.email.split('@')[0];
			} catch (e) { }
			return '';
		}

		if (heroEyebrow) {
			const today = new Date();
			const dateEl = document.getElementById('sp-hero-date');
			const weekdayEl = document.getElementById('sp-hero-weekday');
			if (dateEl) dateEl.textContent = today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
			if (weekdayEl) weekdayEl.textContent = today.toLocaleDateString('ru-RU', { weekday: 'long' });
		}

		(function initHowDemos() {
			const cards = Array.from(document.querySelectorAll('.sp-how-card'));
			if (!cards.length) return;

			const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			const mobileText = window.matchMedia('(max-width: 767px)').matches;
			const searchText = mobileText ? 'Плов' : 'Плов с чечевицей';
			const messageText = 'Юля, добавьте рецепт шакшуки!';

			function typeDemoText(element, text, delay, speed) {
				if (!element) return;
				element.textContent = '';
				let index = 0;
				setTimeout(function tick() {
					element.textContent = text.slice(0, index + 1);
					index += 1;
					if (index < text.length) setTimeout(tick, speed);
				}, delay);
			}

			if (reduceMotion) {
				cards.forEach(card => {
					card.classList.add('is-demo-static');
					const demo = card.dataset.howDemo;
					const typed = card.querySelector('[data-how-type]');
					if (typed) typed.textContent = demo === 'search' ? searchText : messageText;
				});
				return;
			}

			const durations = { search: 4200, balance: 2500, save: 2200, shopping: 2200, message: 4200 };
			const queue = [];
			let demoRunning = false;

			function runNextDemo() {
				if (demoRunning || !queue.length) return;
				const card = queue.shift();
				if (!card || card.dataset.howDemoPlayed === '1') {
					runNextDemo();
					return;
				}

				demoRunning = true;
				card.dataset.howDemoPlayed = '1';
				card.classList.add('is-demo-active');
				const demo = card.dataset.howDemo;
				if (demo === 'search') {
					typeDemoText(card.querySelector('[data-how-type="search"]'), searchText, 280, mobileText ? 115 : 64);
				} else if (demo === 'message') {
					typeDemoText(card.querySelector('[data-how-type="message"]'), messageText, 1500, 62);
				}

				setTimeout(() => {
					card.classList.add('is-demo-complete');
					demoRunning = false;
					runNextDemo();
				}, durations[demo] || 2400);
			}

			function enqueueCard(card) {
				if (!card || card.dataset.howDemoQueued === '1' || card.dataset.howDemoPlayed === '1') return;
				card.dataset.howDemoQueued = '1';
				queue.push(card);
				runNextDemo();
			}

			if (!('IntersectionObserver' in window)) {
				cards.forEach(enqueueCard);
				return;
			}

			const observer = new IntersectionObserver(entries => {
				entries
					.filter(entry => entry.isIntersecting)
					.sort((a, b) => cards.indexOf(a.target) - cards.indexOf(b.target))
					.forEach(entry => {
						enqueueCard(entry.target);
						observer.unobserve(entry.target);
					});
			}, { threshold: .5, rootMargin: '0px 0px -6% 0px' });
			cards.forEach(card => observer.observe(card));
		})();

		if (user) {
			const customName = Auth.getDisplayName();
			Auth.renderAvatar(document.getElementById('u-ava'), customName || user.email);
			document.getElementById('u-name').textContent = customName || user.email.split('@')[0];

			const timeGreet = _spTimeGreeting();
			const heroName = _spHeroName();
			// Hero: приветствие в title, вопрос в sub. Маркетинговый текст не показываем.
			// Имя выносим на отдельную строку — держим editorial-вертикаль и страхуем длинные имена.
			if (heroTitle) {
				if (heroName) {
					heroTitle.innerHTML = escHtml(timeGreet) + ',<br>' + escHtml(heroName);
				} else {
					heroTitle.textContent = timeGreet;
				}
			}
			if (heroSub) {
				heroSub.textContent = 'Что будем сегодня готовить?';
			}
			// Legacy greeting block (если есть на странице — заполняем).
			if (greetingEl) {
				greetingEl.innerHTML = customName
					? (timeGreet + ', <span style="color:var(--accent)">' + escHtml(customName) + '</span>!')
					: (timeGreet + '!');
			}
		} else {
			// Гость: editorial-кнопка «Войти», аватар скрыт через .sp-profile.is-guest.
			// Hero title/sub оставляем как в HTML — маркетинговый текст для незалогиненных.
			const uName = document.getElementById('u-name');
			if (uName) uName.textContent = 'Войти';
			const dd = document.getElementById('user-dropdown');
			if (dd) dd.remove();
			if (userBadge) userBadge.classList.add('is-guest');
		}
		updatePlateIcon();

		// Клик по «профильной» пилюле — для гостя редиректит на login, для логина — открывает меню.
		function onUserBadgeClick(e) {
			if (Auth.isGuest()) {
				e.preventDefault();
				location.href = Auth._loginUrl();
				return;
			}
			toggleUserMenu(e);
		}

		// Scroll effect
		window.addEventListener('scroll', () =>
			document.getElementById('hdr').classList.toggle('scrolled', scrollY > 10));

		// ── CATEGORIES ───────────────────────────────────────────────────────
		function pluralR(n) {
			const m10 = n % 10, m100 = n % 100;
			if (m100 >= 11 && m100 <= 14) return n + ' рецептов';
			if (m10 === 1) return n + ' рецепт';
			if (m10 >= 2 && m10 <= 4) return n + ' рецепта';
			return n + ' рецептов';
		}

		const activeFilters = {};

		// Общая выборка для режимов, которые показывают отдельные рецепты, а не категории.
		// «Популярные» должен сужать уже отфильтрованный список, а не сбрасывать его.
		function getFilteredRecipes() {
			let dishes = Object.values(RECIPES).filter(Boolean);
			if (activeFilters.time) {
				dishes = activeFilters.time === 'over60'
					? dishes.filter(d => d.time > 60)
					: dishes.filter(d => d.time <= activeFilters.time);
			}
			if (activeFilters.difficulty) dishes = dishes.filter(d => d.diff === activeFilters.difficulty);
			if (activeFilters.gluten)  dishes = dishes.filter(d => (d.tags || []).includes('без глютена'));
			if (activeFilters.plant)   dishes = dishes.filter(d => (d.tags || []).includes('растительное'));
			if (activeFilters.fish)    dishes = dishes.filter(d => (d.tags || []).includes('рыбное'));
			if (activeFilters.noSoy)   dishes = dishes.filter(d => (d.tags || []).includes('без сои'));
			if (activeFilters.legumes) dishes = dishes.filter(d => (d.tags || []).includes('бобовые'));
			if (activeFilters.free)    dishes = dishes.filter(d => Auth.isFreeRecipe(d));
			return dishes;
		}

		function renderCats() {
			updateRecipeCount();
			const grid = document.getElementById('cat-grid');
			const hasFilters = Object.values(activeFilters).some(v => v);
			const items = Object.values(CATEGORIES)
				.map(cat => ({ cat, count: getCategoryDishes(cat.id, activeFilters).length }));
			const visible = hasFilters ? items.filter(x => x.count > 0) : items;

			if (hasFilters && visible.length === 0) {
				grid.innerHTML =
					'<div style="grid-column:1/-1;text-align:center;padding:50px 20px;color:var(--text-3)">По выбранным фильтрам рецепты не найдены.</div>';
				if (typeof updateRecipeCount === 'function') updateRecipeCount();
				return;
			}

			grid.innerHTML = visible.map(({ cat, count }) => {
				const _id = encodeURIComponent(cat.id);
				const _name = escHtml(cat.name);
				const _desc = escHtml(cat.desc);
				const _emoji = escHtml(cat.emoji);
				const photo = getCategoryPhoto(cat.id, CAT_PHOTOS[cat.id]);
				const photoHtml = photo
					? `<img src="${escHtml(photo)}" alt="${_name}" loading="lazy">`
					: `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:48px">${_emoji}</div>`;
				return `<button class="cat-card" data-category-id="${_id}">
                <div class="cat-icon-wrap">${photoHtml}</div>
                <div class="cat-body">
                    <div class="cat-name">${_name}</div>
                    <div class="cat-desc">${_desc}</div>
                    <div class="cat-count">${pluralR(count)}</div>
                </div>
            </button>`;
			}).join('');
		}
		// ── NEWS FEED ─────────────────────────────────────────────────────────
		let NEWS_FEED = [];

		// Формат даты в editorial-стиле: «14 ноября» (без года) — CSS превращает в uppercase.
		function _spFormatNewsDate(input) {
			if (!input) return '';
			try {
				const d = new Date(input);
				if (isNaN(d.getTime())) return String(input);
				return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
			} catch (e) { return String(input); }
		}

		async function loadNewsFeed() {
			try {
				const headers = {};
				const token = Auth.getToken();
				if (token) headers['Authorization'] = 'Bearer ' + token;
				const res = await fetch(API_BASE + '/content/news?limit=20', { headers });
				if (res.ok) {
					const data = await res.json();
					const all = data.map(function (n) {
						return {
							type: n.type, text: n.text, id: n.recipe_id,
							badge: n.badge, label: n.label,
							date: _spFormatNewsDate(n.created_at)
						};
					});
					// Правая колонка показывает все свежие обновления, включая анонс
					// рецепта. Карточка слева остаётся главным визуальным анонсом,
					// а строка справа подтверждает посетителю, что лента обновляется.
					var rightNews = all.slice(0, 4);
					// Последний добавленный рецепт — автоматически закрепляется в левой колонке.
					// Селектор `_latestRecipeId()` тот же, что использует renderNewsFeedInitial(),
					// чтобы featured не менялся после ответа /api/news.
					var latestId = _latestRecipeId();
					var latestRecipe = latestId ? RECIPES[latestId] : null;
					NEWS_FEED = [];
					if (latestRecipe) {
						NEWS_FEED.push({
							type: 'recipe', id: latestRecipe.id, badge: 'Новинка',
							date: _spFormatNewsDate(latestRecipe.added || latestRecipe.addedTs)
						});
					}
					NEWS_FEED = NEWS_FEED.concat(rightNews);
				} else {
					// API недоступен — всё равно покажем хотя бы featured-рецепт.
					NEWS_FEED = [];
					var latestId2 = _latestRecipeId();
					var latestRecipe2 = latestId2 ? RECIPES[latestId2] : null;
					if (latestRecipe2) {
						NEWS_FEED.push({
							type: 'recipe', id: latestRecipe2.id, badge: 'Новинка',
							date: _spFormatNewsDate(latestRecipe2.added || latestRecipe2.addedTs)
						});
					}
				}
			} catch {
				NEWS_FEED = [];
				var lrId = _latestRecipeId();
				var lr = lrId ? RECIPES[lrId] : null;
				if (lr) {
					NEWS_FEED.push({
						type: 'recipe', id: lr.id, badge: 'Новинка',
						date: _spFormatNewsDate(lr.added || lr.addedTs)
					});
				}
			}
			renderNewsFeed();
		}

		function imgFallback(img, emoji) {
			img.onerror = null;
			img.style.display = 'none';
			var d = document.createElement('div');
			d.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;font-size:56px';
			d.textContent = emoji;
			img.parentElement.insertBefore(d, img);
		}

		function renderNewsItemHtml(item) {
			const diff_labels = typeof DIFF_LABELS !== 'undefined' ? DIFF_LABELS : {};
			let html = '';
			if (item.type === 'news') {
				html = `<div class="news-text-card">
                    <div class="news-text-card-date">${escHtml(item.date || '')}</div>
                    <div class="news-text-card-top">
                        <div class="news-text-card-ava">
                            <img src="https://voronova.online/images/YV-small.webp" alt="Юлия" data-index-avatar-fallback="👩‍🍳">
                        </div>
                        <div class="news-text-card-author">Юлия Воронова</div>
                    </div>
                    <div class="news-text-card-body">${escHtml(item.text || '')}</div>
                </div>`;
			} else if (item.type === 'recipe') {
				const d = RECIPES[item.id];
				if (!d) return '';
				const _id = encodeURIComponent(d.id);
				const _cat = encodeURIComponent(d.cat);
				const _name = escHtml(String(d.name || ''));
				const _photo = escHtml(String(d.photo || ''));
				const _emoji = escHtml(String(d.emoji || '🍴'));
				const _diff = escHtml(String(diff_labels[d.diff] || d.diff || ''));
				const _diffIcon = typeof diffIcon === 'function' ? diffIcon(d.diff) : '';
				const _timeMeta = formatTimeMeta(d.time, d.timeLabel);
				const _timeStr = escHtml(_timeMeta.short);
				const _timeNote = _timeMeta.note ? escHtml(_timeMeta.note) : '';
				const _kcal = Number(d.kcal) || 0;
				const _protein = Number(d.protein) || 0;
				const _fat = Number(d.fat) || 0;
				const _carbs = Number(d.carbs) || 0;
				const _quoteRaw = String(d.quote || '').replace(/^[«"']|[»"']$/g, '').trim();
				const _desc = _quoteRaw ? escHtml(_quoteRaw.length > 140 ? _quoteRaw.slice(0, 138).replace(/\s+\S*$/, '') + '…' : _quoteRaw) : '';
				const TAG_LABELS = { gluten: 'Без глютена', plant: 'Растительное', fish: 'Рыбное', noSoy: 'Без сои', legumes: 'Бобовые' };
				const _tagsArr = Array.isArray(d.tags) ? d.tags : [];
				const _tagsHtml = _tagsArr.slice(0, 3).map(function (t) {
					const lbl = TAG_LABELS[t] || t;
					return '<span class="featured-card-tag">' + escHtml(String(lbl)) + '</span>';
				}).join('');
				const access = Auth.recipeCardAccess(d);
				const locked = access.locked;
				const lockLevel = locked ? access.level : null;
				const photoHtml = _photo
					? `<img src="${_photo}" alt="${_name}" loading="lazy" data-fallback-emoji="${_emoji}">`
					: `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:56px">${_emoji}</div>`;
				const lockBadgeIcon = '<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>';
				const lockBadgeClass = lockLevel === 'pro' ? 'locked-badge' : 'trial-badge';
				const lockBadge = locked
					? '<div class="' + lockBadgeClass + '">' + lockBadgeIcon + access.label + '</div>'
					: '';
				// «Бесплатно» — показываем гостю/триалу как маркер витрины. Для пользователя с доступом не дублируем.
				const freeBadge = !locked && access.isFree && !Auth.hasFullAccess()
					? '<div class="free-badge">Бесплатно</div>'
					: '';
				const accessHint = locked ? `. ${access.label}. ${access.actionLabel}` : '';
				html = `<button class="featured-card${locked ? ' locked' : ''}" aria-label="${_name}${accessHint}" ${locked ? `data-locked-recipe-id="${_id}" data-locked-recipe-href="recipe.html?id=${_id}&from=${_cat}"` : `data-recipe-href="recipe.html?id=${_id}&from=${_cat}"`}>
                    <div class="featured-card-photo" style="position:relative">
                        ${photoHtml}
                        <div class="card-badge-stack">
                            ${item.badge ? '<div class="card-new-badge">' + escHtml(String(item.badge)) + '</div>' : ''}
                            ${lockBadge}${freeBadge}
                        </div>
                    </div>
                    <div class="featured-card-body">
                        ${item.date ? '<div class="news-item-date">' + escHtml(item.date) + '</div>' : ''}
                        <div class="featured-card-name">${_name}</div>
                        <div class="featured-card-meta">
                            <span class="pill">${typeof timeIcon === 'function' ? timeIcon() : ''}${_timeStr}</span>
                            <span class="pill">${_diffIcon}${_diff}</span>
                        </div>
                        ${_timeNote ? `<div class="recipe-card-time-note"><span class="rcn-arr" aria-hidden="true">↳</span>${_timeNote}</div>` : ''}
                        ${_desc ? `<div class="featured-card-desc">${_desc}</div>` : ''}
                        <div class="featured-card-macros">
                            <span class="kcal">${_kcal} ккал</span>
                            <span>Б ${_protein}</span>
                            <span>Ж ${_fat}</span>
                            <span>У ${_carbs} г</span>
                        </div>
                        ${_tagsHtml ? `<div class="featured-card-tags">${_tagsHtml}</div>` : ''}
						<span class="featured-card-cta">${access.actionLabel} →</span>
                    </div>
                </button>`;
			}
			return html;
		}

		// Синхронная инициализация #new-block ДО renderCats().
		// Левая колонка — финальная featured-карточка из RECIPES (тот же селектор
		// `_latestRecipeId`, что использует loadNewsFeed → swap-а не будет).
		// Правая колонка — skeleton из 4 строк новостей; loadNewsFeed() позже
		// заменит его на реальные новости или схлопнет блок в одну колонку.
		// Цель: блок занимает место с first paint, категории не прыгают вниз.
		function renderNewsFeedInitial() {
			const block = document.getElementById('new-block');
			const featureEl = document.getElementById('new-feature');
			const listEl = document.getElementById('new-list');
			if (!block || !featureEl || !listEl) return;

			// Если RECIPES пуст — крайний случай (контент-ошибка), блок прячем.
			const latestId = _latestRecipeId();
			if (!latestId) { block.style.display = 'none'; return; }
			const latest = RECIPES[latestId];

			featureEl.innerHTML = renderNewFeatureCard({
				type: 'recipe',
				id: latest.id,
				badge: 'Новинка',
				date: _spFormatNewsDate(latest.added || latest.addedTs)
			});

			// Skeleton-строки правой колонки (геометрия = .sp-news-item:
			// date-полоска + 2 строки заголовка). 4 строки соответствуют
			// финальному количеству rightItems.slice(0, 4).
			const widths = [['86%', '62%'], ['92%', '58%'], ['80%', '70%'], ['88%', '50%']];
			listEl.innerHTML = widths.map(function (w, i) {
				return '<article class="sp-news-item" role="listitem" aria-hidden="true">'
					+ '<span class="sp-skel-line" style="width:32%;height:10px;display:block"></span>'
					+ '<span class="sp-skel-line" style="width:' + w[0] + ';height:16px;display:block;margin-top:10px"></span>'
					+ '<span class="sp-skel-line" style="width:' + w[1] + ';height:16px;display:block;margin-top:6px"></span>'
					+ '</article>';
			}).join('');
			block.classList.remove('sp-new-block--no-list');
			block.setAttribute('aria-busy', 'true');
		}

		// Editorial 2-column «Новое»: слева vertical-карточка последнего рецепта,
		// справа — лента свежих обновлений, включая новые рецепты. См. #new-block.
		function renderNewsFeed() {
			const block = document.getElementById('new-block');
			const featureEl = document.getElementById('new-feature');
			const listEl = document.getElementById('new-list');
			if (!block || !featureEl || !listEl) return;

			const recipeItems = NEWS_FEED.filter(function (i) { return i.type === 'recipe'; });
			// У синтетической featured-записи нет текста; она нужна только слева.
			// Все реальные обновления API, включая новые рецепты, идут вправо.
			const rightItems = NEWS_FEED.filter(function (i) { return i.type === 'news' || !!i.text; });

			// display блока больше не трогаем — он показан с first paint,
			// а инициализация прошла через renderNewsFeedInitial().

			const featured = recipeItems[0];
			if (featured) {
				featureEl.innerHTML = renderNewFeatureCard(featured);
			} else {
				featureEl.innerHTML = '';
			}

			if (rightItems.length) {
				const visibleNews = rightItems.slice(0, 4);
				listEl.classList.remove('open');
				listEl.innerHTML = visibleNews.map(renderNewsListItem).join('') + renderNewsListToggle(visibleNews.length);
				block.classList.remove('sp-new-block--no-list');
			} else {
				// Обновлений нет — single-column mode (фичер во всю ширину).
				// Горизонтальный shift приемлем; vertical layout уже стабилен.
				listEl.innerHTML = '';
				listEl.classList.remove('open');
				block.classList.add('sp-new-block--no-list');
			}
			block.removeAttribute('aria-busy');
		}

		// Vertical featured-card в левой колонке #new-block (фото сверху, тело снизу).
		// Контракт макета (см. дизайн): eyebrow «Новый рецепт · дата» → title → desc
		// → meta-строка с точечными разделителями → CTA «Открыть рецепт →» под линией.
		function renderNewFeatureCard(item) {
			const d = RECIPES[item.id];
			if (!d) return '';
			const diff_labels = typeof DIFF_LABELS !== 'undefined' ? DIFF_LABELS : {};
			const _id = encodeURIComponent(d.id);
			const _cat = encodeURIComponent(d.cat || '');
			const _name = escHtml(String(d.name || ''));
			const _photo = escHtml(String(d.photo || ''));
			const _emoji = escHtml(String(d.emoji || '🍴'));
			const _diff = escHtml(String(diff_labels[d.diff] || d.diff || ''));
			const _timeMeta = formatTimeMeta(d.time, d.timeLabel);
			const _timeStr = escHtml(_timeMeta.short);
			const _servings = Number(d.servings) || 0;
			const _yieldLabel = d.yieldLabel ? escHtml(d.yieldLabel) : '';
			const _kcal = Number(d.kcal) || 0;
			// Рейтинг из уже загруженного _apiRatings (без отдельного запроса).
			const _rv = (_apiRatings && _apiRatings[d.id]) ? _apiRatings[d.id] : null;
			const _avg = _rv && Number(_rv.avg) > 0 ? Number(_rv.avg) : 0;
			const _count = _rv ? (Number(_rv.count) || 0) : 0;
			const _starFull = Math.max(1, Math.min(5, Math.round(_avg)));
			let _starsSvg = '';
			for (let i = 1; i <= 5; i++) {
				_starsSvg += '<svg class="' + (i <= _starFull ? '' : 'star-empty') + '" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.5 1.6 6.7L12 17l-6.2 3.6 1.6-6.7L2.2 8.9l6.9-.6z"/></svg>';
			}
			const _revWord = (function (n) { n = Math.abs(n) % 100; const n1 = n % 10; if (n > 10 && n < 20) return 'отзывов'; if (n1 > 1 && n1 < 5) return 'отзыва'; if (n1 === 1) return 'отзыв'; return 'отзывов'; })(_count);
			const ratingHtml = _avg > 0
				? '<div class="sp-new-card-rating"><span class="stars">' + _starsSvg + '</span><span class="num">' + _avg.toFixed(1) + '</span>' + (_count ? '<span>· ' + _count + ' ' + _revWord + '</span>' : '') + '</div>'
				: '<div class="sp-new-card-rating"><span class="rating-new">Новый рецепт</span></div>';
			const _quoteRaw = String(d.quote || '').replace(/^[«"']|[»"']$/g, '').trim();
			const _desc = _quoteRaw ? escHtml(_quoteRaw.length > 160 ? _quoteRaw.slice(0, 158).replace(/\s+\S*$/, '') + '…' : _quoteRaw) : '';

			const photoHtml = _photo
				? `<img src="${_photo}" alt="${_name}" loading="lazy" data-fallback-emoji="${_emoji}">`
				: `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:80px">${_emoji}</div>`;

			const access = Auth.recipeCardAccess(d);
			const locked = access.locked;
			const lockLevel = locked ? access.level : null;
			const lockBadgeIcon = '<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>';
			const lockBadgeClass = lockLevel === 'pro' ? 'locked-badge' : 'trial-badge';
			const lockBadge = locked ? '<div class="' + lockBadgeClass + '">' + lockBadgeIcon + access.label + '</div>' : '';
			const freeBadge = !locked && access.isFree && !Auth.hasFullAccess()
				? '<div class="free-badge">Бесплатно</div>'
				: '';

			const _href = 'recipe.html?id=' + _id + '&from=' + _cat;
			// Гость открывает безопасное превью; авторизованный без доступа видит paywall-подсказку.
			const _lockAttr = locked ? ' data-locked-recipe-id="' + _id + '" data-locked-recipe-href="' + _href + '"' : '';
			// Без префикса «Новый рецепт» (повторяет название секции «Новое»).
			// Год и «г.» обрезаем — на главной показываем только день+месяц.
			const eyebrow = (item.date || '').replace(/\s*\d{4}\s*г\.?$/, '').trim();

			// Бейдж «Новинка» здесь не рисуем — повторяет название секции «Новое».
			// На карточках рецептов в других местах (категории/featured listings) бейдж остаётся.
			return `<article class="sp-new-card${locked ? ' locked' : ''}">
				<a class="sp-new-card-media" href="${_href}" tabindex="-1" aria-hidden="true"${_lockAttr}>
					${photoHtml}
					<div class="card-badge-stack">
						${lockBadge}${freeBadge}
					</div>
				</a>
				<div class="sp-new-card-body">
					<div class="sp-new-card-eyebrow">${escHtml(eyebrow)}</div>
					<h3 class="sp-new-card-title"><a class="sp-new-card-title-link" href="${_href}"${_lockAttr}>${_name}</a></h3>
					${ratingHtml}
					${_desc ? `<p class="sp-new-card-desc">${_desc}</p>` : ''}
					<div class="sp-new-card-meta">
						<span>${typeof timeIcon === 'function' ? timeIcon() : ''}${_timeStr}</span>
						${_diff ? `<span>${typeof diffIcon === 'function' ? diffIcon(d.diff) : ''}${_diff}</span>` : ''}
						${_yieldLabel ? `<span>${_yieldLabel}</span>` : (_servings ? `<span>${_servings} порц.</span>` : '')}
						<span class="kcal">${_kcal} ккал</span>
					</div>
					<a class="sp-new-card-cta" href="${_href}"${_lockAttr}>${access.actionLabel} →</a>
				</div>
			</article>`;
		}

		// Item в правой ленте новостей: дата → title → desc. Заголовок/описание
		// эвристически отделяются от item.text (на API схема — общее поле text).
		// Сплитим по « — » или первой точке-перед-заглавной — если совпало
		// в первых 90 символах, иначе весь текст становится заголовком.
		function renderNewsListItem(item) {
			const text = String(item.text || '').trim();
			let title = text, desc = '';
			const dashIdx = text.indexOf(' — ');
			if (dashIdx > 0 && dashIdx < 90) {
				title = text.slice(0, dashIdx).trim();
				desc = text.slice(dashIdx + 3).trim();
			} else {
				const m = text.match(/^(.{10,90}?[\.\!\?])\s+([А-ЯA-Z].*)$/s);
				if (m) { title = m[1].trim(); desc = m[2].trim(); }
			}
			if (item.type === 'recipe') title = 'Новый рецепт: ' + title;
			return `<article class="sp-news-item" role="listitem">
				<div class="sp-news-item-date">${escHtml(item.date || '')}</div>
				<h3 class="sp-news-item-title">${escHtml(title)}</h3>
				${desc ? `<p class="sp-news-item-desc">${escHtml(desc)}</p>` : ''}
			</article>`;
		}

		function renderNewsListToggle(count) {
			if (count <= 1) return '';
			return `<button class="news-toggle-btn" id="sp-news-toggle-btn" type="button" data-index-template-action="toggle-mobile-news">
				<span class="news-toggle-label">Показать ещё новости (${count - 1})</span>
				<span class="arr">⌄</span>
			</button>`;
		}

		// ── HERO SEARCH ──────────────────────────────────────────────────────
		(function initHeroSearch() {
			const input = document.getElementById('hero-search-input');
			const box = document.getElementById('hero-search-results');
			if (!input || !box) return;

			const DROPDOWN_LIMIT = 6;

			function pluralResults(n) {
				const m10 = n % 10, m100 = n % 100;
				if (m100 >= 11 && m100 <= 14) return n + ' результатов';
				if (m10 === 1) return n + ' результат';
				if (m10 >= 2 && m10 <= 4) return n + ' результата';
				return n + ' результатов';
			}

			function searchUrl(q) {
				return 'category.html?q=' + encodeURIComponent(q.trim());
			}

			function searchRecipeUrl(id, q) {
				return 'recipe.html?id=' + encodeURIComponent(id) +
					'&from=search&q=' + encodeURIComponent(q.trim());
			}

			function render(q) {
				const all = (typeof searchRecipes === 'function') ? searchRecipes(q) : [];
				if (!q.trim()) { box.classList.remove('open'); box.innerHTML = ''; return; }
				if (!all.length) {
					box.innerHTML = '<div class="hero-search-empty">Ничего не найдено</div>';
					box.classList.add('open');
					return;
				}
				const visible = all.slice(0, DROPDOWN_LIMIT);
				const itemsHtml = visible.map(function (d) {
					const _href = searchRecipeUrl(d.id, q);
					const _name = escHtml(String(d.name || ''));
					const _photo = escHtml(String(d.photo || ''));
					const _time = Number(d.time) || 0;
					const _timeStr = d.timeLabel ? escHtml(d.timeLabel) : (_time + ' мин');
					const _kcal = Number(d.kcal) || 0;
					const access = Auth.recipeCardAccess(d);
					const accessText = access.isFree || access.locked
						? `<span class="hero-search-access${access.isFree ? ' is-free' : ''}">· ${escHtml(access.label)}</span>`
						: '';
					const thumb = _photo
						? `<img class="hero-search-thumb" src="${_photo}" alt="" data-index-image-fallback="hide">`
						: `<div class="hero-search-thumb"></div>`;
					return `<a class="hero-search-item" href="${_href}">
						${thumb}
						<div class="hero-search-text">
							<div class="hero-search-name">${_name}</div>
							<div class="hero-search-meta">${typeof timeIcon === 'function' ? timeIcon() : ''}${_timeStr} · ${_kcal} ккал ${accessText}</div>
						</div>
					</a>`;
				}).join('');
				const showAllHtml = all.length > DROPDOWN_LIMIT
					? `<a class="hero-search-show-all" href="${searchUrl(q)}">Показать все ${pluralResults(all.length)} <span class="arr">→</span></a>`
					: '';
				box.innerHTML = itemsHtml + showAllHtml;
				box.classList.add('open');
			}

			input.addEventListener('input', function () { render(input.value); });
			input.addEventListener('focus', function () { if (input.value.trim()) render(input.value); });
			document.addEventListener('click', function (e) {
				if (!e.target.closest('#hero-search')) box.classList.remove('open');
			});
			input.addEventListener('keydown', function (e) {
				if (e.key === 'Escape') { input.value = ''; box.classList.remove('open'); }
				if (e.key === 'Enter') {
					e.preventDefault();
					const q = input.value.trim();
					if (q) location.href = searchUrl(q);
				}
			});
		})();

		// Обработчик submit для editorial-кнопки «→» в hero-search.
		function submitHeroSearch(e) {
			if (e && e.preventDefault) e.preventDefault();
			const inp = document.getElementById('hero-search-input');
			const q = inp ? inp.value.trim() : '';
			if (q) location.href = 'category.html?q=' + encodeURIComponent(q);
			return false;
		}

		function toggleNewsMore() {
			const wrap = document.getElementById('news-more-wrap');
			const btn = document.getElementById('news-toggle-btn');
			if (!wrap || !btn) return;
			const open = wrap.classList.toggle('open');
			btn.classList.toggle('open', open);
			const hiddenCount = wrap.querySelectorAll('.news-text-card').length;
			btn.querySelector('.news-toggle-label').textContent = open ? 'Свернуть' : 'Показать ещё новости (' + hiddenCount + ')';
		}

		function toggleMobileNewsList() {
			const list = document.getElementById('new-list');
			const btn = document.getElementById('sp-news-toggle-btn');
			if (!list || !btn) return;
			const open = list.classList.toggle('open');
			btn.classList.toggle('open', open);
			const hiddenCount = Math.max(0, list.querySelectorAll('.sp-news-item').length - 1);
			const label = btn.querySelector('.news-toggle-label');
			if (label) label.textContent = open ? 'Свернуть' : 'Показать ещё новости (' + hiddenCount + ')';
		}
		renderPlateInline();

		// Общее число рецептов + названия выбранных фильтров (вызывается из renderCats / renderPopular).
		// Число всегда общее, поэтому явно маркируем его «Всего», чтобы не выдавать
		// его за количество рецептов в текущей фильтрации.
		function updateRecipeCount() {
			const rcEl = document.getElementById('recipes-total-count');
			if (!rcEl) return;
			const n = Object.keys(RECIPES).length;
			const m10 = n % 10, m100 = n % 100;
			const word = (m100 >= 11 && m100 <= 14) ? 'рецептов' : m10 === 1 ? 'рецепт' : (m10 >= 2 && m10 <= 4) ? 'рецепта' : 'рецептов';
			const filterLabels = {
				free: 'Бесплатные', gluten: 'Без глютена', plant: 'Растительные',
				fish: 'Рыбные', noSoy: 'Без сои', legumes: 'Бобовые',
				time: { 15: 'До 15 мин', 30: 'До 30 мин', 60: 'До 1 часа', over60: 'Более 1 часа' },
				difficulty: { easy: 'Лёгкая', medium: 'Средняя', hard: 'Сложная' }
			};
			const selected = Object.keys(activeFilters).map(function(key) {
				const label = filterLabels[key];
				return typeof label === 'object' ? label[activeFilters[key]] : label;
			}).filter(Boolean);
			if (typeof _popularActive !== 'undefined' && _popularActive) selected.push('Популярные');
			const applied = selected.length
				? `<span class="rtc-applied">· ${selected.length === 1 ? 'Выбран фильтр' : 'Выбраны фильтры'}: ${selected.join(', ')}</span>`
				: '';
			rcEl.innerHTML = `<span class="rtc-applied">Всего</span><span class="rtc-num">${n}</span><span class="rtc-label">${word}</span>${applied}`;
		}

		// ── EDITORIAL HOMEPAGE BLOCKS ──────────────────────────────────────
		// Бейджи карточек: «Новинка» (если рецепт самый свежий) + access-бейдж.
		// Логика выбора access-бейджа повторяет news-feed / category — НЕ меняем
		// бизнес-семантику, только перерисовываем визуал.
		function spLockBadge(d) {
			const access = Auth.recipeCardAccess(d);
			if (access.locked) {
				const lvl = access.level;
				const lbl = escHtml(access.label || '');
				const cls = lvl === 'pro' ? 'sp-bd--pro' : 'sp-bd--trial';
				const lock = '<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>';
				return { html: `<span class="sp-bd ${cls}">${lock}${lbl}</span>`, locked: true, access };
			}
			// «Бесплатно» — маркер витрины для гостя/триала, не для подписчика.
			if (access.isFree && !Auth.hasFullAccess()) {
				return { html: '<span class="sp-bd sp-bd--free">Бесплатно</span>', locked: false, access };
			}
			return { html: '', locked: false, access };
		}

		// «Самый свежий» рецепт получает бейдж «Новинка» — не зависит от доступа.
		function _latestRecipeId() {
			const all = Object.values(RECIPES);
			if (!all.length) return null;
			const sorted = all.slice().sort(function (a, b) { return (b.addedTs || 0) - (a.addedTs || 0); });
			return sorted[0] ? sorted[0].id : null;
		}

		function spBadgesHtml(d, latestId) {
			const access = spLockBadge(d);
			const newBd = (d.id === latestId) ? '<span class="sp-bd sp-bd--new">Новинка</span>' : '';
			const inner = newBd + access.html;
			return { html: inner ? `<div class="sp-badges">${inner}</div>` : '', locked: access.locked, access: access.access };
		}

		function spRecipeHref(d) {
			return 'recipe.html?id=' + encodeURIComponent(d.id) + '&from=' + encodeURIComponent(d.cat || '');
		}

		function spActionAttrs(d, locked) {
			return locked
				? `data-locked-recipe-id="${escHtml(String(d.id || ''))}" data-locked-recipe-href="${escHtml(spRecipeHref(d))}"`
				: `data-recipe-href="${escHtml(spRecipeHref(d))}"`;
		}

		// 1) Сезонный рецепт. Источник: рецепт с isSeasonal=true.
		//    Fallback (если админ не назначил) — последний опубликованный рецепт.
		//    Если рецептов нет вообще — блок скрыт.
		function renderSeasonal() {
			const block = document.getElementById('seasonal-block');
			const body = document.getElementById('seasonal-body');
			if (!block || !body) return;

			const all = Object.values(RECIPES);
			let r = all.find(function (x) { return x.isSeasonal; });
			let isFallback = false;
			if (!r) {
				const latestId = _latestRecipeId();
				r = latestId ? RECIPES[latestId] : null;
				isFallback = true;
			}
			if (!r) { block.classList.add('index-is-hidden'); return; }

			const latestId = _latestRecipeId();
			const _id = encodeURIComponent(r.id);
			const _cat = encodeURIComponent(r.cat || '');
			const _name = escHtml(String(r.name || ''));
			const _photo = escHtml(String(r.photo || ''));
			const _emoji = escHtml(String(r.emoji || '🍴'));
			const photoHtml = _photo
				? `<img src="${_photo}" alt="${_name}" loading="lazy" data-fallback-emoji="${_emoji}">`
				: `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:64px">${_emoji}</div>`;

			const _diff = escHtml(String((typeof DIFF_LABELS !== 'undefined' ? DIFF_LABELS : {})[r.diff] || r.diff || ''));
			const _timeMeta = formatTimeMeta(r.time, r.timeLabel);
			const _timeStr = escHtml(_timeMeta.short);
			const _servings = Number(r.servings) || 0;
			const _yieldLabel = r.yieldLabel ? escHtml(r.yieldLabel) : '';
			const _kcal = Number(r.kcal) || 0;
			const _protein = Number(r.protein) || 0;
			const _fat = Number(r.fat) || 0;
			const _carbs = Number(r.carbs) || 0;
			const _quoteRaw = String(r.quote || '').replace(/^[«"']|[»"']$/g, '').trim();
			const _desc = _quoteRaw ? escHtml(_quoteRaw.length > 180 ? _quoteRaw.slice(0, 178).replace(/\s+\S*$/, '') + '…' : _quoteRaw) : '';

			const bd = spBadgesHtml(r, latestId);
			const eyebrow = isFallback ? 'Последнее на главной' : 'Сезонный выбор';

			block.classList.remove('index-is-hidden');
			body.innerHTML = `
				<button class="sp-seasonal${bd.locked ? ' locked' : ''}" type="button" ${spActionAttrs(r, bd.locked)}>
					<div class="sp-seasonal-media">
						${photoHtml}
						${bd.html}
					</div>
					<div class="sp-seasonal-body">
						<div class="sp-eyebrow">${escHtml(eyebrow)}</div>
						<h3 class="sp-seasonal-title">${_name}</h3>
						${_desc ? `<p class="sp-seasonal-desc">${_desc}</p>` : ''}
						<div class="sp-seasonal-meta">
							<span>${typeof timeIcon === 'function' ? timeIcon() : ''}${_timeStr}</span>
							${_diff ? `<span>${typeof diffIcon === 'function' ? diffIcon(r.diff) : ''}${_diff}</span>` : ''}
							${_yieldLabel ? `<span>${_yieldLabel}</span>` : (_servings ? `<span>${_servings} порц.</span>` : '')}
							<span class="kcal">${_kcal} ккал</span>
							<span>Б ${_protein} / Ж ${_fat} / У ${_carbs}</span>
						</div>
						<span class="sp-cta-inline">${bd.access.actionLabel}</span>
					</div>
				</button>`;
		}

		// 2) Рекомендуем — автосортировка по рейтингу.
		//    Порядок: рейтинг ↓ → кол-во оценок ↓ → дата добавления ↓.
		//    Рецепты без рейтинга — после рейтинговых, отсортированы по дате.
		//    Источник рейтингов — _apiRatings, грузится в loadApiRatings().
		//    Если рейтинги ещё не пришли — повторим рендер по таймеру (один раз).
		// Skeleton-карточки в #recommended-grid до loadContent → renderRecommended.
		// Заполняется СИНХРОННО при загрузке скрипта (см. вызов ниже), чтобы блок
		// не появлялся пустой и не пушил CTA-strip вниз при первом рендере.
		// Геометрия .sp-skel-card повторяет .sp-card (img 4:3 + 2 строки).
		function _renderRecommendedSkeleton() {
			const grid = document.getElementById('recommended-grid');
			if (!grid) return;
			grid.innerHTML = Array.from({ length: _spRecCount }, function () {
				return '<div class="sp-skel-card" aria-hidden="true">'
					+ '<div class="sp-skel-img"></div>'
					+ '<div class="sp-skel-line"></div>'
					+ '<div class="sp-skel-line short"></div>'
					+ '</div>';
			}).join('');
		}
		function _renderRecommendedInner() {
			const block = document.getElementById('recommended-block');
			const grid = document.getElementById('recommended-grid');
			if (!block || !grid) return;
			const all = Object.values(RECIPES);
			if (!all.length) { block.style.display = 'none'; return; }

			// «Популярные» — только рецепты с реальными оценками.
			const withRating = [];
			all.forEach(function (r) {
				const rv = _apiRatings[r.id];
				if (rv && rv.avg > 0) withRating.push({ r, rv });
			});
			withRating.sort(function (a, b) {
				if (b.rv.avg !== a.rv.avg) return b.rv.avg - a.rv.avg;
				if (b.rv.count !== a.rv.count) return b.rv.count - a.rv.count;
				return (b.r.addedTs || 0) - (a.r.addedTs || 0);
			});
			const shown = withRating.map(function (x) { return x.r; }).slice(0, _spRecCount);
			if (!shown.length) {
				block.style.display = 'none';
				grid.innerHTML = '';
				return;
			}
			const latestId = _latestRecipeId();
			const diffLabels = typeof DIFF_LABELS !== 'undefined' ? DIFF_LABELS : {};

			block.style.display = '';
			grid.innerHTML = shown.map(function (d) {
				const _name = escHtml(String(d.name || ''));
				const _photo = escHtml(String(d.photo || ''));
				const _emoji = escHtml(String(d.emoji || '🍴'));
				const photoHtml = _photo
					? `<img src="${_photo}" alt="${_name}" loading="lazy" data-fallback-emoji="${_emoji}">`
					: `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:44px">${_emoji}</div>`;
				const _diff = escHtml(String(diffLabels[d.diff] || d.diff || ''));
				const _timeMeta = formatTimeMeta(d.time, d.timeLabel);
				const _timeStr = escHtml(_timeMeta.short);
				const _kcal = Number(d.kcal) || 0;
				const _rating = _apiRatings[d.id] || {};
				const _ratingAvg = Number(_rating.avg) || 0;
				const _ratingCount = Number(_rating.count) || 0;
				const _ratingRounded = Math.round(_ratingAvg);
				let _ratingStars = '';
				for (let i = 1; i <= 5; i++) {
					_ratingStars += `<span${i > _ratingRounded ? ' class="empty"' : ''}>★</span>`;
				}
				const _ratingHtml = _ratingAvg > 0
					? `<div class="sp-card-rating" aria-label="Рейтинг ${_ratingAvg.toFixed(1)} из 5"><span class="sp-card-rating-stars" aria-hidden="true">${_ratingStars}</span><span class="sp-card-rating-value">${_ratingAvg.toFixed(1)}</span>${_ratingCount ? `<span>(${_ratingCount})</span>` : ''}</div>`
					: '<div class="sp-card-rating" aria-hidden="true"></div>';
				const bd = spBadgesHtml(d, latestId);
				const accessHint = bd.locked ? `. ${bd.access.label}. ${bd.access.actionLabel}` : '';
				return `
					<button class="sp-card${bd.locked ? ' locked' : ''}" type="button" ${spActionAttrs(d, bd.locked)} aria-label="${_name}${accessHint}">
						<div class="sp-card-media">
							${photoHtml}
							${bd.html}
						</div>
						<div class="sp-card-body">
							<h3 class="sp-card-title">${_name}</h3>
							${_ratingHtml}
							<div class="sp-card-meta">
								<span>${typeof timeIcon === 'function' ? timeIcon() : ''}${_timeStr}</span>
								${_diff ? `<span>${typeof diffIcon === 'function' ? diffIcon(d.diff) : ''}${_diff}</span>` : ''}
							</div>
							<div class="sp-card-foot">
								<span class="lbl">В порции</span>
								<span class="val">${_kcal}<small>ккал</small></span>
							</div>
						</div>
					</button>`;
			}).join('');
		}
		function renderRecommended() {
			_renderRecommendedInner();
			// Рейтинги грузятся параллельно; если их ещё не было — перерисуем через ~600мс.
			if (!Object.keys(_apiRatings).length) {
				setTimeout(_renderRecommendedInner, 700);
			}
		}

		// 3) CTA-полоса с динамическим счётчиком.
		//    Число — реальное кол-во опубликованных рецептов (RECIPES уже содержит
		//    только опубликованные, т.к. /content/recipes фильтрует по is_published).
		//    Логика «Более N» — округление вниз до ближайших 5/10, если есть смысл.
		//    При N < 5 показываем точное число.
		function _roundDownMarketing(n) {
			if (n < 5) return n;
			if (n < 20) return Math.floor(n / 5) * 5;
			return Math.floor(n / 10) * 10;
		}
		function renderCtaStrip() {
			const block = document.getElementById('cta-strip-block');
			const txt = document.getElementById('cta-strip-text');
			const btn = document.getElementById('cta-strip-btn');
			if (!block || !txt) return;

			// Пользователь закрыл CTA — больше не показываем (spec §3.5).
			try {
				if (localStorage.getItem('smartplate.cta.dismissed')) { block.classList.add('index-is-hidden'); return; }
			} catch (e) { /* private mode — игнорируем */ }

			// Полная подписка не нужна — скрываем CTA. (Гость/триал/expired — видят.)
			if (Auth.hasFullAccess && Auth.hasFullAccess()) {
				block.classList.add('index-is-hidden');
				return;
			}

			const n = Object.keys(RECIPES).length;
			if (!n) { block.classList.add('index-is-hidden'); return; }
			const rounded = _roundDownMarketing(n);
			const countLabel = rounded + '+';
			txt.innerHTML = '<span class="sp-cta-text-line"><span class="sp-cta-count">' + escHtml(countLabel) + '</span> адаптивных блюд с автоматическим расчётом КБЖУ, заменой продуктов и сезонными рецептами.</span>'
				+ '<span class="sp-cta-text-line">Управляйте тарелкой сами: сочетайте основные блюда с нужными вам добавками и рецептами.</span>';

			// Гость → ведём на login (триал автоматически), иначе на подписку.
			if (btn) {
				btn.href = Auth.isGuest && Auth.isGuest() ? Auth._loginUrl() : 'cabinet.html#subscription';
				btn.textContent = Auth.isGuest && Auth.isGuest() ? 'Попробовать бесплатно' : 'Оформить подписку';
			}
			block.classList.remove('index-is-hidden');
		}

		// Hero photo + caption — берём из сезонного рецепта; fallback на последний опубликованный.
		// Если рецептов нет / контент-ошибка — оставляем aside скрытым (исключительные ветки
		// ниже ставят display:none). В нормальном loading-состоянии место уже зарезервировано
		// через .sp-hero-aside.is-loading (см. CSS) — этот метод снимает класс после fill.
		// Важно: hero уважает paywall так же, как карточки/seasonal — locked-клик идёт в showLockedMsg,
		// а не на recipe.html.
		function renderHero() {
			const aside = document.getElementById('sp-hero-aside');
			const media = document.getElementById('sp-hero-media');
			const cap = document.getElementById('sp-hero-caption');
			if (!aside || !media || !cap) return;
			const all = Object.values(RECIPES);
			if (!all.length) { aside.style.display = 'none'; return; }
			let r = all.find(function (x) { return x.isSeasonal; });
			let label = 'Сезонный рецепт';
			if (!r) {
				// Fallback: 2-й по свежести, чтобы hero-фото и featured в #new-block
				// не показывали один и тот же рецепт. Если в БД <2 рецептов — берём первый.
				const sorted = all.slice().sort(function (a, b) { return (b.addedTs || 0) - (a.addedTs || 0); });
				r = sorted[1] || sorted[0];
			}
			if (!r) { aside.style.display = 'none'; return; }
			const _name = escHtml(String(r.name || ''));
			const _photo = String(r.photo || '');
			const _emoji = escHtml(String(r.emoji || '🍴'));
			// loading="eager" + fetchpriority="high" — фото первого экрана, важно для LCP.
			media.innerHTML = _photo
				? '<span class="sp-hero-loading-status" role="status">Загружаем фото…</span><img src="' + escHtml(_photo) + '" alt="' + _name + '" loading="eager" fetchpriority="high" data-fallback-emoji="' + _emoji + '">'
				: '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:72px">' + _emoji + '</div>';
			cap.innerHTML = '<span class="sp-cap-tag">' + escHtml(label) + '</span>'
				+ '<span class="sp-cap-title">' + escHtml(String(r.name || '')) + '</span>';
			aside.classList.remove('is-loading');
			const heroImage = media.querySelector('img');
			if (heroImage) {
				aside.classList.add('is-image-loading');
				aside.setAttribute('aria-busy', 'true');
				const finishHeroImage = function () {
					aside.classList.remove('is-image-loading');
					aside.removeAttribute('aria-busy');
					media.querySelector('.sp-hero-loading-status')?.remove();
				};
				heroImage.addEventListener('load', finishHeroImage, { once: true });
				heroImage.addEventListener('error', finishHeroImage, { once: true });
				if (heroImage.complete) finishHeroImage();
			}

			const access = (typeof Auth !== 'undefined' && typeof Auth.recipeCardAccess === 'function')
				? Auth.recipeCardAccess(r) : { locked: false, label: '', actionLabel: 'Открыть рецепт' };
			const locked = access.locked;
			aside.classList.toggle('locked', locked);
			if (locked) {
				aside.setAttribute('aria-label', _name + '. ' + access.label + '. ' + access.actionLabel);
				aside.href = 'recipe.html?id=' + encodeURIComponent(r.id) + '&from=' + encodeURIComponent(r.cat || '');
				aside.onclick = function (e) {
					if (Auth.isGuest()) return true;
					e.preventDefault();
					if (typeof showLockedMsg === 'function') showLockedMsg(r.id);
					return false;
				};
			} else {
				aside.setAttribute('aria-label', _name);
				aside.href = 'recipe.html?id=' + encodeURIComponent(r.id) + '&from=' + encodeURIComponent(r.cat || '');
				aside.onclick = null;
			}
			aside.style.display = '';
		}

		// Sticky-навигация в шапке: подставляем актуальные категории.
		// Показываем до 5 разделов (по дизайну) в desktop-nav + полный список в drawer (mobile).
		// activeCatId (optional): подсветить раздел; если cat не входит в первые 5 — заменяем
		// последний элемент, чтобы active всегда был виден.
		// Навигация хедера строится единым билдером (header-nav.js) из общего
		// источника категорий + справочника ингредиентов. На главной активного
		// продуктового контекста нет (логотип = домой).
		function renderHeaderNav(activeCatId) {
			if (global_SP_HEADER_ready()) {
				window.SP_HEADER.render({ activeCat: activeCatId || null, activeNav: 'home' });
				const heroFavorites = document.getElementById('hero-favorites-link');
				if (heroFavorites && typeof window.SP_HEADER.favoritesHref === 'function') {
					heroFavorites.href = window.SP_HEADER.favoritesHref();
				}
			}
		}
		function global_SP_HEADER_ready() {
			return !!(window.SP_HEADER && typeof window.SP_HEADER.render === 'function');
		}

		// Mobile drawer — открывает/закрывает шторку категорий. Backdrop клик закрывает.
		let _drawerScrollY = 0;
		let _drawerBodyStyles = null;
		function lockDrawerScroll() {
			if (_drawerBodyStyles) return;
			const body = document.body;
			_drawerScrollY = window.scrollY || window.pageYOffset || 0;
			_drawerBodyStyles = {
				overflow: body.style.overflow,
				position: body.style.position,
				top: body.style.top,
				left: body.style.left,
				right: body.style.right,
				width: body.style.width
			};
			body.style.overflow = 'hidden';
			body.style.position = 'fixed';
			body.style.top = '-' + _drawerScrollY + 'px';
			body.style.left = '0';
			body.style.right = '0';
			body.style.width = '100%';
		}
		function unlockDrawerScroll() {
			if (!_drawerBodyStyles) return;
			const body = document.body;
			body.style.overflow = _drawerBodyStyles.overflow;
			body.style.position = _drawerBodyStyles.position;
			body.style.top = _drawerBodyStyles.top;
			body.style.left = _drawerBodyStyles.left;
			body.style.right = _drawerBodyStyles.right;
			body.style.width = _drawerBodyStyles.width;
			_drawerBodyStyles = null;
			window.scrollTo(0, _drawerScrollY);
		}
		function openDrawer() {
			const dr = document.getElementById('sp-drawer');
			if (!dr) return;
			dr.removeAttribute('hidden');
			requestAnimationFrame(function () { dr.classList.add('open'); });
			lockDrawerScroll();
		}
		function closeDrawer() {
			const dr = document.getElementById('sp-drawer');
			if (!dr) return;
			dr.classList.remove('open');
			unlockDrawerScroll();
			setTimeout(function () { if (!dr.classList.contains('open')) dr.setAttribute('hidden', ''); }, 300);
		}
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') {
				const dr = document.getElementById('sp-drawer');
				if (dr && dr.classList.contains('open')) closeDrawer();
			}
		});

		// CTA strip dismiss — spec §3.5. Скрываем и пишем флаг в localStorage; renderCtaStrip
		// проверяет флаг при следующем рендере и не показывает блок.
		const CTA_DISMISS_KEY = 'smartplate.cta.dismissed';
		function dismissCtaStrip() {
			try { localStorage.setItem(CTA_DISMISS_KEY, '1'); } catch (e) { /* private mode */ }
			const block = document.getElementById('cta-strip-block');
			if (block) block.classList.add('index-is-hidden');
		}

		// showLockedMsg() централизован в data-v2.js (общий для index/category/ingredient)

		function goToCategory(catId) {
			const hasFilters = Object.values(activeFilters).some(v => v);
			if (hasFilters) sessionStorage.setItem('platform_filters', JSON.stringify(activeFilters));
			else sessionStorage.removeItem('platform_filters');
			location.href = 'category.html?cat=' + catId;
		}

		// ── FILTERS ──────────────────────────────────────────────────────────
		let openFGroup = null;
		function toggleFGroup(btn) {
			const dropId = btn.dataset.drop;
			const isOpen = openFGroup === dropId;
			closeFGroups();
			if (!isOpen) {
				const drop = document.getElementById(dropId);
				const rect = btn.getBoundingClientRect();
				drop.style.top = (rect.bottom + window.scrollY + 4) + 'px';
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
		document.addEventListener('click', function (e) {
			if (!e.target.closest('[data-drop]') && !e.target.closest('.fgroup-drop')) closeFGroups();
		});
		function pickFilter(el, btnId) {
			const f = el.dataset.f, v = el.dataset.v;
			const btn = document.getElementById(btnId);
			const drop = document.getElementById(btn.dataset.drop);
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
			if (_popularActive) renderPopular();
			else renderCats();
		}
		function toggleTagFilter(el) {
			const f = el.dataset.f;
			if (el.classList.contains('on')) { el.classList.remove('on'); delete activeFilters[f]; }
			else { el.classList.add('on'); activeFilters[f] = true; }
			syncFilterControls();
			if (_popularActive) renderPopular();
			else renderCats();
		}
		function toggleMoreFilters(btn) {
			const panel = document.getElementById(btn.getAttribute('aria-controls'));
			const open = btn.getAttribute('aria-expanded') !== 'true';
			btn.setAttribute('aria-expanded', String(open));
			if (panel) panel.classList.toggle('is-open', open);
		}
		function syncFilterControls() {
			const outer = document.querySelector('.sp-cats-head .filter-outer');
			if (outer) outer.classList.toggle('has-active', Object.keys(activeFilters).length > 0 || _popularActive);
		}
		// ── POPULAR FILTER ───────────────────────────────────────────────────
		const _apiRatings = {}; // recipeId → { avg, count }
		let _popularActive = false;

		(async function loadApiRatings() {
			try {
				const res = await fetch(API_BASE + '/content/ratings');
				if (!res.ok) return;
				const data = await res.json();
				Object.assign(_apiRatings, data);
				// Рейтинги пришли — переотрисуем «Рекомендуем» уже с актуальной сортировкой.
				// Прямой вызов _renderRecommendedInner (без setTimeout), чтобы не зависеть
				// от того, успел ли renderRecommended поставить таймер.
				if (typeof _renderRecommendedInner === 'function') {
					_renderRecommendedInner();
				}
				if (_popularActive && typeof renderPopular === 'function') {
					renderPopular();
				}
				// Featured-карточка «Новое»: если у новинки уже есть оценки —
				// переотрисуем её со звёздами. Высота строки рейтинга фиксирована
				// (.sp-new-card-rating min-height), поэтому скачка не будет.
				const _featEl = document.getElementById('new-feature');
				if (_featEl && _featEl.firstElementChild && typeof renderNewFeatureCard === 'function') {
					let _featItem = null;
					if (typeof NEWS_FEED !== 'undefined' && Array.isArray(NEWS_FEED)) {
						_featItem = NEWS_FEED.find(function (i) { return i.type === 'recipe'; }) || null;
					}
					if (!_featItem && typeof _latestRecipeId === 'function') {
						const _lid = _latestRecipeId();
						if (_lid && RECIPES[_lid]) {
							_featItem = { type: 'recipe', id: _lid, badge: 'Новинка', date: _spFormatNewsDate(RECIPES[_lid].added || RECIPES[_lid].addedTs) };
						}
					}
					if (_featItem) _featEl.innerHTML = renderNewFeatureCard(_featItem);
				}
			} catch (e) { /* silent */ }
		})();

		function togglePopular(el) {
			_popularActive = !_popularActive;
			el.classList.toggle('on', _popularActive);
			syncFilterControls();
			if (_popularActive) {
				renderPopular();
			} else {
				renderCats();
			}
		}

		function renderPopular() {
			updateRecipeCount();
			const allRecipes = getFilteredRecipes();
			const rated = allRecipes.filter(r => _apiRatings[r.id] && _apiRatings[r.id].avg > 0);
			rated.sort((a, b) => {
				const ra = _apiRatings[a.id];
				const rb = _apiRatings[b.id];
				if (rb.avg !== ra.avg) return rb.avg - ra.avg;
				return rb.count - ra.count;
			});
			const shown = rated;
			const latestId = _latestRecipeId();
			const grid = document.getElementById('cat-grid');
			grid.innerHTML = shown.map(r => {
				const _id = encodeURIComponent(r.id);
				const _name = escHtml(r.name);
				const _emoji = escHtml(r.emoji || '🍴');
				const photo = escHtml(r.photo || '');
				const rv = _apiRatings[r.id] || {};
				const avgStr = rv.avg > 0 ? rv.avg : '';
				const starsHtml = avgStr ? `<span style="color:#f5a623;font-size:12px">★</span><span style="font-size:12px;font-weight:600;color:var(--text-2)">${avgStr}</span>` : '';
				const photoHtml = photo
					? `<img src="${photo}" alt="${_name}" loading="lazy" style="width:100%;height:100%;object-fit:cover">`
					: `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:40px">${_emoji}</div>`;
				const bd = spBadgesHtml(r, latestId);
				const accessHint = bd.locked ? `. ${bd.access.label}. ${bd.access.actionLabel}` : '';
				return `<button class="cat-card${bd.locked ? ' locked' : ''}" ${spActionAttrs(r, bd.locked)} aria-label="${_name}${accessHint}">
					<div class="cat-icon-wrap" style="position:relative">${photoHtml}${bd.html}</div>
					<div class="cat-body">
						<div class="cat-name">${_name}</div>
						<div class="cat-desc">${starsHtml}</div>
					</div>
				</button>`;
			}).join('');
		}

		function clearFilters() {
			Object.keys(activeFilters).forEach(k => delete activeFilters[k]);
			_popularActive = false;
			const chip = document.getElementById('popular-chip');
			if (chip) chip.classList.remove('on');
			document.querySelectorAll('.filter-chip.on').forEach(c => c.classList.remove('on'));
			document.querySelectorAll('.fgroup-btn').forEach(b => {
				b.classList.remove('has-value');
				b.querySelector('.fg-label').textContent = b.dataset.label;
			});
			closeFGroups();
			syncFilterControls();
			renderCats();
		}

		// ── MY PLATE MODAL ───────────────────────────────────────────────────
		function openPlate() {
			// Гость: тарелка — фича только для зарегистрированных, ведём на login.
			if (Auth.isGuest()) {
				location.href = Auth._loginUrl();
				return;
			}
			renderPlateModal();
			document.getElementById('plate-overlay').classList.add('open');
			document.body.style.overflow = 'hidden';
		}
		function closePlate() {
			document.getElementById('plate-overlay').classList.remove('open');
			document.body.style.overflow = '';
		}
		function closePlateIfOutside(e) { if (e.target === document.getElementById('plate-overlay')) closePlate(); }

		function renderPlateModal() {
			const items = Plate.get();
			const body = document.getElementById('plate-body');
			const footer = document.getElementById('plate-footer');

			if (!items.length) {
				body.innerHTML = `<div class="pv1-empty">
                <div class="pv1-eyebrow">Пока пусто</div>
                <h2 class="pv1-headline">Соберите первый приём пищи</h2>
                <div class="pv1-divider"></div>
                <p class="pv1-sub">Выберите рецепт из категории — и он попадёт сюда. КБЖУ пересчитаются автоматически.</p>
                <button class="pv1-cta" data-index-template-action="browse-recipes">Выбрать рецепт →</button>
            </div>`;
				footer.classList.add('index-is-hidden');
				return;
			}

			const t = Plate.totals();
			const hydrationWeight = getPlateWeight();
			const hydrationWater = Math.round(hydrationWeight * 30);
			const ingCount = items.reduce((n, it) => n + ((it.ingredients && it.ingredients.length) || 0), 0);
			const list = items.map((item, i) => {
				const adds = item.additions || [];
				const additionsHtml = adds.length
					? `<ul class="pv1-additions">${adds.map(a =>
						`<li class="pv1-addition">
							<span class="pv1-addition-dot">+</span>
							<span class="pv1-addition-name">${escHtml(String(a.name || ''))}</span>
							<span class="pv1-addition-kcal">${Number(a.kcal) || 0} ккал</span>
						</li>`).join('')}</ul>`
					: '';
				const safeName = escHtml(String(item.name || ''));
			const nameHtml = item.recipeId
					? `<a class="pv1-item-name is-link" href="recipe.html?id=${encodeURIComponent(item.recipeId)}&from=plate&simple=1">${safeName}</a>`
					: `<div class="pv1-item-name">${safeName}</div>`;
				return `<div class="pv1-item" id="pi-${Number(i)}">
					${item.photo
						? `<img class="pv1-item-photo" src="${escHtml(String(item.photo))}" alt="">`
						: plateAddonIcon(item.name)}
					<div class="pv1-item-main">
						${nameHtml}
						<div class="pv1-item-meta">${Number(item.kcal) || 0} ккал · Б ${Number(item.protein) || 0} · Ж ${Number(item.fat) || 0} · У ${Number(item.carbs) || 0} · Кл ${Number(item.fiber) || 0}</div>
						${additionsHtml}
					</div>
					<button class="pv1-item-del" data-main-action="remove-plate-item" data-index="${Number(i)}" aria-label="Удалить"><svg class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="5" y1="19" x2="19" y2="5"/></svg></button>
				</div>`;
			}).join('');

			body.innerHTML = `
            <div class="pv1-items">${list}</div>
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
            <div class="hydration">
                <span class="hydration-icon">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
                        <path d="M12 3 C8 9, 5 13, 5 16 C5 19.3, 8.1 22, 12 22 C15.9 22, 19 19.3, 19 16 C19 13, 16 9, 12 3 Z" stroke="#111" stroke-width="1.5"/>
                        <path d="M15 16 C15 17.7, 13.7 19, 12 19" stroke="#e8400a" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </span>
                <span class="hydration-label">Ваш вес</span>
                <span class="hydration-input-wrap">
                    <input class="hydration-input" type="number" id="w-inp" value="${hydrationWeight}" min="30" max="300" step="0.5" data-index-template-input="plate-weight" data-index-template-blur="plate-weight" aria-label="Ваш вес в килограммах">
                    <span class="hydration-unit">кг</span>
                </span>
                <span class="hydration-arrow" aria-hidden="true">→</span>
                <span class="hydration-label">Норма воды</span>
                <span class="hydration-target"><span id="w-res">${hydrationWater}</span><small>мл</small></span>
            </div>
            <div class="shop" id="shop-block">
                <div class="shop-head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
                    Список покупок${ingCount ? ` · ${ingCount} шт` : ''}
                </div>
                <div class="shop-actions">
                    <button class="shop-btn shop-btn-primary" id="plate-shop-mode-btn" data-index-template-action="toggle-shop-mode" aria-pressed="false">В магазине</button>
                    <button class="shop-btn shop-btn-ghost" data-index-template-action="copy-shopping-list">Скопировать</button>
                </div>
                <div class="plate-shop-list" id="plate-shop-list" hidden></div>
            </div>`;
			footer.classList.remove('index-is-hidden');
			document.getElementById('plate-meal-picker').innerHTML = plateMealTypePickerHtml();
			renderPlateShopMode();
		}

		function removeItem(i) { Plate.remove(i); renderPlateModal(); updatePlateIcon(); renderPlateInline(); }
		function getPlateWeight() {
			const isValid = value => Number.isFinite(value) && value >= 30 && value <= 300 && Number.isInteger(value * 2);
			const saved = parseFloat(localStorage.getItem(Auth._userKey('user_weight')));
			if (isValid(saved)) return saved;
			const user = Auth.getUser();
			const accountWeight = user && user.weight != null ? Number(user.weight) : NaN;
			if (isValid(accountWeight)) {
				localStorage.setItem(Auth._userKey('user_weight'), String(accountWeight));
				return accountWeight;
			}
			return 60;
		}
		function updateWater() {
			const w = parseFloat(document.getElementById('w-inp').value);
			if (!Number.isFinite(w) || w < 30 || w > 300) return;
			document.getElementById('w-res').textContent = Math.round(w * 30);
		}
		async function commitPlateWeight() {
			const input = document.getElementById('w-inp');
			const w = parseFloat(input.value);
			if (Number.isFinite(w) && w >= 30 && w <= 300 && Number.isInteger(w * 2)) {
				input.value = w;
				localStorage.setItem(Auth._userKey('user_weight'), String(w));
				const user = Auth.getUser();
				if (user) {
					user.weight = w;
					localStorage.setItem(Auth.KEY, JSON.stringify(user));
					try {
						const res = await Auth.api('/auth/profile', {
							method: 'PUT',
							body: { weight: w }
						});
						if (!res.ok) throw new Error('weight_save_' + res.status);
					} catch (e) {
						console.warn('Не удалось сохранить вес в аккаунте', e);
						showToast('Не удалось сохранить вес на сервере');
					}
				}
				updateWater();
				return;
			}
			input.value = getPlateWeight();
			updateWater();
		}
		function doCopy() {
			navigator.clipboard.writeText(buildShoppingList())
				.then(() => showToast('📋 Список скопирован!'))
				.catch(() => showToast('Не удалось скопировать'));
		}
		let plateShopMode = false;
		let plateShopChecked = new Set();
		function plateShopItems() {
			const out = [];
			Plate.get().forEach((item, itemIndex) => {
				const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
				ingredients.forEach((ing, ingIndex) => {
					const name = typeof ing === 'string' ? ing : (ing && (ing.name || ing.title || ing.text)) || '';
					const label = String(name || '').trim();
					if (!label) return;
					out.push({
						key: itemIndex + '-' + ingIndex + '-' + label,
						dish: String(item.name || 'Блюдо'),
						label
					});
				});
			});
			return out;
		}
		function togglePlateShopMode() {
			plateShopMode = !plateShopMode;
			renderPlateShopMode();
		}
		function togglePlateShopCheckedByIndex(index) {
			if (!plateShopMode) return;
			const item = plateShopItems()[Number(index)];
			if (!item) return;
			const key = item.key;
			if (plateShopChecked.has(key)) plateShopChecked.delete(key);
			else plateShopChecked.add(key);
			renderPlateShopMode();
		}
		function renderPlateShopMode() {
			const listEl = document.getElementById('plate-shop-list');
			const btn = document.getElementById('plate-shop-mode-btn');
			if (!listEl || !btn) return;
			const items = plateShopItems();
			const validKeys = new Set(items.map(item => item.key));
			plateShopChecked = new Set(Array.from(plateShopChecked).filter(key => validKeys.has(key)));
			btn.textContent = 'В магазине';
			btn.setAttribute('aria-pressed', String(plateShopMode));
			btn.classList.toggle('is-active', plateShopMode);
			listEl.hidden = !plateShopMode;
			if (!plateShopMode) {
				listEl.innerHTML = '';
				return;
			}
			if (!items.length) {
				listEl.innerHTML = '<div class="plate-shop-empty">В выбранных блюдах нет ингредиентов.</div>';
				return;
			}
			let currentDish = '';
			let html = '';
			items.forEach((item, index) => {
				if (item.dish !== currentDish) {
					currentDish = item.dish;
					html += '<div class="plate-shop-dish">' + escHtml(currentDish) + '</div>';
				}
				const checked = plateShopChecked.has(item.key);
				html += '<button class="plate-shop-check' + (checked ? ' is-checked' : '') + '" type="button" data-main-action="toggle-shop-item" data-index="' + Number(index) + '" aria-pressed="' + checked + '">'
					+ '<span class="plate-shop-box" aria-hidden="true"></span>'
					+ '<span class="plate-shop-label">' + escHtml(item.label) + '</span>'
					+ '</button>';
			});
			listEl.innerHTML = html;
		}
		function savePlate() {
			if (!Plate.count()) return;
			Plate.saveHistory(getSelectedPlateMealType());
			plateShopMode = false;
			plateShopChecked.clear();
			renderPlateInline();
			closePlate();
			showToast('Тарелка записана в журнал 🎉');
		}

		// ── INLINE PLATE SUMMARY ─────────────────────────────────────────────
		// Компактный summary над "Новое". Управление тарелкой — в модалке openPlate().
		function renderPlateInline() {
			const items = Plate.get();
			const section = document.getElementById('plate-inline-section');
			if (!items.length) {
				section.classList.add('index-is-hidden');
				return;
			}
			const t = Plate.totals();
			const n = items.length;
			const word = n === 1 ? 'блюдо' : (n >= 2 && n <= 4 ? 'блюда' : 'блюд');
			document.getElementById('plate-summary-count').textContent = `В тарелке: ${n} ${word}`;
			document.getElementById('plate-summary-kcal').textContent = `${Number(t.kcal) || 0} ккал`;
			section.classList.remove('index-is-hidden');
		}

		// Swipe to close
		let sy = 0;
		document.getElementById('plate-modal').addEventListener('touchstart', e => { sy = e.touches[0].clientY; }, { passive: true });
		document.getElementById('plate-modal').addEventListener('touchend', e => { if (e.changedTouches[0].clientY - sy > 80) closePlate(); }, { passive: true });

		// ── USER DROPDOWN ────────────────────────────────────────────────────
		function toggleUserMenu(e) {
			e.stopPropagation();
			document.getElementById('user-dropdown').classList.toggle('open');
		}
		document.addEventListener('click', function (e) {
			const wrap = document.getElementById('user-wrap');
			if (wrap && !wrap.contains(e.target)) {
				const dd = document.getElementById('user-dropdown');
				if (dd) dd.classList.remove('open');
			}
		});

		// Avatar восстанавливается через Auth.renderAvatar выше (единый путь).
		// Старый backgroundImage-fallback убран — давал «прыгающий» кроп между страницами.

		function doLogout() {
			document.getElementById('user-dropdown').classList.remove('open');
			const overlay = document.createElement('div');
			overlay.className = 'farewell-overlay';
			overlay.innerHTML = `<div class="farewell-card" role="status" aria-live="polite">
				<div class="farewell-eyebrow">Сеанс завершён</div>
				<h2 class="farewell-title">До встречи!</h2>
				<div class="farewell-divider"></div>
				<p class="farewell-sub">Возвращайтесь — мы ждём вас</p>
				<p class="farewell-caption">Перенаправляем на страницу входа…</p>
				<div class="farewell-progress"><span></span></div>
			</div>`;
			document.body.appendChild(overlay);
			requestAnimationFrame(() => overlay.classList.add('show'));
			setTimeout(() => {
				Auth.logout();
				location.href = 'login.html';
			}, 1800);
		}

		document.addEventListener('click', function (event) {
			const templateActionTarget = event.target.closest('[data-index-template-action]');
			if (templateActionTarget) {
				const action = templateActionTarget.dataset.indexTemplateAction;
				if (action === 'toggle-mobile-news') toggleMobileNewsList();
				else if (action === 'browse-recipes') {
					closePlate();
					location.href = 'category.html';
				}
				else if (action === 'toggle-shop-mode') togglePlateShopMode();
				else if (action === 'copy-shopping-list') doCopy();
				return;
			}
			const actionTarget = event.target.closest('[data-main-action]');
			if (actionTarget) {
				if (actionTarget.dataset.mainAction === 'remove-plate-item') removeItem(Number(actionTarget.dataset.index));
				else if (actionTarget.dataset.mainAction === 'toggle-shop-item') togglePlateShopCheckedByIndex(Number(actionTarget.dataset.index));
				return;
			}
			const lockedTarget = event.target.closest('[data-locked-recipe-id]');
			if (lockedTarget) {
				event.preventDefault();
				if (Auth.isGuest()) {
					location.href = lockedTarget.dataset.lockedRecipeHref || ('recipe.html?id=' + encodeURIComponent(lockedTarget.dataset.lockedRecipeId || ''));
					return;
				}
				showLockedMsg(lockedTarget.dataset.lockedRecipeId || '');
				return;
			}
			const recipeTarget = event.target.closest('[data-recipe-href]');
			if (recipeTarget) {
				location.href = recipeTarget.dataset.recipeHref;
				return;
			}
			const categoryTarget = event.target.closest('[data-category-id]');
			if (categoryTarget) goToCategory(categoryTarget.dataset.categoryId || '');
		});

		document.addEventListener('error', function (event) {
			const image = event.target;
			if (!(image instanceof HTMLImageElement)) return;
			if (image.hasAttribute('data-index-avatar-fallback')) {
				if (image.parentElement) image.parentElement.textContent = image.dataset.indexAvatarFallback || '👩‍🍳';
				return;
			}
			if (image.dataset.indexImageFallback === 'hide') {
				image.style.display = 'none';
				return;
			}
			if (image.hasAttribute('data-fallback-emoji')) imgFallback(image, image.dataset.fallbackEmoji || '🍴');
		}, true);

		document.addEventListener('input', function (event) {
			if (event.target.dataset && event.target.dataset.indexTemplateInput === 'plate-weight') updateWater();
		});
		document.addEventListener('blur', function (event) {
			if (event.target.dataset && event.target.dataset.indexTemplateBlur === 'plate-weight') commitPlateWeight();
		}, true);

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

// CSP: remaining static homepage controls migrated from HTML attributes.
document.querySelectorAll('[data-index-action]').forEach(function (control) {
    control.addEventListener('click', function () {
        if (control.dataset.indexAction === 'complete-guest-tour') completeGuestTour();
        else if (control.dataset.indexAction === 'open-guest-tour') openGuestTour();
    });
});
var heroSearchForm = document.querySelector('[data-index-submit="hero-search"]');
if (heroSearchForm) {
    heroSearchForm.addEventListener('submit', function (event) {
        submitHeroSearch(event);
    });
}
