/**
 * Platform data v2 — Category-based architecture
 * Категории: Завтраки, Супы, Горячее, Блины/Оладьи, Намазки, Соусы, Салаты, Напитки
 * Источник рецептов: Гайд растительного питания Юлии Вороновой
 */

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const API_BASE  = 'https://api.voronova.online';
const PLATFORM_HOSTS = ['app.voronova.online', 'plate.voronova.online'];
const SESSION_MIGRATION_HOST = 'plate.voronova.online';
const CONTENT_API_BASE = (typeof location !== 'undefined' && PLATFORM_HOSTS.includes(location.hostname))
    ? location.origin + '/api'
    : API_BASE;
// Включить когда public-offer.html опубликован на voronova.online (после мержа feature → main + GitHub Pages).
// До этого ссылки на оферту в UI скрыты, чтобы не вести пользователя на 404.
const LEGAL_OFFER_ENABLED = false;
const SITE_BASE = 'https://voronova.online';
const RECIPE_IMAGE_VERSION = '20260509-1';

// ─── AUTH ───────────────────────────────────────────────────────────────────
const Auth = {
    KEY: 'hp_user',
    _token: null,
    _ST: 'hp_st',
    login(email, name, token, subscription, avatar, role, createdAt, id, weight) {
        clearContentCache();
        localStorage.removeItem('hp_token'); // cleanup legacy
        const prev = this.getUser();
        if (prev && prev.email && prev.email !== email) {
            ['fav_recipes','user_notes','hp_plates','hp_plate_history','user_weight','user_avatar','julia_quote_day','hp_user_name'].forEach(k => localStorage.removeItem(k));
        }
        // Migrate old customName to separate key
        if (prev && prev.email === email && prev.customName && !localStorage.getItem('hp_user_name')) {
            localStorage.setItem('hp_user_name', prev.customName);
        }
        const user = {
            id: id || (prev && prev.email === email && prev.id) || null,
            email,
            name: name || (prev && prev.email === email && prev.name) || email.split('@')[0],
            avatar: avatar || (prev && prev.email === email && prev.avatar) || null,
            joined: createdAt || (prev && prev.email === email && prev.joined) || Date.now(),
            subscription: subscription || null,
            role: role || (prev && prev.email === email && prev.role) || null,
            weight: weight == null ? null : Number(weight)
        };
        localStorage.setItem(this.KEY, JSON.stringify(user));
        if (user.weight != null && Number.isFinite(user.weight)) {
            localStorage.setItem(this._userKey('user_weight'), String(user.weight));
        }
        if (name) this.setName(name);
        if (avatar) this.setAvatar(avatar);
        if (token) { this._token = token; sessionStorage.setItem(this._ST, token); }
        return user;
    },
    logout() {
        fetch(API_BASE + '/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        clearContentCache();
        localStorage.removeItem(this.KEY); localStorage.removeItem('hp_token');
        sessionStorage.removeItem(this._ST);
        this._token = null; Plate.clear();
    },
    isLoggedIn() { return !!localStorage.getItem(this.KEY); },
    getUser() { try { return JSON.parse(localStorage.getItem(this.KEY)); } catch { return null; } },
    getToken() { return this._token || sessionStorage.getItem(this._ST); },
    // Защита от open-redirect: разрешаем только относительные пути на нашем поддомене
    _safeReturn(url) {
        if (!url || typeof url !== 'string') return null;
        var v = url.trim();
        if (!v || v !== url) return null;
        if (/[\x00-\x1F\x7F]/.test(v)) return null;
        if (/^[a-z][a-z0-9+.\-]*:/i.test(v)) return null;
        if (v.indexOf('//') === 0) return null;
        if (v.indexOf('\\') !== -1) return null;
        return v;
    },
    _currentReturnUrl() {
        // path+search текущей страницы для login.html?return=...
        var path = location.pathname.split('/').pop() || 'index.html';
        if (path === 'login.html') return null;
        return path + location.search;
    },
    _loginUrl() {
        var ret = this._currentReturnUrl();
        return ret ? 'login.html?return=' + encodeURIComponent(ret) : 'login.html';
    },
    requireAuth() {
        if (this.isLoggedIn()) return true;
        // На новом домене сначала даём API-cookie восстановить профиль. Сам
        // refresh живёт на api.voronova.online и сохраняется при смене frontend-host.
        if (this._domainSessionReady) return false;
        location.href = this._loginUrl();
        return false;
    },
    _userKey(key) {
        const u = this.getUser();
        if (!u || !u.email) return key;
        const uKey = key + '_' + u.email;
        // Migrate from old shared key on first access (skip personal keys like avatar/name)
        const _noMigrate = ['user_avatar', 'hp_user_name'];
        if (!_noMigrate.includes(key) && !localStorage.getItem(uKey) && localStorage.getItem(key)) {
            localStorage.setItem(uKey, localStorage.getItem(key));
        }
        return uKey;
    },
    getDisplayName() {
        // Try user-specific key first, fallback to old key, migrate if found
        const u = this.getUser();
        const uKey = u && u.email ? 'hp_user_name_' + u.email : 'hp_user_name';
        let val = localStorage.getItem(uKey);
        if (!val && u && u.email) {
            val = localStorage.getItem('hp_user_name');
            if (val) { localStorage.setItem(uKey, val); localStorage.removeItem('hp_user_name'); }
        }
        return val || '';
    },
    hasCustomName() { return !!this.getDisplayName(); },
    setName(name) {
        const val = name ? name.trim() : '';
        const uKey = this._userKey('hp_user_name');
        if (val) localStorage.setItem(uKey, val);
        else localStorage.removeItem(uKey);
        const user = this.getUser();
        if (user) {
            user.name = val || (user.email ? user.email.split('@')[0] : user.name);
            localStorage.setItem(this.KEY, JSON.stringify(user));
        }
    },
    getAvatar() { return localStorage.getItem(this._userKey('user_avatar')) || null; },
    // Единый рендер аватара в #u-ava на всех страницах платформы.
    // Without it разные страницы рисуют через innerHTML/backgroundImage/inline <img>
    // с разными inline-стилями → кроп и размер «прыгают» между страницами.
    renderAvatar(el, displayName) {
        if (!el) return;
        const u = this.getUser();
        const fallback = (displayName || this.getDisplayName() || (u && u.email) || '?').trim() || '?';
        const showFallback = () => {
            el.textContent = fallback.charAt(0).toUpperCase();
            el.style.backgroundImage = '';
        };
        // localStorage user_avatar > user.avatar (с сервера при логине, до первого setAvatar).
        const avatar = this.getAvatar() || (u && u.avatar) || null;
        if (avatar) {
            const img = document.createElement('img');
            img.src = avatar;
            img.alt = '';
            img.className = 'v-user-avatar-img';
            img.addEventListener('error', showFallback, { once: true });
            el.replaceChildren(img);
            // Сбрасываем background-image, если был выставлен ранее (legacy путь в index.html).
            el.style.backgroundImage = '';
        } else {
            showFallback();
        }
    },
    setAvatar(dataUrl) {
        const key = this._userKey('user_avatar');
        if (dataUrl) localStorage.setItem(key, dataUrl);
        else localStorage.removeItem(key);
        const user = this.getUser();
        if (user) {
            user.avatar = dataUrl || null;
            localStorage.setItem(this.KEY, JSON.stringify(user));
        }
    },
    _syncProfile(data) {
        if (!data) return;
        if (data.displayName !== undefined) this.setName(data.displayName || '');
        if (data.avatar !== undefined) this.setAvatar(data.avatar || null);
        if (data.weight !== undefined) {
            const user = this.getUser();
            if (user) {
                user.weight = data.weight == null ? null : Number(data.weight);
                localStorage.setItem(this.KEY, JSON.stringify(user));
                if (user.weight != null && Number.isFinite(user.weight)) {
                    localStorage.setItem(this._userKey('user_weight'), String(user.weight));
                }
            }
        }
        if (data.createdAt) {
            const user = this.getUser();
            if (user) { user.joined = data.createdAt; localStorage.setItem(this.KEY, JSON.stringify(user)); }
        }
    },
    _subStatus: null,
    _isAdmin() {
        const user = this.getUser();
        return user && user.role === 'admin';
    },
    _setRole(role) {
        if (!role) return;
        const user = this.getUser();
        if (user) { user.role = role; localStorage.setItem(this.KEY, JSON.stringify(user)); }
    },
    _activityReported: false,
    _reportPlatformActivity() {
        if (this._activityReported || !this.getToken()) return;
        this._activityReported = true;
        fetch(API_BASE + '/auth/activity', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + this.getToken() },
            credentials: 'include'
        }).catch(function() {
            // Метрика не должна влиять на доступ пользователя к платформе.
        });
    },
    async checkAccess(opts) {
        const migrated = await this.waitForDomainSessionMigration();
        // Успешная миграция сразу перезагружает страницу. Не запускаем параллельно
        // гостевой/платный рендер в старом документе до начала навигации.
        if (migrated) return false;
        const allowGuest = !!(opts && opts.allowGuest);
        if (!this.isLoggedIn()) {
            if (allowGuest) {
                this._subStatus = 'guest';
                document.body.style.visibility = 'visible';
                return false;
            }
            location.href = this._loginUrl();
            return false;
        }
        if (!this.getToken()) {
            const ok = await this.refreshToken();
            if (!ok) {
                // Session expired — redirect to login. Admin role from
                // localStorage is not trusted: the server is the gate.
                this.logout();
                location.href = this._loginUrl();
                return false;
            }
        }
        try {
            const res = await this.api('/auth/me');
            if (!res.ok) {
                // Auth failed — redirect to login. No client-side admin shortcut.
                this.logout();
                location.href = this._loginUrl();
                return false;
            }
            const data = await res.json();
            // Sync id + role + displayName + avatar from server → localStorage
            if (data.id) {
                const user = this.getUser();
                if (user && !user.id) { user.id = data.id; localStorage.setItem(this.KEY, JSON.stringify(user)); }
            }
            this._setRole(data.role);
            if (data.displayName) {
                const user = this.getUser();
                if (user) { user.name = data.displayName; localStorage.setItem(this.KEY, JSON.stringify(user)); }
                localStorage.setItem(this._userKey('hp_user_name'), data.displayName);
            }
            if (data.avatar && !this.getAvatar()) {
                this.setAvatar(data.avatar);
            }
            this._syncProfile(data);
            if (data.role !== 'admin') this._reportPlatformActivity();
            if (data.role === 'admin') { this._subStatus = 'active'; this.startAutoRefresh(); return true; }
            const sub = data.subscription;
            if (!sub || !sub.status) { this._subStatus = 'none'; this._showPaywall('no_sub'); return false; }
            this._subStatus = sub.status;
            const now = new Date();
            if (sub.status === 'trial' && new Date(sub.trialEndsAt) > now) { this.startAutoRefresh(); return true; }
            if (sub.status === 'active' && new Date(sub.activeUntil) > now) { this.startAutoRefresh(); return true; }
            this._showPaywall(sub.trialNotGranted ? 'trial_not_granted' : sub.status); return false;
        } catch {
            // Fail-close: на сетевой ошибке не давать доступ. localStorage-роль
            // не источник истины — реальный admin переавторизуется и пройдёт.
            this._subStatus = 'error';
            this._showPaywall('error');
            return false;
        }
    },
    isTrial() { return this._subStatus === 'trial'; },
    isGuest() { return !this.isLoggedIn(); },
    hasFullAccess() { return this._subStatus === 'active'; },

    // Уровень доступа рецепта: 'free' | 'trial' | 'pro'.
    // Fallback на is_free, если access_level не пришёл (старые данные).
    recipeAccessLevel(recipe) {
        if (recipe && recipe.accessLevel) return recipe.accessLevel;
        return (recipe && recipe.free) ? 'free' : 'pro';
    },
    // Видит ли текущий пользователь полный рецепт?
    // Матрица в docs/guest-mode-mvp.md §5.1
    canViewRecipe(recipe) {
        const level = this.recipeAccessLevel(recipe);
        if (level === 'free') return true;
        if (level === 'trial') return this.isTrial() || this.hasFullAccess();
        if (level === 'pro')   return this.hasFullAccess();
        return false;
    },
    // Бейдж для карточки. Возвращает строку или '' если уровень не нужно показывать.
    recipeAccessLabel(recipe) {
        const level = this.recipeAccessLevel(recipe);
        if (level === 'free')  return 'Бесплатно';
        if (level === 'trial') return 'Пробный';
        if (level === 'pro')   return 'Подписка';
        return '';
    },
    isFreeRecipe(recipe) {
        return this.recipeAccessLevel(recipe) === 'free';
    },
    // Единое состояние карточки для главной, категорий, поиска и ингредиентов.
    // Рендереры не должны повторять матрицу guest/trial/active самостоятельно.
    recipeCardAccess(recipe) {
        const level = this.recipeAccessLevel(recipe);
        const locked = !this.canViewRecipe(recipe);
        const label = this.recipeAccessLabel(recipe);
        return {
            level,
            locked,
            label,
            isFree: level === 'free',
            actionLabel: locked ? 'Условия доступа' : 'Открыть рецепт',
        };
    },
    // CTA для locked-карточки и preview-блока в recipe.html.
    // Возвращает { title, btn, href } или null, если у пользователя есть доступ.
    // См. таблицу в docs/guest-mode-mvp.md §6.4
    recipePaywallCta(recipe) {
        if (this.canViewRecipe(recipe)) return null;
        const level = this.recipeAccessLevel(recipe);
        const ret = this._currentReturnUrl();
        if (this.isGuest()) {
            const isSubscriptionRecipe = level === 'pro';
            return {
                title: isSubscriptionRecipe
                    ? 'Откройте полный рецепт'
                    : 'Откройте полный рецепт',
                eyebrow: isSubscriptionRecipe ? 'РЕЦЕПТ ПО ПОДПИСКЕ' : 'РЕЦЕПТ С ДОСТУПОМ НА 7 ДНЕЙ',
                description: isSubscriptionRecipe
                    ? 'По подписке откроются полный список ингредиентов, пошаговое приготовление, замены продуктов, список покупок и добавление блюда в свою тарелку.'
                    : 'После регистрации откроются ингредиенты, пошаговое приготовление и возможности Умной тарелки.',
                price: isSubscriptionRecipe ? '190 ₽/мес' : '',
                priceNote: isSubscriptionRecipe ? 'доступ ко всей базе' : '',
                btn: isSubscriptionRecipe ? 'Войти и оформить подписку' : 'Открыть рецепт бесплатно',
                href: this._loginUrl(),
                noteLines: isSubscriptionRecipe
                    ? [
                        'После регистрации — 7 дней бесплатного доступа к пробным рецептам и возможностям сервиса. Карту привязывать не нужно.',
                    ]
                    : [
                        '7 дней доступа бесплатно.',
                        'Карту привязывать не нужно.',
                    ],
                trialTitle: isSubscriptionRecipe ? 'Хотите сначала попробовать?' : '',
                trialText: isSubscriptionRecipe
                    ? 'После регистрации — 7 дней бесплатного доступа к пробным рецептам и возможностям сервиса. Все основные шаги приготовления сопровождаются фотографиями, а в некоторых рецептах есть видео процесса. Карту привязывать не нужно.'
                    : '',
                trialTextMobile: isSubscriptionRecipe
                    ? '7 дней бесплатно: все основные шаги с фотографиями, а в некоторых рецептах — видео приготовления. Карту привязывать не нужно.'
                    : '',
                trialBtn: isSubscriptionRecipe ? 'Попробовать бесплатно' : '',
                trialHref: isSubscriptionRecipe ? this._loginUrl() : '',
                tariffsHref: 'how-subscription-works.html',
            };
        }
        if (this.isTrial() && level === 'pro') {
            return {
                eyebrow: 'РЕЦЕПТ ПО ПОДПИСКЕ',
                title: 'Откройте полный рецепт',
                description: 'По подписке откроются полный список ингредиентов, пошаговое приготовление, замены продуктов, список покупок и добавление блюда в свою тарелку.',
                price: '190 ₽/мес',
                priceNote: 'доступ ко всей базе',
                btn: 'Оформить Подписку',
                href: 'cabinet.html?tab=subscription' + (ret ? '&return=' + encodeURIComponent(ret) : ''),
                tariffsHref: 'how-subscription-works.html',
            };
        }
        // expired / no_sub / error — продлить
        return {
            eyebrow: 'РЕЦЕПТ ПО ПОДПИСКЕ',
            title: 'Откройте полный рецепт',
            description: 'По подписке откроются полный список ингредиентов, пошаговое приготовление, замены продуктов, список покупок и добавление блюда в свою тарелку.',
            price: '190 ₽/мес',
            priceNote: 'доступ ко всей базе',
            btn: 'Продлить подписку',
            href: 'cabinet.html?tab=subscription' + (ret ? '&return=' + encodeURIComponent(ret) : ''),
            tariffsHref: 'how-subscription-works.html',
        };
    },
    _showPaywall(reason) {
        // Не блокировать cabinet.html — это и есть страница оплаты
        if (location.pathname.indexOf('cabinet.html') !== -1) {
            document.body.style.visibility = 'visible';
            return;
        }
        document.body.style.visibility = 'visible';
        const main = document.querySelector('main');
        if (main) { main.style.filter = 'blur(8px)'; main.style.pointerEvents = 'none'; main.style.userSelect = 'none'; }
        const existingOverlay = document.getElementById('paywall-overlay');
        if (existingOverlay) existingOverlay.remove();
        const overlay = document.createElement('div');
        overlay.id = 'paywall-overlay';
        overlay.className = 'paywall-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'paywall-title');
        const isNetworkError = reason === 'error';
        const isExpired = reason === 'expired' || reason === 'cancelled';
        const isTrialNotGranted = reason === 'trial_not_granted';
        let kicker, title, text, actionHtml, offerHtml;
        if (isNetworkError) {
            kicker = 'ПРОВЕРКА ДОСТУПА';
            title = 'Не удалось проверить доступ';
            text = 'Проверьте подключение к интернету и попробуйте снова.';
            actionHtml = '<button class="paywall-btn" data-shared-action="reload">Повторить</button>';
            offerHtml = '';
        } else {
            kicker = 'ДОСТУП К УМНОЙ ТАРЕЛКЕ';
            title = isTrialNotGranted ? 'Пробный период недоступен' : (isExpired ? 'Подписка завершена' : 'Нужна подписка');
            text = isTrialNotGranted
                ? 'Бесплатный пробный период для этого аккаунта недоступен. Оформите подписку, чтобы открыть рецепты, списки покупок и конструктор тарелки. После оплаты вы вернётесь на эту страницу.'
                : isExpired
                ? 'Продлите подписку, чтобы снова открыть рецепты, списки покупок и конструктор тарелки. После оплаты вы вернётесь на эту страницу.'
                : 'Оформите подписку, чтобы открыть рецепты, списки покупок и конструктор тарелки. После оплаты вы вернётесь на эту страницу.';
            var ret = this._currentReturnUrl();
            var subHref = 'cabinet.html?tab=subscription' + (ret ? '&return=' + encodeURIComponent(ret) : '');
            actionHtml = '<a class="paywall-btn" href="' + subHref + '">' + (isExpired ? 'Продлить подписку' : 'Оформить подписку') + '</a>';
            offerHtml = '<div class="paywall-price"><strong id="paywall-monthly-price">190 ₽/мес</strong><span>доступ ко всей базе</span></div>';
        }
        var policyLink = '<a href="personal-data-processing-policy.html" target="_blank" rel="noopener">Политика обработки персональных данных</a>';
        var offerLink = '<a href="https://voronova.online/public-offer.html" target="_blank" rel="noopener">Оферта</a>';
        var legalLinks = LEGAL_OFFER_ENABLED ? (offerLink + ' · ' + policyLink) : policyLink;
        var legalHtml = isNetworkError ? '' :
            '<div class="paywall-legal">' + legalLinks + '</div>';
        overlay.innerHTML = '<div class="paywall-card">'
            + '<div class="paywall-kicker">' + kicker + '</div>'
            + '<h2 class="paywall-title" id="paywall-title">' + title + '</h2>'
            + '<p class="paywall-text">' + text + '</p>'
            + offerHtml
            + '<div class="paywall-actions">' + actionHtml + '</div>'
            + (isNetworkError ? '' : '<a class="paywall-tariffs" href="how-subscription-works.html">Посмотреть тарифы</a>')
            + legalHtml
            + '</div>';
        document.body.appendChild(overlay);
        const primaryAction = overlay.querySelector('.paywall-btn');
        if (primaryAction) primaryAction.focus();
        if (!isNetworkError) {
            fetch(API_BASE + '/subscription/early-bird', { credentials: 'include' })
                .then(function(response) { return response.ok ? response.json() : null; })
                .then(function(data) {
                    const price = Number(data && data.prices && data.prices['1']);
                    const priceEl = document.getElementById('paywall-monthly-price');
                    if (priceEl && Number.isFinite(price) && price > 0) priceEl.textContent = Math.round(price) + ' ₽/мес';
                })
                .catch(function() {});
        }
    },
    // Refresh-токены на сервере ротируются и одноразовые. Single-flight защищает
    // параллельные запросы внутри одной вкладки, а Web Locks + BroadcastChannel
    // — между вкладками. Иначе две вкладки могут одновременно отправить одну
    // cookie: первая её ротирует, а вторая получает 401 и выбрасывает пользователя
    // на страницу входа.
    _refreshInFlight: null,
    _refreshChannel: null,
    _lastCrossTabRefreshAt: 0,
    _refreshTabId: null,
    _domainSessionReady: null,
    _startDomainSessionMigration() {
        if (typeof location === 'undefined' || location.hostname !== SESSION_MIGRATION_HOST) return null;
        if (this.isLoggedIn()) return null;
        try {
            if (sessionStorage.getItem('hp_plate_domain_session_checked') === '1') return null;
            sessionStorage.setItem('hp_plate_domain_session_checked', '1');
        } catch {
            // Private mode may block storage. A single in-memory attempt is safe.
        }
        this._domainSessionReady = this.refreshToken().then(ok => {
            if (ok && this.isLoggedIn()) {
                location.reload();
                return true;
            }
            return false;
        });
        return this._domainSessionReady;
    },
    waitForDomainSessionMigration() {
        return this._domainSessionReady || Promise.resolve(false);
    },
    _getRefreshTabId() {
        if (this._refreshTabId) return this._refreshTabId;
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            this._refreshTabId = crypto.randomUUID();
        } else {
            this._refreshTabId = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
        }
        return this._refreshTabId;
    },
    _getRefreshChannel() {
        if (this._refreshChannel || typeof BroadcastChannel === 'undefined') return this._refreshChannel;
        try {
            const channel = new BroadcastChannel('smartplate-auth-refresh');
            channel.onmessage = (event) => {
                const data = event && event.data;
                if (!data || data.type !== 'refresh-complete' || data.sender === this._getRefreshTabId()) return;
                if (!data.accessToken) return;
                this._lastCrossTabRefreshAt = Date.now();
                this._applyRefreshResponse({ accessToken: data.accessToken });
            };
            this._refreshChannel = channel;
        } catch {
            // The local single-flight/retry path remains available in older browsers.
        }
        return this._refreshChannel;
    },
    _announceRefresh(data) {
        const channel = this._getRefreshChannel();
        if (!channel || !data || !data.accessToken) return;
        try {
            channel.postMessage({
                type: 'refresh-complete',
                sender: this._getRefreshTabId(),
                accessToken: data.accessToken
            });
        } catch {
            // A failed notification must not invalidate a successful refresh.
        }
    },
    refreshToken() {
        if (this._refreshInFlight) return this._refreshInFlight;
        this._refreshInFlight = this._refreshWithCrossTabLock().finally(() => { this._refreshInFlight = null; });
        return this._refreshInFlight;
    },
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    async _refreshWithCrossTabLock() {
        // Subscribe before waiting for the lock, otherwise a tab can miss the
        // winner's token while it is queued behind that winner.
        this._getRefreshChannel();
        const refreshStartedAt = Date.now();
        const refresh = async () => {
            // A tab that just released the lock broadcasts the fresh short-lived
            // token. Give that message one turn before rotating the cookie again.
            await this._sleep(80);
            if (this._lastCrossTabRefreshAt >= refreshStartedAt) return true;
            return this._doRefresh();
        };
        const locks = typeof navigator !== 'undefined' && navigator.locks;
        if (!locks || typeof locks.request !== 'function') return refresh();
        try {
            return await locks.request('smartplate-auth-refresh', { mode: 'exclusive' }, refresh);
        } catch {
            return refresh();
        }
    },
    async _doRefresh() {
        try {
            const res = await _fetchWithTimeout(
                API_BASE + '/auth/refresh', { method: 'POST', credentials: 'include' }, 8000
            );
            if (!res.ok) {
                // Cross-tab race: another tab may rotate the one-time refresh
                // cookie while this request is in flight. Give the browser a
                // moment to apply the newer cookie, then try once more.
                if (res.status === 401) {
                    await this._sleep(500);
                    const retry = await _fetchWithTimeout(
                        API_BASE + '/auth/refresh', { method: 'POST', credentials: 'include' }, 8000
                    );
                    if (!retry.ok) return false;
                    const retryData = await retry.json();
                    const retryApplied = this._applyRefreshResponse(retryData);
                    if (retryApplied) this._announceRefresh(retryData);
                    return retryApplied;
                }
                return false;
            }
            const data = await res.json();
            const applied = this._applyRefreshResponse(data);
            if (applied) this._announceRefresh(data);
            return applied;
        } catch { return false; }
    },
    _applyRefreshResponse(data) {
        if (!data || !data.accessToken) return false;
        this._token = data.accessToken;
        sessionStorage.setItem(this._ST, data.accessToken);
        let user = this.getUser();
        if (!user && data.user && data.user.email) {
            user = this.login(
                data.user.email,
                data.user.displayName,
                data.accessToken,
                null,
                data.user.avatar,
                data.user.role,
                data.user.createdAt,
                data.user.id,
                data.user.weight
            );
        }
        if (user && data.user) {
            if (data.user.id) user.id = data.user.id;
            user.name = data.user.displayName || user.name;
            user.email = data.user.email;
            if (data.user.role) user.role = data.user.role;
            localStorage.setItem(this.KEY, JSON.stringify(user));
            this._syncProfile(data.user);
            const nameKey = this._userKey('hp_user_name');
            if (data.user.displayName) localStorage.setItem(nameKey, data.user.displayName);
            if (data.user.avatar && !this.getAvatar()) this.setAvatar(data.user.avatar);
        }
        return true;
    },
    // Проактивный refresh — не даём токену протухнуть
    _refreshTimer: null,
    startAutoRefresh() {
        if (this._refreshTimer) return;
        this._refreshTimer = setInterval(() => {
            if (this.isLoggedIn()) this.refreshToken();
        }, 3 * 60 * 1000); // каждые 3 мин
    },
    async api(path, options = {}) {
        // Plain objects are JSON payloads; pre-stringified bodies keep working.
        const requestOptions = Object.assign({}, options);
        const isFormData = typeof FormData !== 'undefined' && requestOptions.body instanceof FormData;
        if (requestOptions.body != null && typeof requestOptions.body === 'object' && !isFormData) {
            requestOptions.body = JSON.stringify(requestOptions.body);
        }
        const token = this.getToken();
        const needsCT = requestOptions.body != null && !isFormData;
        const defaults = needsCT ? { 'Content-Type': 'application/json' } : {};
        const headers = Object.assign(defaults, requestOptions.headers || {});
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const res = await fetch(API_BASE + path, Object.assign({}, requestOptions, { headers, credentials: 'include' }));
        if (res.status === 401) {
            const refreshed = await this.refreshToken();
            if (refreshed) {
                headers['Authorization'] = 'Bearer ' + this.getToken();
                return fetch(API_BASE + path, Object.assign({}, requestOptions, { headers, credentials: 'include' }));
            }
            // Не делаем logout — пусть checkAccess решит что показать
            return res;
        }
        return res;
    }
};

