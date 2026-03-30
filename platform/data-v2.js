/**
 * Platform data v2 — Category-based architecture
 * Категории: Завтраки, Супы, Вторые блюда, Соусы
 * Источник рецептов: Гайд растительного питания Юлии Вороновой
 */

// ─── AUTH ───────────────────────────────────────────────────────────────────
const API_BASE = 'https://api.voronova.online';
const Auth = {
    KEY: 'hp_user',
    _token: null,
    _ST: 'hp_st',
    login(email, name, token, subscription, avatar, role, createdAt) {
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
    requireAuth() { if (!this.isLoggedIn()) location.href = 'login.html'; },
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
    async checkAccess() {
        if (!this.isLoggedIn()) { location.href = 'login.html'; return false; }
        if (!this.getToken()) {
            const ok = await this.refreshToken();
            if (!ok) {
                if (this._isAdmin()) { this._subStatus = 'active'; this.startAutoRefresh(); return true; }
                this._subStatus = 'trial';
                this.startAutoRefresh();
                return true;
            }
        }
        try {
            const res = await this.api('/auth/me');
            if (!res.ok) {
                if (this._isAdmin()) { this._subStatus = 'active'; this.startAutoRefresh(); return true; }
                this._subStatus = 'trial';
                this.startAutoRefresh();
                return true;
            }
            const data = await res.json();
            // Sync role + displayName + avatar from server → localStorage
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
            if (this._isAdmin()) { this._subStatus = 'active'; this.startAutoRefresh(); return true; }
            this._subStatus = 'trial';
            this.startAutoRefresh();
            return true;
        }
    },
    isTrial() { return this._subStatus === 'trial'; },
    hasFullAccess() { return this._subStatus === 'active'; },
    canViewRecipe(recipe) { return recipe.free || this.hasFullAccess(); },
    _showPaywall(reason) {
        document.body.style.visibility = 'visible';
        const main = document.querySelector('main');
        if (main) { main.style.filter = 'blur(8px)'; main.style.pointerEvents = 'none'; main.style.userSelect = 'none'; }
        const overlay = document.createElement('div');
        overlay.id = 'paywall-overlay';
        const isExpired = reason === 'expired' || reason === 'cancelled';
        const title = isExpired ? 'Подписка истекла' : 'Нужна подписка';
        const text = isExpired
            ? 'Продлите подписку, чтобы продолжить пользоваться рецептами и конструктором тарелки.'
            : 'Оформите подписку, чтобы получить доступ к рецептам и конструктору тарелки.';
        overlay.innerHTML = '<div style="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.85);padding:20px">'
            + '<div style="text-align:center;max-width:400px">'
            + '<div style="font-size:48px;margin-bottom:16px">🔒</div>'
            + '<h2 style="font-family:Playfair Display,serif;font-size:28px;color:#1a1a1a;margin-bottom:12px">' + title + '</h2>'
            + '<p style="color:#666;font-size:15px;line-height:1.5;margin-bottom:24px">' + text + '</p>'
            + '<a href="cabinet.html" style="display:inline-block;background:var(--accent,#e8734a);color:#fff;padding:14px 32px;border-radius:12px;font-weight:600;text-decoration:none;font-size:16px">Оформить подписку</a>'
            + '<br><a href="cabinet.html" style="display:inline-block;margin-top:12px;color:#888;font-size:13px;text-decoration:underline">Личный кабинет</a>'
            + '</div></div>';
        document.body.appendChild(overlay);
    },
    async refreshToken() {
        try {
            const res = await fetch(API_BASE + '/auth/refresh', { method: 'POST', credentials: 'include' });
            if (!res.ok) return false;
            const data = await res.json();
            this._token = data.accessToken;
            sessionStorage.setItem(this._ST, data.accessToken);
            const user = this.getUser();
            if (user && data.user) {
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
        const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
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

// ─── FAVORITES ───────────────────────────────────────────────────────────────
const Favorites = {
    _key()        { return Auth._userKey('fav_recipes'); },
    get()         { try { return JSON.parse(localStorage.getItem(this._key()) || '[]'); } catch { return []; } },
    set(v)        { localStorage.setItem(this._key(), JSON.stringify(v)); },
    has(id)       { return this.get().includes(id); },
    add(id)       { const f = this.get(); if (!f.includes(id)) { f.unshift(id); this.set(f); } },
    remove(id)    { this.set(this.get().filter(x => x !== id)); },
    toggle(id)    { this.has(id) ? this.remove(id) : this.add(id); return this.has(id); }
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
        notes.unshift(note); this.set(notes); return note;
    },
    update(id, text) {
        const notes = this.get();
        const n = notes.find(n => n.id === id);
        if (n) { n.text = text; n.title = text.trim().split('\n')[0].trim().slice(0, 60) || 'Заметка'; n.updated = new Date().toISOString(); this.set(notes); }
    },
    remove(id)   { this.set(this.get().filter(n => n.id !== id)); }
};

// ─── MY PLATE ────────────────────────────────────────────────────────────────
const Plate = {
    _key()  { return Auth._userKey('plate_items'); },
    _hkey() { return Auth._userKey('plate_history'); },
    get()  { try { return JSON.parse(localStorage.getItem(this._key()) || '[]'); } catch { return []; } },
    set(v) { localStorage.setItem(this._key(), JSON.stringify(v)); updatePlateIcon(); },
    add(item) { const p = this.get(); p.push({ ...item, addedAt: Date.now() }); this.set(p); },
    remove(idx) { const p = this.get(); p.splice(idx, 1); this.set(p); },
    clear() { localStorage.removeItem(this._key()); updatePlateIcon(); },
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
    saveHistory() {
        const items = this.get();
        if (!items.length) return;
        const h = this.getHistory();
        h.unshift({ date: new Date().toISOString(), items, totals: this.totals() });
        localStorage.setItem(this._hkey(), JSON.stringify(h.slice(0, 30)));
        this.clear();
    },
    getHistory() { try { return JSON.parse(localStorage.getItem(this._hkey()) || '[]'); } catch { return []; } }
};

// ─── RATINGS ──────────────────────────────────────────────────────────────────
const Ratings = {
    KEY: 'recipe_ratings',
    get()  { try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch { return {}; } },
    set(v) { localStorage.setItem(this.KEY, JSON.stringify(v)); },
    rate(recipeId, stars) {
        const all = this.get();
        const prev = all[recipeId] || { sum: 0, count: 0, mine: 0 };
        if (prev.mine) {
            prev.sum = prev.sum - prev.mine + stars;
        } else {
            prev.sum += stars;
            prev.count += 1;
        }
        prev.mine = stars;
        all[recipeId] = prev;
        this.set(all);
        return prev;
    },
    forRecipe(recipeId) {
        return this.get()[recipeId] || { sum: 0, count: 0, mine: 0 };
    },
    avg(recipeId) {
        const r = this.forRecipe(recipeId);
        return r.count > 0 ? Math.round(r.sum / r.count) : 0;
    }
};

function updatePlateIcon() {
    const n = Plate.count();
    document.querySelectorAll('.plate-count').forEach(el => {
        el.textContent = n;
        el.style.display = n > 0 ? 'flex' : 'none';
    });
}

// ─── RECIPE DATA (loaded from API) ───────────────────────────────────────────
const RECIPES = {};
let CATEGORIES = {};
let _contentLoaded = false;

// Normalize image paths: ../images/... → absolute URL on main site
function _fixPhoto(p) {
    if (!p) return null;
    if (p.startsWith('../images/')) return 'https://voronova.online/' + p.slice(3);
    if (p.startsWith('/images/')) return window.location.origin + p;
    if (p.startsWith('images/')) {
        return 'https://voronova.online/' + p;
    }
    return p;
}

// Map API snake_case → frontend camelCase
function _mapRecipe(r) {
    return {
        id: r.id, cat: r.cat, name: r.name, emoji: r.emoji || '🍴',
        time: r.time_min || 30, diff: r.difficulty || 'easy', servings: r.servings || 4, portionGrams: r.portion_grams || 300,
        free: !!r.is_free,
        kcal: r.kcal || 0, protein: r.protein || 0, fat: r.fat || 0,
        carbs: r.carbs || 0, fiber: r.fiber || 0,
        tags: r.tags || [],
        photo: _fixPhoto(r.photo), imgPosition: r.img_position || null,
        quote: r.quote || null,
        ingredients: r.ingredients || [],
        steps: (r.steps || []).map(s => typeof s === 'object' && s && s.photo ? {...s, photo: _fixPhoto(s.photo)} : s),
        note: r.note || null,
        vkVideo: r.vk_video || null,
        addProtein: r.add_protein || [],
        addFat: r.add_fat || [],
        addCarbs: r.add_carbs || [],
        addFiber: r.add_fiber || [],
        sortOrder: r.sort_order || 0,
        added: r.created_at ? new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : null,
    };
}

let _contentError = false;

async function loadContent() {
    if (_contentLoaded) return;
    _contentError = false;
    try {
        const [recipesRes, catsRes] = await Promise.all([
            fetch(API_BASE + '/content/recipes'),
            fetch(API_BASE + '/content/categories')
        ]);
        if (!recipesRes.ok || !catsRes.ok) {
            _contentError = true;
            console.error('API returned non-OK status', recipesRes.status, catsRes.status);
            return;
        }
        const data = await recipesRes.json();
        data.forEach(r => { RECIPES[r.id] = _mapRecipe(r); });
        const cats = await catsRes.json();
        cats.forEach(c => {
            CATEGORIES[c.id] = {
                id: c.id, name: c.name, emoji: c.emoji, color: c.color,
                desc: c.description || '',
                dishes: c.dishes || []
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
            '<h2 style="font-family:Playfair Display,serif;font-size:24px;color:#1a1a1a;margin-bottom:12px">Сервер рецептов временно недоступен</h2>' +
            '<p style="color:#666;font-size:15px;line-height:1.5;margin-bottom:24px">Попробуйте обновить страницу позже</p>' +
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
    if (filters.plant)   dishes = dishes.filter(d => (d.tags||[]).includes('растительный'));
    if (filters.fish)    dishes = dishes.filter(d => (d.tags||[]).includes('рыбное'));
    if (filters.noSoy)   dishes = dishes.filter(d => (d.tags||[]).includes('без сои'));
    if (filters.legumes) dishes = dishes.filter(d => (d.tags||[]).includes('бобовые'));
    return dishes;
}

const DIFF_LABELS = { easy: 'Легкая', medium: 'Средняя', hard: 'Сложная' };

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(msg, ms = 2800) {
    let el = document.getElementById('v2-toast');
    if (!el) { el = document.createElement('div'); el.id = 'v2-toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms);
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

// ─── COMMENTS ─────────────────────────────────────────────────────────────────
const Comments = {
    KEY: 'recipe_comments',
    get() { try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch { return {}; } },
    set(v) { localStorage.setItem(this.KEY, JSON.stringify(v)); },
    forRecipe(recipeId) { return (this.get()[recipeId] || []); },
    add(recipeId, author, text, stars, email) {
        const all = this.get();
        if (!all[recipeId]) all[recipeId] = [];
        all[recipeId].unshift({ author, text, stars: stars || 0, email: email || '', ts: Date.now() });
        this.set(all);
    },
    remove(recipeId, ts) {
        const all = this.get();
        if (!all[recipeId]) return;
        all[recipeId] = all[recipeId].filter(c => c.ts !== ts);
        this.set(all);
    },
    count(recipeId) { return this.forRecipe(recipeId).length; }
};
