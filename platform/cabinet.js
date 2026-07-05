		Auth.requireAuth();
		const _cabAccess = Auth.checkAccess();

		// Навигация хедера — единый билдер (header-nav.js). В кабинете активен
		// пункт «Избранное», когда открыта вкладка избранного (?tab=favorites).
		function renderHeaderNav() {
			if (window.SP_HEADER && typeof window.SP_HEADER.render === 'function') {
				var tab = new URLSearchParams(location.search).get('tab');
				window.SP_HEADER.render({ activeCat: null, activeNav: tab === 'favorites' ? 'favorites' : null });
			}
		}
		renderHeaderNav();  // ранний рендер: ингредиенты/ссылки не зависят от API
		loadContent().then(function () {
			renderHeaderNav();
			// RECIPES готовы (или content-error — loadContent резолвится в обоих случаях).
			// Снимаем loading-флаг и перерисовываем активную RECIPES-зависимую вкладку
			// (Избранные/История): при прямом входе ?tab=favorites она отрендерилась
			// в инициализации ДО загрузки рецептов и показала skeleton.
			_recipesReady = true;
			var favP = document.getElementById('panel-favorites');
			if (favP && favP.classList.contains('active') && typeof renderFavorites === 'function') renderFavorites();
			var histP = document.getElementById('panel-history');
			if (histP && histP.classList.contains('active') && typeof renderHistory === 'function') renderHistory();
		});
		updatePlateIcon();

		// Источник контактов поддержки — единая точка правки.
		// TODO: при росте проекта заменить fallbackEmail на support@voronova.online.
		const SUPPORT_CONTACT = {
			label: 'Отдел заботы',
			text: 'Написать в чат Отдела заботы',
			url: 'https://tawk.to/chat/699610c27418241c38dd96b3/1js4rtjr9',
			fallbackEmail: 'hello@voronova.online'
		};
		function _supportEmailHref() { return 'mailto:' + SUPPORT_CONTACT.fallbackEmail; }
		function supportContactHtml(paymentStatus) {
			const hasChat = !!SUPPORT_CONTACT.url;
			const email = SUPPORT_CONTACT.fallbackEmail;
			const emailLink = '<a href="' + _supportEmailHref() + '" style="color:var(--accent);text-decoration:underline">' + email + '</a>';
			if (paymentStatus === 'rejected' && hasChat) {
				const retryChatLink = '<a href="' + SUPPORT_CONTACT.url + '" data-tawk-open target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">чат Отдела заботы</a>';
				return 'Если нужна помощь с повторной оплатой — напишите в ' + retryChatLink + ' или на ' + emailLink + '.';
			}
			const lead = paymentStatus === 'pending'
				? 'Если проверка занимает дольше 30 минут — '
				: 'Если остался вопрос — ';
			if (hasChat) {
				const chatLink = '<a href="' + SUPPORT_CONTACT.url + '" data-tawk-open target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">' + SUPPORT_CONTACT.text + '</a>';
				return lead + chatLink + ' или напишите на ' + emailLink + '.';
			}
			return lead + 'напишите на ' + emailLink + '.';
		}

		// Return-to-context: пользователь пришёл с рецепта через paywall.
		// Сохраняем return URL в sessionStorage (переживает навигацию внутри кабинета).
		(function () {
			const raw = new URLSearchParams(location.search).get('return');
			const safe = Auth._safeReturn(raw);
			if (safe) sessionStorage.setItem('_cab_return_url', safe);
		})();
		function _getCabReturn() {
			const v = sessionStorage.getItem('_cab_return_url');
			return Auth._safeReturn(v);
		}
		function _renderReturnBanner() {
			const ret = _getCabReturn();
			const panel = document.getElementById('panel-subscription');
			if (!panel) return;
			let banner = document.getElementById('cab-return-banner');
			if (!ret) { if (banner) banner.remove(); return; }
			if (banner) return;
			banner = document.createElement('div');
			banner.id = 'cab-return-banner';
			banner.style.cssText = 'margin:0 0 16px;padding:12px 14px;border-radius:10px;background:#fff8f0;border:1px solid #f0d8b8;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap';
			const text = document.createElement('div');
			text.style.cssText = 'font-size:13px;color:var(--text-2);line-height:1.4';
			text.textContent = 'Вы пришли с рецепта. После оформления доступа сможете вернуться.';
			const link = document.createElement('a');
			link.href = ret;
			link.textContent = 'Вернуться к рецепту →';
			link.style.cssText = 'font-size:13px;font-weight:600;color:var(--accent);text-decoration:none;white-space:nowrap';
			banner.appendChild(text);
			banner.appendChild(link);
			panel.insertBefore(banner, panel.firstChild);
		}

		// User pill init
		(function () {
			const user = Auth.getUser();
			if (!user) return;
			const emailBase = user.email ? user.email.split('@')[0] : '?';
			const customName = Auth.getDisplayName();
			const displayName = customName || user.name || emailBase;
			Auth.renderAvatar(document.getElementById('u-ava'), displayName);
			document.getElementById('u-name').textContent = displayName;
		})();

		function toggleUserMenu(e) {
			e.stopPropagation();
			document.getElementById('user-dropdown').classList.toggle('open');
		}
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

		// ── SCROLL HEADER ─────────────────────────────────────────────────────────
		window.addEventListener('scroll', () =>
			document.getElementById('hdr').classList.toggle('scrolled', scrollY > 10));

		// ── PROFILE ───────────────────────────────────────────────────────────────
		function setCabinetAvatarImage(src) {
			const image = document.createElement('img');
			image.src = String(src || '');
			image.alt = 'avatar';
			const avatar = document.getElementById('cab-ava');
			image.addEventListener('error', function () {
				const currentUser = Auth.getUser();
				const fallback = (Auth.getDisplayName() || (currentUser && currentUser.email) || '?').trim() || '?';
				avatar.textContent = fallback.charAt(0).toUpperCase();
			}, { once: true });
			avatar.replaceChildren(image);
		}

		const user = Auth.getUser();
		if (user) {
			const emailBase = user.email ? user.email.split('@')[0] : '?';
			const customName = Auth.getDisplayName();
			const profileName = customName || user.name || emailBase;
			document.getElementById('cab-name').textContent = profileName;
			document.getElementById('cab-email').textContent = user.email;
			if (customName || (user.name && user.name !== emailBase)) {
				document.getElementById('cab-custom-name').value = customName || user.name || '';
				document.getElementById('name-edit-btn').style.display = 'inline-flex';
			} else {
				// No name yet — show input
				document.getElementById('name-edit-row').style.display = 'flex';
			}
			const joined = user.joined
				? new Date(user.joined).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
				: '';
			if (joined) document.getElementById('cab-since').textContent = 'В сервисе с ' + joined;
			const avaEl = document.getElementById('cab-ava');
			const savedAva = localStorage.getItem(Auth._userKey('user_avatar'));
			if (savedAva) {
				setCabinetAvatarImage(savedAva);
			} else {
				avaEl.textContent = profileName.charAt(0).toUpperCase();
			}
		}

		// After checkAccess, sync favorites + notes from server then re-sync displayName + avatar
		_cabAccess.then(function() {
			return Favorites.load();
		}).then(function() {
			// Серверное избранное синхронизировано — снимаем loading-флаг.
			_favoritesReady = true;
			if (typeof renderCabSummaryStats === 'function') renderCabSummaryStats();
			if (document.getElementById('panel-favorites') && document.getElementById('panel-favorites').classList.contains('active')) renderFavorites();
		}).catch(function() {
			// Доступ/синхронизация не удались — всё равно снимаем loading-флаг,
			// иначе вкладка «Избранные» зависнет в skeleton навсегда.
			_favoritesReady = true;
			if (document.getElementById('panel-favorites') && document.getElementById('panel-favorites').classList.contains('active')) renderFavorites();
		});
		_cabAccess.then(function() {
			return Notes.load();
		}).then(function() {
			if (document.getElementById('panel-notes') && document.getElementById('panel-notes').classList.contains('active')) renderNotesList();
		}).catch(function() {});
		_cabAccess.then(function() {
			return Plate.load();
		}).then(function() {
			if (typeof renderCabSummaryStats === 'function') renderCabSummaryStats();
			var historyPanel = document.getElementById('panel-history');
			if (historyPanel && historyPanel.classList.contains('active') && typeof renderHistory === 'function') renderHistory();
		}).catch(function() {});
		_cabAccess.then(function() {
			const freshName = Auth.getDisplayName();
			if (freshName) {
				document.getElementById('cab-name').textContent = freshName;
				document.getElementById('cab-custom-name').value = freshName;
				document.getElementById('name-edit-row').style.display = 'none';
				document.getElementById('name-edit-btn').style.display = 'inline-flex';
				var uName = document.getElementById('u-name');
				if (uName) uName.textContent = freshName;
			}
			const freshAva = Auth.getAvatar();
			if (freshAva) {
				setCabinetAvatarImage(freshAva);
				Auth.renderAvatar(document.getElementById('u-ava'));
			}
		});

		function startEditName() {
			document.getElementById('name-edit-row').style.display = 'flex';
			document.getElementById('cab-custom-name').focus();
		}

		function finishEditName() {
			const val = document.getElementById('cab-custom-name').value.trim();
			Auth.setName(val);
			// Sync to server
			Auth.api('/auth/profile', { method: 'PUT', body: { displayName: val } }).then(function(res) {
				if (!res.ok) console.error('Profile save failed:', res.status);
			}).catch(function(e) { console.error('Profile save error:', e); });
			document.getElementById('cab-name').textContent = val || user.email.split('@')[0];
			const avaEl = document.getElementById('cab-ava');
			if (!localStorage.getItem(Auth._userKey('user_avatar'))) {
				avaEl.textContent = (val || user.email || '?').charAt(0).toUpperCase();
			}
			// Update header pill
			var uName = document.getElementById('u-name');
			if (uName) uName.textContent = val || user.email.split('@')[0];
			Auth.renderAvatar(document.getElementById('u-ava'), val || user.email);
			if (val) {
				document.getElementById('name-edit-row').style.display = 'none';
				document.getElementById('name-edit-btn').style.display = 'inline-flex';
				const msg = document.getElementById('name-saved-msg');
				msg.style.opacity = '1';
				setTimeout(function () { msg.style.opacity = '0'; }, 1500);
			}
		}

		function openAvatarPicker() {
			const input = document.getElementById('ava-upload');
			if (!input) return;
			input.value = '';
			input.click();
		}

		function handleAvatarUpload(input) {
			const file = input.files[0];
			if (!file) return;
			if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
				showToast('Выберите изображение PNG, JPEG, WebP или GIF');
				return;
			}
			const img = new Image();
			img.onload = function() {
				// Resize to max 200x200 to keep base64 small
				const MAX = 200;
				let w = img.width, h = img.height;
				if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
				else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
				const canvas = document.createElement('canvas');
				canvas.width = w; canvas.height = h;
				const context = canvas.getContext('2d');
				if (!context) { showToast('Не удалось обработать изображение'); return; }
				context.drawImage(img, 0, 0, w, h);
				const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
				// Save locally
				Auth.setAvatar(dataUrl);
				// Update UI
				setCabinetAvatarImage(dataUrl);
				Auth.renderAvatar(document.getElementById('u-ava'));
				// Save to server
				Auth.api('/auth/profile', { method: 'PUT', body: { avatar: dataUrl } }).then(function(res) {
					if (!res.ok) throw new Error('Avatar save failed: ' + res.status);
					showToast('Аватар обновлён');
				}).catch(function(e) {
					console.error('Avatar save error:', e);
					showToast('Аватар показан, но не сохранился. Попробуйте ещё раз');
				});
				input.value = '';
			};
			img.onerror = function() {
				input.value = '';
				showToast('Не удалось открыть изображение');
			};
			const reader = new FileReader();
			reader.onload = function() { img.src = String(reader.result || ''); };
			reader.onerror = function() {
				input.value = '';
				showToast('Не удалось прочитать изображение');
			};
			reader.readAsDataURL(file);
		}

		// Допустимо: 30–300 кг и только шаг 0.5 (как step в разметке).
		// n*2 — целое только для кратных 0.5 (.5 точно представима в float),
		// поэтому 55 и 55.5 проходят, а 55.3 / 29.5 / 300.5 — нет.
		function isValidWeight(n) {
			return n >= 30 && n <= 300 && Number.isInteger(n * 2);
		}
		// Во время набора (oninput): живой пересчёт воды для валидного значения,
		// БЕЗ записи в localStorage. Иначе промежуточный префикс (напр. «55.» при
		// наборе «55.3») затёр бы сохранённый вес. Невалидное — игнорируем.
		function previewWeight(v) {
			const n = parseFloat(v);
			if (isValidWeight(n)) updateWaterNorm(n);
		}
		// Фиксация на blur: валидное — сохраняем и пересчитываем; невалидное —
		// откатываем поле к последнему сохранённому (и воду), а если сохранённого
		// нет — очищаем поле и скрываем карточку воды.
		async function commitWeight(el) {
			const n = parseFloat(el.value);
			if (isValidWeight(n)) {
				el.value = n;  // нормализуем отображение («045» → «45», «55,5»→«55.5»)
				localStorage.setItem(Auth._userKey('user_weight'), n);
				updateWaterNorm(n);
				try {
					const res = await Auth.api('/auth/profile', {
						method: 'PUT',
						body: { weight: n }
					});
					if (!res.ok) throw new Error('weight_save_' + res.status);
					const user = Auth.getUser();
					if (user) {
						user.weight = n;
						localStorage.setItem(Auth.KEY, JSON.stringify(user));
					}
					showToast('Вес сохранён');
				} catch (e) {
					showToast('Не удалось сохранить вес в аккаунте');
				}
				return;
			}
			const saved = localStorage.getItem(Auth._userKey('user_weight'));
			if (saved !== null && saved !== '') {
				el.value = saved;
				updateWaterNorm(parseFloat(saved));
			} else {
				el.value = '';
				resetWaterNorm();
			}
		}
		// ── Newsletter toggle ─────────────────────────────
		let _dietarySaveTimer = null;
		let _dietaryLoading = false;

		function dietaryCheckboxFlags(input) {
			const raw = input.getAttribute('data-dietary-flags') || input.getAttribute('data-dietary-flag') || '';
			return raw.split(',').map(function(flag) { return flag.trim(); }).filter(Boolean);
		}

		function collectDietaryPreferences() {
			const selected = [];
			document.querySelectorAll('#dietary-options input[type="checkbox"]:checked').forEach(function(input) {
				dietaryCheckboxFlags(input).forEach(function(flag) {
					if (selected.indexOf(flag) === -1) selected.push(flag);
				});
			});
			const allowSwaps = document.getElementById('dietary-allow-swaps');
			return {
				excluded_flags: selected,
				allow_swaps: allowSwaps ? allowSwaps.checked : true
			};
		}

		function applyDietaryPreferences(preferences) {
			const selected = Array.isArray(preferences.excluded_flags) ? preferences.excluded_flags : [];
			document.querySelectorAll('#dietary-options input[type="checkbox"]').forEach(function(input) {
				const flags = dietaryCheckboxFlags(input);
				input.checked = flags.length > 0 && flags.every(function(flag) { return selected.indexOf(flag) !== -1; });
			});
			const allowSwaps = document.getElementById('dietary-allow-swaps');
			if (allowSwaps) allowSwaps.checked = preferences.allow_swaps !== false;
		}

		(async function loadDietaryPreferences() {
			_dietaryLoading = true;
			try {
				const res = await Auth.api('/subscription/dietary-preferences');
				if (!res.ok) return;
				applyDietaryPreferences(await res.json());
			} catch(e) {
				const status = document.getElementById('dietary-status');
				if (status) status.textContent = 'Не удалось загрузить настройки.';
			} finally {
				_dietaryLoading = false;
			}
		})();

		function scheduleDietarySave() {
			if (_dietaryLoading) return;
			const status = document.getElementById('dietary-status');
			if (status) status.textContent = 'Сохраняем настройки…';
			clearTimeout(_dietarySaveTimer);
			_dietarySaveTimer = setTimeout(saveDietaryPreferences, 450);
		}

		async function saveDietaryPreferences() {
			const status = document.getElementById('dietary-status');
			try {
				const res = await Auth.api('/subscription/dietary-preferences', {
					method: 'PUT',
					body: JSON.stringify(collectDietaryPreferences())
				});
				if (!res.ok) throw new Error('save failed');
				clearContentCache();
				if (status) status.textContent = 'Сохранено';
			} catch(e) {
				if (status) status.textContent = 'Не удалось сохранить настройки.';
				showToast('Ошибка сети');
			}
		}

		(async function loadNewsletterState() {
			try {
				const res = await Auth.api('/subscription/newsletter');
				if (!res.ok) return;
				const data = await res.json();
				const cb = document.getElementById('newsletter-toggle');
				if (cb) {
					cb.checked = data.subscribed;
				}
			} catch(e) {}
		})();

		async function toggleNewsletter(checked) {
			try {
				await Auth.api('/subscription/newsletter', {
					method: 'PUT',
					body: JSON.stringify({ subscribed: checked })
				});
				showToast(checked ? 'Рассылка включена' : 'Вы отписались от рассылки');
			} catch(e) {
				showToast('Ошибка сети');
			}
		}

		function resetWaterNorm() {
			const norm = document.getElementById('water-norm');
			const val = document.getElementById('water-val');
			const unit = document.getElementById('water-unit');
			const badge = document.getElementById('water-glasses-badge');
			if (norm) norm.style.display = 'grid';
			if (val) val.textContent = '—';
			if (unit) unit.textContent = '';
			if (badge) badge.textContent = 'Введите вес для расчёта';
		}

		function updateWaterNorm(w) {
			const norm = document.getElementById('water-norm');
			const val = document.getElementById('water-val');
			const unit = document.getElementById('water-unit');
			if (!norm || !val) return;
			const ml = Math.round(w * 30);
			const liters = (ml / 1000).toFixed(1);
			val.textContent = ml >= 1000 ? liters : ml;
			if (unit) unit.textContent = ml >= 1000 ? 'л' : 'мл';
			norm.style.display = 'grid';
			const badge = document.getElementById('water-glasses-badge');
			if (badge) {
				const glasses = Math.round(ml / 250);
				badge.textContent = 'Это ' + glasses + (glasses === 1 ? ' стакан' : glasses < 5 ? ' стакана' : ' стаканов') + ' в день';
			}
		}
		// Load weight on init
		const savedWeight = localStorage.getItem(Auth._userKey('user_weight'));
		if (savedWeight) {
			document.getElementById('cab-weight').value = savedWeight;
			updateWaterNorm(parseFloat(savedWeight));
		}
		_cabAccess.then(async function() {
			const user = Auth.getUser();
			const accountWeight = user && user.weight != null ? Number(user.weight) : null;
			const localWeight = parseFloat(localStorage.getItem(Auth._userKey('user_weight')));
			if (isValidWeight(accountWeight)) {
				localStorage.setItem(Auth._userKey('user_weight'), accountWeight);
				document.getElementById('cab-weight').value = accountWeight;
				updateWaterNorm(accountWeight);
			} else if (isValidWeight(localWeight)) {
				// One-time migration for existing users whose weight lived only in this browser.
				try {
					const res = await Auth.api('/auth/profile', {
						method: 'PUT',
						body: { weight: localWeight }
					});
					if (res.ok && user) {
						user.weight = localWeight;
						localStorage.setItem(Auth.KEY, JSON.stringify(user));
					}
				} catch (e) { /* local fallback remains available */ }
			}
		});

		// ── TABS ──────────────────────────────────────────────────────────────────
		function revealCabinetTargetIfNeeded(target, options) {
			if (!target) return false;
			options = options || {};
			var rect = target.getBoundingClientRect();
			var margin = options.margin == null ? 12 : options.margin;
			var isVisible = rect.top >= margin && rect.bottom <= window.innerHeight - margin;
			if (isVisible) return false;
			var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			target.scrollIntoView({
				behavior: reduceMotion ? 'auto' : (options.behavior || 'smooth'),
				block: options.block || 'nearest'
			});
			return true;
		}

		function updateCompactTabMode(name) {
			var main = document.querySelector('.cab-main');
			if (!main) return;
			main.classList.remove('tab-subscription', 'tab-history', 'tab-favorites', 'tab-notes', 'tab-feedback', 'tab-settings');
			main.classList.add('tab-' + name);
			main.classList.toggle('is-content-tab',
				name === 'favorites' || name === 'history' || name === 'notes' || name === 'feedback' || name === 'settings');
		}

		function switchTab(name, btn, options) {
			if (!window.SP_CABINET_TABS || !window.SP_CABINET_TABS.isTab(name)) name = 'subscription';
			options = options || {};
			btn = btn || document.querySelector('.cab-tab[data-tab="' + name + '"]');
			if (!btn) return;
			var tabsNav = document.querySelector('.cab-tabs');
			var tabsTop = tabsNav ? tabsNav.getBoundingClientRect().top : null;
			var keepTabsInPlace = tabsTop !== null && tabsTop >= 0 && tabsTop <= window.innerHeight && window.scrollY > 0;
			var previousTab = document.documentElement.dataset.cabinetTab;
			document.documentElement.dataset.cabinetTab = name;
			updateCompactTabMode(name);
			document.querySelectorAll('.cab-tab').forEach(function (tabLink) {
				var isActive = tabLink === btn;
				tabLink.classList.toggle('active', isActive);
				if (isActive) tabLink.setAttribute('aria-current', 'page');
				else tabLink.removeAttribute('aria-current');
			});
			document.querySelectorAll('.cab-tab-panel').forEach(function (panel) {
				var isActive = panel.id === 'panel-' + name;
				panel.classList.toggle('active', isActive);
				panel.setAttribute('aria-hidden', String(!isActive));
			});
			btn.classList.add('active');
			if (options.history === 'push' && previousTab !== name) {
				history.pushState({ cabinetTab: name }, '', window.SP_CABINET_TABS.urlFor(location.href, name));
			} else if (options.history === 'replace') {
				history.replaceState({ cabinetTab: name }, '', window.SP_CABINET_TABS.urlFor(location.href, name));
			}
			renderHeaderNav();
			if (name === 'subscription') loadSubscription();
			if (name === 'history') renderHistory();
			if (name === 'favorites') renderFavorites();
			if (name === 'notes') loadNotes();
			if (name === 'feedback') loadFeedbackHistory();
			// Mobile compact mode changes the hero height. If the user switched a visible
			// tab, compensate that reflow synchronously so the tab bar stays under their
			// finger instead of jumping to another part of the page.
			if (keepTabsInPlace) {
				var shiftedTop = tabsNav.getBoundingClientRect().top;
				var shift = shiftedTop - tabsTop;
				if (Math.abs(shift) > 1) window.scrollTo({ top: Math.max(0, window.scrollY + shift), behavior: 'auto' });
			}
		}

		// Состояние вкладки «Избранные». ДОЛЖНО быть объявлено/инициализировано до
		// обработчика ?tab= ниже: при прямом входе cabinet.html?tab=favorites
		// switchTab('favorites') → renderFavorites → _renderFavGrid читают _favFilter
		// синхронно во время инициализации. Если объявление ниже — ReferenceError
		// (TDZ) рушит весь init кабинета. Раньше favorites открывали кликом (async,
		// после инициализации), поэтому баг был латентным; ссылка «Избранное» в
		// хедере (?tab=favorites) его проявила.
		let _favFilter = 'all';

		// Loading-state вкладки «Избранные». ОБЯЗАТЕЛЬНО объявить/инициализировать
		// здесь — до обработчика ?tab= ниже (та же причина, что и _favFilter: при
		// прямом входе cabinet.html?tab=favorites switchTab('favorites') →
		// renderFavorites выполняется синхронно в инициализации, читает эти флаги;
		// объявление ниже = TDZ ReferenceError рушит весь init).
		//   _recipesReady   — RECIPES загружены (loadContent резолвнулся);
		//   _favoritesReady — серверное избранное синхронизировано (Favorites.load).
		// Пока хоть один false → renderFavorites рисует skeleton, а НЕ empty-state.
		// Пустой массив избранного считается валидным empty ТОЛЬКО когда оба true.
		let _recipesReady = false;
		let _favoritesReady = false;

		// Initial state is resolved in cabinet-tabs.js in <head>, before first paint.
		(function initCabinetTabs() {
			var initialTab = window.SP_CABINET_TABS.resolve(location.search, location.hash);
			switchTab(initialTab, null, { history: 'replace' });
			document.querySelector('.cab-tabs').addEventListener('click', function (event) {
				var tabLink = event.target.closest('.cab-tab[data-tab]');
				if (!tabLink || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
				event.preventDefault();
				switchTab(tabLink.dataset.tab, tabLink, { history: 'push' });
			});
			window.addEventListener('popstate', function () {
				var tab = window.SP_CABINET_TABS.resolve(location.search, location.hash);
				switchTab(tab, null, { history: 'none' });
			});
		})();

		// ── ПОДПИСКА ──────────────────────────────────────────────────────────────
		const SUB_LABELS = { trial: 'Пробный период', active: 'Активна', expired: 'Завершена' };
		function subscriptionPricePreviewHtml() {
			var price = (_currentPrices && Number(_currentPrices[1])) || 390;
			return '<div class="sub-price-preview">От&nbsp;' + formatRubles(price) + '/мес. · все рецепты и&nbsp;БЖУ</div>';
		}
		function updateSubscriptionPricePreview() {
			var preview = document.querySelector('.sub-price-preview');
			if (preview) preview.outerHTML = subscriptionPricePreviewHtml();
		}

		function renderFallbackSubCard() {
			var wrap = document.getElementById('sub-status-wrap');
			if (!wrap) return;
			const ctaText = 'Оформить подписку';
			wrap.innerHTML = '<div class="sub-card">'
				+ '<div>'
				+ '<div class="sub-status-row"><span class="status-pill expired">Нет подписки</span></div>'
				+ '<h3 class="sub-headline">Доступ к&nbsp;рецептам</h3>'
				+ '<div class="sub-active-until">Оформите подписку, чтобы открыть полный доступ.</div>'
				+ subscriptionPricePreviewHtml()
				+ '</div>'
				+ '<div class="sub-actions-col">'
				+ '<button type="button" id="sub-renew-btn" class="btn btn-orange sub-action-btn" '
				+ 'data-cta-default="' + ctaText + '" onclick="togglePaySection()">' + ctaText + '</button>'
				+ '</div>'
				+ '</div>';
		}

		async function loadSubscription() {
			try {
				const res = await Auth.api('/subscription');
				if (!res.ok) { renderFallbackSubCard(); loadPaymentHistory(); return false; }
				const data = await res.json();
				const wrap = document.getElementById('sub-status-wrap');
				const badge = data.status || 'none';
				const pillClass = badge === 'active' ? '' : (badge === 'trial' ? ' trial' : ' expired');
				let label = SUB_LABELS[badge] || 'Нет подписки';
				if (data.trialNotGranted) label = 'Пробный период не активирован';
				else if (badge === 'expired' && data.trialEndsAt) label = 'Пробный период завершён';
				const earlyBadge = data.isEarlyBird ? '<span class="sub-badge early-bird">Друг Умной тарелки</span>' : '';
				let untilStr = '';
				if (data.activeUntil) {
					untilStr = new Date(data.activeUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
				}
				// Editorial sub-card: status pill + plan text + serif headline + until date + actions col
				const headlineHtml = data.trialNotGranted
					? '<h3 class="sub-headline">Доступ по&nbsp;подписке</h3>'
					: data.daysLeft !== undefined && badge !== 'expired'
					? '<h3 class="sub-headline">Осталось&nbsp;<b>' + data.daysLeft + '&nbsp;' + pluralDays(data.daysLeft) + '</b></h3>'
					: '<h3 class="sub-headline">' + escHtml(label) + '</h3>';
				const untilHtml = data.trialNotGranted
					? '<div class="sub-active-until">Бесплатный пробный период уже использовался на этом устройстве или в вашей сети. Оформите подписку, чтобы открыть полный доступ.</div>'
					: untilStr
					? '<div class="sub-active-until">Доступ к рецептам и&nbsp;сайдбару БЖУ — до&nbsp;<b>' + escHtml(untilStr) + '</b></div>'
					: '';
				const planText = badge === 'active' ? 'Тариф «Месяц»' : '';
				const planHtml = planText ? '<span class="sub-plan">' + escHtml(planText) + '</span>' : '';
				const pricePreviewHtml = badge === 'active' ? '' : subscriptionPricePreviewHtml();
				const activeSummaryHtml = badge === 'active' && untilStr
					? '<div class="sub-active-until">Активна до <b>' + escHtml(untilStr) + '</b></div>'
						+ planHtml
						+ headlineHtml
					: '';
				const defaultSummaryHtml = activeSummaryHtml || (
					'<div class="sub-status-row"><span class="status-pill' + pillClass + '">' + escHtml(label) + '</span>' + planHtml + earlyBadge + '</div>'
					+ headlineHtml + untilHtml + pricePreviewHtml
				);
				const ctaText = badge === 'active' ? 'Продлить подписку' : 'Оформить подписку';
				const actionsHtml = '<div class="sub-actions-col">'
					+ '<button type="button" id="sub-renew-btn" class="btn btn-orange sub-action-btn" '
					+ 'data-cta-default="' + escHtml(ctaText) + '" onclick="togglePaySection()">'
					+ escHtml(ctaText) + '</button>'
					+ '</div>';
				wrap.innerHTML = '<div class="sub-card">'
					+ '<div>'
					+ defaultSummaryHtml
					+ '</div>'
					+ actionsHtml
					+ '</div>';

				// Active users also see their personal early-access renewal status.
				if (badge === 'active') {
					loadPaymentHistory();
					return true;
				}
			} catch (e) { renderFallbackSubCard(); }

			loadPaymentHistory();
			return false;
		}

		function pluralDays(n) {
			const abs = Math.abs(n) % 100;
			const n1 = abs % 10;
			if (abs > 10 && abs < 20) return 'дней';
			if (n1 > 1 && n1 < 5) return 'дня';
			if (n1 === 1) return 'день';
			return 'дней';
		}

		function copyCard() {
			var num = document.getElementById('pay-card-num').textContent.replace(/\s/g, '');
			navigator.clipboard.writeText(num).then(function () {
				var btn = document.getElementById('pay-copy-btn');
				btn.textContent = 'Скопировано!';
				btn.style.background = '#28a745';
				btn.style.borderColor = '#28a745';
				btn.style.color = '#fff';
				setTimeout(function () {
					btn.textContent = 'Скопировать';
					btn.style.background = '';
					btn.style.borderColor = '';
					btn.style.color = '';
				}, 1500);
			});
		}

		// Set default datetime to now
		(function() {
			var now = new Date();
			now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
			document.getElementById('pay-date').value = now.toISOString().slice(0, 16);
		})();

		// Screenshot preview
		var _screenshotData = null;
		function previewScreenshot(input) {
			var file = input.files[0];
			if (!file) return;
			if (file.size > 5 * 1024 * 1024) {
				document.getElementById('pay-error').textContent = 'Файл слишком большой (макс. 5 МБ)';
				document.getElementById('pay-error').style.display = 'block';
				input.value = '';
				return;
			}
			var reader = new FileReader();
			reader.onload = function(e) {
				_screenshotData = e.target.result;
				document.getElementById('pay-screenshot-img').src = _screenshotData;
				document.getElementById('pay-screenshot-preview').style.display = 'block';
				document.getElementById('pay-screenshot-name').textContent = file.name;
			};
			reader.readAsDataURL(file);
		}
		function clearScreenshot() {
			_screenshotData = null;
			document.getElementById('pay-screenshot').value = '';
			document.getElementById('pay-screenshot-preview').style.display = 'none';
			document.getElementById('pay-screenshot-name').textContent = 'Прикрепить изображение';
		}

		// ── Wizard navigation ──
		var _selectedPlan = null;

		function goPayStep(step) {
			// Update step indicators
			document.querySelectorAll('.pay-step').forEach(function(el) {
				var s = parseInt(el.dataset.step);
				el.classList.remove('active', 'done');
				if (s < step) el.classList.add('done');
				if (s === step) el.classList.add('active');
			});
			// Show/hide panels
			for (var i = 1; i <= 3; i++) {
				document.getElementById('pay-step-' + i).style.display = (i === step) ? 'block' : 'none';
			}
			// Populate sender on step 3
			if (step === 3) {
				var user = Auth.getUser();
				if (user && user.email) document.getElementById('pay-sender-display').textContent = user.email;
			}
		}

		function selectPlan(months, amount, el) {
			_selectedPlan = { months: months, amount: amount };
			document.getElementById('pay-amount').value = amount;
			document.getElementById('pay-transfer-amount').textContent = amount + ' ₽';
			document.querySelectorAll('.pay-plan-card').forEach(function(c) { c.classList.remove('selected'); });
			el.classList.add('selected');
			document.getElementById('pay-next-1').disabled = false;
		}

		function renderPlanCards() {
			var plans = [
				{ months: 1, name: 'Знакомство', label: '1 месяц', amount: _currentPrices[1], future: _regularPrices[1] },
				{ months: 3, name: 'Оптимальный старт', label: '3 месяца', amount: _currentPrices[3], future: _regularPrices[3], badge: 'Рекомендуем', featured: true },
				{ months: 12, name: 'Годовой доступ', label: '12 месяцев', amount: _currentPrices[12], future: _regularPrices[12], badge: 'Самая выгодная цена' }
			];
			var grid = document.getElementById('pay-plan-grid');
			grid.innerHTML = plans.map(function(pl) {
				var badgeHtml = pl.badge ? '<div class="pay-plan-badge">' + pl.badge + '</div>' : '';
				var futureHtml = _showFuturePrices
					? '<div class="pay-plan-future">' + _futurePriceLabel + ' — ' + formatRubles(pl.future) + '</div>'
					: '';
				return '<div class="pay-plan-card' + (pl.featured ? ' featured' : '') + '" data-cabinet-action="select-plan" data-months="' + Number(pl.months) + '" data-amount="' + Number(pl.amount) + '">'
					+ badgeHtml
					+ '<div class="pay-plan-name">' + pl.name + '</div>'
					+ '<div class="pay-plan-duration">' + pl.label + '</div>'
					+ '<div class="pay-plan-price">' + formatRubles(pl.amount) + '</div>'
					+ futureHtml
					+ '</div>';
			}).join('');
		}

		function formatRubles(amount) {
			return Number(amount).toLocaleString('ru-RU') + '&nbsp;₽';
		}

		function resetPayWizard() {
			_selectedPlan = null;
			document.getElementById('pay-success').style.display = 'none';
			// Гарантируем, что план-карточки отрисованы. loadEarlyBird() пропускается
			// для active-подписки, поэтому при «Продлить» grid мог быть пустым.
			var planGrid = document.getElementById('pay-plan-grid');
			if (planGrid && !planGrid.children.length) renderPlanCards();
			document.querySelectorAll('.pay-plan-card').forEach(function(c) { c.classList.remove('selected'); });
			document.getElementById('pay-next-1').disabled = true;
			document.getElementById('pay-form').style.display = 'flex';
			document.getElementById('pay-comment').value = '';
			clearScreenshot();
			// Reset datetime
			var now = new Date();
			now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
			document.getElementById('pay-date').value = now.toISOString().slice(0, 16);
			goPayStep(1);
		}

		async function submitPayment() {
			var amount = parseInt(document.getElementById('pay-amount').value);
			var paymentDate = document.getElementById('pay-date').value;
			var comment = document.getElementById('pay-comment').value.trim();

			var errEl = document.getElementById('pay-error');
			errEl.style.display = 'none';

			if (!amount || amount <= 0) { errEl.textContent = 'Укажите сумму'; errEl.style.display = 'block'; return; }
			if (!paymentDate) { errEl.textContent = 'Укажите дату перевода'; errEl.style.display = 'block'; return; }

			var btn = document.getElementById('pay-submit-btn');
			btn.disabled = true; btn.textContent = 'Отправка...';

			try {
				var body = { amount: amount, paymentDate: paymentDate, comment: comment };
				if (_screenshotData) body.screenshot = _screenshotData;
				var res = await Auth.api('/subscription/payment', {
					method: 'POST',
					body: JSON.stringify(body)
				});
				var data = await res.json();
				if (!res.ok) {
					if (res.status === 409) {
						// Дубль pending: добавляем контакт поддержки прямо в ошибку
						errEl.innerHTML = escHtml(data.error || 'У вас уже есть платёж на проверке.') + '<br>' + supportContactHtml();
					} else {
						errEl.textContent = data.error || 'Ошибка';
					}
					errEl.style.display = 'block';
					btn.disabled = false;
					btn.textContent = 'Отправить на проверку';
					// Подтягиваем историю, чтобы пользователь увидел существующий pending
					if (res.status === 409) loadPaymentHistory();
					return;
				}
				// Hide all wizard steps, show success
				for (var i = 1; i <= 3; i++) document.getElementById('pay-step-' + i).style.display = 'none';
				document.querySelector('.pay-steps').style.display = 'none';
				_injectSuccessSupportNote();
				var success = document.getElementById('pay-success');
				success.style.display = 'block';
				clearScreenshot();
				await loadPaymentHistory();
				startPaymentPolling();
				requestAnimationFrame(function() {
					var visibleStatus = document.querySelector('#pay-pending-block .pay-pending-card') || success;
					revealCabinetTargetIfNeeded(visibleStatus, { block: 'center' });
					visibleStatus.focus({ preventScroll: true });
				});
			} catch (e) {
				errEl.textContent = 'Ошибка сети'; errEl.style.display = 'block';
			}
			btn.disabled = false; btn.textContent = 'Отправить на проверку';
		}

		var PAY_STATUS_LABELS = { pending: 'На проверке', confirmed: 'Подтверждён', rejected: 'Отклонён' };

		// Poll payment status every 15s while there are pending payments
		var _payPollTimer = null;
		function startPaymentPolling() {
			stopPaymentPolling();
			_payPollTimer = setInterval(async function() {
				try {
					var res = await Auth.api('/subscription/payments');
					if (!res.ok) return;
					var payments = await res.json();
					var hasPending = payments.some(function(p) { return p.status === 'pending'; });
					loadPaymentHistory();
					if (!hasPending) {
						stopPaymentPolling();
						// Если платёж подтверждён и пользователь пришёл с рецепта — возвращаем туда
						var lastPayment = payments[0];
						if (lastPayment && lastPayment.status === 'confirmed') {
							clearContentCache();
							var ret = _getCabReturn();
							if (ret) {
								sessionStorage.removeItem('_cab_return_url');
								if (typeof showToast === 'function') showToast('Доступ открыт — возвращаемся к рецепту', 1800);
								setTimeout(function() { location.href = ret; }, 1500);
								return;
							}
						}
						// Refresh both access data and the visible subscription card.
						await Auth.checkAccess();
						await loadSubscription();
					}
				} catch(e) { /* ignore */ }
			}, 15000);
		}
		function stopPaymentPolling() {
			if (_payPollTimer) { clearInterval(_payPollTimer); _payPollTimer = null; }
		}

		function _renderPendingBlock(payment) {
			var section = document.querySelector('.pay-section');
			var details = document.getElementById('pay-details');
			var cardBtn = document.getElementById('sub-renew-btn');
			var block = document.getElementById('pay-pending-block');
			if (!payment) {
				if (block) block.remove();
				if (cardBtn) {
					cardBtn.disabled = false;
					cardBtn.style.opacity = '';
					cardBtn.style.cursor = '';
					cardBtn.style.pointerEvents = '';
					cardBtn.removeAttribute('title');
				}
				return;
			}
			var hiddenNoticeId = localStorage.getItem(Auth._userKey('hidden_payment_notice'));
			if (payment.status === 'rejected' && (payment.notice_dismissed_at || String(payment.id) === hiddenNoticeId)) {
				if (block) block.remove();
				return;
			}
			var isPending = payment.status === 'pending';
			// Only a pending payment blocks a duplicate submission.
			if (cardBtn) {
				cardBtn.disabled = isPending;
				cardBtn.style.opacity = isPending ? '.55' : '';
				cardBtn.style.cursor = isPending ? 'not-allowed' : '';
				cardBtn.style.pointerEvents = isPending ? 'none' : '';
				if (isPending) cardBtn.title = 'Дождитесь подтверждения текущего платежа';
				else cardBtn.removeAttribute('title');
			}
			if (isPending && details) details.style.display = 'none';
			if (!section) return;
			if (!block) {
				block = document.createElement('div');
				block.id = 'pay-pending-block';
				section.insertBefore(block, section.firstChild);
			}
			var d = payment.created_at ? new Date(payment.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '';
			var amount = escHtml(String(payment.amount || '')) + '&nbsp;₽';
			var cardClass = 'pay-pending-card';
			var title = 'Платёж на проверке';
			var text = 'Платёж от&nbsp;<b>' + escHtml(d) + '</b> на&nbsp;<b>' + amount + '</b> отправлен. Обычно проверка занимает около 30&nbsp;минут.';
			var support = '<div class="pay-pending-support">' + supportContactHtml('pending') + '</div>';
			if (payment.status === 'confirmed') {
				cardClass += ' confirmed';
				title = 'Оплата подтверждена';
				text = 'Платёж на&nbsp;<b>' + amount + '</b> подтверждён. Доступ по подписке открыт.';
				support = '';
			} else if (payment.status === 'rejected') {
				cardClass += ' rejected';
				title = 'Оплата не подтверждена';
				text = payment.admin_comment
					? 'Причина: <b>' + escHtml(payment.admin_comment) + '</b>'
					: 'Проверьте данные перевода и отправьте подтверждение ещё раз.';
				support = '<div class="pay-pending-support">' + supportContactHtml('rejected') + '</div>';
			}
			if (!isPending) {
				var success = document.getElementById('pay-success');
				if (success) success.style.display = 'none';
			}
			var hideAction = payment.status === 'rejected'
				? '<button type="button" class="pay-notice-hide" data-payment-id="' + escHtml(String(payment.id)) + '" onclick="hidePaymentNotice(this)">Скрыть уведомление</button>'
				: '';
			block.innerHTML = '<div class="' + cardClass + '" role="status" aria-live="polite" tabindex="-1">'
				+ '<div class="pay-pending-eyebrow">' + title + '</div>'
				+ '<div class="pay-pending-text">' + text + '</div>'
				+ support + hideAction + '</div>';
		}

		async function hidePaymentNotice(button) {
			var paymentId = button && button.getAttribute('data-payment-id');
			if (paymentId) localStorage.setItem(Auth._userKey('hidden_payment_notice'), paymentId);
			var block = document.getElementById('pay-pending-block');
			if (block) block.remove();
			if (!paymentId) return;
			try {
				var res = await Auth.api('/subscription/payments/' + encodeURIComponent(paymentId) + '/dismiss-notice', { method: 'PUT' });
				if (!res.ok) throw new Error('dismiss_payment_notice_' + res.status);
			} catch (e) {
				console.warn('Не удалось синхронизировать скрытие уведомления об оплате', e);
			}
		}

		function _injectHistorySupportNote(parent, paymentStatus) {
			var note = document.getElementById('pay-history-support');
			if (!note) {
				note = document.createElement('div');
				note.id = 'pay-history-support';
				note.className = 'cab-support-note';
				note.style.cssText = 'margin-top:32px';
				parent.parentNode.insertBefore(note, parent.nextSibling);
			}
			note.innerHTML = '<div class="cab-support-note-text">' + supportContactHtml(paymentStatus) + '</div>';
			_injectLegalLinks(note);
		}

		function _injectLegalLinks(after) {
			var legal = document.getElementById('pay-legal-links');
			if (!legal) {
				legal = document.createElement('div');
				legal.id = 'pay-legal-links';
				legal.style.cssText = 'margin-top:8px;font-size:11px;color:#aaa;line-height:1.5;text-align:center';
				var policyLink = '<a href="personal-data-processing-policy.html" target="_blank" rel="noopener" style="color:#aaa;text-decoration:underline">Политика обработки персональных данных</a>';
				var offerLink = '<a href="https://voronova.online/public-offer.html" target="_blank" rel="noopener" style="color:#aaa;text-decoration:underline">Оферта</a>';
				legal.innerHTML = (typeof LEGAL_OFFER_ENABLED !== 'undefined' && LEGAL_OFFER_ENABLED)
					? (offerLink + ' · ' + policyLink)
					: policyLink;
				after.parentNode.insertBefore(legal, after.nextSibling);
			}
		}

		(function _renderWizardLegal() {
			var el = document.getElementById('pay-wizard-legal');
			if (!el) return;
			var policy = '<a href="personal-data-processing-policy.html" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">политикой обработки персональных данных</a>';
			if (typeof LEGAL_OFFER_ENABLED !== 'undefined' && LEGAL_OFFER_ENABLED) {
				var offer = '<a href="https://voronova.online/public-offer.html" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">условиями оферты</a>';
				el.innerHTML = 'Отправляя заявку на оплату, вы соглашаетесь с ' + offer + ' и ' + policy + '.';
			} else {
				el.innerHTML = 'Отправляя заявку на оплату, вы соглашаетесь с ' + policy + '.';
			}
		})();

		function _injectSuccessSupportNote() {
			var card = document.getElementById('pay-success');
			if (!card || document.getElementById('pay-success-support')) return;
			var note = document.createElement('div');
			note.id = 'pay-success-support';
			note.style.cssText = 'margin-top:14px;font-size:12px;color:var(--text-3);line-height:1.5;text-align:center';
			note.innerHTML = supportContactHtml('pending');
			var btn = card.querySelector('button');
			if (btn) card.insertBefore(note, btn);
			else card.appendChild(note);
		}

		async function loadPaymentHistory() {
			try {
				var res = await Auth.api('/subscription/payments');
				if (!res.ok) return;
				var payments = await res.json();
				var pending = payments.find(function(p) { return p.status === 'pending'; });
				var latest = payments[0] || null;
				// Auto-start polling if there are pending payments
				if (pending && !_payPollTimer) startPaymentPolling();
				// Pending-блокировка wizard (либо снятие блокировки)
				_renderPendingBlock(pending || latest);
				var el = document.getElementById('pay-history');
				if (!payments.length) { el.innerHTML = ''; return; }
				var payCount = payments.length;
				var payMeta = payCount + ' ' + (payCount === 1 ? 'операция' : payCount < 5 ? 'операции' : 'операций');
				var existingHistory = el.querySelector('.pay-history-disclosure');
				var historyOpen = existingHistory ? existingHistory.open : payCount === 1;
				el.innerHTML = '<details class="pay-history-disclosure"' + (historyOpen ? ' open' : '') + '>'
					+ '<summary class="pay-history-summary">'
					+ '<h2 class="cab-sec-title">История платежей</h2>'
					+ '<span class="pay-history-summary-meta"><span class="cab-sec-title-meta">' + payMeta + '</span>'
					+ '<span class="pay-history-action"><span class="pay-history-action-show">Показать операции</span>'
					+ '<span class="pay-history-action-hide">Скрыть операции</span>'
					+ '<span class="pay-history-chevron" aria-hidden="true">⌄</span></span></span></summary>'
					+ '<div class="pay-list">'
					+ payments.map(function (p) {
						var dateStr = new Date(p.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
						var statusClass = p.status || 'pending';
						var rejectReason = (p.status === 'rejected' && p.admin_comment)
							? '<div class="pay-hist-reject-reason" style="margin-top:6px;padding:8px 12px;background:#fff5f5;border-left:3px solid #dc3545;font-size:12px;color:#721c24">Причина: ' + escHtml(p.admin_comment) + '</div>'
							: (p.admin_comment ? '<div style="font-size:12px;color:var(--text-2);margin-top:4px">' + escHtml(p.admin_comment) + '</div>' : '');
						return '<div class="pay-row">'
							+ '<div class="pay-amount-val">' + escHtml(String(p.amount)) + '<span class="pay-cur"> ₽</span></div>'
							+ '<div class="pay-info-col">'
							+ '<div class="pay-date-str">' + escHtml(dateStr) + '</div>'
							+ (p.sender_name ? '<div class="pay-meta-str"><b>' + escHtml(p.sender_name) + '</b></div>' : '')
							+ rejectReason
							+ '</div>'
							+ '<span class="pay-status-pill ' + statusClass + '">' + escHtml(PAY_STATUS_LABELS[p.status] || p.status) + '</span>'
							+ '</div>';
					}).join('')
					+ '</div></details>';
				_injectHistorySupportNote(el, latest && latest.status);
			} catch (e) { /* ignore */ }
		}

		function togglePaySection() {
			var details = document.getElementById('pay-details');
			var btn = document.getElementById('pay-toggle-btn');         // standalone (hidden)
			var cardBtn = document.getElementById('sub-renew-btn');      // in sub-card
			if (details.style.display === 'none' || !details.style.display) {
				details.style.display = 'block';
				details.style.animation = 'fadeUp .3s ease both';
				document.querySelector('.pay-steps').style.display = 'flex';
				resetPayWizard();
				if (btn) { btn.textContent = 'Скрыть'; btn.className = 'btn btn-ghost'; btn.style.width = '100%'; }
				if (cardBtn) cardBtn.textContent = 'Скрыть';
				setTimeout(function () {
					var title = document.getElementById('pay-details-title');
					var target = title || details;
					revealCabinetTargetIfNeeded(target, { block: 'start' });
					if (title) title.focus({ preventScroll: true });
				}, 80);
			} else {
				details.style.display = 'none';
				if (btn) { btn.textContent = 'Оформить подписку'; btn.className = 'btn btn-orange'; }
				if (cardBtn) cardBtn.textContent = cardBtn.dataset.ctaDefault || 'Оформить подписку';
			}
		}

		var _currentPrices = { 1: 390, 3: 990, 12: 2990 };
		var _regularPrices = { 1: 390, 3: 990, 12: 2990 };
		var _showFuturePrices = false;
		var _futurePriceLabel = 'После раннего доступа';

		function pluralMonths(n) {
			var abs = Math.abs(n) % 100;
			var n1 = abs % 10;
			if (abs > 10 && abs < 20) return 'месяцев';
			if (n1 > 1 && n1 < 5) return 'месяца';
			if (n1 === 1) return 'месяц';
			return 'месяцев';
		}

		async function loadEarlyBird() {
			var statusEl = document.getElementById('early-access-user-status');
			try {
				var res = await Auth.api('/subscription/early-bird');
				if (!res.ok) return;
				var data = await res.json();
				document.getElementById('early-bird-remaining').textContent = data.remaining;
				_currentPrices = data.prices || _currentPrices;
				_regularPrices = data.regularPrices || _regularPrices;
				_showFuturePrices = !!data.eligible;
				_futurePriceLabel = data.eligibility === 'renewal' ? 'Следующее продление' : 'После раннего доступа';
				if (statusEl) {
					if (data.eligibility === 'renewal') {
						statusEl.textContent = 'За вами сохранено одно продление по стартовой цене. После него будет действовать актуальная цена на момент продления.';
					} else if (data.renewalUsed) {
						statusEl.textContent = 'Вы уже использовали продление по стартовой цене. Для следующего продления действуют актуальные цены.';
					} else if (data.eligible) {
						statusEl.textContent = 'Вам доступна стартовая цена. После первой покупки вы сможете один раз продлить подписку по той же цене.';
					} else {
						statusEl.textContent = 'Ранний доступ завершён. Для оформления и продления действуют актуальные цены.';
					}
				}
			} catch (e) { /* ignore */ }
			renderPlanCards();
			updateSubscriptionPricePreview();
		}

		// Load subscription tab on init — wait for checkAccess to set _subStatus
		_cabAccess.then(function() {
			loadSubscription().then(function(isActive) {
				loadEarlyBird().then(function() {
				if (!isActive) {
					_renderReturnBanner();
						// Continue a paywall return in context; a normal subscription tab stays concise.
						if (_getCabReturn()) {
							var toggleBtn = document.getElementById('pay-toggle-btn');
							if (toggleBtn && document.getElementById('pay-details').style.display === 'none') {
								togglePaySection();
							}
						}
				} else {
					// Подписка уже активна — если есть сохранённый return, сразу предлагаем вернуться
					const ret = _getCabReturn();
					if (ret) {
						sessionStorage.removeItem('_cab_return_url');
						location.href = ret;
					}
				}
				});
			});
		});

		// ── KPI SUMMARY (4 метрики в шапке кабинета) ──────────────────────────────
		function renderCabSummaryStats() {
			const platesEl = document.getElementById('cab-plates-count');
			const favEl = document.getElementById('cab-favorites-count');
			const favHintEl = document.getElementById('cab-favorites-hint');
			if (platesEl) platesEl.textContent = String(Plate.getHistory().length || 0);
			const favoritesCount = Favorites.get().length || 0;
			if (favEl) favEl.textContent = String(favoritesCount);
			if (favHintEl) {
				const mod100 = favoritesCount % 100;
				const mod10 = favoritesCount % 10;
				const word = mod100 >= 11 && mod100 <= 14
					? 'рецептов'
					: mod10 === 1 ? 'рецепт' : (mod10 >= 2 && mod10 <= 4 ? 'рецепта' : 'рецептов');
				favHintEl.textContent = word + (mod100 % 10 === 1 && mod100 !== 11 ? ' сохранён' : ' сохранено');
			}
		}

		// ── ИСТОРИЯ ТАРЕЛОК ───────────────────────────────────────────────────────
		function renderHistory() {
			renderCabSummaryStats();
			const hist = Plate.getHistory();
			const el = document.getElementById('history-body');
			if (!hist.length) {
				el.innerHTML = '<div class="hist-empty"><div class="hist-empty-mark">Журнал пуст</div>Сохраните тарелку из&nbsp;главного меню.</div>';
				return;
			}

			// Группировка по дням
			const groups = {};
			const groupOrder = [];
			hist.forEach((entry, idx) => {
				const d = new Date(entry.date);
				const dayKey = d.toLocaleDateString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit' });
				if (!groups[dayKey]) {
					groups[dayKey] = { date: d, entries: [], dayKey };
					groupOrder.push(dayKey);
				}
				groups[dayKey].entries.push({ entry, idx });
			});

			el.innerHTML = groupOrder.map(dayKey => {
				const g = groups[dayKey];
				const d = g.date;
				const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
				const weekday = d.toLocaleDateString('ru-RU', { weekday: 'long' });
				const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
				const dayKcal = g.entries.reduce((sum, { entry }) => sum + (Number((entry.totals || {}).kcal) || 0), 0);

				const mealsHtml = g.entries.map(({ entry, idx }) => {
					const t = entry.totals || {};
					const items = entry.items || [];
					const timeStr = new Date(entry.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
					const primaryItem = items.length ? items[0] : null;
					const primaryName = primaryItem ? String(primaryItem.name || 'Тарелка') : 'Тарелка';
					const primaryRecipe = resolveHistoryRecipe(primaryItem);
					const primaryPhoto = resolveHistoryThumbPhoto(primaryItem, primaryRecipe);
					const primaryThumb = primaryPhoto
						? `<span class="hist-info-thumb"><img src="${escHtml(primaryPhoto)}" alt="" loading="lazy" decoding="async"></span>`
						: '';
					const mealSummary = items.length === 1
						? '1 блюдо'
						: items.length + ' блюда: ' + items.map(function(it) { return String(it.name || ''); }).join(', ');
					const mealType = Plate._safeMealType(entry.mealType);
					const chips = [
						Number(t.protein) ? `<span class="macro-chip prot">Б · ${t.protein}</span>` : '',
						Number(t.fat)     ? `<span class="macro-chip fat">Ж · ${t.fat}</span>` : '',
						Number(t.carbs)   ? `<span class="macro-chip carb">У · ${t.carbs}</span>` : '',
						Number(t.fiber)   ? `<span class="macro-chip fib">Кл · ${t.fiber}</span>` : ''
					].filter(Boolean).join('');
					const mealOptions = [
						['breakfast', 'Завтрак'],
						['lunch', 'Обед'],
						['dinner', 'Ужин'],
						['snack', 'Перекус'],
						['', 'Не указывать']
					].map(function(opt) {
						return `<button type="button" data-cabinet-action="choose-meal-type" data-entry-date="${escHtml(encodeURIComponent(String(entry.date || '')))}" data-meal-type="${escHtml(opt[0])}">${opt[1]}</button>`;
					}).join('');
					const mealLabel = mealType ? Plate._mealTypes[mealType] + ' ▾' : '+ Прием пищи';
					const itemsHtml = items.slice(1).map(it => {
						const linkedRecipe = resolveHistoryRecipe(it);
						const photo = resolveHistoryThumbPhoto(it, linkedRecipe);
						const thumb = photo
							? `<img src="${escHtml(photo)}" alt="" loading="lazy" decoding="async">`
							: historyAddonIcon(it.name);
						return `<div class="meal-item">
						<div class="meal-item-thumb">${thumb}</div>
						<div class="meal-item-name"><b>${escHtml(String(it.name || ''))}</b></div>
						<div class="meal-item-kcal">${Number(it.kcal) || 0} ккал</div>
					</div>`;
					}).join('');
					return `<article class="hist-card${idx === 0 ? ' open' : ''}" id="he-${idx}">
						<div class="hist-card-row">
							<div class="hist-time-col">
								<span class="meal-time">${timeStr}</span>
								<div class="hist-meal-picker${mealType ? ' has-value' : ''}">
									<button class="hist-meal-button" type="button" aria-haspopup="menu" aria-expanded="false" data-cabinet-action="toggle-meal-menu">${mealLabel}</button>
									<div class="hist-meal-menu" role="menu">${mealOptions}</div>
								</div>
							</div>
							<div class="hist-info">
								<div class="hist-info-heading">${primaryThumb}<h3 class="hist-info-title">${escHtml(primaryName)}</h3></div>
								<div class="hist-info-summary">${escHtml(mealSummary)}</div>
								<div class="meal-macros">${chips}</div>
							</div>
							<div class="hist-side">
								<span class="meal-kcal">${Number(t.kcal) || 0}<small>ккал</small></span>
								${items.length > 1 ? `<button class="hist-details" type="button" data-cabinet-action="toggle-history" data-index="${Number(idx)}">Детали <span>⌄</span></button>` : ''}
							</div>
						</div>
						${items.length > 1 ? `<div class="meal-body">
							<div class="meal-items">${itemsHtml}</div>
						</div>` : ''}
					</article>`;
				}).join('');

				return `<div class="day-block">
					<div class="day-head">
						<span class="day-date">${dateStr}</span>
						<span class="day-weekday">${weekdayCap}</span>
						<span class="day-total">Итого · <b>${dayKcal} ккал</b></span>
					</div>
					${mealsHtml}
				</div>`;
			}).join('');
		}

		function resolveHistoryThumbPhoto(item, linkedRecipe) {
			const ownPhoto = firstHistoryPhoto(item && item.photo);
			if (linkedRecipe) {
				const linkedPhoto = firstHistoryPhoto(linkedRecipe.photo);
				if (linkedPhoto) return linkedPhoto;
			}
			return ownPhoto;
		}

		function historyAddonIcon(name) {
			const value = String(name || '').toLowerCase();
			const attrs = 'class="meal-addon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
			if (/кур|индей|мяс|птиц/.test(value)) {
				return `<svg ${attrs}><path d="M14.8 5.2c2.2 2.2 2.2 5.7 0 7.9s-5.7 2.2-7.9 0-2.2-5.7 0-7.9 5.7-2.2 7.9 0Z"/><path d="m7.2 12.8-3.4 3.4m0 0-1.3-.2-.5.5 2 2 2 2 .5-.5-.2-1.3 3.4-3.4"/></svg>`;
			}
			if (/хлеб|тост|бул|лаваш|круп|рис|греч|макарон/.test(value)) {
				return `<svg ${attrs}><path d="M5 10.2C5 6.8 7.8 4 11.2 4h1.6C16.2 4 19 6.8 19 10.2V20H5v-9.8Z"/><path d="M8.5 9.5c1-1 2-1.5 3.5-1.5s2.5.5 3.5 1.5"/><path d="M9 13h6"/></svg>`;
			}
			if (/рыб|лос|тун|треск|морепр/.test(value)) {
				return `<svg ${attrs}><path d="M4 12c3-4 7-6 12-4l4-3v14l-4-3c-5 2-9 0-12-4Z"/><circle cx="15" cy="11" r=".8" fill="currentColor" stroke="none"/><path d="M8 10c1 1.3 1 2.7 0 4"/></svg>`;
			}
			if (/сыр|творог|йогур|кефир|молок/.test(value)) {
				return `<svg ${attrs}><path d="M4 10 14 4l6 6v10H4V10Z"/><circle cx="14" cy="10" r="1.5"/><circle cx="9" cy="15" r="1.3"/><path d="M4 10h16"/></svg>`;
			}
			if (/яйц/.test(value)) {
				return `<svg ${attrs}><path d="M18 14.5a6 6 0 0 1-12 0C6 10.5 9.5 4 12 4s6 6.5 6 10.5Z"/></svg>`;
			}
			if (/масл|авокад|орех|сем|жир/.test(value)) {
				return `<svg ${attrs}><path d="M12 3s5.5 6.3 5.5 11a5.5 5.5 0 0 1-11 0C6.5 9.3 12 3 12 3Z"/><path d="M9 15.5c.5 1.2 1.4 1.8 2.7 2"/></svg>`;
			}
			if (/овощ|салат|зел|помид|огур|капуст|перец/.test(value)) {
				return `<svg ${attrs}><path d="M19 5C11 5 6 9 6 15c0 2.2 1.8 4 4 4 6 0 9-6 9-14Z"/><path d="M5 20c2.5-5 6-8.5 11-11"/></svg>`;
			}
			return `<svg ${attrs}><circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/></svg>`;
		}

		function firstHistoryPhoto(value) {
			if (Array.isArray(value)) {
				const first = value.find(function(photo) { return typeof photo === 'string' && photo.trim(); });
				return first ? first.trim() : '';
			}
			return typeof value === 'string' ? value.trim() : '';
		}

		function resolveHistoryRecipe(item) {
			if (!item || typeof RECIPES === 'undefined') return null;
			if (item.recipeId && RECIPES[item.recipeId]) return RECIPES[item.recipeId];
			const itemName = normalizeHistoryRecipeName(item.name);
			if (!itemName) return null;
			return Object.values(RECIPES).find(function(recipe) {
				return recipe && normalizeHistoryRecipeName(recipe.name) === itemName;
			}) || null;
		}

		function normalizeHistoryRecipeName(value) {
			return String(value || '')
				.toLocaleLowerCase('ru-RU')
				.replace(/ё/g, 'е')
				.replace(/[^а-яa-z0-9]+/gi, ' ')
				.trim()
				.replace(/\s+/g, ' ');
		}

		function toggleHist(idx) {
			document.getElementById('he-' + idx).classList.toggle('open');
		}

		function setHistoryMealType(encodedDate, mealType) {
			Plate.setHistoryMealType(decodeURIComponent(encodedDate), mealType);
			renderHistory();
		}

		function toggleHistoryMealMenu(button) {
			const picker = button.closest('.hist-meal-picker');
			const willOpen = !picker.classList.contains('open');
			closeHistoryMealMenus();
			picker.classList.toggle('open', willOpen);
			button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
		}

		function closeHistoryMealMenus() {
			document.querySelectorAll('.hist-meal-picker.open').forEach(function(picker) {
				picker.classList.remove('open');
				const button = picker.querySelector('.hist-meal-button');
				if (button) button.setAttribute('aria-expanded', 'false');
			});
		}

		function chooseHistoryMealType(encodedDate, mealType) {
			closeHistoryMealMenus();
			setHistoryMealType(encodedDate, mealType);
		}

		function openHistoryExport() {
			const historyBtn = document.querySelector('.cab-tab[data-tab="history"]');
			if (historyBtn && !historyBtn.classList.contains('active')) switchTab('history', historyBtn, { history: 'push' });
			const panel = document.getElementById('hist-export');
			if (!panel.classList.contains('open')) updateHistoryDateRange();
			panel.classList.add('open');
			const status = document.getElementById('hist-export-status');
			if (status) status.textContent = 'Настройки выгрузки открыты. Выберите период и формат.';
			setTimeout(function() {
				const title = document.getElementById('hist-export-title');
				// Wait for the export panel expansion, then make the result visible in one stable move.
				revealCabinetTargetIfNeeded(panel, { behavior: 'auto', block: 'center' });
				if (title) title.focus({ preventScroll: true });
			}, 320);
		}

		function closeHistoryExport() {
			const panel = document.getElementById('hist-export');
			if (panel) panel.classList.remove('open');
		}

		function updateHistoryDateRange() {
			const select = document.getElementById('hist-range');
			const from = document.getElementById('hist-from');
			const to = document.getElementById('hist-to');
			if (!select || !from || !to) return;
			const end = new Date();
			if (select.value !== 'custom') {
				const start = new Date(end);
				start.setDate(end.getDate() - Number(select.value) + 1);
				from.value = historyInputDate(start);
				to.value = historyInputDate(end);
			}
		}

		function useCustomHistoryRange() {
			const select = document.getElementById('hist-range');
			if (select) select.value = 'custom';
		}

		function historyInputDate(date) {
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			return year + '-' + month + '-' + day;
		}

		function getHistoryForExport() {
			const fromValue = document.getElementById('hist-from').value;
			const toValue = document.getElementById('hist-to').value;
			const from = fromValue ? new Date(fromValue + 'T00:00:00') : null;
			const to = toValue ? new Date(toValue + 'T23:59:59.999') : null;
			return Plate.getHistory().filter(function(entry) {
				const date = new Date(entry.date);
				return (!from || date >= from) && (!to || date <= to);
			});
		}

		function historyMealLabel(value) {
			return Plate._mealTypes[Plate._safeMealType(value)] || '';
		}

		function downloadHistoryCsv(entries) {
			const rows = [['Дата', 'Время', 'Прием пищи', 'Главное блюдо', 'Состав', 'Ккал', 'Белки, г', 'Жиры, г', 'Углеводы, г', 'Клетчатка, г', 'Источник']];
			entries.forEach(function(entry) {
				const d = new Date(entry.date);
				const items = entry.items || [];
				const t = entry.totals || {};
				rows.push([
					d.toLocaleDateString('ru-RU'),
					d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
					historyMealLabel(entry.mealType),
					items[0] ? String(items[0].name || '') : '',
					items.map(function(item) { return String(item.name || ''); }).join('; '),
					Number(t.kcal) || 0, Number(t.protein) || 0, Number(t.fat) || 0,
					Number(t.carbs) || 0, Number(t.fiber) || 0, 'Умная тарелка Юлии Вороновой'
				]);
			});
			const csv = '\uFEFF' + rows.map(function(row) {
				return row.map(function(cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(';');
			}).join('\n');
			const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
			const link = document.createElement('a');
			link.href = url;
			link.download = 'umnaya-tarelka_history_' + document.getElementById('hist-from').value + '_' + document.getElementById('hist-to').value + '.csv';
			link.click();
			URL.revokeObjectURL(url);
		}

		function printHistoryPdf(entries) {
			const popup = window.open('', '_blank');
			if (!popup) {
				if (typeof showToast === 'function') showToast('Разрешите всплывающее окно для сохранения PDF');
				return;
			}
			const rows = entries.map(function(entry) {
				const date = new Date(entry.date);
				const items = entry.items || [];
				const t = entry.totals || {};
				return '<tr><td>' + escHtml(date.toLocaleDateString('ru-RU')) + '<br><small>' + escHtml(date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })) + '</small></td>'
					+ '<td><b>' + escHtml(items[0] ? String(items[0].name || '') : '') + '</b><br><small>' + escHtml(items.map(function(item) { return String(item.name || ''); }).join(', ')) + '</small></td>'
					+ '<td>' + escHtml(historyMealLabel(entry.mealType) || '-') + '</td>'
					+ '<td class="num">' + (Number(t.kcal) || 0) + '</td></tr>';
			}).join('');
			const period = document.getElementById('hist-from').value + ' - ' + document.getElementById('hist-to').value;
			popup.document.write('<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Журнал тарелок</title><style>'
				+ 'body{font-family:Arial,sans-serif;color:#221f1c;margin:42px}header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #221f1c;padding-bottom:15px}'
				+ 'header b{font-family:Georgia,serif;font-size:27px}header b i{font-style:normal;color:#e8400a}header span{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#777}'
				+ 'h1{font:700 30px Georgia,serif;margin:34px 0 8px}.period{font-size:13px;color:#666;margin-bottom:28px}'
				+ 'table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;border-bottom:1px solid #221f1c;padding:10px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#777}'
				+ 'td{border-bottom:1px solid #e5e1dc;padding:12px 8px;vertical-align:top}small{color:#666}.num{font:700 18px Georgia,serif;color:#e8400a;text-align:right}'
				+ 'footer{margin-top:34px;padding-top:12px;border-top:1px solid #e5e1dc;text-align:center;color:#777;font-size:11px}'
				+ '@media print{body{margin:22mm 16mm}}</style></head><body>'
				+ '<header><b>Умная <i>тарелка</i></b><span>Юлия Воронова</span></header>'
				+ '<h1>Журнал тарелок</h1><div class="period">' + escHtml(period) + ' · сформировано на voronova.online</div>'
				+ '<table><thead><tr><th>Дата</th><th>Тарелка</th><th>Прием пищи</th><th style="text-align:right">Ккал</th></tr></thead><tbody>' + rows + '</tbody></table>'
				+ '<footer>Умная тарелка Юлии Вороновой · voronova.online</footer></body></html>');
			popup.document.close();
			popup.onafterprint = function() {
				popup.close();
				window.focus();
			};
			popup.focus();
			setTimeout(function() { popup.print(); }, 250);
		}

		function exportHistory() {
			const entries = getHistoryForExport();
			const status = document.getElementById('hist-export-status');
			if (!entries.length) {
				if (status) status.textContent = 'За выбранный период нет сохранённых тарелок.';
				if (typeof showToast === 'function') showToast('За выбранный период нет сохраненных тарелок');
				return;
			}
			if (document.getElementById('hist-format').value === 'csv') {
				downloadHistoryCsv(entries);
				if (status) status.textContent = 'CSV-файл сформирован и скачан.';
			} else {
				printHistoryPdf(entries);
				if (status) status.textContent = 'PDF подготовлен — открылось окно печати и сохранения.';
			}
		}

		document.addEventListener('click', function(event) {
			if (!event.target.closest('.hist-meal-picker')) closeHistoryMealMenus();
		});

		document.addEventListener('keydown', function(event) {
			if (event.key === 'Escape') {
				closeHistoryMealMenus();
				closeHistoryExport();
			}
		});

		renderHistory();

		// ── ИЗБРАННЫЕ ─────────────────────────────────────────────────────────────
		// _favFilter объявлена выше, до обработчика ?tab= (см. инициализацию) — иначе TDZ.

		function filterFavs(catId) {
			_favFilter = catId;
			document.querySelectorAll('#fav-filters .fav-chip').forEach(btn => {
				btn.classList.toggle('active', btn.dataset.cat === catId);
			});
			_renderFavGrid();
		}

		// Skeleton-карточки на время загрузки. Геометрия = реальной .fav-card,
		// чтобы не было layout shift при подмене. Декоративные (aria-hidden),
		// контейнер помечается aria-busy. Палитра/shimmer — см. CSS в cabinet.html
		// (общие .sk-line/.is-skeleton, согласованы со skeleton из category.html).
		function _renderFavSkeletons() {
			const grid = document.getElementById('fav-grid');
			const filtersEl = document.getElementById('fav-filters');
			if (filtersEl) filtersEl.innerHTML = '';
			if (!grid) return;
			grid.setAttribute('aria-busy', 'true');
			const widths = [['88%', '58%'], ['78%', '50%'], ['92%', '46%']];
			grid.innerHTML = Array.from({ length: 3 }, (_, i) => {
				const [w1, w2] = widths[i % widths.length];
				return '<div class="fav-card is-skeleton" aria-hidden="true">'
					+   '<div class="fav-card-media"></div>'
					+   '<div class="fav-card-body">'
					+     '<span class="sk-line sk-line--title" style="width:' + w1 + '"></span>'
					+     '<span class="sk-line" style="width:' + w2 + ';margin-top:10px;height:11px"></span>'
					+     '<div class="fav-card-foot">'
					+       '<span class="sk-line" style="width:30%;height:10px"></span>'
					+       '<span class="sk-line" style="width:22%;height:16px"></span>'
					+     '</div>'
					+   '</div>'
					+ '</div>';
			}).join('');
		}

		function renderFavorites() {
			renderCabSummaryStats();
			const grid = document.getElementById('fav-grid');
			const filtersEl = document.getElementById('fav-filters');
			// Loading-state: пока не готовы RECIPES и/или серверное избранное —
			// показываем skeleton, а не ложный «Нет избранных рецептов».
			if (!_recipesReady || !_favoritesReady) {
				_renderFavSkeletons();
				return;
			}
			if (grid) grid.removeAttribute('aria-busy');
			const ids = Favorites.get();
			if (!ids.length) {
				if (filtersEl) filtersEl.innerHTML = '';
				grid.innerHTML = '<div class="fav-empty">Нет избранных рецептов.<br>Нажмите на закладку на карточке рецепта.</div>';
				return;
			}
			const dishes = ids.map(id => RECIPES[id]).filter(Boolean);
			if (ids.length && !dishes.length && isContentError()) {
				if (filtersEl) filtersEl.innerHTML = '';
				grid.innerHTML = '<div class="fav-empty" style="text-align:center">' +
					'<div style="font-size:32px;margin-bottom:8px">📡</div>' +
					'Не удалось загрузить рецепты<br>' +
					'<button onclick="location.reload()" style="margin-top:12px;background:var(--accent,#e8734a);color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px">Повторить</button>' +
					'</div>';
				return;
			}
			// Build category filter chips from actual favourited recipes
			if (filtersEl) {
				const usedCatIds = [...new Set(dishes.map(d => (d.categories && d.categories[0]) || d.cat).filter(Boolean))];
				if (usedCatIds.length > 1) {
					const chips = [{ id: 'all', name: 'Все' }, ...usedCatIds.map(id => ({ id, name: (CATEGORIES[id] || {}).name || id }))];
					filtersEl.innerHTML = chips.map(c =>
						`<button class="fav-chip${_favFilter === c.id ? ' active' : ''}" data-cat="${escHtml(c.id)}" type="button">${escHtml(c.name)}</button>`
					).join('');
				} else {
					filtersEl.innerHTML = '';
				}
			}
			_renderFavGrid(dishes);
		}

		function _renderFavGrid(dishes) {
			if (!dishes) {
				const ids = Favorites.get();
				dishes = ids.map(id => RECIPES[id]).filter(Boolean);
			}
			const grid = document.getElementById('fav-grid');
			const filtered = _favFilter === 'all' ? dishes : dishes.filter(d => {
				const primary = (d.categories && d.categories[0]) || d.cat;
				return primary === _favFilter;
			});
			if (!filtered.length) {
				grid.innerHTML = '<div class="fav-empty">Нет рецептов в этой категории.</div>';
				return;
			}
			grid.innerHTML = filtered.map(d => favCardHtml(d)).join('');
		}

		function favCardHtml(d) {
			const _id = encodeURIComponent(d.id);
			const _name = escHtml(d.name || '');
			const _photo = escHtml(d.photo || '');
			const _emoji = escHtml(d.emoji || '🍴');
			const _imgPos = escHtml(d.imgPosition || '');
			const _kcal = Number(d.kcal) || 0;
			const primaryCatId = (d.categories && d.categories[0]) || d.cat;
			const catName = primaryCatId ? escHtml((CATEGORIES[primaryCatId] || {}).name || primaryCatId) : '';
			const photoHtml = _photo
				? `<img src="${_photo}" alt="${_name}" loading="lazy" data-fallback-emoji="${_emoji}" data-fallback-class="fav-card-media-placeholder"${_imgPos ? ` style="object-position:${_imgPos}"` : ''}>`
				: `<div class="fav-card-media-placeholder">${_emoji}</div>`;
			// Meta row: время · сложность · порции
			const _diffLabels = typeof DIFF_LABELS !== 'undefined' ? DIFF_LABELS : {};
			const metaParts = [
				d.time   ? escHtml('⏱ ' + d.time + ' мин') : '',
				_diffLabels[d.diff] ? escHtml(_diffLabels[d.diff]) : '',
				d.servings ? escHtml(d.servings + ' порц.') : ''
			].filter(Boolean);
			const metaHtml = metaParts.length
				? '<div class="fav-card-meta">' + metaParts.map((p, i) =>
					'<span>' + p + '</span>' + (i < metaParts.length - 1 ? '<span class="dot"></span>' : '')
				).join('') + '</div>'
				: '';
			return `<article class="fav-card" role="button" tabindex="0" data-cabinet-recipe-id="${_id}">
				<div class="fav-card-media">
					${photoHtml}
					${catName ? `<div class="fav-card-eyebrow">${catName}</div>` : ''}
					<button class="fav-card-bookmark active" type="button" id="fav-${_id}" data-favorite-id="${_id}" aria-label="Убрать из избранного"><svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg></button>
				</div>
				<div class="fav-card-body">
					<div class="fav-card-title">${_name}</div>
					${metaHtml}
					${_kcal ? `<div class="fav-card-foot"><span class="fav-card-kcal-lab">Калорийность</span><span class="fav-card-kcal-val">${_kcal}<small>ккал</small></span></div>` : ''}
				</div>
			</article>`;
		}

		// ── ЗАМЕТКИ ───────────────────────────────────────────────────────────────
		let editingNoteId = null;

		function loadNotes() {
			renderNotesList();
		}

		function addNote() {
			const ta = document.getElementById('notes-ta');
			const text = ta.value.trim();
			if (!text) { ta.focus(); return; }
			if (editingNoteId) {
				Notes.update(editingNoteId, text);
				editingNoteId = null;
			} else {
				Notes.add(text);
			}
			ta.value = '';
			document.getElementById('notes-save-btn').textContent = 'Сохранить';
			renderNotesList();
		}

		function renderNotesList() {
			const notes = Notes.get();
			const el = document.getElementById('notes-list');
			const metaEl = document.querySelector('.cab-note-list-meta');
			if (!notes.length) {
				el.innerHTML = '<div class="cab-notes-empty">Заметок пока нет.<br>Напишите первую!</div>';
				if (metaEl) metaEl.textContent = '';
				return;
			}
			const plural = n => n === 1 ? '1 заметка' : n <= 4 ? n + ' заметки' : n + ' заметок';
			if (metaEl) metaEl.textContent = plural(notes.length);
			el.innerHTML = notes.map(n => {
				const d = new Date(n.updated || n.date);
				const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
				const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
				return `<div class="cab-note-item" id="note-${n.id}">
					<div class="cab-note-head">
						<span class="cab-note-date">${dateStr} · ${timeStr}</span>
						<div class="cab-note-actions">
							<button type="button" data-cabinet-action="edit-note" data-note-id="${Number(n.id)}">Изменить</button>
							<button type="button" class="del" data-cabinet-action="delete-note" data-note-id="${Number(n.id)}">Удалить</button>
						</div>
					</div>
					<div class="cab-note-title">${escHtml(n.title || '')}</div>
					<div class="cab-note-body">${escHtml(n.text)}</div>
				</div>`;
			}).join('');
		}

		function toggleNote(id) {
			document.getElementById('note-' + id)?.classList.toggle('open');
		}
		function editNote(id) {
			const note = Notes.get().find(n => n.id === id);
			if (!note) return;
			editingNoteId = id;
			document.getElementById('notes-ta').value = note.text;
			document.getElementById('notes-save-btn').textContent = 'Обновить';
			const noteEditor = document.getElementById('notes-ta');
			revealCabinetTargetIfNeeded(noteEditor, { block: 'start' });
			noteEditor.focus({ preventScroll: true });
		}
		function deleteNote(id) {
			Notes.remove(id);
			if (editingNoteId === id) { editingNoteId = null; document.getElementById('notes-ta').value = ''; }
			renderNotesList();
		}
		function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
		function escAttr(s) { return escHtml(s); }

		function imgFallback(img, emoji, cls) {
			img.onerror = null;
			img.style.display = 'none';
			var d = document.createElement('div');
			d.className = cls || 'recipe-card-emoji';
			d.textContent = emoji;
			img.parentElement.insertBefore(d, img);
		}

		function recipeCardHtml(d) {
			const _id = encodeURIComponent(d.id);
			const _name = escHtml(d.name || '');
			const _photo = escHtml(d.photo || '');
			const _emoji = escHtml(d.emoji || '🍴');
			const _imgPos = escHtml(d.imgPosition || '');
			const _diff = escHtml((typeof DIFF_LABELS !== 'undefined' ? DIFF_LABELS : {})[d.diff] || d.diff || '');
			const _diffIcon = typeof diffIcon === 'function' ? diffIcon(d.diff) : '';
			const _timeMeta = formatTimeMeta(d.time, d.timeLabel);
			const _timeStr = escHtml(_timeMeta.short);
			const _timeNote = _timeMeta.note ? escHtml(_timeMeta.note) : '';
			const _kcal = Number(d.kcal) || 0;
			const isFav = Favorites.has(d.id);
			const photoHtml = _photo
				? `<img src="${_photo}" alt="${_name}" loading="lazy" data-fallback-emoji="${_emoji}"${_imgPos ? ` style="object-position:${_imgPos}"` : ''}>`
				: `<div class="recipe-card-emoji">${_emoji}</div>`;
			return `<button class="recipe-card" data-cabinet-recipe-id="${_id}">
            <div class="recipe-card-photo" style="position:relative">
                ${photoHtml}
				<div class="card-fav-btn${isFav ? ' active' : ''}" id="fav-${_id}" data-favorite-id="${_id}">
                    <svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
                </div>
            </div>
            <div class="recipe-card-body">
                <div class="recipe-card-name">${_name}</div>
                <div class="recipe-card-meta">
                    <span class="pill">${typeof timeIcon === 'function' ? timeIcon() : ''}${_timeStr}</span>
                    <span class="pill">${_diffIcon}${_diff}</span>
                </div>
                ${_timeNote ? `<div class="recipe-card-time-note"><span class="rcn-arr" aria-hidden="true">↳</span>${_timeNote}</div>` : ''}
                <div class="recipe-card-kcal" style="margin-top:4px">${_kcal} ккал</div>
            </div>
        </button>`;
		}

		function toggleFav(id) {
			const isNowFav = Favorites.toggle(id);
			const btn = document.getElementById('fav-' + id);
			if (btn) btn.classList.toggle('active', isNowFav);
			// If in favorites tab, refresh
			if (document.getElementById('panel-favorites').classList.contains('active')) {
				renderFavorites();
			}
		}

		function goToRecipe(id) {
			const r = RECIPES[id];
			location.href = 'recipe.html?id=' + encodeURIComponent(id) + '&from=' + encodeURIComponent(r ? r.cat : 'breakfasts');
		}

		document.addEventListener('click', function(event) {
			const actionTarget = event.target.closest('[data-cabinet-action]');
			if (actionTarget) {
				const action = actionTarget.dataset.cabinetAction;
				if (action === 'choose-meal-type') chooseHistoryMealType(actionTarget.dataset.entryDate || '', actionTarget.dataset.mealType || '');
				else if (action === 'toggle-meal-menu') toggleHistoryMealMenu(actionTarget);
				else if (action === 'toggle-history') toggleHist(Number(actionTarget.dataset.index));
				else if (action === 'edit-note') editNote(Number(actionTarget.dataset.noteId));
				else if (action === 'delete-note') deleteNote(Number(actionTarget.dataset.noteId));
				else if (action === 'remove-plate-item') removePlateItem(Number(actionTarget.dataset.index));
				else if (action === 'toggle-shop-item') toggleCabinetPlateShopCheckedByIndex(Number(actionTarget.dataset.index));
				else if (action === 'select-plan') selectPlan(Number(actionTarget.dataset.months), Number(actionTarget.dataset.amount), actionTarget);
				else if (action === 'open-feedback-reply') openFeedbackReply(actionTarget.dataset.threadId || '');
				else if (action === 'close-feedback-thread') closeFeedbackThread(actionTarget.dataset.threadId || '', actionTarget);
				else if (action === 'close-feedback-reply') closeFeedbackReplyForm(actionTarget.dataset.threadId || '');
				else if (action === 'hide-feedback') hideFeedback(actionTarget.dataset.threadId || '', actionTarget);
				return;
			}
			const favoriteTarget = event.target.closest('[data-favorite-id]');
			if (favoriteTarget) {
				event.stopPropagation();
				toggleFav(favoriteTarget.dataset.favoriteId || '');
				return;
			}
			const filterTarget = event.target.closest('#fav-filters [data-cat]');
			if (filterTarget) {
				filterFavs(filterTarget.dataset.cat || 'all');
				return;
			}
			const recipeTarget = event.target.closest('[data-cabinet-recipe-id]');
			if (recipeTarget) goToRecipe(recipeTarget.dataset.cabinetRecipeId || '');
		});

		document.addEventListener('keydown', function(event) {
			const recipeTarget = event.target.closest('article[data-cabinet-recipe-id]');
			if (!recipeTarget || event.target !== recipeTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
			event.preventDefault();
			goToRecipe(recipeTarget.dataset.cabinetRecipeId || '');
		});

		document.addEventListener('submit', function(event) {
			const form = event.target.closest('form[data-fb-form]');
			if (form) submitFeedbackReply(event, form.dataset.fbForm || '');
		});

		document.addEventListener('error', function(event) {
			const image = event.target;
			if (!(image instanceof HTMLImageElement) || !image.hasAttribute('data-fallback-emoji')) return;
			imgFallback(image, image.dataset.fallbackEmoji || '🍴', image.dataset.fallbackClass || undefined);
		}, true);

		// ── PLATE ─────────────────────────────────────────────────────────────────
		let cabinetPlateShopMode = false;
		let cabinetPlateShopChecked = new Set();

		function openPlate() {
			const items = Plate.get();
			const body = document.getElementById('plate-body');
			if (!items.length) {
				body.innerHTML = `<div class="pv1-empty">
                <div class="pv1-eyebrow">Пока пусто</div>
                <h2 class="pv1-headline">Соберите первый приём пищи</h2>
                <div class="pv1-divider"></div>
                <p class="pv1-sub">Выберите рецепт из категории — и он попадёт сюда. КБЖУ пересчитаются автоматически.</p>
                <button class="pv1-cta" onclick="closePlate();location.href='category.html'">К рецептам →</button>
            </div>`;
			} else {
				const t = Plate.totals();
				const ingCount = items.reduce((n, item) => n + (Array.isArray(item.ingredients) ? item.ingredients.length : 0), 0);
				const list = items.map((item, i) => `<div class="pv1-item">
                    ${item.photo
						? `<img class="pv1-item-photo" src="${escHtml(String(item.photo))}" alt="">`
						: `<div class="pv1-item-emoji">${escHtml(String(item.emoji || '🍴'))}</div>`}
                    <div class="pv1-item-main">
                        <div class="pv1-item-name">${escHtml(String(item.name || ''))}</div>
                        <div class="pv1-item-meta">${Number(item.kcal) || 0} ккал · Б ${Number(item.protein) || 0} · Ж ${Number(item.fat) || 0} · У ${Number(item.carbs) || 0} · Кл ${Number(item.fiber) || 0}</div>
                    </div>
                    <button class="pv1-item-del" data-cabinet-action="remove-plate-item" data-index="${Number(i)}" aria-label="Удалить"><svg class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="5" y1="19" x2="19" y2="5"/></svg></button>
                </div>`).join('');
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
				<div class="shop" id="shop-block">
					<div class="shop-head">
						<svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
						Список покупок${ingCount ? ` · ${ingCount} шт` : ''}
					</div>
					<div class="shop-actions">
						<button class="shop-btn shop-btn-primary" id="cabinet-plate-shop-mode-btn" type="button" onclick="toggleCabinetPlateShopMode()" aria-pressed="false">В магазине</button>
						<button class="shop-btn shop-btn-ghost" type="button" onclick="copyCabinetPlateShoppingList()">Скопировать</button>
					</div>
					<div class="plate-shop-list" id="cabinet-plate-shop-list" hidden></div>
				</div>
				${plateMealTypePickerHtml()}
				<div class="pv1-actions">
					<div class="pv1-actions-row">
						<button class="pv1-btn" onclick="location.href='index.html'">← На главную</button>
					</div>
					<button class="pv1-btn pv1-btn-primary pv1-btn-full" onclick="savePlateCabinet()">Записать тарелку в журнал</button>
				</div>`;
				renderCabinetPlateShopMode();
			}
			document.getElementById('plate-overlay').classList.add('open');
			document.body.style.overflow = 'hidden';
		}
		function closePlate() {
			document.getElementById('plate-overlay').classList.remove('open');
			document.body.style.overflow = '';
		}
		function closePlateIfOutside(e) {
			if (e.target === document.getElementById('plate-overlay')) closePlate();
		}
		function removePlateItem(i) { Plate.remove(i); updatePlateIcon(); openPlate(); }
		function cabinetPlateShopItems() {
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
		function toggleCabinetPlateShopMode() {
			cabinetPlateShopMode = !cabinetPlateShopMode;
			renderCabinetPlateShopMode();
		}
		function toggleCabinetPlateShopCheckedByIndex(index) {
			if (!cabinetPlateShopMode) return;
			const item = cabinetPlateShopItems()[Number(index)];
			if (!item) return;
			if (cabinetPlateShopChecked.has(item.key)) cabinetPlateShopChecked.delete(item.key);
			else cabinetPlateShopChecked.add(item.key);
			renderCabinetPlateShopMode();
		}
		function renderCabinetPlateShopMode() {
			const listEl = document.getElementById('cabinet-plate-shop-list');
			const btn = document.getElementById('cabinet-plate-shop-mode-btn');
			if (!listEl || !btn) return;
			const items = cabinetPlateShopItems();
			const validKeys = new Set(items.map(item => item.key));
			cabinetPlateShopChecked = new Set(Array.from(cabinetPlateShopChecked).filter(key => validKeys.has(key)));
			btn.setAttribute('aria-pressed', String(cabinetPlateShopMode));
			btn.classList.toggle('is-active', cabinetPlateShopMode);
			listEl.hidden = !cabinetPlateShopMode;
			if (!cabinetPlateShopMode) {
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
				const checked = cabinetPlateShopChecked.has(item.key);
				html += '<button class="plate-shop-check' + (checked ? ' is-checked' : '') + '" type="button" data-cabinet-action="toggle-shop-item" data-index="' + Number(index) + '" aria-pressed="' + checked + '">'
					+ '<span class="plate-shop-box" aria-hidden="true"></span>'
					+ '<span class="plate-shop-label">' + escHtml(item.label) + '</span>'
					+ '</button>';
			});
			listEl.innerHTML = html;
		}
		function copyCabinetPlateShoppingList() {
			navigator.clipboard.writeText(buildShoppingList())
				.then(() => showToast('📋 Список скопирован!'))
				.catch(() => showToast('Не удалось скопировать'));
		}
		function savePlateCabinet() {
			if (!Plate.count()) return;
			Plate.saveHistory(getSelectedPlateMealType());
			cabinetPlateShopMode = false;
			cabinetPlateShopChecked.clear();
			updatePlateIcon();
			renderHistory();
			closePlate();
			if (typeof showToast === 'function') showToast('Тарелка записана в журнал 🎉');
		}

		// ── ОБРАТНАЯ СВЯЗЬ ────────────────────────────────────────────────────────
		// Очистка старого localStorage (обращения теперь хранятся на сервере)
		localStorage.removeItem('user_feedback');

		let fbCat = 'wish';
		const FB_LABELS = { wish: 'Пожелание', recipe: 'Идея рецепта', problem: 'Проблема' };
		const FB_BADGE = { wish: 'fb-badge-wish', recipe: 'fb-badge-recipe', problem: 'fb-badge-problem' };

		function pickFbCat(btn) {
			document.querySelectorAll('.fb-cat').forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			fbCat = btn.dataset.cat;
		}

		async function sendFeedback() {
			const text = document.getElementById('fb-text').value.trim();
			if (!text) { document.getElementById('fb-text').focus(); return; }
			const btn = document.querySelector('.fb-actions .btn');
			btn.disabled = true; btn.textContent = 'Отправка...';
			try {
				const res = await Auth.api('/feedback', {
					method: 'POST',
					body: JSON.stringify({ category: fbCat, text })
				});
				if (!res.ok) {
					const data = await res.json();
					showToast(data.error || 'Ошибка отправки');
					btn.disabled = false; btn.textContent = 'Отправить';
					return;
				}
				document.getElementById('fb-text').value = '';
				btn.disabled = false; btn.textContent = 'Отправить';
				loadFeedbackHistory();
			} catch {
				showToast('Ошибка сети');
				btn.disabled = false; btn.textContent = 'Отправить';
			}
		}

		// Считает непрочитанные сообщения от Юлии (admin без seen_at) в видимых тредах
		function countUnseenAdminMessages(all) {
			if (!all) return 0;
			let n = 0;
			for (const f of all) {
				if (!f.messages) continue;
				for (const m of f.messages) {
					if (m.sender_type === 'admin' && !m.seen_at) n++;
				}
			}
			return n;
		}

		// Загрузить счётчик непрочитанных ответов для бейджа (при загрузке страницы)
		async function loadFeedbackBadge() {
			try {
				const res = await Auth.api('/feedback');
				if (!res.ok) return;
				const all = await res.json();
				const unseen = countUnseenAdminMessages(all);
				const badge = document.getElementById('fb-unseen-badge');
				if (unseen > 0) { badge.textContent = unseen; badge.style.display = ''; }
				else { badge.style.display = 'none'; }
			} catch {}
		}
		loadFeedbackBadge();

		async function loadFeedbackHistory() {
			const el = document.getElementById('fb-sent-list');
			try {
				const res = await Auth.api('/feedback');
				if (!res.ok) { el.innerHTML = ''; return; }
				const all = await res.json();
				renderFeedbackHistory(all);
				if (countUnseenAdminMessages(all) > 0) {
					Auth.api('/feedback/mark-seen', { method: 'POST' }).catch(() => {});
					document.getElementById('fb-unseen-badge').style.display = 'none';
					if (typeof Feedback !== 'undefined' && Feedback.clear) Feedback.clear();
				}
			} catch {
				el.innerHTML = '';
			}
		}

		// Maps API category → thread tag CSS class + display label
		const FB_THREAD_TAG = { wish: 'wish', recipe: 'idea', problem: 'bug' };
		const FB_THREAD_LABEL = { wish: 'Пожелание', recipe: 'Идея', problem: 'Проблема' };

		function fbStatusLabel(status, hasAdminReply) {
			if (status === 'closed') return { cls: 'done', text: 'Вопрос решён' };
			if (status === 'waiting_admin' || status === 'new') return { cls: 'wait', text: 'Ждёт ответа Юлии' };
			if (status === 'waiting_user' || status === 'answered') return { cls: 'reply', text: hasAdminReply ? 'Юлия ответила' : 'Ответ получен' };
			return null;
		}

		function fmtFbDate(iso) {
			const d = new Date(iso);
			return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
				+ ', ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
		}

		function renderFeedbackHistory(all) {
			const el = document.getElementById('fb-sent-list');
			if (!all || !all.length) {
				el.innerHTML = '<div class="threads-empty">'
					+ '<div class="threads-empty-mark">Пока пусто</div>'
					+ '<h3 class="threads-empty-title">Здесь появятся Ваши обращения</h3>'
					+ '<p>Напишите Юлии в&nbsp;форме выше&nbsp;— пожелание, идею рецепта или сообщение о&nbsp;проблеме. Ответ придёт сюда и&nbsp;на&nbsp;почту.</p>'
					+ '</div>';
				return;
			}
			const n = all.length;
			const counter = n + ' ' + (n === 1 ? 'обращение' : n < 5 ? 'обращения' : 'обращений');
			const head = '<div class="threads-head"><h3 class="threads-title">Ваши обращения</h3><span class="threads-meta">' + counter + '</span></div>';
			el.innerHTML = head + all.map(f => renderFeedbackThread(f)).join('');
		}

		function renderFeedbackThread(f) {
			const msgs = (f.messages && f.messages.length)
				? f.messages
				: [{ sender_type: 'user', text: '', created_at: f.created_at }];
			const userAvatar = feedbackUserAvatarHtml();
			const tagCls = FB_THREAD_TAG[f.category] || 'wish';
			const tagLabel = FB_THREAD_LABEL[f.category] || (FB_LABELS[f.category] || f.category);
			const lastAdmin = [...msgs].reverse().find(m => m.sender_type === 'admin');
			const status = fbStatusLabel(f.status, !!lastAdmin);
			const statusHtml = status ? '<div class="thread-status ' + status.cls + '">' + status.text + '</div>' : '';
			const headDate = fmtFbDate(f.created_at);

			let body = '';
			let userIdx = 0;
			for (const m of msgs) {
				if (m.sender_type === 'user') {
					const isFirst = userIdx === 0;
					userIdx++;
					if (isFirst) {
						body += '<div class="thread-msg">'
							+ userAvatar
							+ '<div class="thread-user-body">'
							+ '<p class="thread-user-text">' + escHtml(m.text) + '</p>'
							+ '</div>'
							+ '</div>';
					} else {
						body += '<div class="thread-followup">'
							+ userAvatar
							+ '<div class="thread-user-body">'
							+ '<div class="thread-followup-head">'
							+ '<span class="thread-followup-name">Вы</span>'
							+ '<span class="thread-followup-date">' + fmtFbDate(m.created_at) + '</span>'
							+ '</div>'
							+ '<p class="thread-followup-text">' + escHtml(m.text) + '</p>'
							+ '</div>'
							+ '</div>';
					}
				} else if (m.sender_type === 'admin') {
					body += '<div class="thread-reply">'
						+ '<div class="thread-reply-head">'
						+ '<div class="thread-reply-ava"><img src="' + SITE_BASE + '/images/YV-blog.webp" alt="Юлия Воронова"></div>'
						+ '<span class="thread-reply-name">Юлия</span>'
						+ '<span class="thread-reply-date">' + fmtFbDate(m.created_at) + '</span>'
						+ '</div>'
						+ '<p class="thread-reply-text">' + escHtml(m.text) + '</p>'
						+ '</div>';
				}
			}

			let actions = '';
			const canFollowUp = (f.status === 'waiting_user' || f.status === 'answered') && !!lastAdmin;
			if (canFollowUp) {
				actions = '<div class="thread-actions">'
					+ '<button type="button" class="thread-action" data-cabinet-action="open-feedback-reply" data-thread-id="' + escHtml(f.id) + '">Задать уточнение</button>'
					+ '<button type="button" class="thread-action thread-action-quiet" data-cabinet-action="close-feedback-thread" data-thread-id="' + escHtml(f.id) + '">Спасибо, вопрос решён</button>'
					+ '</div>'
					+ '<form class="thread-inline-form" data-fb-form="' + escHtml(f.id) + '">'
					+ '<textarea class="thread-inline-input" maxlength="2000" placeholder="Ваше уточнение..." required></textarea>'
					+ '<div class="thread-inline-actions">'
					+ '<button type="button" class="thread-action thread-action-quiet" data-cabinet-action="close-feedback-reply" data-thread-id="' + escHtml(f.id) + '">Отменить</button>'
					+ '<button type="submit" class="thread-action thread-action-primary">Отправить</button>'
					+ '</div>'
					+ '</form>';
			}

			return '<article class="thread" data-fb-id="' + f.id + '">'
				+ '<div class="thread-head">'
				+ '<span class="thread-tag ' + tagCls + '">' + escHtml(tagLabel) + '</span>'
				+ statusHtml
				+ '<span class="thread-date">' + headDate + '</span>'
				+ '<button type="button" class="thread-hide" title="Скрыть обращение" aria-label="Скрыть обращение" data-cabinet-action="hide-feedback" data-thread-id="' + escHtml(f.id) + '">Скрыть</button>'
				+ '</div>'
				+ body
				+ actions
				+ '</article>';
		}

		function feedbackUserAvatarHtml() {
			const avatar = Auth.getAvatar && Auth.getAvatar();
			if (avatar) {
				return '<span class="thread-user-ava"><img src="' + escAttr(avatar) + '" alt=""></span>';
			}
			const user = Auth.getUser && Auth.getUser();
			const fallback = (Auth.getDisplayName && Auth.getDisplayName()) || (user && (user.name || user.email)) || '?';
			return '<span class="thread-user-ava">' + escHtml(String(fallback).trim().charAt(0).toUpperCase() || '?') + '</span>';
		}

		function openFeedbackReply(id) {
			const form = document.querySelector('[data-fb-form="' + id + '"]');
			if (!form) return;
			form.classList.add('open');
			const ta = form.querySelector('textarea');
			if (ta) ta.focus();
		}

		function closeFeedbackReplyForm(id) {
			const form = document.querySelector('[data-fb-form="' + id + '"]');
			if (!form) return;
			form.classList.remove('open');
			const ta = form.querySelector('textarea');
			if (ta) ta.value = '';
		}

		async function submitFeedbackReply(ev, id) {
			ev.preventDefault();
			const form = ev.target;
			const ta = form.querySelector('textarea');
			const submitBtn = form.querySelector('button[type="submit"]');
			const text = (ta && ta.value || '').trim();
			if (!text) { if (ta) ta.focus(); return; }
			submitBtn.disabled = true; submitBtn.textContent = 'Отправка...';
			try {
				const res = await Auth.api('/feedback/' + id + '/messages', {
					method: 'POST',
					body: JSON.stringify({ text })
				});
				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					showToast(data.error || 'Ошибка отправки');
					submitBtn.disabled = false; submitBtn.textContent = 'Отправить';
					return;
				}
				ta.value = '';
				submitBtn.disabled = false; submitBtn.textContent = 'Отправить';
				loadFeedbackHistory();
			} catch {
				showToast('Ошибка сети');
				submitBtn.disabled = false; submitBtn.textContent = 'Отправить';
			}
		}

		async function closeFeedbackThread(id, btn) {
			const ok = await showAppConfirm({
				title: 'Отметить вопрос решённым?',
				text: 'Продолжить диалог в этом обращении уже не получится.',
				confirmText: 'Отметить решённым',
				cancelText: 'Отмена'
			});
			if (!ok) return;
			if (btn) { btn.disabled = true; }
			try {
				const res = await Auth.api('/feedback/' + id + '/close', { method: 'POST' });
				if (!res.ok) {
					showToast('Не удалось закрыть обращение');
					if (btn) { btn.disabled = false; }
					return;
				}
				loadFeedbackHistory();
			} catch {
				showToast('Ошибка сети');
				if (btn) { btn.disabled = false; }
			}
		}

		async function hideFeedback(id, btn) {
			const ok = await showAppConfirm({
				title: 'Скрыть обращение из списка?',
				text: 'В базе оно сохранится, но Вы его больше не увидите.',
				confirmText: 'Скрыть',
				cancelText: 'Отмена',
				danger: true
			});
			if (!ok) return;
			if (btn) { btn.disabled = true; btn.textContent = '...'; }
			try {
				const res = await Auth.api('/feedback/' + id, { method: 'DELETE' });
				if (!res.ok) {
					showToast('Не удалось скрыть обращение');
					if (btn) { btn.disabled = false; btn.textContent = 'Скрыть'; }
					return;
				}
				// Перерисовать список, чтобы корректно обновился счётчик и пустое состояние
				loadFeedbackHistory();
			} catch {
				showToast('Ошибка сети');
				if (btn) { btn.disabled = false; btn.textContent = 'Скрыть'; }
			}
		}