// Запускается только на новом frontend-host и ничего не меняет для действующего
// legacy app.voronova.online. checkAccess/loadContent дождутся результата ниже.
Auth._startDomainSessionMigration();

// ─── FEEDBACK NOTIFICATIONS ──────────────────────────────────────────────────
// Глобальный индикатор «есть новый ответ Юлии» в шапке всех страниц платформы.
// Подсветка строится по hooks (#sp-profile-dot, #user-dd-feedback, #user-dd-feedback-sep)
// — если их нет на странице (например, header другой), Feedback.refresh() просто молчит.
// Гость → запроса не делаем, 401 игнорируется по Auth.api.
const Feedback = {
    async loadUnseen() {
        if (!Auth.getToken()) return 0;
        try {
            const res = await Auth.api('/feedback');
            if (!res.ok) return 0;
            const all = await res.json();
            if (!Array.isArray(all)) return 0;
            // Считаем непрочитанные сообщения от Юлии (admin без seen_at) по всем тредам.
            // Backward compat: если бэкенд не отдал messages (старая сессия) — fallback на reply_seen.
            var n = 0;
            for (var i = 0; i < all.length; i++) {
                var f = all[i];
                if (!f) continue;
                if (Array.isArray(f.messages)) {
                    for (var j = 0; j < f.messages.length; j++) {
                        var m = f.messages[j];
                        if (m && m.sender_type === 'admin' && !m.seen_at) n++;
                    }
                } else if (f.status === 'answered' && !f.reply_seen) {
                    n++;
                }
            }
            return n;
        } catch (e) { return 0; }
    },
    _apply(n) {
        const dot = document.getElementById('sp-profile-dot');
        const badge = document.getElementById('user-badge');
        const mi = document.getElementById('user-dd-feedback');
        const sep = document.getElementById('user-dd-feedback-sep');
        if (n > 0) {
            if (dot) { dot.hidden = false; dot.textContent = n > 9 ? '9+' : String(n); }
            if (badge) {
                badge.setAttribute('data-fb-unseen', '1');
                badge.setAttribute('title', 'Есть новый ответ Юлии');
            }
            if (mi) mi.hidden = false;
            if (sep) sep.hidden = false;
        } else {
            if (dot) { dot.hidden = true; dot.textContent = ''; }
            if (badge) {
                badge.removeAttribute('data-fb-unseen');
                badge.removeAttribute('title');
            }
            if (mi) mi.hidden = true;
            if (sep) sep.hidden = true;
        }
    },
    async refresh() {
        const n = await this.loadUnseen();
        this._apply(n);
        return n;
    },
    clear() { this._apply(0); }
};

