		// Защита от open-redirect: только относительные пути в пределах поддомена
		function _safeReturn(url) {
			if (!url || typeof url !== 'string') return null;
			var v = url.trim();
			if (!v || v !== url) return null;
			if (/[\x00-\x1F\x7F]/.test(v)) return null;
			if (/^[a-z][a-z0-9+.\-]*:/i.test(v)) return null;
			if (v.indexOf('//') === 0) return null;
			if (v.indexOf('\\') !== -1) return null;
			return v;
		}
		var _rawReturn = new URLSearchParams(location.search).get('return');
		var _returnUrl = _safeReturn(_rawReturn) || 'index.html';
		var _entry = new URLSearchParams(location.search).get('entry');
		var _isRecipeReturn = /^recipe\.html(?:[?#]|$)/.test(_returnUrl);
		var _isProRecipeEntry = _entry === 'pro-recipe' && _isRecipeReturn;
		var _isTrialRecipeEntry = _entry === 'trial-recipe' && _isRecipeReturn;
		var _recipeContext = document.getElementById('lp-recipe-context');
		if (_recipeContext) _recipeContext.hidden = !_isProRecipeEntry;
		var _isAdminLogin = _returnUrl.indexOf('admin.html') !== -1 || _returnUrl.indexOf('recipe-editor.html') !== -1;
		var _hasReturn = !!_safeReturn(_rawReturn);
		// Дописываем оферту, только если она опубликована (флаг в data-v2.js)
		if (typeof LEGAL_OFFER_ENABLED !== 'undefined' && LEGAL_OFFER_ENABLED) {
			var _legalEl = document.getElementById('lp-footer-legal');
			if (_legalEl) {
				_legalEl.innerHTML = 'Продолжая, вы соглашаетесь с '
					+ '<a href="https://voronova.online/public-offer.html" target="_blank" rel="noopener">офертой</a> и '
					+ '<a href="personal-data-processing-policy.html" target="_blank" rel="noopener">политикой обработки данных</a>.';
			}
		}
		if (Auth.isLoggedIn()) {
			if (_hasReturn) {
				// Originating page redirected us here because its API calls failed despite localStorage flag.
				// Try a silent refresh — if it works, go back; otherwise stay on the form (no server logout,
				// so a transient 429 on /auth/refresh doesn't nuke a valid refresh cookie).
				Auth.refreshToken().then(function (ok) {
					if (ok) location.href = _returnUrl;
					// else: show login form and let the user re-auth by email code
				});
			} else {
				location.href = _returnUrl;
			}
		}

		// Show OAuth error if redirected back
		(function () {
			var params = new URLSearchParams(location.search);
			var err = params.get('error');
			if (err === 'blocked') showError('email-error', 'Аккаунт заблокирован');
			else if (err) showError('email-error', 'Ошибка входа. Попробуйте другой способ.');
		})();

		var currentEmail = '';
		var timerInterval = null;
		var _fingerprint = null;
		var _metrikaClientId = null;
		function refreshMetrikaClientId() {
			if (!window.SmartPlateMetrika || typeof window.SmartPlateMetrika.getClientId !== 'function') return;
			window.SmartPlateMetrika.getClientId().then(function (clientId) {
				if (clientId) _metrikaClientId = clientId;
			});
		}
		refreshMetrikaClientId();

		// Dynamic recipe count: use the same marketing threshold as the main page.
		fetch(API_BASE + '/content/stats')
			.then(function (r) { return r.ok ? r.json() : null; })
			.then(function (d) {
				if (d && d.recipes) {
					var count = Number(d.recipes);
					var rounded = count < 5 ? count
						: count < 20 ? Math.floor(count / 5) * 5
							: Math.floor(count / 10) * 10;
					document.getElementById('lp-recipes-count').textContent = rounded + '+ рецептов';
				}
			})
			.catch(function () { });

		// Keep the offer on the entry form in sync with the subscription API.
		// If pricing is temporarily unavailable, the copy remains truthful without guessing.
		fetch(API_BASE + '/subscription/early-bird', { credentials: 'include' })
			.then(function (r) { return r.ok ? r.json() : null; })
			.then(function (d) {
				var price = Number(d && d.prices && d.prices['1']);
				var priceEl = document.getElementById('lp-monthly-price');
				if (priceEl && Number.isFinite(price) && price > 0) {
					priceEl.textContent = Math.round(price) + ' ₽/мес';
				}
			})
			.catch(function () { });

		// Генерация browser fingerprint (canvas + screen + timezone + UA)
		(async function () {
			try {
				var canvas = document.createElement('canvas');
				var ctx = canvas.getContext('2d');
				ctx.textBaseline = 'top';
				ctx.font = '14px Arial';
				ctx.fillText('fp-test', 2, 2);
				var raw = [
					canvas.toDataURL(),
					screen.width, screen.height, screen.colorDepth,
					Intl.DateTimeFormat().resolvedOptions().timeZone,
					navigator.userAgent,
					navigator.language,
					navigator.hardwareConcurrency || 0
				].join('|');
				var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
				_fingerprint = Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
			} catch (e) { _fingerprint = null; }
		})();

		function showError(id, msg) {
			var el = document.getElementById(id);
			el.textContent = msg;
			el.classList.add('is-visible');
		}
		function hideError(id) {
			var el = document.getElementById(id);
			el.classList.remove('is-visible');
			el.textContent = '';
		}

		function setLoading(btnId, loading) {
			var btn = document.getElementById(btnId);
			if (loading) {
				btn.disabled = true;
				btn.dataset.text = btn.textContent;
				btn.innerHTML = '<span class="lp-spinner"></span>Отправка…';
			} else {
				btn.disabled = false;
				btn.textContent = btn.dataset.text || 'Отправить';
			}
		}

		function setSuccessContent(title, copy, primaryLabel, primaryHref, secondaryLabel, secondaryHref, context) {
			document.getElementById('success-title').textContent = title;
			document.getElementById('success-copy').textContent = copy;
			var primary = document.getElementById('success-primary');
			var secondary = document.getElementById('success-secondary');
			primary.textContent = primaryLabel;
			primary.href = primaryHref;
			secondary.textContent = secondaryLabel;
			secondary.href = secondaryHref;
			var contextEl = document.getElementById('success-context');
			contextEl.textContent = context || '';
			contextEl.hidden = !context;
			document.getElementById('success-actions').hidden = false;
			var features = document.querySelector('.lp-features');
			if (features) features.classList.add('is-hidden');
		}

		function showRegistrationSuccess(subscription) {
			if (subscription === undefined && (_isProRecipeEntry || _isTrialRecipeEntry)) {
				setSuccessContent(
					'Вы зарегистрированы',
					'Проверяем доступ к выбранному рецепту…',
					'К рецепту →', _returnUrl,
					'Открыть каталог', 'index.html',
					''
				);
				return;
			}
			var isTrial = subscription && subscription.status === 'trial'
				&& subscription.trialEndsAt && new Date(subscription.trialEndsAt) > new Date();
			if (_isProRecipeEntry) {
				setSuccessContent(
					'Вы зарегистрированы',
					isTrial
						? 'Этот рецепт откроется по подписке. Вам доступны рецепты категории «Пробный» с доступом на 7 дней и все возможности сервиса.'
						: 'Этот рецепт откроется по подписке. Сейчас пробный доступ не предоставлен — вы всё равно можете посмотреть каталог и вернуться к рецепту.',
					'К рецепту →', _returnUrl,
					isTrial ? 'Посмотреть рецепты на 7 дней' : 'Открыть каталог', 'index.html',
					'Контекст сохранён: на странице рецепта останется понятный путь к подписке.'
				);
				return;
			}
			if (_isTrialRecipeEntry) {
				setSuccessContent(
					isTrial ? 'Готово — рецепт открыт' : 'Вы зарегистрированы',
					isTrial
						? 'Теперь доступны полный состав, точные количества, все шаги и подсказки для сбалансированной тарелки.'
						: 'Вернём вас к выбранному рецепту. Доступ к нему зависит от статуса пробного периода.',
					'К рецепту →', _returnUrl,
					'Как пользоваться Умной тарелкой', 'index.html?guestTour=1',
					''
				);
				return;
			}
			setSuccessContent(
				'Добро пожаловать в Умную тарелку',
				'Начните с блюда, которое хочется приготовить сегодня. Остальное подскажем по ходу.',
				'Открыть каталог →', 'index.html',
				'Как пользоваться Умной тарелкой', 'index.html?guestTour=1',
				''
			);
		}

		function loadRegistrationSubscription() {
			return Auth.api('/auth/me')
				.then(function(res) { return res.ok ? res.json() : null; })
				.then(function(data) { return data && data.subscription ? data.subscription : null; })
				.catch(function() { return null; });
		}

		async function sendCode() {
			hideError('email-error');
			var email = document.getElementById('email-input').value.trim().toLowerCase();
			if (!email || !email.includes('@') || !email.includes('.')) {
				showError('email-error', 'Введите корректный email'); return;
			}
			currentEmail = email;
			refreshMetrikaClientId();
			setLoading('send-code-btn', true);
			try {
				var res = await fetch(API_BASE + '/auth/send-code', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email: email, context: _isAdminLogin ? 'admin' : undefined, metrikaClientId: _metrikaClientId })
				});
				var data = await res.json();
				if (!res.ok) { showError('email-error', data.error || 'Ошибка'); setLoading('send-code-btn', false); return; }
				if (!_isAdminLogin && window.SmartPlateMetrika) {
					if (!data.metrikaGoals || !data.metrikaGoals.registration_started) window.SmartPlateMetrika.goal('registration_started');
					if (!data.metrikaGoals || !data.metrikaGoals.verification_code_sent) window.SmartPlateMetrika.goal('verification_code_sent');
				}
				showCodeStep();
			} catch (e) {
				showError('email-error', 'Ошибка сети');
			}
			setLoading('send-code-btn', false);
		}

		function showCodeStep() {
			document.getElementById('email-show-text').textContent = currentEmail;
			document.getElementById('step-email').classList.add('is-hidden');
			var step2 = document.getElementById('step-code');
			document.getElementById('mfa-field').classList.toggle('is-hidden', !_isAdminLogin);
			step2.classList.add('is-animation-reset');
			step2.classList.remove('is-hidden');
			requestAnimationFrame(function () {
				step2.classList.remove('is-animation-reset');
				document.getElementById('code-input').focus();
			});
			startTimer();
		}

		function startTimer() {
			var sec = 60;
			var timerEl = document.getElementById('timer-sec');
			var block = document.getElementById('timer-block');
			block.classList.remove('has-error');
			block.innerHTML = 'Отправить повторно через <span id="timer-sec">60</span> сек';
			timerEl = document.getElementById('timer-sec');
			clearInterval(timerInterval);
			timerInterval = setInterval(function () {
				sec--;
				timerEl.textContent = sec;
				if (sec <= 0) {
					clearInterval(timerInterval);
					var resend = document.createElement('a');
					resend.href = '#';
					resend.textContent = 'Отправить код повторно';
					resend.addEventListener('click', function (event) {
						event.preventDefault();
						resendCode();
					});
					block.replaceChildren(resend);
				}
			}, 1000);
		}

		async function resendCode() {
			var block = document.getElementById('timer-block');
			block.innerHTML = 'Отправка…';
			try {
				var res = await fetch(API_BASE + '/auth/send-code', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email: currentEmail, context: _isAdminLogin ? 'admin' : undefined })
				});
				var data = await res.json();
				if (!res.ok) {
					block.classList.add('has-error');
					block.textContent = data.error || 'Ошибка';
					return;
				}
				startTimer();
			} catch (e) {
				block.classList.add('has-error');
				block.textContent = 'Ошибка сети';
			}
		}

		async function verifyCode() {
			hideError('code-error');
			var code = document.getElementById('code-input').value.trim();
			if (code.length !== 6) { showError('code-error', 'Введите 6-значный код'); return; }
			var mfaCode = document.getElementById('mfa-code-input').value.trim();
			if (_isAdminLogin && mfaCode.length !== 6) { showError('code-error', 'Введите код приложения-аутентификатора'); return; }
			setLoading('verify-btn', true);
			try {
				var res = await fetch(API_BASE + '/auth/verify', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({ email: currentEmail, code: code, fingerprint: _fingerprint, context: _isAdminLogin ? 'admin' : undefined, mfaCode: _isAdminLogin ? mfaCode : undefined, metrikaClientId: _metrikaClientId })
				});
				var data = await res.json();
				if (!res.ok) {
					// An admin account can arrive here from an ordinary page (for example, a recipe).
					// The server asks for MFA only after the email code was verified.
					if (data.mfaRequired) {
						_isAdminLogin = true;
						document.getElementById('mfa-field').classList.remove('is-hidden');
						showError('code-error', 'Введите код из приложения-аутентификатора');
						document.getElementById('mfa-code-input').focus();
						setLoading('verify-btn', false);
						return;
					}
					showError('code-error', data.error || 'Ошибка'); setLoading('verify-btn', false); return;
				}
				if (data.isNew && window.SmartPlateMetrika && (!data.metrikaGoals || !data.metrikaGoals.registration_completed)) window.SmartPlateMetrika.goal('registration_completed');
				if (data.isNew && window.SmartPlateGoogleAnalytics) window.SmartPlateGoogleAnalytics.event('sign_up');
				Auth.login(data.user.email, data.user.displayName, data.accessToken, data.user.subscription, data.user.avatar, data.user.role, data.user.createdAt, data.user.id, data.user.weight);
				document.getElementById('step-code').classList.add('is-hidden');
				var success = document.getElementById('step-success');
				success.classList.add('is-visible');
				if (data.isNew) {
					showRegistrationSuccess();
					loadRegistrationSubscription().then(function(subscription) {
						showRegistrationSuccess(subscription);
					});
					setTimeout(function () { location.href = _returnUrl; }, 3500);
				} else {
					setTimeout(function () { location.href = _returnUrl; }, 900);
				}
			} catch (e) {
				showError('code-error', 'Ошибка сети');
				setLoading('verify-btn', false);
			}
		}

		function goBack() {
			clearInterval(timerInterval);
			document.getElementById('step-code').classList.add('is-hidden');
			document.getElementById('code-input').value = '';
			document.getElementById('mfa-code-input').value = '';
			var s1 = document.getElementById('step-email');
			s1.classList.add('is-animation-reset');
			s1.classList.remove('is-hidden');
			requestAnimationFrame(function () { s1.classList.remove('is-animation-reset'); });
			document.getElementById('email-input').focus();
		}

		document.addEventListener('keydown', function (e) {
			if (e.key !== 'Enter') return;
			if (!document.getElementById('step-email').classList.contains('is-hidden')) sendCode();
			else if (!document.getElementById('step-code').classList.contains('is-hidden')) verifyCode();
		});
		document.getElementById('code-input').addEventListener('input', function () {
			if (!_isAdminLogin && this.value.length === 6) verifyCode();
		});
		document.getElementById('send-code-btn').addEventListener('click', sendCode);
		document.getElementById('verify-btn').addEventListener('click', verifyCode);
		document.getElementById('login-back-btn').addEventListener('click', goBack);
		document.getElementById('login-media-image').addEventListener('error', function () {
			this.classList.add('is-hidden');
		});
