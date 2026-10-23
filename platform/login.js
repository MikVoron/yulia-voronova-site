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
		var _isAdminEntry = _isAdminLogin;
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
		var _sendingCode = false;
		var _verifyingCode = false;
		var _codeExpiresAt = 0;
		var _resendAvailableAt = 0;
		var _verifyAvailableAt = 0;
		var _codeUnavailable = false;
		var _lastRejectedKey = '';
		var _emailBlockedAddress = '';
		var _emailAvailableAt = 0;
		var _emailRateMessage = false;
		var _pendingKey = 'smartplate.login.pending.v1.' + (_isAdminLogin ? 'admin' : 'email');
		function clearPendingLogin() {
			try { sessionStorage.removeItem(_pendingKey); } catch (e) { }
		}
		function savePendingLogin() {
			if (!currentEmail || !_codeExpiresAt) return;
			try { sessionStorage.setItem(_pendingKey, JSON.stringify({
				email: currentEmail, expiresAt: _codeExpiresAt, resendAt: _resendAvailableAt,
				verifyAt: _verifyAvailableAt, unavailable: _codeUnavailable, mfaRequired: _isAdminLogin, savedAt: Date.now()
			})); } catch (e) { }
		}
		function restorePendingLogin() {
			try {
				var pending = JSON.parse(sessionStorage.getItem(_pendingKey));
				if (!pending || typeof pending.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pending.email)
					|| !Number.isFinite(pending.savedAt) || pending.savedAt < Date.now() - 30 * 60000 || pending.savedAt > Date.now() + 60000
					|| !Number.isFinite(pending.expiresAt) || !Number.isFinite(pending.resendAt) || !Number.isFinite(pending.verifyAt)) {
					clearPendingLogin(); return;
				}
				currentEmail = pending.email;
				_codeExpiresAt = pending.expiresAt;
				_resendAvailableAt = pending.resendAt;
				_emailBlockedAddress = pending.email;
				_emailAvailableAt = pending.resendAt;
				_verifyAvailableAt = pending.verifyAt;
				_codeUnavailable = pending.unavailable === true;
				_isAdminLogin = _isAdminLogin || pending.mfaRequired === true;
				document.getElementById('email-input').value = currentEmail;
				showCodeStep(false);
			} catch (e) { clearPendingLogin(); }
		}
		function clockText(ms) {
			var seconds = Math.max(0, Math.ceil(ms / 1000));
			return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
		}
		function serverDeadline(value, serverTime, fallbackSeconds) {
			var deadline = Date.parse(value);
			var now = Date.parse(serverTime);
			if (Number.isFinite(deadline) && Number.isFinite(now)) return Date.now() + Math.max(0, Math.min(15 * 60000, deadline - now));
			return Date.now() + fallbackSeconds * 1000;
		}
		function retryDeadline(data, response) {
			var header = response.headers && response.headers.get ? response.headers.get('Retry-After') : null;
			var seconds = Number(data.retryAfterSeconds || header);
			return Date.now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 900) : 900) * 1000;
		}
		function updateLoginTimers() {
			var now = Date.now();
			var resend = document.getElementById('resend-code-btn');
			var wait = _resendAvailableAt - now;
			resend.disabled = _sendingCode || _verifyingCode || wait > 0;
			resend.textContent = _sendingCode ? 'Отправка…' : wait > 0 ? 'Новое письмо через ' + clockText(wait) : 'Отправить код ещё раз';
			document.getElementById('resend-help').textContent = wait > 60000 ? 'Пауза действует только на отправку писем' : 'Если письмо не пришло';
			var expiry = document.getElementById('code-expiry');
			var expired = _codeExpiresAt > 0 && _codeExpiresAt <= now;
			if (_codeUnavailable) expiry.textContent = 'Этот код больше не действует. Получите новый код.';
			else if (expired) expiry.textContent = 'Срок действия кода закончился. Получите новый код.';
			else if (_codeExpiresAt) expiry.textContent = 'Код действует ещё ' + clockText(_codeExpiresAt - now);
			if (_verifyAvailableAt > now) expiry.textContent = 'Проверку кода можно повторить через ' + clockText(_verifyAvailableAt - now);
			document.getElementById('verify-btn').disabled = _sendingCode || _verifyingCode || expired || _codeUnavailable || _verifyAvailableAt > now;
			document.getElementById('login-back-btn').disabled = _sendingCode || _verifyingCode;
			var email = document.getElementById('email-input').value.trim().toLowerCase();
			var emailWaiting = email === _emailBlockedAddress && _emailAvailableAt > now;
			document.getElementById('send-code-btn').disabled = _sendingCode || _verifyingCode || emailWaiting;
			if (_emailRateMessage) {
				if (emailWaiting) showError('email-error', 'Новое письмо можно запросить через ' + clockText(_emailAvailableAt - now) + '. Если код уже пришёл, используйте последнее письмо.');
				else { hideError('email-error'); _emailRateMessage = false; }
			}
		}
		function refreshMetrikaClientId() {
			if (_isAdminLogin || _metrikaClientId || !window.SmartPlateMetrika || typeof window.SmartPlateMetrika.getClientId !== 'function') return Promise.resolve(_metrikaClientId);
			return window.SmartPlateMetrika.getClientId().then(function (clientId) {
				if (clientId) _metrikaClientId = clientId;
				return _metrikaClientId;
			}).catch(function () {
				return _metrikaClientId;
			});
		}
		refreshMetrikaClientId();

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
			el.classList.remove('is-notice');
			el.classList.add('is-visible');
		}
		function hideError(id) {
			var el = document.getElementById(id);
			el.classList.remove('is-visible');
			el.classList.remove('is-notice');
			el.textContent = '';
		}

		function setLoading(btnId, loading) {
			var btn = document.getElementById(btnId);
			if (loading) {
				btn.disabled = true;
				btn.dataset.text = btn.textContent;
				btn.innerHTML = '<span class="lp-spinner"></span>' + (btnId === 'verify-btn' ? 'Проверяем…' : 'Отправка…');
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
			if (_sendingCode || _verifyingCode) return;
			hideError('email-error');
			var email = document.getElementById('email-input').value.trim().toLowerCase();
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
				showError('email-error', 'Введите корректный email'); return;
			}
			if (email === _emailBlockedAddress && _emailAvailableAt > Date.now()) {
				showError('email-error', 'Новое письмо можно запросить через ' + clockText(_emailAvailableAt - Date.now())); return;
			}
			await requestLoginCode(email, false);
		}

		async function requestLoginCode(email, resending) {
			if (_sendingCode || _verifyingCode) return;
			var errorId = resending ? 'code-error' : 'email-error';
			hideError(errorId);
			_sendingCode = true;
			if (!resending) setLoading('send-code-btn', true);
			updateLoginTimers();
			try {
				await refreshMetrikaClientId();
				var res = await fetch(API_BASE + '/auth/send-code', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email: email, context: _isAdminLogin ? 'admin' : undefined, metrikaClientId: _metrikaClientId })
				});
				var data = await res.json();
				if (!res.ok) {
					if (res.status === 429) {
						var retryAt = retryDeadline(data, res);
						_emailBlockedAddress = email;
						_emailAvailableAt = retryAt;
						_emailRateMessage = !resending;
						if (email === currentEmail) _resendAvailableAt = retryAt;
						savePendingLogin();
						showError(errorId, 'Новое письмо можно запросить через ' + clockText(retryAt - Date.now()) + '. Если код уже пришёл, используйте последнее письмо.');
						startTimer();
					} else showError(errorId, data.error || 'Не удалось отправить письмо. Попробуйте ещё раз.');
					return;
				}
				currentEmail = email;
				_codeExpiresAt = serverDeadline(data.codeExpiresAt, data.serverTime, 600);
				_resendAvailableAt = serverDeadline(data.resendAvailableAt, data.serverTime, 60);
				_verifyAvailableAt = 0;
				_codeUnavailable = false;
				_lastRejectedKey = '';
				_emailBlockedAddress = email;
				_emailAvailableAt = _resendAvailableAt;
				document.getElementById('code-input').value = '';
				document.getElementById('code-input').setAttribute('aria-invalid', 'false');
				document.getElementById('mfa-code-input').value = '';
				savePendingLogin();
				if (!_isAdminLogin && window.SmartPlateMetrika) {
					if (!data.metrikaGoals || !data.metrikaGoals.registration_started) window.SmartPlateMetrika.goal('registration_started');
					if (!data.metrikaGoals || !data.metrikaGoals.verification_code_sent) window.SmartPlateMetrika.goal('verification_code_sent');
				}
				showCodeStep(true);
				if (resending) {
					showError('code-error', 'Отправили новый код. Используйте самое новое письмо — предыдущий код больше не действует.');
					document.getElementById('code-error').classList.add('is-notice');
				}
			} catch (e) {
				showError(errorId, 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.');
			} finally {
				_sendingCode = false;
				if (!resending) setLoading('send-code-btn', false);
				updateLoginTimers();
			}
		}

		function showCodeStep(focusCode) {
			document.getElementById('email-show-text').textContent = currentEmail;
			document.getElementById('step-email').classList.add('is-hidden');
			var step2 = document.getElementById('step-code');
			document.getElementById('mfa-field').classList.toggle('is-hidden', !_isAdminLogin);
			step2.classList.add('is-animation-reset');
			step2.classList.remove('is-hidden');
			requestAnimationFrame(function () {
				step2.classList.remove('is-animation-reset');
				if (focusCode) document.getElementById('code-input').focus();
			});
			startTimer();
		}

		function startTimer() {
			clearInterval(timerInterval);
			updateLoginTimers();
			timerInterval = setInterval(updateLoginTimers, 1000);
		}

		async function resendCode() {
			if (!currentEmail || _resendAvailableAt > Date.now()) return;
			await requestLoginCode(currentEmail, true);
		}

		async function verifyCode() {
			if (_verifyingCode || _sendingCode) return;
			if (_codeUnavailable || (_codeExpiresAt && _codeExpiresAt <= Date.now()) || _verifyAvailableAt > Date.now()) { updateLoginTimers(); return; }
			hideError('code-error');
			var code = document.getElementById('code-input').value.trim();
			if (!/^\d{6}$/.test(code)) { showError('code-error', 'Введите 6 цифр из письма'); return; }
			var mfaCode = document.getElementById('mfa-code-input').value.trim();
			if (_isAdminLogin && !/^\d{6}$/.test(mfaCode)) { showError('code-error', 'Введите код приложения-аутентификатора'); return; }
			var submittedKey = code + ':' + (_isAdminLogin ? mfaCode : '');
			if (_lastRejectedKey === submittedKey) {
				showError('code-error', _isAdminLogin ? 'Эти коды уже проверяли. Проверьте код приложения-аутентификатора.' : 'Этот код уже проверяли. Измените его или запросите новое письмо.'); return;
			}
			_verifyingCode = true;
			setLoading('verify-btn', true);
			updateLoginTimers();
			try {
				await refreshMetrikaClientId();
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
						if (_isAdminLogin && data.reason === 'MFA_INVALID') _lastRejectedKey = submittedKey;
						_isAdminLogin = true;
						savePendingLogin();
						document.getElementById('mfa-field').classList.remove('is-hidden');
						showError('code-error', 'Введите код из приложения-аутентификатора');
						document.getElementById('mfa-code-input').focus();
						setLoading('verify-btn', false);
						return;
					}
					var reason = data.reason;
					if (reason === 'INVALID_CODE' || (!reason && data.error === 'Неверный код')) {
						_lastRejectedKey = submittedKey;
						document.getElementById('code-input').setAttribute('aria-invalid', 'true');
						showError('code-error', 'Код не подошёл. Если запрашивали письмо повторно, возьмите код из самого нового письма.');
					} else if (reason === 'CODE_EXPIRED' || reason === 'CODE_UNAVAILABLE' || reason === 'CODE_ATTEMPTS_EXCEEDED' || reason === 'MFA_ATTEMPTS_EXCEEDED') {
						_codeUnavailable = true;
						showError('code-error', data.error || 'Этот код больше не действует. Получите новый код.');
					} else if (res.status === 429) {
						_verifyAvailableAt = retryDeadline(data, res);
						showError('code-error', 'Слишком много попыток проверки. Можно повторить через ' + clockText(_verifyAvailableAt - Date.now()));
						startTimer();
					} else showError('code-error', data.error || 'Не удалось проверить код. Попробуйте ещё раз.');
					savePendingLogin();
					return;
				}
				if (data.isNew && window.SmartPlateMetrika && (!data.metrikaGoals || !data.metrikaGoals.registration_completed)) window.SmartPlateMetrika.goal('registration_completed');
				if (data.isNew && window.SmartPlateGoogleAnalytics) window.SmartPlateGoogleAnalytics.event('sign_up');
				Auth.login(data.user.email, data.user.displayName, data.accessToken, data.user.subscription, data.user.avatar, data.user.role, data.user.createdAt, data.user.id, data.user.weight);
				clearPendingLogin();
				clearInterval(timerInterval);
				document.getElementById('code-input').value = '';
				document.getElementById('mfa-code-input').value = '';
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
				showError('code-error', 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ввести тот же код ещё раз.');
			} finally {
				_verifyingCode = false;
				setLoading('verify-btn', false);
				updateLoginTimers();
			}
		}

		function goBack() {
			if (_sendingCode || _verifyingCode) return;
			clearPendingLogin();
			_isAdminLogin = _isAdminEntry;
			_codeExpiresAt = 0;
			_codeUnavailable = false;
			_lastRejectedKey = '';
			clearInterval(timerInterval);
			document.getElementById('step-code').classList.add('is-hidden');
			document.getElementById('code-input').value = '';
			document.getElementById('mfa-code-input').value = '';
			document.getElementById('email-input').value = currentEmail;
			hideError('email-error');
			hideError('code-error');
			var s1 = document.getElementById('step-email');
			s1.classList.add('is-animation-reset');
			s1.classList.remove('is-hidden');
			requestAnimationFrame(function () { s1.classList.remove('is-animation-reset'); });
			document.getElementById('email-input').focus();
			startTimer();
		}

		document.addEventListener('keydown', function (e) {
			if (e.key !== 'Enter' || e.repeat || (e.target && e.target.tagName !== 'INPUT')) return;
			e.preventDefault();
			if (!document.getElementById('step-email').classList.contains('is-hidden')) sendCode();
			else if (!document.getElementById('step-code').classList.contains('is-hidden')) verifyCode();
		});
		function normalizeCodeInput(input) { input.value = input.value.replace(/[^0-9]/g, '').slice(0, 6); }
		['code-input', 'mfa-code-input'].forEach(function (id) {
			var input = document.getElementById(id);
			input.addEventListener('input', function () { normalizeCodeInput(input); input.setAttribute('aria-invalid', 'false'); });
			input.addEventListener('paste', function (event) {
				if (!event.clipboardData) return;
				event.preventDefault();
				input.value = event.clipboardData.getData('text');
				normalizeCodeInput(input);
				input.setAttribute('aria-invalid', 'false');
			});
		});
		document.getElementById('email-input').addEventListener('input', updateLoginTimers);
		document.addEventListener('visibilitychange', updateLoginTimers);
		document.getElementById('send-code-btn').addEventListener('click', sendCode);
		document.getElementById('verify-btn').addEventListener('click', verifyCode);
		document.getElementById('login-back-btn').addEventListener('click', goBack);
		document.getElementById('resend-code-btn').addEventListener('click', resendCode);
		document.getElementById('login-media-image').addEventListener('error', function () {
			this.classList.add('is-hidden');
		});
		restorePendingLogin();