// Авто-обновление индикатора профиля. Если у пользователя нет токена — молчим
// (никаких 401, никаких лишних запросов для гостей).
document.addEventListener('DOMContentLoaded', function () {
    if (!Auth.isLoggedIn()) return;
    if (!document.getElementById('user-badge')) return;
    Feedback.refresh();
});

// ─── CONTENT UPDATES ────────────────────────────────────────────────────────
// Новые рецепты и важные текстовые новости живут в одной ленте. Бейдж
// появляется только у авторизованных пользователей и исчезает после открытия
// конкретного обновления, а не просто после раскрытия панели.
const ContentUpdates = {
    _wired: false,
    _escape(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },
    _date(value) {
        try { return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); }
        catch (e) { return ''; }
    },
    _ensureUi() {
        const host = document.getElementById('user-wrap');
        const profile = document.getElementById('user-badge');
        if (!host || !profile) return null;
        let wrap = document.getElementById('sp-updates');
        if (wrap) return wrap;
        wrap = document.createElement('div');
        wrap.className = 'sp-updates';
        wrap.id = 'sp-updates';
        wrap.hidden = true;
        wrap.innerHTML = '<button class="sp-updates-btn" id="sp-updates-btn" type="button" aria-label="Обновления" aria-expanded="false" aria-controls="sp-updates-panel">'
            + '<svg class="sp-updates-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4"/></svg>'
            + '<span class="sp-updates-label">Новое</span><span class="sp-updates-count" id="sp-updates-count">0</span>'
            + '</button><aside class="sp-updates-panel" id="sp-updates-panel" aria-label="Новые обновления"></aside>';
        host.insertBefore(wrap, profile);
        const button = document.getElementById('sp-updates-btn');
        const panel = document.getElementById('sp-updates-panel');
        button.addEventListener('click', function(event) {
            event.stopPropagation();
            const open = panel.classList.toggle('open');
            button.setAttribute('aria-expanded', String(open));
        });
        panel.addEventListener('click', async function(event) {
            const link = event.target.closest('[data-content-update-id]');
            if (!link) return;
            event.preventDefault();
            const href = link.getAttribute('href');
            try { await ContentUpdates.markRead(link.dataset.contentUpdateId); } catch (e) {}
            location.href = href;
        });
        if (!this._wired) {
            this._wired = true;
            document.addEventListener('click', function(event) {
                if (event.target.closest('#sp-updates')) return;
                const activePanel = document.getElementById('sp-updates-panel');
                const activeButton = document.getElementById('sp-updates-btn');
                if (activePanel) activePanel.classList.remove('open');
                if (activeButton) activeButton.setAttribute('aria-expanded', 'false');
            });
            document.addEventListener('keydown', function(event) {
                if (event.key !== 'Escape') return;
                const activePanel = document.getElementById('sp-updates-panel');
                const activeButton = document.getElementById('sp-updates-btn');
                if (activePanel) activePanel.classList.remove('open');
                if (activeButton) activeButton.setAttribute('aria-expanded', 'false');
            });
        }
        return wrap;
    },
    _render(items) {
        const panel = document.getElementById('sp-updates-panel');
        if (!panel) return;
        const countLabel = items.length === 1 ? '1 обновление' : items.length + ' обновления';
        panel.innerHTML = '<div class="sp-updates-panel-head"><strong>Новое</strong><span>' + countLabel + '</span></div>'
            + items.map(function(item) {
                const isRecipe = item.type === 'recipe' && item.recipe_id && item.recipe_name;
                const title = isRecipe ? item.recipe_name : 'Обновление в Умной тарелке';
                const href = isRecipe ? 'recipe.html?id=' + encodeURIComponent(item.recipe_id) : 'index.html#new-block';
                const image = isRecipe && item.recipe_photo
                    ? '<img src="' + ContentUpdates._escape(item.recipe_photo) + '" alt="' + ContentUpdates._escape(title) + '">'
                    : '<span class="sp-update-icon" aria-hidden="true">✦</span>';
                return '<a class="sp-update-item' + (isRecipe ? ' is-recipe' : '') + '" href="' + href + '" data-content-update-id="' + Number(item.id) + '">'
                    + image + '<span class="sp-update-copy"><span class="sp-update-eyebrow">'
                    + ContentUpdates._escape(isRecipe ? 'Новый рецепт · ' : 'Обновление · ')
                    + ContentUpdates._escape(ContentUpdates._date(item.created_at)) + '</span>'
                    + '<strong>' + ContentUpdates._escape(title) + '</strong>'
                    + '<span class="sp-update-text">' + ContentUpdates._escape(item.text || '') + '</span>'
                    + '<span class="sp-update-cta">' + (isRecipe ? 'Открыть рецепт' : 'Посмотреть') + ' →</span></span></a>';
            }).join('') + '<div class="sp-updates-panel-foot">Отметка исчезнет после открытия обновления.</div>';
    },
    _apply(items) {
        const updates = Array.isArray(items) ? items : [];
        const wrap = this._ensureUi();
        if (!wrap) return;
        wrap.hidden = updates.length === 0;
        if (!updates.length) return;
        const badge = document.getElementById('sp-updates-count');
        if (badge) badge.textContent = updates.length > 9 ? '9+' : String(updates.length);
        this._render(updates);
    },
    async refresh() {
        if (!Auth.getToken()) return [];
        try {
            const res = await Auth.api('/content/updates?limit=5');
            if (!res.ok) return [];
            const items = await res.json();
            this._apply(items);
            return items;
        } catch (e) { return []; }
    },
    async markRead(id) {
        const res = await Auth.api('/content/updates/' + encodeURIComponent(id) + '/read', { method: 'POST' });
        if (!res.ok) throw new Error('Update could not be marked read');
        return res.json();
    }
};

