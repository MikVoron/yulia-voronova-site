/**
 * Platform data v2 — Category-based architecture
 * Категории: Завтраки, Основные блюда, Блины/Оладьи, Намазки, Соусы, Салаты, Напитки
 * Источник рецептов: Гайд растительного питания Юлии Вороновой
 */

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const API_BASE  = 'https://api.voronova.online';
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
    login(email, name, token, subscription, avatar, role, createdAt, id) {
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
            role: role || (prev && prev.email === email && prev.role) || null
        };
        localStorage.setItem(this.KEY, JSON.stringify(user));
        if (name) this.setName(name);
        if (avatar) this.setAvatar(avatar);
        if (token) { this._token = token; sessionStorage.setItem(this._ST, token); }
        return user;
    },
    logout() {
        fetch(API_BASE + '/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
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
    requireAuth() { if (!this.isLoggedIn()) location.href = this._loginUrl(); },
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
        // localStorage user_avatar > user.avatar (с сервера при логине, до первого setAvatar).
        const avatar = this.getAvatar() || (u && u.avatar) || null;
        if (avatar) {
            const img = document.createElement('img');
            img.src = avatar;
            img.alt = '';
            img.className = 'v-user-avatar-img';
            el.replaceChildren(img);
            // Сбрасываем background-image, если был выставлен ранее (legacy путь в index.html).
            el.style.backgroundImage = '';
        } else {
            const fallback = (displayName || this.getDisplayName() || (u && u.email) || '?').trim() || '?';
            el.textContent = fallback.charAt(0).toUpperCase();
            el.style.backgroundImage = '';
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
    async checkAccess(opts) {
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
            if (data.role === 'admin') { this._subStatus = 'active'; this.startAutoRefresh(); return true; }
            const sub = data.subscription;
            if (!sub || !sub.status) { this._subStatus = 'none'; this._showPaywall('no_sub'); return false; }
            this._subStatus = sub.status;
            const now = new Date();
            if (sub.status === 'trial' && new Date(sub.trialEndsAt) > now) { this.startAutoRefresh(); return true; }
            if (sub.status === 'active' && new Date(sub.activeUntil) > now) { this.startAutoRefresh(); return true; }
            this._showPaywall(sub.status); return false;
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
    // CTA для locked-карточки и preview-блока в recipe.html.
    // Возвращает { title, btn, href } или null, если у пользователя есть доступ.
    // См. таблицу в docs/guest-mode-mvp.md §6.4
    recipePaywallCta(recipe) {
        if (this.canViewRecipe(recipe)) return null;
        const level = this.recipeAccessLevel(recipe);
        const ret = this._currentReturnUrl();
        if (this.isGuest()) {
            return {
                title: level === 'pro'
                    ? 'Этот рецепт открыт для подписчиков Pro'
                    : 'Этот рецепт открыт после регистрации',
                btn: 'Войти и получить 7 дней бесплатно',
                href: this._loginUrl(),
            };
        }
        if (this.isTrial() && level === 'pro') {
            return {
                title: 'Этот рецепт доступен по подписке Pro',
                btn: 'Оформить Pro',
                href: 'cabinet.html?tab=subscription' + (ret ? '&return=' + encodeURIComponent(ret) : ''),
            };
        }
        // expired / no_sub / error — продлить
        return {
            title: 'Доступ к рецептам ограничен',
            btn: 'Продлить подписку',
            href: 'cabinet.html?tab=subscription' + (ret ? '&return=' + encodeURIComponent(ret) : ''),
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
        const overlay = document.createElement('div');
        overlay.id = 'paywall-overlay';
        const isNetworkError = reason === 'error';
        const isExpired = reason === 'expired' || reason === 'cancelled';
        let icon, title, text, actionHtml;
        if (isNetworkError) {
            icon = '📡';
            title = 'Не удалось связаться с сервером';
            text = 'Проверьте подключение к интернету и попробуйте снова. Если проблема не исчезнет — напишите нам.';
            actionHtml = '<button onclick="location.reload()" style="display:inline-block;background:var(--accent,#e8734a);color:#fff;border:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:16px;cursor:pointer">Повторить</button>';
        } else {
            icon = '🔒';
            title = isExpired ? 'Подписка истекла' : 'Нужна подписка';
            text = isExpired
                ? 'Продлите подписку, чтобы продолжить пользоваться рецептами и конструктором тарелки.'
                : 'Оформите подписку, чтобы получить доступ к рецептам и конструктору тарелки.';
            var ret = this._currentReturnUrl();
            var subHref = 'cabinet.html?tab=subscription' + (ret ? '&return=' + encodeURIComponent(ret) : '');
            actionHtml = '<a href="' + subHref + '" style="display:inline-block;background:var(--accent,#e8734a);color:#fff;padding:14px 32px;border-radius:12px;font-weight:600;text-decoration:none;font-size:16px">Оформить подписку</a>'
                + '<br><a href="cabinet.html" style="display:inline-block;margin-top:12px;color:#888;font-size:13px;text-decoration:underline">Личный кабинет</a>';
        }
        var policyLink = '<a href="https://voronova.online/personal-data-processing-policy.html" target="_blank" rel="noopener" style="color:#aaa;text-decoration:underline">Политика обработки персональных данных</a>';
        var offerLink = '<a href="https://voronova.online/public-offer.html" target="_blank" rel="noopener" style="color:#aaa;text-decoration:underline">Оферта</a>';
        var legalLinks = LEGAL_OFFER_ENABLED ? (offerLink + ' · ' + policyLink) : policyLink;
        var legalHtml = isNetworkError ? '' :
            '<div style="margin-top:24px;font-size:11px;color:#aaa;line-height:1.5">' + legalLinks + '</div>';
        overlay.innerHTML = '<div style="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.85);padding:20px">'
            + '<div style="text-align:center;max-width:400px">'
            + '<div style="font-size:48px;margin-bottom:16px">' + icon + '</div>'
            + '<h2 style="font-family:Playfair Display,serif;font-size:28px;color:#1a1a1a;margin-bottom:12px">' + title + '</h2>'
            + '<p style="color:#666;font-size:15px;line-height:1.5;margin-bottom:24px">' + text + '</p>'
            + actionHtml
            + legalHtml
            + '</div></div>';
        document.body.appendChild(overlay);
    },
    // Single-flight refresh. Refresh-токены на сервере РОТИРУЮТСЯ (одноразовые:
    // /auth/refresh удаляет старую refresh_session и выдаёт новую). Если на
    // странице несколько запросов одновременно ловят 401 (кабинет: /subscription,
    // /favorites, /feedback, /auth/me и т.д.), каждый звал бы свой /auth/refresh
    // с одной и той же cookie → первый удаляет сессию, остальные получают 401
    // «Сессия истекла» (+ clearCookie). Итог: часть запросов падает, ЛК
    // показывает «Нет подписки»/пустые списки, хотя данные есть. Поэтому держим
    // ОДИН общий in-flight refresh: все параллельные вызовы ждут его.
    _refreshInFlight: null,
    refreshToken() {
        if (this._refreshInFlight) return this._refreshInFlight;
        this._refreshInFlight = this._doRefresh().finally(() => { this._refreshInFlight = null; });
        return this._refreshInFlight;
    },
    async _doRefresh() {
        try {
            const res = await fetch(API_BASE + '/auth/refresh', { method: 'POST', credentials: 'include' });
            if (!res.ok) return false;
            const data = await res.json();
            this._token = data.accessToken;
            sessionStorage.setItem(this._ST, data.accessToken);
            const user = this.getUser();
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
        } catch { return false; }
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
        const token = this.getToken();
        const needsCT = options.body != null;
        const defaults = needsCT ? { 'Content-Type': 'application/json' } : {};
        const headers = Object.assign(defaults, options.headers || {});
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const res = await fetch(API_BASE + path, Object.assign({}, options, { headers, credentials: 'include' }));
        if (res.status === 401) {
            const refreshed = await this.refreshToken();
            if (refreshed) {
                headers['Authorization'] = 'Bearer ' + this.getToken();
                return fetch(API_BASE + path, Object.assign({}, options, { headers, credentials: 'include' }));
            }
            // Не делаем logout — пусть checkAccess решит что показать
            return res;
        }
        return res;
    }
};

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
    get()  { try { return JSON.parse(localStorage.getItem(this._key()) || '[]'); } catch { return []; } },
    set(v) { localStorage.setItem(this._key(), JSON.stringify(v)); updatePlateIcon(); },
    add(item) {
        const p = this.get();
        p.push({ ...item, addedAt: Date.now() });
        this.set(p);
        this._syncToServer();
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
        // Sync save to server
        if (Auth.getToken()) {
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
        + '<small>Можно добавить или изменить позже в истории.</small>'
        + '</div>';
}

function getSelectedPlateMealType() {
    var select = document.getElementById('plate-meal-type');
    return select ? select.value : '';
}


function updatePlateIcon() {
    const n = Plate.count();
    document.querySelectorAll('.plate-count').forEach(el => {
        el.textContent = n;
        el.style.display = n > 0 ? 'flex' : 'none';
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
    return {
        id: r.id, cat: r.cat, categories: r.categories || (r.cat ? [r.cat] : []), name: r.name, emoji: r.emoji || '🍴',
        time: r.time_min || 30, timeLabel: r.time_label || null, diff: r.difficulty || 'easy', servings: r.servings || 4, portionGrams: r.portion_grams == null ? null : Number(r.portion_grams),
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
        sortOrder: r.sort_order || 0,
        added: r.created_at ? new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : null,
        addedTs: r.created_at ? new Date(r.created_at).getTime() : 0,
    };
}

let _contentError = false;

async function loadContent() {
    if (_contentLoaded) return;
    _contentError = false;
    try {
        // New tabs start with empty sessionStorage. If the user is logged in but token
        // is missing, refresh it first — otherwise the API strips ingredients/steps/note
        // for "unauthenticated" requests.
        if (Auth.isLoggedIn() && !Auth.getToken()) {
            await Auth.refreshToken();
        }
        const headers = {};
        const token = Auth.getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const [recipesRes, catsRes] = await Promise.all([
            fetch(API_BASE + '/content/recipes', { headers }),
            fetch(API_BASE + '/content/categories')
        ]);
        if (!recipesRes.ok || !catsRes.ok) {
            _contentError = true;
            console.error('API returned non-OK status', recipesRes.status, catsRes.status);
            return;
        }
        const data = await recipesRes.json();
        data.forEach(r => {
            try {
                RECIPES[r.id] = _mapRecipe(r);
            } catch (err) {
                console.error('Failed to map recipe', r && r.id, err);
            }
        });
        const cats = await catsRes.json();
        cats.forEach(c => {
            CATEGORIES[c.id] = {
                id: c.id, name: c.name, emoji: c.emoji, color: c.color,
                desc: c.description || '',
                dishes: c.dishes || [],
                autoAddons: c.auto_addons || {}
            };
        });
        _contentLoaded = true;
    } catch (e) {
        _contentError = true;
        console.error('Failed to load content from API', e);
    }
}

function isContentError() { return _contentError; }

// Показать экран ошибки при недоступности API
function showApiError(container) {
    if (!container) return;
    container.innerHTML =
        '<div style="text-align:center;padding:60px 20px;max-width:440px;margin:0 auto">' +
            '<div style="font-size:56px;margin-bottom:16px">📡</div>' +
            '<h2 style="font-family:Playfair Display,serif;font-size:24px;color:#1a1a1a;margin-bottom:12px">Не удалось загрузить рецепты</h2>' +
            '<p style="color:#666;font-size:15px;line-height:1.5;margin-bottom:24px">Проверьте подключение к интернету или попробуйте позже.</p>' +
            '<button onclick="location.reload()" style="background:var(--accent,#e8734a);color:#fff;border:none;padding:12px 28px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer">Повторить</button>' +
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

// ─── SHOPPING LIST ────────────────────────────────────────────────────────────
function buildShoppingList() {
    const items = Plate.get();
    if (!items.length) return '';
    let txt = `🛒 Список покупок\n${new Date().toLocaleDateString('ru-RU')}\n\n`;
    items.forEach(item => {
        txt += `📌 ${item.name}\n`;
        if (item.ingredients) item.ingredients.forEach(ing => { txt += `  • ${ing.name || ing}\n`; });
        txt += '\n';
    });
    const t = Plate.totals();
    txt += `────────\nИтого: ${t.kcal} ккал | Б: ${t.protein}г | Ж: ${t.fat}г | У: ${t.carbs}г`;
    return txt;
}

function shareShoppingList() {
    const txt = buildShoppingList();
    if (navigator.share) { navigator.share({ text: txt }).catch(() => {}); }
    else { navigator.clipboard.writeText(txt).then(() => showToast('📋 Скопировано!')).catch(() => showToast('Не удалось скопировать')); }
}

