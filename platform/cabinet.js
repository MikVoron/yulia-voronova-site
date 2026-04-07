		Auth.requireAuth();
		const _cabAccess = Auth.checkAccess();
		loadContent();
		updatePlateIcon();

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
				uAva.innerHTML = `<img src="${savedAva}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
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
				avaEl.innerHTML = `<img src="${savedAva}" alt="avatar">`;
			} else {
				avaEl.textContent = profileName.charAt(0).toUpperCase();
			}
		}

		// After checkAccess, sync favorites from server then re-sync displayName + avatar
		_cabAccess.then(function() {
			return Favorites.load();
		}).then(function() {
			if (document.getElementById('panel-favorites') && document.getElementById('panel-favorites').classList.contains('active')) renderFavorites();
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
			const num = document.getElementById('pay-card-num').textContent.replace(/\s/g, '');
			navigator.clipboard.writeText(num).then(function () {
				const btn = event.target;
				btn.textContent = 'Скопировано!';
				setTimeout(function () { btn.textContent = 'Скопировать номер'; }, 1500);
			});
		}

		// Set default date to today
		// Set default datetime to now
		(function() {
			var now = new Date();
			now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
			document.getElementById('pay-date').value = now.toISOString().slice(0, 16);
		})();

		// Screenshot preview
		var _screenshotData = null;
		function previewScreenshot(input) {
			const file = input.files[0];
			if (!file) return;
			if (file.size > 5 * 1024 * 1024) {
				document.getElementById('pay-error').textContent = 'Файл слишком большой (макс. 5 МБ)';
				document.getElementById('pay-error').style.display = 'block';
				input.value = '';
				return;
			}
			const reader = new FileReader();
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

		async function submitPayment() {
			const amount = parseInt(document.getElementById('pay-amount').value);
			const paymentDate = document.getElementById('pay-date').value;
			const comment = document.getElementById('pay-comment').value.trim();

			const errEl = document.getElementById('pay-error');
			errEl.style.display = 'none';

			if (!amount || amount <= 0) { errEl.textContent = 'Укажите сумму'; errEl.style.display = 'block'; return; }
			if (!paymentDate) { errEl.textContent = 'Укажите дату перевода'; errEl.style.display = 'block'; return; }

			const btn = document.getElementById('pay-submit-btn');
			btn.disabled = true; btn.textContent = 'Отправка...';

			try {
				const body = { amount, paymentDate, comment };
				if (_screenshotData) body.screenshot = _screenshotData;
				const res = await Auth.api('/subscription/payment', {
					method: 'POST',
					body: JSON.stringify(body)
				});
				const data = await res.json();
				if (!res.ok) { errEl.textContent = data.error || 'Ошибка'; errEl.style.display = 'block'; btn.disabled = false; btn.textContent = 'Я оплатил'; return; }
				document.getElementById('pay-form').style.display = 'none';
				document.getElementById('pay-success').style.display = 'block';
				clearScreenshot();
				loadPaymentHistory();
			} catch (e) {
				errEl.textContent = 'Ошибка сети'; errEl.style.display = 'block';
			}
			btn.disabled = false; btn.textContent = 'Я оплатил';
		}

		const PAY_STATUS_LABELS = { pending: 'На проверке', confirmed: 'Подтверждён', rejected: 'Отклонён' };

		async function loadPaymentHistory() {
			try {
				const res = await Auth.api('/subscription/payments');
				if (!res.ok) return;
				const payments = await res.json();
				const el = document.getElementById('pay-history');
				if (!payments.length) { el.innerHTML = ''; return; }
				el.innerHTML = '<div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px">История платежей</div>'
					+ payments.map(function (p) {
						const d = new Date(p.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
						const statusClass = p.status || 'pending';
						return '<div class="pay-hist-item">'
							+ '<div><div style="font-size:14px;font-weight:600;color:var(--text)">' + p.amount + ' ₽</div>'
							+ '<div style="font-size:12px;color:var(--text-3);margin-top:2px">' + d
							+ (p.sender_name ? ' · ' + escHtml(p.sender_name) : '') + '</div>'
							+ (p.admin_comment ? '<div style="font-size:12px;color:var(--text-2);margin-top:4px">' + escHtml(p.admin_comment) + '</div>' : '')
							+ '</div>'
							+ '<span class="pay-hist-status ' + statusClass + '">' + (PAY_STATUS_LABELS[p.status] || p.status) + '</span>'
							+ '</div>';
					}).join('');
			} catch (e) { /* ignore */ }
		}

		function togglePaySection() {
			const details = document.getElementById('pay-details');
			const btn = document.getElementById('pay-toggle-btn');
			if (details.style.display === 'none') {
				details.style.display = 'block';
				details.style.animation = 'fadeUp .3s ease both';
				var user = Auth.getUser();
				if (user && user.email) document.getElementById('pay-sender-display').textContent = user.email;
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

		function updateMonthsCalc() {
			var amount = parseInt(document.getElementById('pay-amount').value) || 0;
			var el = document.getElementById('pay-months-val');
			if (amount <= 0) { el.textContent = '—'; return; }
			var months = Math.floor(amount / _pricePerMonth);
			if (months < 1) { el.textContent = 'менее 1 месяца'; return; }
			el.textContent = months + ' ' + pluralMonths(months);
		}

		document.getElementById('pay-amount').addEventListener('input', function () {
			updateMonthsCalc();
			// снять active с кнопок при ручном вводе
			document.querySelectorAll('.pay-quick-btn').forEach(function (b) { b.classList.remove('active'); });
		});

		function renderQuickBtns() {
			var p = _pricePerMonth;
			var btns = [
				{ label: 'Месяц', amount: p },
				{ label: 'Полгода', amount: p * 6 },
				{ label: 'Год', amount: p * 12 }
			];
			var wrap = document.getElementById('pay-quick-btns');
			wrap.innerHTML = btns.map(function (b) {
				return '<button type="button" class="pay-quick-btn" data-amount="' + b.amount + '">' + b.label + ' · ' + b.amount + ' ₽</button>';
			}).join('');
			wrap.querySelectorAll('.pay-quick-btn').forEach(function (btn) {
				btn.addEventListener('click', function () {
					document.getElementById('pay-amount').value = btn.dataset.amount;
					wrap.querySelectorAll('.pay-quick-btn').forEach(function (b) { b.classList.remove('active'); });
					btn.classList.add('active');
					updateMonthsCalc();
				});
			});
		}

		async function loadEarlyBird() {
			// Не показывать early-bird если подписка активна
			if (Auth._subStatus === 'active') return;
			try {
				const res = await fetch(API_BASE + '/subscription/early-bird');
				if (!res.ok) return;
				const data = await res.json();
				if (data.active && data.remaining > 0) {
					document.getElementById('early-bird-card').style.display = 'block';
					document.getElementById('early-bird-remaining').textContent = data.remaining;
					_pricePerMonth = 100;
				}
			} catch (e) { /* ignore */ }
			renderQuickBtns();
			updateMonthsCalc();
		}

		// Load subscription tab on init — wait for checkAccess to set _subStatus
		_cabAccess.then(function() {
			loadSubscription().then(function(isActive) { if (!isActive) loadEarlyBird(); });
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
		function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

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
			const _time = Number(d.time) || 0;
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
                    <span class="pill">⏱ ${_time} мин</span>
                    <span class="pill">${_diff}</span>
                </div>
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
							+ '<img class="fb-reply-mark" src="https://voronova.online/images/YV-blog.webp" alt="Юлия Воронова">'
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