document.addEventListener('DOMContentLoaded', function () {
    if (!Auth.isLoggedIn()) return;
    if (!document.getElementById('user-wrap')) return;
    ContentUpdates.refresh();
});

// ─── ACTIVE NAV LINK ─────────────────────────────────────────────────────────
// Подсвечивает текущую ссылку в .sp-nav по URL текущей страницы.
// index.html  → «Главная»
// category.html?cat=X     → ссылка с cat=X
// recipe.html?from=X      → ссылка с cat=X (категория, из которой пришли)
// recipe.html без from    → опционально data-cat на <body>
document.addEventListener('DOMContentLoaded', function () {
    const nav = document.querySelector('.sp-nav');
    if (!nav) return;
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const params = new URLSearchParams(location.search);
    const cat = params.get('cat');
    const from = params.get('from');
    const links = nav.querySelectorAll('a');
    let matched = null;
    links.forEach(function(a) {
        const href = a.getAttribute('href') || '';
        const hPath = (href.split('?')[0].split('/').pop() || '').toLowerCase();
        const hParams = new URLSearchParams((href.split('?')[1] || ''));
        const hCat = hParams.get('cat');
        if (path === 'index.html' || path === '' || path === '/') {
            if (hPath === 'index.html' && !hCat) matched = a;
        } else if (path === 'category.html' && cat && hCat === cat) {
            matched = a;
        } else if (path === 'recipe.html') {
            // 1) из ?from= (нав-ссылки рецептов везде передают from)
            // 2) fallback: data-cat на <body> если кто-то его выставит
            const targetCat = from || document.body.getAttribute('data-cat');
            if (targetCat && hCat === targetCat) matched = a;
        }
    });
    if (matched) matched.classList.add('active');
});

// ─── FAVORITES ───────────────────────────────────────────────────────────────
const Favorites = {
    _key()        { return Auth._userKey('fav_recipes'); },
    get()         { try { return JSON.parse(localStorage.getItem(this._key()) || '[]'); } catch { return []; } },
    set(v)        { localStorage.setItem(this._key(), JSON.stringify(v)); },
    has(id)       { return this.get().includes(id); },
    add(id)       { const f = this.get(); if (!f.includes(id)) { f.unshift(id); this.set(f); } },
    remove(id)    { this.set(this.get().filter(x => x !== id)); },
    toggle(id) {
        this.has(id) ? this.remove(id) : this.add(id);
        const now = this.has(id);
        if (Auth.getToken()) {
            Auth.api('/favorites/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipe_id: id }) }).catch(function() {});
        }
        return now;
    },
    /** Pull favorites from server, merge with local, push back if needed */
    load() {
        if (!Auth.getToken()) return Promise.resolve();
        var self = this;
        var local = self.get();
        return Auth.api('/favorites').then(function(r) { return r.json(); }).then(function(server) {
            if (!Array.isArray(server)) return;
            // Merge: keep order — server first, then local-only items
            var merged = server.slice();
            local.forEach(function(id) { if (merged.indexOf(id) === -1) merged.push(id); });
            self.set(merged);
            // If local had items not on server, sync them up
            if (merged.length !== server.length) {
                Auth.api('/favorites/sync', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: merged }) }).catch(function() {});
            }
        }).catch(function() {});
    }
};

// ─── NOTES ───────────────────────────────────────────────────────────────────
const Notes = {
    _key()       { return Auth._userKey('user_notes'); },
    get()        { try { return JSON.parse(localStorage.getItem(this._key()) || '[]'); } catch { return []; } },
    set(v)       { localStorage.setItem(this._key(), JSON.stringify(v)); },
    add(text)    {
        const notes = this.get();
        const title = text.trim().split('\n')[0].trim().slice(0, 60) || 'Заметка';
        const note = { id: Date.now(), text, title, date: new Date().toISOString() };
        notes.unshift(note); this.set(notes);
        if (Auth.getToken()) {
            Auth.api('/notes/upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: note.id, title: note.title, text: note.text }) }).catch(function() {});
        }
        return note;
    },
    update(id, text) {
        const notes = this.get();
        const n = notes.find(n => n.id === id);
        if (n) {
            n.text = text; n.title = text.trim().split('\n')[0].trim().slice(0, 60) || 'Заметка'; n.updated = new Date().toISOString(); this.set(notes);
            if (Auth.getToken()) {
                Auth.api('/notes/upsert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id, title: n.title, text: n.text }) }).catch(function() {});
            }
        }
    },
    remove(id) {
        this.set(this.get().filter(n => n.id !== id));
        if (Auth.getToken()) {
            Auth.api('/notes/' + id, { method: 'DELETE' }).catch(function() {});
        }
    },
    /** Pull notes from server, merge with local, push back if needed */
    load() {
        if (!Auth.getToken()) return Promise.resolve();
        var self = this;
        var local = self.get();
        return Auth.api('/notes').then(function(r) { return r.json(); }).then(function(server) {
            if (!Array.isArray(server)) return;
            // Build map by id: server wins on conflicts, local-only items appended
            var map = {};
            server.forEach(function(n) { map[n.id] = n; });
            var localOnly = [];
            local.forEach(function(n) {
                if (!map[n.id]) localOnly.push(n);
            });
            var merged = server.concat(localOnly);
            self.set(merged);
            // If local had items not on server, sync them up
            if (localOnly.length) {
                Auth.api('/notes/sync', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: merged }) }).catch(function() {});
            }
        }).catch(function() {});
    }
};

