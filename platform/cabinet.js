		Auth.requireAuth();
		const _cabAccess = Auth.checkAccess();
		loadContent();
		updatePlateIcon();

		// Источник контактов поддержки — единая точка правки.
		// TODO: при росте проекта заменить fallbackEmail на support@voronova.online
		// или подключить Tawk.to (заполнить url).
		const SUPPORT_CONTACT = {
			label: 'чат поддержки',
			text: 'Написать в чат поддержки',
			url: '#',
			fallbackEmail: 'hello@voronova.online'
		};
		function _supportEmailHref() { return 'mailto:' + SUPPORT_CONTACT.fallbackEmail; }
		function supportContactHtml() {
			const hasChat = SUPPORT_CONTACT.url && SUPPORT_CONTACT.url !== '#';
			const email = SUPPORT_CONTACT.fallbackEmail;
			const emailLink = '<a href="' + _supportEmailHref() + '" style="color:var(--accent);text-decoration:underline">' + email + '</a>';
			if (hasChat) {
				const chatLink = '<a href="' + SUPPORT_CONTACT.url + '" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">' + SUPPORT_CONTACT.text + '</a>';
				return 'Если оплата не подтвердилась или возник вопрос — ' + chatLink + '. Если чат недоступен, напишите на ' + emailLink + '.';
			}
			return 'Если оплата не подтвердилась или возник вопрос — напишите на ' + emailLink + '.';
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
			if (wrap && !wrap.contains(e.target)) document.getElementById('user-dropdown').classList.remove('open');
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
				const safeAva = String(savedAva).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
				avaEl.innerHTML = `<img src="${safeAva}" alt="avatar">`;
			} else {
				avaEl.textContent = profileName.charAt(0).toUpperCase();
			}
		}

		// After checkAccess, sync favorites + notes from server then re-sync displayName + avatar
		_cabAccess.then(function() {
			return Favorites.load();
		}).then(function() {
			if (typeof renderCabSummaryStats === 'function') renderCabSummaryStats();
			if (document.getElementById('panel-favorites') && document.getElementById('panel-favorites').classList.contains('active')) renderFavorites();
		}).catch(function() {});
		_cabAccess.then(function() {
			return Notes.load();
		}).then(function() {
			if (document.getElementById('panel-notes') && document.getElementById('panel-notes').classList.contains('active')) renderNotesList();
		}).catch(function() {});
		_cabAccess.then(function() {
			return Plate.load();
		}).then(function() {
			if (typeof renderCabSummaryStats === 'function') renderCabSummaryStats();
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
				document.getElementById('cab-ava').innerHTML = '<img src="' + freshAva + '" alt="avatar">';
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
			Auth.api('/auth/profile', { method: 'PUT', body: JSON.stringify({ displayName: val }) }).then(function(res) {
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

		function handleAvatarUpload(input) {
			const file = input.files[0];
			if (!file) return;
			const img = new Image();
			img.onload = function() {
				// Resize to max 200x200 to keep base64 small
				const MAX = 200;
				let w = img.width, h = img.height;
				if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
				else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
				const canvas = document.createElement('canvas');
				canvas.width = w; canvas.height = h;
				canvas.getContext('2d').drawImage(img, 0, 0, w, h);
				const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
				// Save locally
				Auth.setAvatar(dataUrl);
				// Update UI
				document.getElementById('cab-ava').innerHTML = '<img src="' + dataUrl + '" alt="avatar">';
				Auth.renderAvatar(document.getElementById('u-ava'));
				// Save to server
				Auth.api('/auth/profile', { method: 'PUT', body: JSON.stringify({ avatar: dataUrl }) }).then(function(res) {
					if (!res.ok) console.error('Avatar save failed:', res.status);
				}).catch(function(e) { console.error('Avatar save error:', e); });
				input.value = '';
			};
			img.src = URL.createObjectURL(file);
		}

		function saveWeight(v) {
			const n = parseFloat(v);
			if (n >= 30 && n <= 300) {
				localStorage.setItem(Auth._userKey('user_weight'), n);
				updateWaterNorm(n);
			}
		}
		// ── Newsletter toggle ─────────────────────────────
		(async function loadNewsletterState() {
			try {
				const res = await Auth.api('/subscription/newsletter');
				if (!res.ok) return;
				const data = await res.json();
				const cb = document.getElementById('newsletter-toggle');
				if (cb) {
					cb.checked = data.subscribed;
					updateNlSlider(data.subscribed);
				}
			} catch(e) {}
		})();

		function updateNlSlider(on) {
			const slider = document.getElementById('nl-slider');
			const bg = slider?.parentElement?.querySelector('span');
			// toggle 56×28 (border 1.5px) + thumb 22×22 at left:2 → ход = 56 - 22 - 2*2 = 30px
			if (slider) slider.style.transform = on ? 'translateX(30px)' : 'translateX(0)';
			if (bg) bg.style.background = on ? 'var(--accent)' : '#ccc';
		}

		async function toggleNewsletter(checked) {
			updateNlSlider(checked);
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

		function updateWaterNorm(w) {
			const norm = document.getElementById('water-norm');
			const val = document.getElementById('water-val');
			if (!norm || !val) return;
			const ml = Math.round(w * 30);
			const liters = (ml / 1000).toFixed(1);
			val.textContent = ml >= 1000 ? liters + ' л' : ml + ' мл';
			norm.style.display = 'block';
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

		// ── TABS ──────────────────────────────────────────────────────────────────
		function switchTab(name, btn) {
			document.querySelectorAll('.cab-tab').forEach(b => b.classList.remove('active'));
			document.querySelectorAll('.cab-tab-panel').forEach(p => p.classList.remove('active'));
			btn.classList.add('active');
			document.getElementById('panel-' + name).classList.add('active');
			if (name === 'subscription') loadSubscription();
			if (name === 'history') renderHistory();
			if (name === 'favorites') renderFavorites();
			if (name === 'notes') loadNotes();
			if (name === 'feedback') loadFeedbackHistory();
		}

		// Handle ?tab= query param (e.g. from paywall redirect)
		(function() {
			var params = new URLSearchParams(location.search);
			var tab = params.get('tab');
			if (tab) {
				var tabBtn = document.querySelector('.cab-tab[onclick*="' + tab + '"]');
				if (tabBtn) switchTab(tab, tabBtn);
			}
		})();

		// ── ПОДПИСКА ──────────────────────────────────────────────────────────────
		const SUB_LABELS = { trial: 'Пробный период', active: 'Активна', expired: 'Истекла' };

		function renderFallbackSubCard() {
			var wrap = document.getElementById('sub-status-wrap');
			if (!wrap) return;
			const ctaText = 'Оформить подписку';
			wrap.innerHTML = '<div class="sub-card">'
				+ '<div>'
				+ '<div class="sub-status-row"><span class="status-pill expired">Нет подписки</span></div>'
				+ '<h3 class="sub-headline">Доступ к&nbsp;рецептам</h3>'
				+ '<div class="sub-active-until">Оформите подписку, чтобы открыть все рецепты и&nbsp;сайдбар БЖУ.</div>'
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
				const label = SUB_LABELS[badge] || 'Нет подписки';
				const earlyBadge = data.isEarlyBird ? '<span class="sub-badge early-bird">Друг Умной тарелки</span>' : '';
				let untilStr = '';
				if (data.activeUntil) {
					untilStr = new Date(data.activeUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
				}
				// Editorial sub-card: status pill + plan text + serif headline + until date + actions col
				const headlineHtml = data.daysLeft !== undefined
					? '<h3 class="sub-headline">Осталось&nbsp;<b>' + data.daysLeft + '&nbsp;' + pluralDays(data.daysLeft) + '</b></h3>'
					: '<h3 class="sub-headline">' + escHtml(label) + '</h3>';
				const untilHtml = untilStr
					? '<div class="sub-active-until">Доступ к рецептам и&nbsp;сайдбару БЖУ — до&nbsp;<b>' + escHtml(untilStr) + '</b></div>'
					: '';
				const planText = badge === 'active' ? 'Тариф «Месяц»' : (badge === 'trial' ? 'Пробный период' : '');
				const planHtml = planText ? '<span class="sub-plan">' + escHtml(planText) + '</span>' : '';
				const ctaText = badge === 'active' ? 'Продлить подписку' : 'Оформить подписку';
				const actionsHtml = '<div class="sub-actions-col">'
					+ '<button type="button" id="sub-renew-btn" class="btn btn-orange sub-action-btn" '
					+ 'data-cta-default="' + escHtml(ctaText) + '" onclick="togglePaySection()">'
					+ escHtml(ctaText) + '</button>'
					+ '</div>';
				wrap.innerHTML = '<div class="sub-card">'
					+ '<div>'
					+ '<div class="sub-status-row"><span class="status-pill' + pillClass + '">' + escHtml(label) + '</span>' + planHtml + earlyBadge + '</div>'
					+ headlineHtml + untilHtml
					+ '</div>'
					+ actionsHtml
					+ '</div>';

				// For active subscription: hide early-bird, keep pay-section accessible (renewal via sub-renew-btn)
				if (badge === 'active') {
					var ebCard = document.getElementById('early-bird-card');
					if (ebCard) ebCard.style.display = 'none';
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
			var p = _pricePerMonth;
			var plans = [
				{ months: 1, label: '1 месяц', amount: p },
				{ months: 3, label: '3 месяца', amount: p * 3 },
				{ months: 6, label: '6 месяцев', amount: p * 6, badge: null },
				{ months: 12, label: '12 месяцев', amount: p * 12, badge: null }
			];
			var grid = document.getElementById('pay-plan-grid');
			grid.innerHTML = plans.map(function(pl) {
				var perMonth = Math.round(pl.amount / pl.months);
				var badgeHtml = pl.badge ? '<div class="pay-plan-badge">' + pl.badge + '</div>' : '';
				return '<div class="pay-plan-card" onclick="selectPlan(' + pl.months + ',' + pl.amount + ',this)">'
					+ badgeHtml
					+ '<div class="pay-plan-duration">' + pl.label + '</div>'
					+ '<div class="pay-plan-price">' + pl.amount + ' ₽</div>'
					+ (pl.months > 1 ? '<div class="pay-plan-permonth">' + perMonth + ' ₽/мес</div>' : '')
					+ '</div>';
			}).join('');
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
				document.getElementById('pay-success').style.display = 'block';
				clearScreenshot();
				loadPaymentHistory();
				startPaymentPolling();
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
							var ret = _getCabReturn();
							if (ret) {
								sessionStorage.removeItem('_cab_return_url');
								if (typeof showToast === 'function') showToast('Доступ открыт — возвращаемся к рецепту', 1800);
								setTimeout(function() { location.href = ret; }, 1500);
								return;
							}
						}
						// Refresh subscription status — payment was confirmed or rejected
						Auth.checkAccess();
					}
				} catch(e) { /* ignore */ }
			}, 15000);
		}
		function stopPaymentPolling() {
			if (_payPollTimer) { clearInterval(_payPollTimer); _payPollTimer = null; }
		}

		function _renderPendingBlock(pending) {
			var section = document.querySelector('.pay-section');
			var details = document.getElementById('pay-details');
			var cardBtn = document.getElementById('sub-renew-btn');
			var block = document.getElementById('pay-pending-block');
			if (!pending) {
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
			// Pending — блокируем in-card CTA + сворачиваем wizard
			if (cardBtn) {
				cardBtn.disabled = true;
				cardBtn.style.opacity = '.55';
				cardBtn.style.cursor = 'not-allowed';
				cardBtn.style.pointerEvents = 'none';
				cardBtn.title = 'Дождитесь подтверждения текущего платежа';
			}
			if (details) details.style.display = 'none';
			if (!section) return;
			if (!block) {
				block = document.createElement('div');
				block.id = 'pay-pending-block';
				section.insertBefore(block, section.firstChild);
			}
			var d = pending.created_at ? new Date(pending.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '';
			block.innerHTML = '<div class="pay-pending-card">'
				+ '<div class="pay-pending-eyebrow">Платёж на проверке</div>'
				+ '<div class="pay-pending-text">Платёж от&nbsp;<b>' + escHtml(d) + '</b> на&nbsp;<b>' + escHtml(String(pending.amount || '')) + '&nbsp;₽</b> ожидает подтверждения. Обычно подтверждаем в&nbsp;течение 30&nbsp;минут.</div>'
				+ '<div class="pay-pending-support">' + supportContactHtml() + '</div>'
				+ '</div>';
		}

		function _injectHistorySupportNote(parent) {
			var note = document.getElementById('pay-history-support');
			if (!note) {
				note = document.createElement('div');
				note.id = 'pay-history-support';
				note.className = 'cab-support-note';
				note.style.cssText = 'margin-top:32px';
				parent.parentNode.insertBefore(note, parent.nextSibling);
			}
			var hasChat = SUPPORT_CONTACT.url && SUPPORT_CONTACT.url !== '#';
			var btnHtml = hasChat
				? '<button type="button" class="btn btn-ghost" onclick="openTawk()" style="padding:12px 22px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;border-radius:0;font-size:11px;white-space:nowrap">Написать в&nbsp;поддержку</button>'
				: '';
			note.innerHTML = '<div class="cab-support-note-text">' + supportContactHtml() + '</div>' + btnHtml;
			_injectLegalLinks(note);
		}

		function _injectLegalLinks(after) {
			var legal = document.getElementById('pay-legal-links');
			if (!legal) {
				legal = document.createElement('div');
				legal.id = 'pay-legal-links';
				legal.style.cssText = 'margin-top:8px;font-size:11px;color:#aaa;line-height:1.5;text-align:center';
				var policyLink = '<a href="https://voronova.online/personal-data-processing-policy.html" target="_blank" rel="noopener" style="color:#aaa;text-decoration:underline">Политика обработки персональных данных</a>';
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
			var policy = '<a href="https://voronova.online/personal-data-processing-policy.html" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">политикой обработки персональных данных</a>';
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
			note.innerHTML = supportContactHtml();
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
				// Auto-start polling if there are pending payments
				if (pending && !_payPollTimer) startPaymentPolling();
				// Pending-блокировка wizard (либо снятие блокировки)
				_renderPendingBlock(pending);
				var el = document.getElementById('pay-history');
				if (!payments.length) { el.innerHTML = ''; _injectHistorySupportNote(el); return; }
				var payCount = payments.length;
				var payMeta = payCount + ' ' + (payCount === 1 ? 'операция' : payCount < 5 ? 'операции' : 'операций');
				el.innerHTML = '<div class="cab-sec-title-row" style="margin-top:36px">'
					+ '<h2 class="cab-sec-title">История платежей</h2>'
					+ '<span class="cab-sec-title-meta">' + payMeta + '</span></div>'
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
					+ '</div>';
				_injectHistorySupportNote(el);
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
				setTimeout(function () { details.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 80);
			} else {
				details.style.display = 'none';
				if (btn) { btn.textContent = 'Оформить подписку'; btn.className = 'btn btn-orange'; }
				if (cardBtn) cardBtn.textContent = cardBtn.dataset.ctaDefault || 'Оформить подписку';
			}
		}

		var _pricePerMonth = 250; // стандартная цена, обновится из early-bird

		function pluralMonths(n) {
			var abs = Math.abs(n) % 100;
			var n1 = abs % 10;
			if (abs > 10 && abs < 20) return 'месяцев';
			if (n1 > 1 && n1 < 5) return 'месяца';
			if (n1 === 1) return 'месяц';
			return 'месяцев';
		}

		async function loadEarlyBird() {
			// Не показывать early-bird если подписка активна
			if (Auth._subStatus === 'active') return;
			try {
				var res = await fetch(API_BASE + '/subscription/early-bird');
				if (!res.ok) return;
				var data = await res.json();
				if (data.active && data.remaining > 0) {
					document.getElementById('early-bird-card').style.display = 'block';
					document.getElementById('early-bird-remaining').textContent = data.remaining;
					_pricePerMonth = 100;
				}
			} catch (e) { /* ignore */ }
			renderPlanCards();
		}

		// Load subscription tab on init — wait for checkAccess to set _subStatus
		_cabAccess.then(function() {
			loadSubscription().then(function(isActive) {
				if (!isActive) {
					_renderReturnBanner();
					loadEarlyBird().then(function() {
						// Auto-open payment section if arrived via ?tab=subscription
						if (new URLSearchParams(location.search).get('tab') === 'subscription') {
							var toggleBtn = document.getElementById('pay-toggle-btn');
							if (toggleBtn && document.getElementById('pay-details').style.display === 'none') {
								togglePaySection();
							}
						}
					});
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

		// ── KPI SUMMARY (4 метрики в шапке кабинета) ──────────────────────────────
		function renderCabSummaryStats() {
			const platesEl = document.getElementById('cab-plates-count');
			const favEl = document.getElementById('cab-favorites-count');
			if (platesEl) platesEl.textContent = String(Plate.getHistory().length || 0);
			if (favEl) favEl.textContent = String(Favorites.get().length || 0);
		}

		// ── ИСТОРИЯ ТАРЕЛОК ───────────────────────────────────────────────────────
		function renderHistory() {
			renderCabSummaryStats();
			const hist = Plate.getHistory();
			const el = document.getElementById('history-body');
			if (!hist.length) {
				el.innerHTML = '<div class="hist-empty"><div class="hist-empty-mark">История пуста</div>Сохраните тарелку из&nbsp;главного меню.</div>';
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
					const chips = [
						Number(t.protein) ? `<span class="macro-chip prot">Б · ${t.protein}</span>` : '',
						Number(t.fat)     ? `<span class="macro-chip fat">Ж · ${t.fat}</span>` : '',
						Number(t.carbs)   ? `<span class="macro-chip carb">У · ${t.carbs}</span>` : '',
						Number(t.fiber)   ? `<span class="macro-chip fib">К · ${t.fiber}</span>` : ''
					].filter(Boolean).join('');
					const itemsHtml = items.map(it => `<div class="meal-item">
						<div class="meal-item-thumb">${escHtml(String(it.emoji || '🍴'))}</div>
						<div class="meal-item-name"><b>${escHtml(String(it.name || ''))}</b></div>
						<div class="meal-item-kcal">${Number(it.kcal) || 0} ккал</div>
					</div>`).join('');
					return `<article class="meal" id="he-${idx}">
						<button class="meal-head" type="button" onclick="toggleHist(${idx})">
							<span class="meal-time">${timeStr}</span>
							<span class="meal-macros">${chips}</span>
							<span class="meal-kcal">${Number(t.kcal) || 0}<small>ккал</small></span>
							<span class="meal-chev">▾</span>
						</button>
						<div class="meal-body">
							<div class="meal-items">${itemsHtml}</div>
						</div>
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

		function toggleHist(idx) {
			document.getElementById('he-' + idx).classList.toggle('open');
		}

		renderHistory();

		// ── ИЗБРАННЫЕ ─────────────────────────────────────────────────────────────
		let _favFilter = 'all';

		function filterFavs(catId) {
			_favFilter = catId;
			document.querySelectorAll('#fav-filters .fav-chip').forEach(btn => {
				btn.classList.toggle('active', btn.dataset.cat === catId);
			});
			_renderFavGrid();
		}

		function renderFavorites() {
			renderCabSummaryStats();
			const ids = Favorites.get();
			const grid = document.getElementById('fav-grid');
			const filtersEl = document.getElementById('fav-filters');
			if (!ids.length) {
				if (filtersEl) filtersEl.innerHTML = '';
				grid.innerHTML = '<div class="fav-empty">Нет избранных рецептов.<br>Нажмите ♡ на карточке рецепта.</div>';
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
						`<button class="fav-chip${_favFilter === c.id ? ' active' : ''}" data-cat="${escHtml(c.id)}" type="button" onclick="filterFavs('${escHtml(c.id)}')">${escHtml(c.name)}</button>`
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
				? `<img src="${_photo}" alt="${_name}" loading="lazy" onerror="imgFallback(this,'${_emoji}','fav-card-media-placeholder')"${_imgPos ? ` style="object-position:${_imgPos}"` : ''}>`
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
			return `<article class="fav-card" role="button" tabindex="0"
					onclick="goToRecipe('${_id}')"
					onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();goToRecipe('${_id}')}">
				<div class="fav-card-media">
					${photoHtml}
					${catName ? `<div class="fav-card-eyebrow">${catName}</div>` : ''}
					<button class="fav-card-bookmark active" type="button" id="fav-${_id}"
						onclick="event.stopPropagation();toggleFav('${_id}')" aria-label="Убрать из избранного">♥</button>
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
							<button type="button" onclick="editNote(${n.id})">Изменить</button>
							<button type="button" class="del" onclick="deleteNote(${n.id})">Удалить</button>
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
			document.getElementById('notes-ta').scrollIntoView({ behavior: 'smooth', block: 'start' });
			document.getElementById('notes-ta').focus();
		}
		function deleteNote(id) {
			Notes.remove(id);
			if (editingNoteId === id) { editingNoteId = null; document.getElementById('notes-ta').value = ''; }
			renderNotesList();
		}
		function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

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
				? `<img src="${_photo}" alt="${_name}" loading="lazy" onerror="imgFallback(this,'${_emoji}')"${_imgPos ? ` style="object-position:${_imgPos}"` : ''}>`
				: `<div class="recipe-card-emoji">${_emoji}</div>`;
			return `<button class="recipe-card" onclick="goToRecipe('${_id}')">
            <div class="recipe-card-photo" style="position:relative">
                ${photoHtml}
                <div class="card-fav-btn${isFav ? ' active' : ''}" id="fav-${_id}"
                    onclick="event.stopPropagation();toggleFav('${_id}')">
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

		// ── PLATE ─────────────────────────────────────────────────────────────────
		function openPlate() {
			const items = Plate.get();
			const body = document.getElementById('plate-body');
			if (!items.length) {
				body.innerHTML = `<div class="pv1-empty">
                <div class="pv1-eyebrow">Пока пусто</div>
                <h2 class="pv1-headline">Соберите первый приём пищи</h2>
                <div class="pv1-divider"></div>
                <p class="pv1-sub">Выберите рецепт из категории — и он попадёт сюда. КБЖУ пересчитаются автоматически.</p>
                <button class="pv1-cta" onclick="closePlate();location.href='index.html'">К рецептам →</button>
            </div>`;
			} else {
				const t = Plate.totals();
				const list = items.map((item, i) => `<div class="pv1-item">
                    ${item.photo
						? `<img class="pv1-item-photo" src="${escHtml(String(item.photo))}" alt="">`
						: `<div class="pv1-item-emoji">${escHtml(String(item.emoji || '🍴'))}</div>`}
                    <div class="pv1-item-main">
                        <div class="pv1-item-name">${escHtml(String(item.name || ''))}</div>
                        <div class="pv1-item-meta">${Number(item.kcal) || 0} ккал · Б ${Number(item.protein) || 0} · Ж ${Number(item.fat) || 0} · У ${Number(item.carbs) || 0} · Кл ${Number(item.fiber) || 0}</div>
                    </div>
                    <button class="pv1-item-del" onclick="removePlateItem(${Number(i)})" aria-label="Удалить"><svg class="icon-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="5" y1="19" x2="19" y2="5"/></svg></button>
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
                <div class="pv1-actions">
                    <div class="pv1-actions-row">
                        <button class="pv1-btn" onclick="location.href='index.html'">← На главную</button>
                        <button class="pv1-btn" onclick="shareShoppingList()">Список продуктов</button>
                    </div>
                    <button class="pv1-btn pv1-btn-primary pv1-btn-full" onclick="savePlateCabinet()">Сохранить в историю</button>
                </div>`;
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
		function savePlateCabinet() {
			if (!Plate.count()) return;
			Plate.saveHistory();
			updatePlateIcon();
			renderHistory();
			closePlate();
			if (typeof showToast === 'function') showToast('Тарелка сохранена в историю 🎉');
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
					alert(data.error || 'Ошибка отправки');
					btn.disabled = false; btn.textContent = 'Отправить';
					return;
				}
				document.getElementById('fb-text').value = '';
				btn.disabled = false; btn.textContent = 'Отправить';
				loadFeedbackHistory();
			} catch {
				alert('Ошибка сети');
				btn.disabled = false; btn.textContent = 'Отправить';
			}
		}

		// Загрузить счётчик непрочитанных ответов для бейджа (при загрузке страницы)
		async function loadFeedbackBadge() {
			try {
				const res = await Auth.api('/feedback');
				if (!res.ok) return;
				const all = await res.json();
				const unseen = all.filter(f => f.status === 'answered' && !f.reply_seen).length;
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
				// Пометить ответы как просмотренные
				const hasUnseen = all.some(f => f.status === 'answered' && !f.reply_seen);
				if (hasUnseen) {
					Auth.api('/feedback/mark-seen', { method: 'POST' }).catch(() => {});
					document.getElementById('fb-unseen-badge').style.display = 'none';
					// Снять глобальный индикатор «новый ответ Юлии» в шапке.
					if (typeof Feedback !== 'undefined' && Feedback.clear) Feedback.clear();
				}
			} catch {
				el.innerHTML = '';
			}
		}

		// Maps API category → thread tag CSS class + display label
		const FB_THREAD_TAG = { wish: 'wish', recipe: 'idea', problem: 'bug' };
		const FB_THREAD_LABEL = { wish: 'Пожелание', recipe: 'Идея', problem: 'Проблема' };

		function renderFeedbackHistory(all) {
			const el = document.getElementById('fb-sent-list');
			if (!all || !all.length) {
				el.innerHTML = '<div class="threads-empty">'
					+ '<div class="threads-empty-mark">Пока пусто</div>'
					+ '<h3 class="threads-empty-title">Здесь появятся ваши обращения</h3>'
					+ '<p>Напишите Юлии в&nbsp;форме выше&nbsp;— пожелание, идею рецепта или сообщение о&nbsp;проблеме. Ответ придёт сюда и&nbsp;на&nbsp;почту.</p>'
					+ '</div>';
				return;
			}
			const n = all.length;
			const counter = n + ' ' + (n === 1 ? 'обращение' : n < 5 ? 'обращения' : 'обращений');
			const head = '<div class="threads-head"><h3 class="threads-title">Ваши обращения</h3><span class="threads-meta">' + counter + '</span></div>';
			el.innerHTML = head + all.map(f => {
				const d = new Date(f.created_at);
				const ds = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
				const ts = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
				const tagCls = FB_THREAD_TAG[f.category] || 'wish';
				const tagLabel = FB_THREAD_LABEL[f.category] || (FB_LABELS[f.category] || f.category);
				const statusHtml = f.status === 'answered'
					? ''
					: '<div class="thread-status wait">На рассмотрении</div>';
				let replyHtml = '';
				if (f.admin_reply) {
					const rd = new Date(f.admin_replied_at);
					const rds = rd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
					const rts = rd.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
					// «Прочитано Юлией» — используем admin_replied_at как момент прочтения
					// (если есть ответ, значит сообщение прочитано). Для отдельного read-state
					// backend должен отдавать read_at/viewed_at — сейчас этого поля нет.
					const readMark = '<div class="thread-reply-foot">'
						+ '<span class="thread-read">'
						+ '<svg viewBox="0 0 18 12"><path d="M0 6.4l1.4-1.4L5 8.6 11.6 2l1.4 1.4L5 11.4 0 6.4zm9 0l1.4-1.4 2.6 2.6L18 2l-.4 1.4-7 7L9 6.4z"/></svg>'
						+ 'Прочитано Юлией'
						+ '</span>'
						+ '<span class="thread-read when">· ' + rds + ', ' + rts + '</span>'
						+ '</div>';
					replyHtml = '<div class="thread-reply">'
						+ '<div class="thread-reply-head">'
						+ '<div class="thread-reply-ava"><img src="' + SITE_BASE + '/images/YV-blog.webp" alt="Юлия Воронова"></div>'
						+ '<span class="thread-reply-name">Ответ Юлии</span>'
						+ '<span class="thread-reply-date">' + rds + ', ' + rts + '</span>'
						+ '</div>'
						+ '<p class="thread-reply-text">' + escHtml(f.admin_reply) + '</p>'
						+ readMark
						+ '</div>';
				}
				return '<article class="thread" data-fb-id="' + f.id + '">'
					+ '<div class="thread-head">'
					+ '<span class="thread-tag ' + tagCls + '">' + tagLabel + '</span>'
					+ statusHtml
					+ '<span class="thread-date">' + ds + ', ' + ts + '</span>'
					+ '<button type="button" class="thread-hide" title="Скрыть обращение" aria-label="Скрыть обращение" onclick="hideFeedback(' + f.id + ', this)">Скрыть</button>'
					+ '</div>'
					+ '<p class="thread-msg">' + escHtml(f.text) + '</p>'
					+ replyHtml
					+ '</article>';
			}).join('');
		}

		async function hideFeedback(id, btn) {
			if (!confirm('Скрыть это обращение из списка? В базе оно сохранится, но вы его больше не увидите.')) return;
			if (btn) { btn.disabled = true; btn.textContent = '...'; }
			try {
				const res = await Auth.api('/feedback/' + id, { method: 'DELETE' });
				if (!res.ok) {
					alert('Не удалось скрыть обращение');
					if (btn) { btn.disabled = false; btn.textContent = 'Скрыть'; }
					return;
				}
				// Перерисовать список, чтобы корректно обновился счётчик и пустое состояние
				loadFeedbackHistory();
			} catch {
				alert('Ошибка сети');
				if (btn) { btn.disabled = false; btn.textContent = 'Скрыть'; }
			}
		}
