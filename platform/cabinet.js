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
			const uAva = document.getElementById('u-ava');
			const savedAva = localStorage.getItem(Auth._userKey('user_avatar'));
			if (savedAva) {
				const safeAva = String(savedAva).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
				uAva.innerHTML = `<img src="${safeAva}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
			} else {
				uAva.textContent = displayName.charAt(0).toUpperCase();
			}
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
			overlay.innerHTML = '<div class="farewell-emoji">👋</div><div class="farewell-text">До встречи!</div><div class="farewell-sub">Возвращайтесь — мы ждём вас</div>';
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
			if (document.getElementById('panel-favorites') && document.getElementById('panel-favorites').classList.contains('active')) renderFavorites();
		}).catch(function() {});
		_cabAccess.then(function() {
			return Notes.load();
		}).then(function() {
			if (document.getElementById('panel-notes') && document.getElementById('panel-notes').classList.contains('active')) renderNotesList();
		}).catch(function() {});
		_cabAccess.then(function() {
			return Plate.load();
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
				var uAva = document.getElementById('u-ava');
				if (uAva) uAva.innerHTML = '<img src="' + freshAva + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
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
			var uAva = document.getElementById('u-ava');
			if (uAva && !localStorage.getItem(Auth._userKey('user_avatar'))) {
				uAva.textContent = (val || user.email || '?').charAt(0).toUpperCase();
			}
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
				const uAva = document.getElementById('u-ava');
				if (uAva) uAva.innerHTML = '<img src="' + dataUrl + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
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
			if (slider) slider.style.transform = on ? 'translateX(20px)' : 'translateX(0)';
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

		async function loadSubscription() {
			try {
				const res = await Auth.api('/subscription');
				if (!res.ok) return;
				const data = await res.json();
				const wrap = document.getElementById('sub-status-wrap');
				const badge = data.status || 'none';
				const badgeClass = ['trial', 'active'].includes(badge) ? badge : 'expired';
				const label = SUB_LABELS[badge] || 'Нет подписки';
				let untilStr = '';
				if (badge === 'active' && data.activeUntil) {
					untilStr = 'Активна до ' + new Date(data.activeUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
				}
				var earlyBadge = data.isEarlyBird ? '<span class="sub-badge early-bird">Друг Умной тарелки</span>' : '';
				wrap.innerHTML = '<div class="sub-status-card">'
					+ '<span class="sub-badge ' + badgeClass + '">' + label + '</span>' + earlyBadge
					+ (data.daysLeft !== undefined ? '<div class="sub-days">Осталось: ' + data.daysLeft + ' ' + pluralDays(data.daysLeft) + '</div>' : '')
					+ (untilStr ? '<div class="sub-until">' + untilStr + '</div>' : '')
					+ '</div>';

				// Hide payment section if subscription is active
				if (badge === 'active') {
					var ebCard = document.getElementById('early-bird-card');
					var paySection = document.querySelector('.pay-section');
					if (ebCard) ebCard.style.display = 'none';
					if (paySection) paySection.style.display = 'none';
					loadPaymentHistory();
					return true;
				}
			} catch (e) { /* ignore */ }

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
			var toggleBtn = document.getElementById('pay-toggle-btn');
			var details = document.getElementById('pay-details');
			var block = document.getElementById('pay-pending-block');
			if (!pending) {
				if (block) block.remove();
				if (toggleBtn) toggleBtn.style.display = '';
				return;
			}
			if (toggleBtn) toggleBtn.style.display = 'none';
			if (details) details.style.display = 'none';
			if (!section) return;
			if (!block) {
				block = document.createElement('div');
				block.id = 'pay-pending-block';
				section.insertBefore(block, toggleBtn || section.firstChild);
			}
			var d = pending.created_at ? new Date(pending.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '';
			block.innerHTML = '<div style="padding:14px 16px;border-radius:12px;background:#fff8e1;border:1px solid #ffe082;">'
				+ '<div style="font-size:14px;font-weight:700;color:#7a5a00;margin-bottom:6px">У вас есть платёж на проверке</div>'
				+ '<div style="font-size:13px;color:var(--text-2);line-height:1.5;margin-bottom:10px">'
				+ 'Платёж от ' + escHtml(d) + ' на ' + escHtml(String(pending.amount || '')) + ' ₽ ожидает подтверждения. '
				+ 'Обычно подтверждаем в течение 30 минут.</div>'
				+ '<div style="font-size:13px;color:var(--text-3);line-height:1.5">' + supportContactHtml() + '</div>'
				+ '</div>';
		}

		function _injectHistorySupportNote(parent) {
			var note = document.getElementById('pay-history-support');
			if (!note) {
				note = document.createElement('div');
				note.id = 'pay-history-support';
				note.style.cssText = 'margin-top:14px;font-size:12px;color:var(--text-3);line-height:1.5;text-align:center';
				parent.parentNode.insertBefore(note, parent.nextSibling);
			}
			note.innerHTML = supportContactHtml();
			_injectLegalLinks(note);
		}

		function _injectLegalLinks(after) {
			var legal = document.getElementById('pay-legal-links');
			if (!legal) {
				legal = document.createElement('div');
				legal.id = 'pay-legal-links';
				legal.style.cssText = 'margin-top:8px;font-size:11px;color:#aaa;line-height:1.5;text-align:center';
				legal.innerHTML = '<a href="https://voronova.online/public-offer.html" target="_blank" rel="noopener" style="color:#aaa;text-decoration:underline">Оферта</a>'
					+ ' · '
					+ '<a href="https://voronova.online/personal-data-processing-policy.html" target="_blank" rel="noopener" style="color:#aaa;text-decoration:underline">Политика обработки персональных данных</a>';
				after.parentNode.insertBefore(legal, after.nextSibling);
			}
		}

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
				el.innerHTML = '<div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px">История платежей</div>'
					+ payments.map(function (p) {
						var d = new Date(p.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
						var statusClass = p.status || 'pending';
						var rejectReason = (p.status === 'rejected' && p.admin_comment)
							? '<div class="pay-hist-reject-reason">Причина: ' + escHtml(p.admin_comment) + '</div>'
							: (p.admin_comment ? '<div style="font-size:12px;color:var(--text-2);margin-top:4px">' + escHtml(p.admin_comment) + '</div>' : '');
						return '<div class="pay-hist-item' + (p.status === 'rejected' ? ' rejected' : '') + '">'
							+ '<div><div style="font-size:14px;font-weight:600;color:var(--text)">' + p.amount + ' ₽</div>'
							+ '<div style="font-size:12px;color:var(--text-3);margin-top:2px">' + d
							+ (p.sender_name ? ' · ' + escHtml(p.sender_name) : '') + '</div>'
							+ rejectReason
							+ '</div>'
							+ '<span class="pay-hist-status ' + statusClass + '">' + (PAY_STATUS_LABELS[p.status] || p.status) + '</span>'
							+ '</div>';
					}).join('');
				_injectHistorySupportNote(el);
			} catch (e) { /* ignore */ }
		}

		function togglePaySection() {
			var details = document.getElementById('pay-details');
			var btn = document.getElementById('pay-toggle-btn');
			if (details.style.display === 'none') {
				details.style.display = 'block';
				details.style.animation = 'fadeUp .3s ease both';
				document.querySelector('.pay-steps').style.display = 'flex';
				resetPayWizard();
				btn.textContent = 'Скрыть';
				btn.className = 'btn btn-ghost';
				btn.style.width = '100%';
			} else {
				details.style.display = 'none';
				btn.textContent = 'Оформить подписку';
				btn.className = 'btn btn-orange';
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

		// ── ИСТОРИЯ ТАРЕЛОК ───────────────────────────────────────────────────────
		function renderHistory() {
			const hist = Plate.getHistory();
			const el = document.getElementById('history-body');
			if (!hist.length) {
				el.innerHTML = '<div class="hist-empty">История пока пуста.<br>Сохраните тарелку из главного меню.</div>';
				return;
			}
			el.innerHTML = hist.map((entry, idx) => {
				const d = new Date(entry.date);
				const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
				const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
				const t = entry.totals || {};
				const items = entry.items || [];
				return `<div class="hist-entry" id="he-${idx}">
                <div class="hist-entry-head" onclick="toggleHist(${idx})">
                    <div>
                        <div class="hist-date">${dateStr}, ${timeStr}</div>
                        <div class="hist-macros">${t.kcal || 0} ккал · Б${t.protein || 0} · Ж${t.fat || 0} · У${t.carbs || 0}</div>
                    </div>
                    <span class="hist-arrow">▾</span>
                </div>
                <div class="hist-items">
                    ${items.map(it => `<div class="hist-item">
                        <span class="hist-item-emoji">${it.emoji || '🍴'}</span>
                        <span class="hist-item-name">${it.name}</span>
                        <span class="hist-item-kcal">${it.kcal || 0} ккал</span>
                    </div>`).join('')}
                </div>
            </div>`;
			}).join('');
		}

		function toggleHist(idx) {
			document.getElementById('he-' + idx).classList.toggle('open');
		}

		renderHistory();

		// ── ИЗБРАННЫЕ ─────────────────────────────────────────────────────────────
		function renderFavorites() {
			const ids = Favorites.get();
			const grid = document.getElementById('fav-grid');
			if (!ids.length) {
				grid.innerHTML = '<div class="fav-empty">Нет избранных рецептов.<br>Нажмите ♡ на карточке рецепта.</div>';
				return;
			}
			const dishes = ids.map(id => RECIPES[id]).filter(Boolean);
			if (ids.length && !dishes.length && isContentError()) {
				grid.innerHTML = '<div class="fav-empty" style="text-align:center">' +
					'<div style="font-size:32px;margin-bottom:8px">📡</div>' +
					'Не удалось загрузить рецепты<br>' +
					'<button onclick="location.reload()" style="margin-top:12px;background:var(--accent,#e8734a);color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px">Повторить</button>' +
					'</div>';
				return;
			}
			grid.innerHTML = dishes.map(d => recipeCardHtml(d)).join('');
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
			document.querySelector('.btn-green[onclick="addNote()"]').textContent = 'Сохранить';
			renderNotesList();
		}

		function renderNotesList() {
			const notes = Notes.get();
			const el = document.getElementById('notes-list');
			if (!notes.length) { el.innerHTML = ''; return; }
			const plural = n => n === 1 ? '1 заметка' : n <= 4 ? n + ' заметки' : n + ' заметок';
			el.innerHTML = `<div style="font-size:13px;color:var(--text-3);font-weight:600;margin-bottom:14px">${plural(notes.length)}</div>` +
				notes.map(n => {
					const d = new Date(n.updated || n.date);
					const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
					const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
					return `<div class="hist-entry" id="note-${n.id}">
                    <div class="hist-entry-head" onclick="toggleNote(${n.id})">
                        <div>
                            <div class="hist-date">${n.title}</div>
                            <div class="hist-macros">${dateStr} · ${timeStr}</div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px">
                            <button style="font-size:12px;color:var(--accent);background:none;border:none;cursor:pointer;padding:4px"
                                onclick="event.stopPropagation();editNote(${n.id})">Изменить</button>
                            <button style="font-size:12px;color:var(--text-3);background:none;border:none;cursor:pointer;padding:4px"
                                onclick="event.stopPropagation();deleteNote(${n.id})">✕</button>
                            <span class="hist-arrow">▾</span>
                        </div>
                    </div>
                    <div class="hist-items" style="white-space:pre-wrap;font-size:13px;color:var(--text-2);line-height:1.6">${escHtml(n.text)}</div>
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
			document.querySelector('.btn-green[onclick="addNote()"]').textContent = 'Обновить';
			document.getElementById('notes-ta').scrollIntoView({ behavior: 'smooth', block: 'start' });
			document.getElementById('notes-ta').focus();
		}
		function deleteNote(id) {
			Notes.remove(id);
			if (editingNoteId === id) { editingNoteId = null; document.getElementById('notes-ta').value = ''; }
			renderNotesList();
		}
		function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

		function imgFallback(img, emoji) {
			img.onerror = null;
			img.style.display = 'none';
			var d = document.createElement('div');
			d.className = 'recipe-card-emoji';
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
				body.innerHTML = '<div class="plate-empty"><div class="plate-empty-icon">🍽️</div><div class="plate-empty-text">Тарелка пока пуста</div></div>';
			} else {
				const t = Plate.totals();
				body.innerHTML = '<div class="plate-items">' +
					items.map((item, i) => `<div class="plate-item">
                    ${item.photo
						? `<img class="plate-item-photo" src="${item.photo}" alt="">`
						: `<div class="plate-item-emoji">${item.emoji || '🍴'}</div>`}
                    <div class="plate-item-info"><div class="plate-item-name">${item.name}</div>
                    <div class="plate-item-kcal">${item.kcal} ккал · Б${item.protein}г · Ж${item.fat}г · У${item.carbs}г</div></div>
                    <button class="plate-item-del" onclick="removePlateItem(${i})">✕</button>
                </div>`).join('') + '</div>' +
					`<div class="plate-total-block" style="margin-top:12px">
                    <div class="plate-total-title">Итого</div>
                    <div class="plate-total-val">${t.kcal} ккал | Б: ${t.protein}г | Ж: ${t.fat}г | У: ${t.carbs}г${t.fiber ? ' | Кл: ' + t.fiber + 'г' : ''}</div>
                </div>
                <div style="display:flex;gap:8px;margin-top:10px">
                    <button class="btn btn-orange" style="flex:1" onclick="location.href='index.html'">← На главную</button>
                    <button class="btn btn-ghost" style="flex-shrink:0" onclick="shareShoppingList()">📤 Список продуктов</button>
                </div>`;
			}
			document.getElementById('plate-overlay').classList.add('active');
			document.body.style.overflow = 'hidden';
		}
		function closePlate() {
			document.getElementById('plate-overlay').classList.remove('active');
			document.body.style.overflow = '';
		}
		function closePlateIfOutside(e) {
			if (e.target === document.getElementById('plate-overlay')) closePlate();
		}
		function removePlateItem(i) { Plate.remove(i); updatePlateIcon(); openPlate(); }

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
				}
			} catch {
				el.innerHTML = '';
			}
		}

		function renderFeedbackHistory(all) {
			const el = document.getElementById('fb-sent-list');
			if (!all || !all.length) { el.innerHTML = ''; return; }
			const counter = all.length + ' ' + (all.length === 1 ? 'обращение' : all.length < 5 ? 'обращения' : 'обращений');
			el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
				+ '<div style="font-size:14px;font-weight:700;color:var(--text)">Ваши обращения</div>'
				+ '<span style="font-size:12px;color:var(--text-3);font-weight:600">' + counter + '</span></div>'
				+ all.map(f => {
					const d = new Date(f.created_at);
					const ds = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
					const ts = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
					const badgeCls = FB_BADGE[f.category] || 'fb-badge-wish';
					const statusHtml = f.status === 'answered'
						? '<div class="fb-ticket-status fb-st-answered">Ответ получен</div>'
						: '<div class="fb-ticket-status fb-st-new">На рассмотрении</div>';
					let replyHtml = '';
					if (f.admin_reply) {
						const rd = new Date(f.admin_replied_at);
						const rds = rd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
						const rts = rd.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
						replyHtml = '<div class="fb-reply">'
							+ '<img class="fb-reply-mark" src="' + SITE_BASE + '/images/YV-blog.webp" alt="Юлия Воронова">'
							+ '<div class="fb-reply-body">'
							+ '<div class="fb-reply-title">Ответ Юлии</div>'
							+ '<p>' + escHtml(f.admin_reply) + '</p>'
							+ '<time>' + rds + ', ' + rts + '</time>'
							+ '</div></div>';
					}
					return '<article class="fb-ticket">'
						+ '<div class="fb-ticket-head">'
						+ '<span class="fb-badge ' + badgeCls + '">' + (FB_LABELS[f.category] || f.category) + '</span>'
						+ '<time>' + ds + ', ' + ts + '</time>'
						+ '</div>'
						+ '<p class="fb-ticket-text">' + escHtml(f.text) + '</p>'
						+ statusHtml
						+ replyHtml
						+ '</article>';
				}).join('');
		}