// ─── MY PLATE ────────────────────────────────────────────────────────────────
const Plate = {
    _key()  { return Auth._userKey('plate_items'); },
    _hkey() { return Auth._userKey('plate_history'); },
    _mealTypes: { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' },
    _safeMealType(value) {
        return Object.prototype.hasOwnProperty.call(this._mealTypes, value) ? value : '';
    },
    _historySignature(entry) {
        const items = Array.isArray(entry.items) ? entry.items.map(function(item) {
            return [item.recipeId || '', item.name || '', Number(item.kcal) || 0, Number(item.protein) || 0, Number(item.fat) || 0, Number(item.carbs) || 0, Number(item.fiber) || 0];
        }) : [];
        const t = entry.totals || {};
        return JSON.stringify([items, Number(t.kcal) || 0, Number(t.protein) || 0, Number(t.fat) || 0, Number(t.carbs) || 0, Number(t.fiber) || 0]);
    },
    _dedupeItems(items) {
        const seenRecipeIds = new Set();
        return (Array.isArray(items) ? items : []).filter(function(item) {
            const recipeId = item && typeof item.recipeId === 'string' ? item.recipeId.trim() : '';
            if (!recipeId) return true;
            if (seenRecipeIds.has(recipeId)) return false;
            seenRecipeIds.add(recipeId);
            return true;
        });
    },
    _dedupeHistory(history) {
        const sorted = (Array.isArray(history) ? history : []).filter(function(entry) {
            return entry && Array.isArray(entry.items) && entry.items.length;
        }).slice().sort(function(a, b) {
            return new Date(b.date) - new Date(a.date);
        });
        const kept = [];
        sorted.forEach((entry) => {
            entry.mealType = this._safeMealType(entry.mealType);
            const sig = this._historySignature(entry);
            const time = new Date(entry.date).getTime();
            const duplicate = kept.some(function(saved) {
                return saved.sig === sig && Number.isFinite(time) && Math.abs(saved.time - time) <= 60000;
            });
            if (!duplicate) kept.push({ entry, sig, time });
        });
        return kept.slice(0, 30).map(function(saved) { return saved.entry; });
    },
    get()  { try { return this._dedupeItems(JSON.parse(localStorage.getItem(this._key()) || '[]')); } catch { return []; } },
    set(v, options) { localStorage.setItem(this._key(), JSON.stringify(this._dedupeItems(v))); updatePlateIcon(options); },
    add(item) {
        const p = this.get();
        const recipeId = item && typeof item.recipeId === 'string' ? item.recipeId.trim() : '';
        if (recipeId && p.some(function(existing) {
            return existing && typeof existing.recipeId === 'string' && existing.recipeId.trim() === recipeId;
        })) return false;
        p.push({ ...item, addedAt: Date.now() });
        this.set(p, { emphasize: true });
        this._syncToServer();
        return true;
    },
    remove(idx) {
        const p = this.get();
        p.splice(idx, 1);
        this.set(p);
        this._syncToServer();
    },
    clear() {
        localStorage.setItem(this._key(), '[]');
        try { localStorage.setItem(Auth._userKey('plate_last_local_change'), String(Date.now())); } catch (e) {}
        updatePlateIcon();
        this._syncToServer();
    },
    count() { return this.get().length; },
    totals() {
        return this.get().reduce((t, i) => ({
            kcal:    t.kcal    + (i.kcal    || 0),
            protein: t.protein + (i.protein || 0),
            fat:     t.fat     + (i.fat     || 0),
            carbs:   t.carbs   + (i.carbs   || 0),
            fiber:   t.fiber   + (i.fiber   || 0)
        }), { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 });
    },
    saveHistory(mealType) {
        const items = this.get();
        if (!items.length) return;
        const totals = this.totals();
        const date = new Date().toISOString();
        const safeMealType = this._safeMealType(mealType);
        const h = this.getHistory();
        h.unshift({ date, items, totals, mealType: safeMealType });
        localStorage.setItem(this._hkey(), JSON.stringify(this._dedupeHistory(h)));
        this.clear();
        if (window.SmartPlateMetrika) window.SmartPlateMetrika.goal('plate_saved');
        if (window.SmartPlateGoogleAnalytics) window.SmartPlateGoogleAnalytics.event('plate_saved');
        // A separate analytics event for a plate saved by an authenticated user.
        // Guest saves remain useful for the product funnel but are not account actions.
        const token = Auth.getToken();
        if (token) {
            if (window.SmartPlateMetrika) window.SmartPlateMetrika.goal('plate_saved_registered');
            if (window.SmartPlateGoogleAnalytics) window.SmartPlateGoogleAnalytics.event('plate_saved_registered');
            // Sync save to server
            Auth.api('/plate/history', {
                method: 'POST',
                body: JSON.stringify({ date, items, totals, mealType: safeMealType })
            }).catch(function() {});
        }
    },
    getHistory() {
        try {
            return this._dedupeHistory(JSON.parse(localStorage.getItem(this._hkey()) || '[]'));
        } catch {
            return [];
        }
    },
    setHistoryMealType(date, mealType) {
        const safeMealType = this._safeMealType(mealType);
        const h = this.getHistory().map(function(entry) {
            if (entry.date === date) return { ...entry, mealType: safeMealType };
            return entry;
        });
        localStorage.setItem(this._hkey(), JSON.stringify(h));
        if (Auth.getToken()) {
            Auth.api('/plate/history/meal-type', {
                method: 'PUT',
                body: JSON.stringify({ date, mealType: safeMealType })
            }).catch(function() {});
        }
    },
    removeHistory(date) {
        const removeLocal = () => {
            const h = this.getHistory().filter(function(entry) { return entry.date !== date; });
            localStorage.setItem(this._hkey(), JSON.stringify(h));
        };
        if (!Auth.getToken()) {
            removeLocal();
            return Promise.resolve();
        }
        return Auth.api('/plate/history', {
            method: 'DELETE',
            body: JSON.stringify({ date })
        }).then(function(response) {
            if (!response || !response.ok) throw new Error('Не удалось удалить запись журнала');
            removeLocal();
        });
    },
    /** Sync current plate to server (fire-and-forget) */
    _syncToServer() {
        if (!Auth.getToken()) return;
        Auth.api('/plate', {
            method: 'PUT',
            body: JSON.stringify({ items: this.get() })
        }).catch(function() {});
    },
    /** Pull from server, merge with local, push back if needed. Called after login. */
    load() {
        if (!Auth.getToken()) return Promise.resolve();
        var self = this;
        var hasLocalState = localStorage.getItem(self._key()) !== null;
        var localItems = self.get();
        var localHistory = self.getHistory();

        var pItems = Auth.api('/plate').then(function(r) { return r.json(); }).catch(function() { return null; });
        var pHistory = Auth.api('/plate/history').then(function(r) { return r.json(); }).catch(function() { return null; });

        return Promise.all([pItems, pHistory]).then(function(results) {
            var serverData = results[0];
            var serverHistory = results[1];

            // --- Merge current plate items ---
            var serverItems = (serverData && Array.isArray(serverData.items)) ? serverData.items : [];
            if (serverItems.length && !localItems.length) {
                if (hasLocalState) {
                    // User explicitly cleared locally (e.g. saveHistory) — local empty wins.
                    // Push empty up so a stale server snapshot can't resurrect old items.
                    self._syncToServer();
                } else {
                    // First load on this device — adopt server items.
                    self.set(serverItems);
                }
            } else if (localItems.length && !serverItems.length) {
                // Local has items, server is empty — push local to server
                self._syncToServer();
            } else if (localItems.length && serverItems.length) {
                // Both have items — keep local (user's active session), push to server
                self._syncToServer();
            }
            // Both empty — nothing to do

            // --- Merge history ---
            var sHist = Array.isArray(serverHistory) ? serverHistory : [];
            if (sHist.length && !localHistory.length) {
                // Server has history, local empty — take server
                localStorage.setItem(self._hkey(), JSON.stringify(sHist.slice(0, 30)));
            } else if (localHistory.length && !sHist.length) {
                // Local has history, server empty — push to server
                Auth.api('/plate/history/sync', {
                    method: 'PUT',
                    body: JSON.stringify({ history: localHistory })
                }).catch(function() {});
            } else if (localHistory.length && sHist.length) {
                // Both have history — merge by date, deduplicate, keep newest 30
                var map = {};
                sHist.forEach(function(h) { map[h.date] = h; });
                localHistory.forEach(function(h) { if (!map[h.date]) map[h.date] = h; });
                var merged = self._dedupeHistory(Object.values(map).sort(function(a, b) {
                    return new Date(b.date) - new Date(a.date);
                }));
                localStorage.setItem(self._hkey(), JSON.stringify(merged));
                // Find local-only entries to sync up
                var serverDates = {};
                sHist.forEach(function(h) { serverDates[h.date] = true; });
                var localOnly = localHistory.filter(function(h) { return !serverDates[h.date]; });
                if (localOnly.length) {
                    Auth.api('/plate/history/sync', {
                        method: 'PUT',
                        body: JSON.stringify({ history: localOnly })
                    }).catch(function() {});
                }
            }
        }).catch(function() {});
    }
};

function plateMealTypePickerHtml() {
    return '<div class="pv1-meal-type">'
        + '<label for="plate-meal-type">Прием пищи <span>необязательно</span></label>'
        + '<select id="plate-meal-type">'
        + '<option value="" selected>Не указывать</option>'
        + '<option value="breakfast">Завтрак</option>'
        + '<option value="lunch">Обед</option>'
        + '<option value="dinner">Ужин</option>'
        + '<option value="snack">Перекус</option>'
        + '</select>'
        + '<small>После записи тарелка очистится, а блюда появятся в журнале. Тип приема пищи можно изменить позже.</small>'
        + '</div>';
}

function getSelectedPlateMealType() {
    var select = document.getElementById('plate-meal-type');
    return select ? select.value : '';
}


function updatePlateIcon(options) {
    const n = Plate.count();
    const emphasize = Boolean(options && options.emphasize && n > 0);
    document.querySelectorAll('.plate-count').forEach(el => {
        el.textContent = n;
        el.hidden = n <= 0;
        if (emphasize) {
            // Restart the short acknowledgement only after a successful Plate.add().
            el.classList.remove('is-updated');
            void el.offsetWidth;
            el.classList.add('is-updated');
        }
    });
}

// Bfcache fix: после Plate.add() + history.back() браузер восстанавливает
// предыдущую страницу из back-forward cache без перезапуска скриптов, поэтому
// .plate-count и компактный summary остаются в старом состоянии. Здесь
// синхронизируем виджеты из localStorage при возврате из bfcache.
window.addEventListener('pageshow', function(e) {
    if (!e.persisted) return;
    updatePlateIcon();
    if (typeof renderPlateInline === 'function') renderPlateInline();
});

// ─── RECIPE DATA (loaded from API) ───────────────────────────────────────────
const RECIPES = {};
let CATEGORIES = {};
let _contentLoaded = false;

// Normalize image paths: ../images/... → absolute URL on main site.
// Контракт photo (для обложки рецепта и для step.photo):
//   string      → нормализованный URL
//   string[]    → массив нормализованных URL (пустые/не-строки отфильтрованы)
//   true        → true (плейсхолдер-маркер, рендерится как «📷 Фото шага N»)
//   null / undefined / "" / что-то иное → null (блок фото не рендерится)
function _fixPhotoStr(p) {
    if (typeof p !== 'string' || !p) return null;
    if (p.startsWith('../images/')) return _withRecipeImageVersion(SITE_BASE + '/' + p.slice(3));
    if (p.startsWith('/images/')) return _withRecipeImageVersion(SITE_BASE + p);
    if (p.startsWith('images/')) return _withRecipeImageVersion(SITE_BASE + '/' + p);
    return p;
}
function _withRecipeImageVersion(url) {
    if (typeof url !== 'string' || !url) return url;
    if (!/\/images\/recipes\//.test(url)) return url;
    return url + (url.includes('?') ? '&' : '?') + 'v=' + RECIPE_IMAGE_VERSION;
}
function _fixPhoto(p) {
    if (p === true) return true;
    if (Array.isArray(p)) {
        const arr = p.map(_fixPhotoStr).filter(Boolean);
        return arr.length ? arr : null;
    }
    return _fixPhotoStr(p);
}

// Map API snake_case → frontend camelCase
function _mapRecipe(r) {
    // access_level — источник истины; free оставляем как legacy mirror для совместимости
    const accessLevel = r.access_level || (r.is_free ? 'free' : 'pro');
    const yieldLabel = ['light-vegetable-broth', 'dark-vegetable-broth'].includes(r.id) ? '3 л' : null;
    return {
        id: r.id, cat: r.cat, categories: r.categories || (r.cat ? [r.cat] : []), name: r.name, emoji: r.emoji || '🍴',
        time: r.time_min || 30, timeLabel: r.time_label || null, diff: r.difficulty || 'easy',
        // Овощные бульоны готовят объёмом, а не порциями: не подставляем им дефолтные 4 порции.
        servings: yieldLabel ? null : (r.servings || 4),
        portionGrams: yieldLabel ? null : (r.portion_grams == null ? null : Number(r.portion_grams)),
        yieldLabel,
        accessLevel,
        free: accessLevel === 'free',
        isSeasonal: r.is_seasonal === true,
        kcal: r.kcal || 0, protein: r.protein || 0, fat: r.fat || 0,
        carbs: r.carbs || 0, fiber: r.fiber || 0,
        tags: r.tags || [],
        photo: _fixPhoto(r.photo), imgPosition: r.img_position || null,
        quote: r.quote || null,
        ingredients: r.ingredients || [],
        steps: (r.steps || []).map(s => typeof s === 'object' && s && s.photo ? {...s, photo: _fixPhoto(s.photo)} : s),
        previewIngredients: r.preview_ingredients || [],
        previewSteps: r.preview_steps || [],
        ingredientCount: Number(r.ingredient_count) || 0,
        stepCount: Number(r.step_count) || 0,
        note: r.note || null,
        vkVideo: r.vk_video || null,
        ytVideo: r.yt_video || null,
        dzenVideo: r.dzen_video || null,
        addProtein: r.add_protein || [],
        addFat: r.add_fat || [],
        addCarbs: r.add_carbs || [],
        addFiber: r.add_fiber || [],
        autoAddons: r.auto_addons || {},
        isSoup: r.is_soup === true,
        // Кураторские основные ингредиенты для навигационных выборок (ingredient.html).
        // НЕ состав рецепта. Источник — recipes.main_ingredients (TEXT[]).
        mainIngredients: r.main_ingredients || [],
        dietaryFlags: r.dietary_flags || [],
        dietaryVerified: r.dietary_verified === true,
        sortOrder: r.sort_order || 0,
        added: r.created_at ? new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : null,
        addedTs: r.created_at ? new Date(r.created_at).getTime() : 0,
    };
}

let _contentError = false;
let _contentErrorType = '';
let _contentErrorDetails = null;
let _contentIsStale = false;
let _contentRefreshInFlight = null;
const LEGACY_CONTENT_CACHE_PREFIX = 'sp_content_cache_v1:';
// v4 fixes a guest regression: free recipes retain their public instructions.
// v5 added the first safe preview shape; v6 also carries it for pro recipes.
const PREVIOUS_CONTENT_CACHE_PREFIX = 'sp_content_cache_v4:';
const LAST_CONTENT_CACHE_PREFIX = 'sp_content_cache_v5:';
const CONTENT_CACHE_PREFIX = 'sp_content_cache_v6:';
const CONTENT_CACHE_MAX_AGE = 6 * 60 * 60 * 1000;
const CONTENT_STALE_MAX_AGE = 14 * 24 * 60 * 60 * 1000;

function _contentAudienceKey() {
    const user = Auth.getUser();
    if (!user) return 'guest';
    return 'user:' + String(user.id || user.email || 'unknown') + ':' + String(user.role || 'user');
}

function _contentCacheKey() {
    return CONTENT_CACHE_PREFIX + encodeURIComponent(_contentAudienceKey());
}

// Экспортируем как обычную глобальную функцию: кабинет и редактор рецептов
// сбрасывают кэш после изменения данных, влияющих на выдачу.
function clearContentCache() {
    [sessionStorage, localStorage].forEach(storage => {
        try {
            for (let i = storage.length - 1; i >= 0; i--) {
                const key = storage.key(i);
                if (key && (
                    key.indexOf(CONTENT_CACHE_PREFIX) === 0 ||
                    key.indexOf(PREVIOUS_CONTENT_CACHE_PREFIX) === 0 ||
                    key.indexOf(LAST_CONTENT_CACHE_PREFIX) === 0 ||
                    key.indexOf(LEGACY_CONTENT_CACHE_PREFIX) === 0
                )) {
                    storage.removeItem(key);
                }
            }
        } catch (_) {}
    });
}

function _validContentCache(storage, maxAge) {
    try {
        const cached = JSON.parse(storage.getItem(_contentCacheKey()) || 'null');
        if (!cached || !cached.savedAt || Date.now() - cached.savedAt > maxAge) return null;
        if (!Array.isArray(cached.recipes) || !Array.isArray(cached.categories)) return null;
        return cached;
    } catch (_) { return null; }
}

function _readContentCache(maxAge = CONTENT_CACHE_MAX_AGE) {
    // Авторизованный пользователь всегда получает свежую серверную матрицу
    // доступа и не восстанавливает ранее выданные платные поля из storage.
    if (Auth.isLoggedIn()) return null;
    const sessionCached = _validContentCache(sessionStorage, maxAge);
    const persistentCached = _validContentCache(localStorage, maxAge);
    if (!sessionCached) return persistentCached;
    if (!persistentCached) return sessionCached;
    return sessionCached.savedAt >= persistentCached.savedAt ? sessionCached : persistentCached;
}

function _writeContentCache(payload, savedAt = Date.now()) {
    if (Auth.isLoggedIn()) return;
    // API already grants guests the full content of free recipes and strips it
    // from trial/pro recipes. Preserve only that public free content in storage:
    // otherwise a guest who visits the catalogue before a free recipe loses its
    // ingredients, steps and step photos on the recipe page.
    const publicRecipes = payload.recipes.map(recipe => {
        const accessLevel = recipe && (recipe.access_level || (recipe.is_free ? 'free' : 'pro'));
        if (accessLevel === 'free') return recipe;
        const { ingredients, steps, note, ...meta } = recipe || {};
        return meta;
    });
    const serialized = JSON.stringify({
        savedAt,
        recipes: publicRecipes,
        categories: payload.categories,
        ingredients: []
    });
    try {
        sessionStorage.setItem(_contentCacheKey(), serialized);
    } catch (_) {}
    try {
        // Persistent last-known-good data keeps the catalogue usable in a new tab
        // and after a short provider/DNS outage. Audience-specific keys plus
        // clearContentCache() prevent paid payloads crossing account boundaries.
        localStorage.setItem(_contentCacheKey(), serialized);
    } catch (_) {}
}

// Remove old cache shapes before any read. v1 could hold paid content; v3
// removed the public content of free recipes and broke their recipe pages.
[sessionStorage, localStorage].forEach(storage => {
    try {
        for (let i = storage.length - 1; i >= 0; i--) {
            const key = storage.key(i);
            if (key && (
                key.indexOf(LEGACY_CONTENT_CACHE_PREFIX) === 0 ||
                key.indexOf(PREVIOUS_CONTENT_CACHE_PREFIX) === 0 ||
                key.indexOf(LAST_CONTENT_CACHE_PREFIX) === 0
            )) storage.removeItem(key);
        }
    } catch (_) {}
});

function _applyContentPayload(payload) {
    Object.keys(RECIPES).forEach(id => { delete RECIPES[id]; });
    Object.keys(CATEGORIES).forEach(id => { delete CATEGORIES[id]; });

    if (window.SP_INGREDIENTS && typeof SP_INGREDIENTS.addIngredients === 'function') {
        SP_INGREDIENTS.addIngredients(payload.ingredients || []);
    }
    payload.recipes.forEach(r => {
        try {
            RECIPES[r.id] = _mapRecipe(r);
        } catch (err) {
            console.error('Failed to map recipe', r && r.id, err);
        }
    });
    payload.categories.forEach(c => {
        CATEGORIES[c.id] = {
            id: c.id, name: c.name, emoji: c.emoji, color: c.color,
            desc: c.description || '',
            sort_order: c.sort_order,
            coverRecipeId: c.cover_recipe_id || null,
            dishes: c.dishes || [],
            autoAddons: c.auto_addons || {}
        };
    });
}

// Контент — основа почти всех экранов SmartPlate. Без таймаута один зависший
// запрос оставляет страницу в skeleton-состоянии навсегда. AbortController
// обрывает только конкретный запрос и позволяет показать понятную ошибку.
function _fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 8000);
    const fetchOptions = Object.assign({}, options || {}, { signal: controller.signal });
    return fetch(url, fetchOptions).finally(() => clearTimeout(timer));
}

// Transient TLS/DNS stalls often affect several requests at once. Fresh attempts
// are spaced out instead of immediately repeating the same failing route.
async function _fetchWithRetry(url, options, timeouts) {
    const attemptTimeouts = Array.isArray(timeouts) && timeouts.length ? timeouts : [8000, 12000, 15000];
    let lastError = null;
    for (let attempt = 0; attempt < attemptTimeouts.length; attempt++) {
        if (attempt > 0) {
            const baseDelay = attempt === 1 ? 1000 : 3000;
            const jitter = Math.floor(Math.random() * 500);
            await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
        }
        try {
            const response = await _fetchWithTimeout(url, options, attemptTimeouts[attempt]);
            const retryableStatus = response.status === 408 || response.status === 425 ||
                response.status === 429 || response.status >= 500;
            if (!retryableStatus || attempt === attemptTimeouts.length - 1) return response;
            lastError = new Error('Content API returned retryable status ' + response.status);
            lastError.contentType = response.status === 429 ? 'rate-limit' : 'server';
            lastError.status = response.status;
        } catch (err) {
            const retryable = err && (err.name === 'AbortError' || err.name === 'TypeError');
            if (!retryable) throw err;
            lastError = err;
        }
    }
    throw lastError || new Error('Content request failed');
}

async function _fetchContentPayload() {
    const migrated = await Auth.waitForDomainSessionMigration();
    if (migrated) return { recipes: [], categories: [], ingredients: [] };
    // New tabs start with empty sessionStorage. If the user is logged in but token
    // is missing, refresh it first — otherwise the API strips paid fields.
    if (Auth.isLoggedIn() && !Auth.getToken()) await Auth.refreshToken();

    const headers = {};
    const token = Auth.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const ingredientsPromise = _fetchWithRetry(
        CONTENT_API_BASE + '/content/ingredients', { headers }, [2500, 5000]
    ).then(res => res.ok ? res.json() : []).catch(() => []);
    const [recipesRes, catsRes, ingredients] = await Promise.all([
        _fetchWithRetry(CONTENT_API_BASE + '/content/recipes', { headers }, [6000, 8000, 10000]),
        _fetchWithRetry(CONTENT_API_BASE + '/content/categories', { headers }, [6000, 8000, 10000]),
        ingredientsPromise
    ]);
    if (!recipesRes.ok || !catsRes.ok) {
        const error = new Error('Content API returned non-OK status');
        error.contentType = recipesRes.status === 429 || catsRes.status === 429 ? 'rate-limit' : 'server';
        error.statuses = [recipesRes.status, catsRes.status];
        throw error;
    }
    return {
        recipes: await recipesRes.json(),
        categories: await catsRes.json(),
        ingredients
    };
}

function _refreshContentCacheInBackground() {
    if (_contentRefreshInFlight) return _contentRefreshInFlight;
    _contentRefreshInFlight = _fetchContentPayload()
        .then(payload => {
            // Текущий экран остаётся стабильным; свежий ответ подхватит следующий
            // переход. Так stale-while-revalidate не перестраивает DOM под рукой.
            _writeContentCache(payload);
            window.dispatchEvent(new CustomEvent('smartplate:content-cache-refreshed'));
        })
        .catch(err => console.warn('Background content refresh failed', err))
        .finally(() => { _contentRefreshInFlight = null; });
    return _contentRefreshInFlight;
}

async function loadContent() {
    if (_contentLoaded) return;
    _contentError = false;
    _contentErrorType = '';
    _contentErrorDetails = null;
    _contentIsStale = false;
    const cached = _readContentCache();
    if (cached) {
        _applyContentPayload(cached);
        // Promote an existing session-only cache to persistent storage without
        // making it look newer than it really is.
        _writeContentCache(cached, cached.savedAt);
        _contentLoaded = true;
        _refreshContentCacheInBackground();
        return;
    }
    try {
        const payload = await _fetchContentPayload();
        _applyContentPayload(payload);
        _writeContentCache(payload);
        _contentLoaded = true;
    } catch (e) {
        const staleCached = _readContentCache(CONTENT_STALE_MAX_AGE);
        if (staleCached) {
            _applyContentPayload(staleCached);
            _contentLoaded = true;
            _contentIsStale = true;
            console.warn('Using last-known-good content after API failure', e);
            showContentStaleNotice(staleCached.savedAt);
            window.dispatchEvent(new CustomEvent('smartplate:content-stale', {
                detail: { savedAt: staleCached.savedAt }
            }));
            return;
        }
        _contentError = true;
        _contentErrorType = e && e.contentType
            ? e.contentType
            : (e && e.name === 'AbortError' ? 'timeout' : 'network');
        _contentErrorDetails = e || null;
        console.error('Failed to load content from API', e);
    }
}

function isContentError() { return _contentError; }
function isContentStale() { return _contentIsStale; }

function showContentStaleNotice(savedAt) {
    if (!document.body || document.getElementById('content-stale-notice')) return;
    const notice = document.createElement('div');
    notice.id = 'content-stale-notice';
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'position:fixed;left:50%;bottom:18px;z-index:10000;transform:translateX(-50%);max-width:calc(100vw - 32px);background:#1d1d1b;color:#fff;padding:11px 14px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.22);font:13px/1.4 Arial,sans-serif;display:flex;gap:12px;align-items:center';
    const date = savedAt ? new Date(savedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const message = document.createElement('span');
    message.textContent = 'Показаны сохранённые рецепты' + (date ? ' от ' + date : '') + '. Связь восстановится автоматически.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Проверить';
    retry.style.cssText = 'border:1px solid rgba(255,255,255,.55);background:transparent;color:#fff;padding:6px 9px;border-radius:7px;cursor:pointer;font:inherit;white-space:nowrap';
    retry.addEventListener('click', async function () {
        retry.disabled = true;
        retry.textContent = 'Проверяем…';
        try {
            const payload = await _fetchContentPayload();
            _writeContentCache(payload);
            _contentIsStale = false;
            message.textContent = 'Связь восстановлена. Свежие данные загрузятся при переходе в следующий раздел.';
            retry.remove();
            setTimeout(() => notice.remove(), 5000);
            window.dispatchEvent(new CustomEvent('smartplate:content-cache-refreshed'));
        } catch (err) {
            retry.disabled = false;
            retry.textContent = 'Проверить ещё раз';
            message.textContent = 'Связь пока не восстановилась. Сохранённые рецепты остаются доступны.';
        }
    });
    notice.append(message, retry);
    document.body.appendChild(notice);
}

// Показать экран ошибки при недоступности API
function showApiError(container) {
    if (!container) return;
    const timedOut = _contentErrorType === 'timeout';
    const rateLimited = _contentErrorType === 'rate-limit';
    const serverError = _contentErrorType === 'server';
    const title = rateLimited ? 'Слишком много запросов из вашей сети'
        : (timedOut ? 'Сервер отвечает дольше обычного'
        : (serverError ? 'Сервис временно недоступен' : 'Не удалось загрузить рецепты'));
    const text = rateLimited
        ? 'Подождите немного и попробуйте снова. Такое возможно в мобильной сети с общим IP-адресом.'
        : (timedOut
        ? 'Мы остановили ожидание, чтобы страница не зависла. Попробуйте загрузить рецепты ещё раз.'
        : (serverError ? 'Мы уже можем отличить эту ошибку от проблемы с интернетом. Попробуйте чуть позже.'
        : 'Проверьте подключение к интернету или попробуйте позже.'));
    const statusText = _contentErrorDetails && Array.isArray(_contentErrorDetails.statuses)
        ? ' <small style="display:block;margin-top:8px;color:#999">Код: ' + _contentErrorDetails.statuses.join(' / ') + '</small>'
        : '';
    container.innerHTML =
        '<div style="text-align:center;padding:60px 20px;max-width:440px;margin:0 auto">' +
            '<div style="font-size:56px;margin-bottom:16px">📡</div>' +
            '<h2 style="font-family:Playfair Display,serif;font-size:24px;color:#1a1a1a;margin-bottom:12px">' + title + '</h2>' +
            '<p style="color:#666;font-size:15px;line-height:1.5;margin-bottom:24px">' + text + statusText + '</p>' +
            '<button data-shared-action="reload" style="background:var(--accent,#e8734a);color:#fff;border:none;padding:12px 28px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer">Повторить</button>' +
        '</div>';
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getRecipe(id)     { return RECIPES[id] || null; }
function getCategory(id)   { return CATEGORIES[id] || null; }
function getCategoryDishes(catId, filters = {}) {
    const cat = CATEGORIES[catId];
    if (!cat) return [];
    let dishes = cat.dishes.map(id => RECIPES[id]).filter(Boolean);
    if (filters.time) {
        if (filters.time === 'over60') dishes = dishes.filter(d => d.time > 60);
        else dishes = dishes.filter(d => d.time <= filters.time);
    }
    if (filters.difficulty) dishes = dishes.filter(d => d.diff === filters.difficulty);
    if (filters.gluten)  dishes = dishes.filter(d => (d.tags||[]).includes('без глютена'));
    if (filters.plant)   dishes = dishes.filter(d => (d.tags||[]).includes('растительное'));
    if (filters.fish)    dishes = dishes.filter(d => (d.tags||[]).includes('рыбное'));
    if (filters.noSoy)   dishes = dishes.filter(d => (d.tags||[]).includes('без сои'));
    if (filters.legumes) dishes = dishes.filter(d => (d.tags||[]).includes('бобовые'));
    if (filters.free)    dishes = dishes.filter(d => Auth.isFreeRecipe(d));
    return dishes;
}

function _categoryPhotoValue(photo) {
    if (typeof photo === 'string' && photo.trim()) return photo;
    if (Array.isArray(photo)) {
        const first = photo.find(p => typeof p === 'string' && p.trim());
        return first || '';
    }
    return '';
}

function getLatestCategoryRecipe(catId) {
    const dishes = getCategoryDishes(catId, {});
    return dishes
        .filter(r => r && _categoryPhotoValue(r.photo))
        .sort((a, b) => (b.addedTs || 0) - (a.addedTs || 0))[0] || null;
}

function getCategoryPhoto(catId, fallback) {
    const category = CATEGORIES[catId];
    const cover = category && RECIPES[category.coverRecipeId];
    if (cover && _categoryPhotoValue(cover.photo)) {
        return _categoryPhotoValue(cover.photo);
    }
    const latest = getLatestCategoryRecipe(catId);
    if (!latest) return fallback || '';
    return _categoryPhotoValue(latest.photo) || fallback || '';
}

// Shared search helper — used by both hero dropdown (index.html) and full
// search results (category.html?q=...). Keep relevance and normalization in
// one place so the two views never diverge.
function _searchNorm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').trim(); }

function searchRecipes(query) {
    const nq = _searchNorm(query);
    if (!nq) return [];
    const all = Object.values(RECIPES || {});
    const scored = [];
    for (const r of all) {
        const name = _searchNorm(r.name);
        const desc = _searchNorm(r.description || r.desc || '');
        const tags = _searchNorm((r.tags || []).join(' '));
        let score = 0;
        if (name.startsWith(nq)) score = 100;
        else if (name.includes(nq)) score = 60;
        else if (tags.includes(nq)) score = 30;
        else if (desc.includes(nq)) score = 15;
        if (score) scored.push({ r, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map(x => x.r);
}

const DIFF_LABELS = { easy: 'Легкая', medium: 'Средняя', hard: 'Сложная' };

function diffIcon(diff) {
    const lvl = diff === 'hard' ? 3 : diff === 'medium' ? 2 : 1;
    const bar = (i, h) => `<rect x="${i*4}" y="${10-h}" width="3" height="${h}" rx="0.5" fill="currentColor" opacity="${i+1<=lvl?1:0.28}"/>`;
    return `<svg viewBox="0 0 11 10" width="11" height="10" style="vertical-align:-1px;flex-shrink:0;margin-right:4px" aria-hidden="true">${bar(0,4)}${bar(1,7)}${bar(2,10)}</svg>`;
}

function timeIcon() {
    return `<svg viewBox="0 0 12 12" width="12" height="12" style="vertical-align:-2px;flex-shrink:0;margin-right:4px" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="6" y1="6" x2="6" y2="3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="6" y1="6" x2="8.2" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
}

// Раскладывает time/timeLabel на короткий бейдж и уточнение.
// "20 минут (без варки пшёнки)" → { short: "20 мин", note: "без варки пшёнки" }
// "25–30 минут"                 → { short: "25–30 мин", note: "" }
// (timeLabel пуст, time=15)     → { short: "15 мин", note: "" }
function formatTimeMeta(time, timeLabel) {
    const label = (typeof timeLabel === 'string') ? timeLabel.trim() : '';
    if (label) {
        let base = label, note = '';
        const m = label.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
        if (m) { base = m[1].trim(); note = m[2].trim(); }
        // Часть старых рецептов хранит уточнение через запятую:
        // «25 мин, без учёта замачивания». Выносим его в отдельную строку,
        // чтобы длинная подпись не налезала на рейтинг.
        const commaNote = base.match(/^(.+?),\s*(без\s+.+)$/i);
        if (commaNote) { base = commaNote[1].trim(); note = commaNote[2].trim(); }
        // Если в поле указано только уточнение («без учёта замачивания»),
        // длительность берём из time_min, а подпись показываем второй строкой.
        if (/^без\s+.+/i.test(base)) { note = base; base = ''; }
        const short = base.replace(/минут[ауы]?/gi, 'мин').replace(/\s+/g, ' ').trim();
        return { short: short || ((Number(time) || 0) + ' мин'), note: note };
    }
    return { short: (Number(time) || 0) + ' мин', note: '' };
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(msg, ms = 2800) {
    let el = document.getElementById('v2-toast');
    if (!el) { el = document.createElement('div'); el.id = 'v2-toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms);
}

// ─── CONFIRM (фирменный, вместо нативного confirm()) ──────────────────────────
// Возвращает Promise<boolean>. Закрытие: Esc / клик по backdrop / Отмена → false,
// подтверждающая кнопка → true. Фокус ставится на главную кнопку и
// восстанавливается на элемент, который был активен до открытия.
// Использует общий паттерн .modal-overlay/.modal-box (style-v4.css).
function showAppConfirm(opts = {}) {
    const {
        title = 'Подтвердите действие',
        text = '',
        confirmText = 'Подтвердить',
        cancelText = 'Отмена',
        danger = false,
    } = opts;
    return new Promise(resolve => {
        const prevFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay app-confirm';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML =
            '<div class="modal-box app-confirm-box">' +
                '<div class="app-confirm-title"></div>' +
                (text ? '<div class="app-confirm-text"></div>' : '') +
                '<div class="app-confirm-actions">' +
                    '<button type="button" class="app-confirm-btn app-confirm-cancel"></button>' +
                    '<button type="button" class="app-confirm-btn app-confirm-ok' + (danger ? ' is-danger' : '') + '"></button>' +
                '</div>' +
            '</div>';
        overlay.querySelector('.app-confirm-title').textContent = title;
        if (text) overlay.querySelector('.app-confirm-text').textContent = text;
        const okBtn = overlay.querySelector('.app-confirm-ok');
        const cancelBtn = overlay.querySelector('.app-confirm-cancel');
        okBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;

        let done = false;
        function close(result) {
            if (done) return;
            done = true;
            document.removeEventListener('keydown', onKey, true);
            overlay.classList.remove('open');
            setTimeout(() => {
                overlay.remove();
                if (prevFocus && typeof prevFocus.focus === 'function') {
                    try { prevFocus.focus(); } catch {}
                }
            }, 260);
            resolve(result);
        }
        function onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); close(false); }
        }
        overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
        okBtn.addEventListener('click', () => close(true));
        cancelBtn.addEventListener('click', () => close(false));
        document.addEventListener('keydown', onKey, true);

        document.body.appendChild(overlay);
        // двойной rAF — гарантирует transition при добавлении класса .open
        requestAnimationFrame(() => requestAnimationFrame(() => {
            overlay.classList.add('open');
            // для деструктивных действий фокус на «Отмена», чтобы случайный Enter не подтвердил
            (danger ? cancelBtn : okBtn).focus();
        }));
    });
}

// ─── LOCKED RECIPE PREVIEW ───────────────────────────────────────────────────
// Единый helper для index/category/ingredient. Пользователь сохраняет контекст
// выбранного блюда и видит фото, описание и условия доступа на recipe.html.
function showLockedMsg(recipeId) {
    if (recipeId) {
        location.href = 'recipe.html?id=' + encodeURIComponent(recipeId);
        return;
    }
    const esc = s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const r = (recipeId && typeof RECIPES !== 'undefined') ? RECIPES[recipeId] : null;
    const cta = (r && typeof Auth !== 'undefined') ? Auth.recipePaywallCta(r) : null;
    const existing = document.getElementById('locked-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'locked-toast';
    toast.className = 'locked-toast';
    toast.innerHTML = cta
        ? esc(cta.title) + ' <a class="locked-toast-link" href="' + esc(cta.href) + '">' + esc(cta.btn) + '</a>'
        : 'Этот рецепт доступен по подписке. <a class="locked-toast-link" href="cabinet.html">Оформить</a>';
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 250);
    }, 5000);
}

// ─── SHOPPING LIST ────────────────────────────────────────────────────────────
function formatShoppingListItem(ingredient) {
    const raw = typeof ingredient === 'string'
        ? ingredient
        : (ingredient && (ingredient.name || ingredient.title || ingredient.text)) || '';
    return String(raw)
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildShoppingList() {
    const items = Plate.get();
    if (!items.length) return '';
    let txt = 'УМНАЯ ТАРЕЛКА\nСписок покупок\n\n';
    items.forEach(item => {
        txt += `${formatShoppingListItem(item.name || 'Блюдо').toLocaleUpperCase('ru-RU')}\n`;
        if (item.ingredients) item.ingredients.forEach(ing => {
            const label = formatShoppingListItem(ing);
            if (label) txt += `□ ${label}\n`;
        });
        txt += '\n';
    });
    txt += '────────────\nЮлия Воронова · нутрициолог\n@voronova_nutrition\nplate.voronova.online';
    return txt;
}

function shareShoppingList() {
    const txt = buildShoppingList();
    if (navigator.share) { navigator.share({ text: txt }).catch(() => {}); }
    else { navigator.clipboard.writeText(txt).then(() => showToast('📋 Скопировано!')).catch(() => showToast('Не удалось скопировать')); }
}

// CSP: shared retry buttons migrated from JavaScript-template event attributes.
document.addEventListener('click', function (event) {
    const reloadControl = event.target.closest('[data-shared-action="reload"]');
    if (reloadControl) location.reload();
});
