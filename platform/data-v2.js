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
    login(email, name, token, subscription) {
        localStorage.removeItem('hp_token'); // cleanup legacy
        const prev = this.getUser();
        if (prev && prev.email && prev.email !== email) {
            ['fav_recipes','user_notes','hp_plates','hp_plate_history','user_weight','user_avatar','julia_quote_day','hp_user_name'].forEach(k => localStorage.removeItem(k));
        }
        // Migrate old customName to separate key
        if (prev && prev.email === email && prev.customName && !localStorage.getItem('hp_user_name')) {
            localStorage.setItem('hp_user_name', prev.customName);
        }
        const user = { email, name: name || email.split('@')[0], joined: (prev && prev.email === email && prev.joined) || Date.now(), subscription: subscription || null };
        localStorage.setItem(this.KEY, JSON.stringify(user));
        if (token) { this._token = token; sessionStorage.setItem(this._ST, token); }
        return user;
    },
    logout() {
        fetch(API_BASE + '/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        const u = this.getUser();
        const email = u && u.email ? u.email : '';
        localStorage.removeItem(this.KEY); localStorage.removeItem('hp_token');
        // Clean user-specific keys
        if (email) ['hp_user_name','user_avatar','user_weight'].forEach(k => localStorage.removeItem(k + '_' + email));
        localStorage.removeItem('hp_user_name');
        sessionStorage.removeItem(this._ST);
        this._token = null; Plate.clear();
    },
    isLoggedIn() { return !!localStorage.getItem(this.KEY); },
    getUser() { try { return JSON.parse(localStorage.getItem(this.KEY)); } catch { return null; } },
    getToken() { return this._token || sessionStorage.getItem(this._ST); },
    requireAuth() { if (!this.isLoggedIn()) location.href = 'login.html'; },
    _userKey(key) {
        const u = this.getUser();
        return u && u.email ? key + '_' + u.email : key;
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
    },
    _subStatus: null,
    async checkAccess() {
        if (!this.isLoggedIn()) { location.href = 'login.html'; return false; }
        if (!this.getToken()) {
            const ok = await this.refreshToken();
            if (!ok) {
                // Нет токена и refresh не работает — показываем контент в trial-режиме
                this._subStatus = 'trial';
                return true;
            }
        }
        try {
            const res = await this.api('/auth/me');
            if (!res.ok) {
                // API вернул ошибку — показываем контент, не редиректим
                this._subStatus = 'trial';
                return true;
            }
            const data = await res.json();
            const sub = data.subscription;
            if (!sub || !sub.status) { this._subStatus = 'none'; this._showPaywall('no_sub'); return false; }
            this._subStatus = sub.status;
            const now = new Date();
            if (sub.status === 'trial' && new Date(sub.trialEndsAt) > now) return true;
            if (sub.status === 'active' && new Date(sub.activeUntil) > now) return true;
            this._showPaywall(sub.status); return false;
        } catch {
            // Сеть недоступна — показываем контент в trial-режиме
            this._subStatus = 'trial';
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
            if (user && data.user) { user.name = data.user.displayName || user.name; user.email = data.user.email; localStorage.setItem(this.KEY, JSON.stringify(user)); }
            return true;
        } catch { return false; }
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
            this.logout(); location.href = 'login.html';
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

// Map API snake_case → frontend camelCase
function _mapRecipe(r) {
    return {
        id: r.id, cat: r.cat, name: r.name, emoji: r.emoji || '🍴',
        time: r.time_min || 30, diff: r.difficulty || 'easy', servings: r.servings || 2,
        free: !!r.is_free,
        kcal: r.kcal || 0, protein: r.protein || 0, fat: r.fat || 0,
        carbs: r.carbs || 0, fiber: r.fiber || 0,
        tags: r.tags || [],
        photo: r.photo || null, imgPosition: r.img_position || null,
        quote: r.quote || null,
        ingredients: r.ingredients || [],
        steps: r.steps || [],
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

async function loadContent() {
    if (_contentLoaded) return;
    try {
        const [recipesRes, catsRes] = await Promise.all([
            fetch(API_BASE + '/content/recipes'),
            fetch(API_BASE + '/content/categories')
        ]);
        if (recipesRes.ok) {
            const data = await recipesRes.json();
            // Clear and repopulate
            Object.keys(RECIPES).forEach(k => delete RECIPES[k]);
            data.forEach(r => { RECIPES[r.id] = _mapRecipe(r); });
        }
        if (catsRes.ok) {
            const cats = await catsRes.json();
            CATEGORIES = {};
            cats.forEach(c => {
                CATEGORIES[c.id] = {
                    id: c.id, name: c.name, emoji: c.emoji, color: c.color,
                    desc: c.description || '',
                    dishes: c.dishes || []
                };
            });
        }
        _contentLoaded = true;
    } catch (e) {
        console.warn('Failed to load content from API, using fallback', e);
        if (!Object.keys(CATEGORIES).length) CATEGORIES = Object.assign({}, _FALLBACK_CATEGORIES);
    }
}

// ─── ЗАВТРАКИ (fallback if API unavailable) ──────────────────────────────────

RECIPES['tofu-syrniki'] = {
    id: 'tofu-syrniki', cat: 'breakfasts', free: true,
    name: 'Сырники из тофу', emoji: '🥞', time: 20, diff: 'easy', servings: 2,
    kcal: 210, protein: 14, fat: 8, carbs: 20, fiber: 2,
    added: '19 марта 2026',
    tags: ['до 30 мин', 'простой', 'без глютена', 'соя', 'бобовые'],
    photo: '../images/img-guides/plant-based/tofu-sirniki.webp',
    quote: 'Их сразу и безоговорочно приняла моя семья, а самое главное — дети! Эти сырники могут жить без холодильника, в отличие от их творожных братьев. Если у вас не всегда получались сырники из творога и они разваливались, то эти «тофники» прекрасно держат форму и у вас всё получится с первого раза, легко и просто!',
    ingredients: [
        { name: '300 гр. тофу (не шелковый, без добавок)', swap: null },
        { name: 'Сок половины лимона', swap: null },
        { name: 'Цедра половины лимона', swap: null },
        { name: '2 ч.л. подсластителя (топинамбур/кленовый сироп или 1 банан)', swap: 'Любой жидкий подсластитель' },
        { name: '2 ст.л. цельнозерновой муки (или безглютеновой)', swap: 'Рисовая или гречневая мука' },
    ],
    steps: [
        'Пробиваем всё в блендере (можно воспользоваться погружным).',
        'Обжариваем на сковороде на небольшом количестве оливкового масла до румяной корочки.',
    ],
    note: 'Можно сделать тесто заранее, вечером, а утром остаётся только поджарить сырники. Они будут вкусными и в холодном виде. Цедру трите аккуратно, до белой части лимона — нам нужна только жёлтая, так как белая горчит. В тесто можно добавить любимые сухофрукты. Особенно вкусно получается с изюмом, предварително замоченным в кипятке для мягкости.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['lentil-pancakes'] = {
    id: 'lentil-pancakes', cat: 'pancakes',
    name: 'Оладьи из чечевицы', emoji: '🥞', time: 30, diff: 'easy', servings: 3,
    kcal: 280, protein: 16, fat: 4, carbs: 46, fiber: 8,
    added: '19 марта 2026',
    tags: ['простой', 'на спорте', 'бобовые'],
    photo: '../images/img-guides/plant-based/pancakes-red-lentil.webp',
    quote: 'Эти оладьи хороши не только со сладким. Напеките, накормите, услышьте хвалебные песни и не говорите из чего они! Вкуса чечевицы нет вообще — и пользы сколько!',
    ingredients: [
        { name: '300 гр. красной чечевицы', swap: null },
        { name: '200 мл. растительного молока', swap: 'Любое растительное молоко' },
        { name: '2 ст.л. топинамбура или любого жидкого подсластителя', swap: '1–2 банана' },
        { name: '170 гр. цельнозерновой муки', swap: null },
        { name: '1,5 ч.л. разрыхлителя', swap: null },
        { name: 'Сок 1/2 лимона', swap: null },
    ],
    steps: [
        'Чечевицу лучше замочить на 2–3 часа или на ночь (в этом случае поставьте в холодильник). Так оладушки получатся более воздушными.',
        'Взбить чечевицу со всеми ингредиентами в блендере.',
        'Обжарить на сковороде на небольшом количестве оливкового масла.',
    ],
    note: 'Вместо сиропа топинамбура можно взять 1–2 банана. Попробуйте помять авокадо, сбрызнуть его лимоном и солью, порезать слайсами помидор и положить всё это слоями на оладушек.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['nut-omelet'] = {
    id: 'nut-omelet', cat: 'breakfasts',
    name: 'Нутовый омлет', emoji: '🍳', time: 20, diff: 'easy', servings: 2,
    kcal: 195, protein: 11, fat: 6, carbs: 24, fiber: 5,
    added: '19 марта 2026',
    tags: ['до 30 мин', 'простой', 'без глютена', 'бобовые'],
    photo: '../images/img-guides/plant-based/chickpea-omelette.webp',
    quote: 'При приготовлении вы можете использовать любые любимые овощи.',
    ingredients: [
        { name: '100 гр. нутовой муки', swap: null },
        { name: '200 мл. воды', swap: null },
        { name: '1/2 ч.л. соли', swap: null },
        { name: '1 маленький лук', swap: null },
        { name: '1 кабачок/цукини', swap: null },
        { name: '1 сладкий перец', swap: null },
        { name: '4 помидоры черри', swap: null },
        { name: '1/2 банки томатов в собственном соку', swap: null },
        { name: '30 гр. любой зелени', swap: null },
    ],
    steps: [
        'Обжариваем овощи на небольшом количестве оливкового масла (можно добавить немного воды вместо масла и слегка их потушить).',
        'Подсолите немного овощи.',
        'В муку добавляем соль, перемешиваем, добавляем воду, ещё раз перемешиваем (чтобы не было комочков).',
        'Добавляем мелкопорезанную зелень, перемешиваем.',
        'Выливаем смесь на овощи, слегка перемешиваем, накрываем крышкой и тушим около 5 мин. на небольшом огне.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['lentil-pancakes-gf'] = {
    id: 'lentil-pancakes-gf', cat: 'pancakes',
    name: 'Оладьи из чечевицы (без глютена)', emoji: '🥞', time: 30, diff: 'easy', servings: 3,
    kcal: 250, protein: 14, fat: 3, carbs: 42, fiber: 7,
    added: '19 марта 2026',
    tags: ['простой', 'без глютена', 'бобовые'],
    photo: '../images/img-guides/plant-based/pancakes-lentil-gluten-free.webp',
    quote: 'Этот вариант чечевичных оладьев без глютена. Они идеально подойдут людям с целиакией, непереносимостью глютена или тем, кому показан безглютеновый рацион. Это способ сохранить любимые вкусы без компромиссов — особенно важно, когда за столом собираются гости с разными пищевыми предпочтениями.',
    ingredients: [
        { name: '200 гр. красной чечевицы', swap: null },
        { name: '240 мл. овсяного (или любого растительного) молока', swap: null },
        { name: 'Щепотка соли', swap: null },
        { name: '1 ч.л. разрыхлителя', swap: null },
        { name: '1 банан или немного подсластителя (по вкусу)', swap: null },
    ],
    steps: [
        'Чечевицу замочить на 2–3 часа или на ночь (в этом случае поставьте в холодильник). Так оладушки получатся более воздушными.',
        'Взбить чечевицу со всеми ингредиентами в блендере.',
        'Обжарить на сковороде с толстым дном на небольшом количестве оливкового масла. Жарим на среднем огне.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['apple-pear-pancakes'] = {
    id: 'apple-pear-pancakes', cat: 'pancakes',
    name: 'Панкейки с яблочно-грушевым пюре', emoji: '🍎', time: 35, diff: 'medium', servings: 4,
    kcal: 290, protein: 7, fat: 5, carbs: 55, fiber: 6,
    added: '19 марта 2026',
    tags: ['средний'],
    photo: '../images/img-guides/plant-based/pancakes-apple.webp',
    quote: 'Эти панкейки — настоящий десерт без сахара! Фруктовое пюре на пару даёт нежную сладость, а цельнозерновая мука — сытость. Дети просят ещё и ещё!',
    ingredients: [
        { name: '3 груши', swap: null },
        { name: '3 яблока', swap: null },
        { name: '6 фиников', swap: null },
        { name: '300 гр. цельнозерновой муки', swap: null },
        { name: '1,5 ч.л. разрыхлителя', swap: null },
        { name: '1 ч.л. яблочного уксуса или сока лимона', swap: null },
        { name: '300 мл. растительного молока', swap: null },
        { name: '3 ст.л. подсластителя (сироп топинамбура или кленовый)', swap: null },
        { name: '2 ст.л. растительного масла', swap: null },
        { name: '1 ст.л. молотых семян льна + 3 ст.л. тёплой воды', swap: null },
    ],
    steps: [
        'Режем крупно фрукты, из фиников вынимаем косточки. Готовим в пароварке около 10 минут до мягкости ингредиентов (проверяйте по финикам — они самые твёрдые). Пароварку можно сделать самим, использовав кастрюлю и специальную сетку для неё.',
        'Отправляем всё в блендер, делаем гладкое и однородное пюре (его можно смешивать с кашами, если не хотите использовать подсластители и мёд).',
        'В молотые семена льна добавляем воду, перемешиваем, накрываем и оставляем набухать минут на 10–15. Можно залить почти кипятком — тогда время набухания сокращается до 5 минут, но лучше заливать тёплой водой.',
        'Смешиваем все ингредиенты и набухший лён.',
        'Жарим панкейки на сухой антипригарной сковороде.',
        'Подаём с пюре из фруктов.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['tofu-scramble'] = {
    id: 'tofu-scramble', cat: 'breakfasts',
    name: 'Скрэмбл из тофу', emoji: '🍳', time: 15, diff: 'easy', servings: 2,
    kcal: 175, protein: 13, fat: 9, carbs: 8, fiber: 2,
    added: '19 марта 2026',
    tags: ['до 15 мин', 'простой', 'без глютена', 'соя', 'бобовые'],
    photo: '../images/img-guides/plant-based/tofu-scrambel.webp',
    quote: 'Эту альтернативу яичнице принял даже мой муж, у которого по жизни был девиз: «если есть яйца, значит есть и еда!». Человек жить не мог без яичницы. Но тофу (и я, чего уж тут) сделал своё дело, стал альтернативой — теперь очень часто на завтрак муж просит именно этот скрэмбл из тофу!',
    ingredients: [
        { name: '1 луковица', swap: null },
        { name: '1 зубчик чеснока', swap: null },
        { name: '200 гр. томатов в собственном соку или 2 свежих томата', swap: null },
        { name: '200 гр. тофу (не шелковый, обычный)', swap: null },
        { name: 'Соль, перец по вкусу', swap: null },
        { name: 'Любимая зелень', swap: null },
    ],
    steps: [
        'Поджариваем луковицу, чеснок на небольшом количестве оливкового масла, добавляем сочные помидоры.',
        'Тушим овощи 5 мин. и добавляем 200 гр. раскрошенного тофу.',
        'Томим ещё 5 мин., даём тофу возможность напитаться вкусами.',
        'Перчим, солим. Зелень по желанию.',
    ],
    note: 'Вы можете добавлять всё, что любите в классической яичнице: лук, чеснок, томаты, сладкий перец и т.д. Просто вместо яиц добавьте размятый тофу и побольше свежих помидоров или томатов в собственном соку — тофу сильно впитывает влагу.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['hummus'] = {
    id: 'hummus', cat: 'spreads', free: true,
    name: 'Хумус', emoji: '🫙', time: 10, diff: 'easy', servings: 6,
    kcal: 140, protein: 7, fat: 6, carbs: 16, fiber: 4,
    added: '19 марта 2026',
    tags: ['до 15 мин', 'простой', 'без глютена', 'бобовые'],
    photo: '../images/img-guides/plant-based/humus.webp',
    quote: 'Невероятно полезный, вкусный и простой в приготовлении — намазка хумус! Возможно, вы его полюбите не сразу, но когда распробуете, то, уверяю вас, будете делать его очень часто! Я готова есть его каждый день!',
    ingredients: [
        { name: '400 гр. отваренного нута или консервированного', swap: null },
        { name: '2 ст.л. тахини (паста из кунжута)', swap: null },
        { name: 'Сок 1 среднего лимона', swap: null },
        { name: '1 небольшой зубчик чеснока', swap: null },
        { name: '1 ч.л. соли', swap: null },
        { name: '1 ч.л. кориандра', swap: null },
        { name: '½ ч.л. кумина', swap: null },
        { name: '70–90 мл. воды (в идеале аквафабы)', swap: null },
    ],
    steps: [
        'Количество жидкости регулируйте сами, делайте желаемую консистенцию.',
        'Можно добавить больше лимона.',
        'Все отправляем в блендер и готово!',
        'Сверху можно полить оливковым маслом и приправить острым чили перцем или паприкой.',
    ],
    note: 'Всегда держите замороженный отваренный нут в холодильнике — после его разморозки сделать хумус проще простого! Нут — высокобелковое доступное бобовое: отваривайте его сразу много, фасуйте в пакеты по 400 гр., замораживайте и готовьте хумус так часто, как захотите.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['bean-paste'] = {
    id: 'bean-paste', cat: 'spreads',
    name: 'Паштет из фасоли', emoji: '🫘', time: 20, diff: 'easy', servings: 6,
    kcal: 120, protein: 7, fat: 4, carbs: 15, fiber: 5,
    added: '19 марта 2026',
    tags: ['до 30 мин', 'простой', 'без глютена', 'бобовые'],
    photo: '../images/img-guides/plant-based/pashtet-red-lentil.webp',
    quote: 'С этого паштета началась любовь к бобовым у старшей дочери-подростка, которая до этого ничего, кроме варёной колбаски на хлебе не признавала. А сейчас она с удовольствием ест все мои намазки :) Да, понадобилось время, но ведь главное — результат, мы же играем вдолгую!',
    ingredients: [
        { name: '500 гр. варёной красной фасоли', swap: null },
        { name: '2 средние луковицы', swap: null },
        { name: '2 средние моркови', swap: null },
        { name: '1 зубчик чеснока', swap: null },
        { name: '1/2 ч.л. кориандра', swap: null },
        { name: '1/2 ч.л. сладкой паприки', swap: null },
        { name: 'Соль, перец', swap: null },
    ],
    steps: [
        'Нарезаем чеснок и лук (позже будем всё перекручивать).',
        'Натираем морковь на крупной тёрке.',
        'Обжариваем на небольшом количестве оливкового масла лук, добавляем чеснок и через 1 мин. морковь. Добавляем специи, всё обжариваем и тушим до мягкости (при необходимости добавьте немного воды в сковороду).',
        'Смешиваем фасоль и тушёные овощи и пюрируем погружным блендером, прокручиваем в мясорубке или в любом комбайне.',
        'Солим по вкусу. Можно добавить совсем немного любого подсластителя. Вкус поменяется — попробуйте и так и так.',
    ],
    note: 'Намазываем на хлеб, питу — вкусно и полезно завтракаем! Готовый паштет можно хранить в холодильнике несколько дней.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['avocado-toast'] = {
    id: 'avocado-toast', cat: 'breakfasts',
    name: 'Тост с авокадо', emoji: '🥑', time: 10, diff: 'easy', servings: 1,
    kcal: 230, protein: 5, fat: 14, carbs: 22, fiber: 7,
    added: '19 марта 2026',
    tags: ['до 15 мин', 'простой'],
    photo: '../images/img-guides/plant-based/avocado-toast.webp',
    quote: 'Самый быстрый и полезный завтрак! Авокадо — это полезные жиры, которые дают сытость на несколько часов. Добавьте лимон и специи — и у вас идеальное утро за 10 минут.',
    ingredients: [
        { name: '1 авокадо', swap: null },
        { name: '1/2 сладкого красного лука (можно без него)', swap: null },
        { name: '1 маленький помидор', swap: null },
        { name: 'Сок 1/2 лимона', swap: null },
        { name: 'Пара веточек кинзы', swap: 'Петрушка' },
        { name: 'Соль', swap: null },
        { name: 'Красный перец чили (если любите поострее)', swap: null },
    ],
    steps: [
        'Авокадо мнём вилкой или чем удобнее.',
        'Мелко режем лук, помидор и кинзу.',
        'Смешиваем с авокадо, добавляем лимонный сок, перец чили и соль.',
        'Хорошо перемешиваем, поджариваем хлеб или делаем тост и густо кладём на него нашу намазку из авокадо.',
    ],
    note: 'Если вы в своём рационе допускаете рыбу, то можно на помятое и сдобренное лимонным соком, солью и перцем авокадо положить консервированный тунец (в собственном соку, не в масле). Это очень вкусное сочетание!',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['bruschetta-cashew'] = {
    id: 'bruschetta-cashew', cat: 'breakfasts',
    name: 'Брускетта с томатом и соусом из кешью', emoji: '🍅', time: 20, diff: 'easy', servings: 2,
    kcal: 260, protein: 7, fat: 12, carbs: 30, fiber: 4,
    added: '19 марта 2026',
    tags: ['до 30 мин', 'простой'],
    photo: '../images/img-guides/plant-based/tomato-bruschetta.webp',
    quote: 'Если у вас сейчас сезон томатов, то этот «бутерброд» не оставит вас равнодушными!',
    ingredients: [
        { name: '1 крупный помидор', swap: null },
        { name: '1/4 или 1/2 красного лука', swap: null },
        { name: 'Сок среднего лимона', swap: null },
        { name: '2–3 веточки петрушки', swap: null },
        { name: '2 ст.л. оливкового масла', swap: null },
        { name: '1 ст.л. бальзамического уксуса', swap: null },
        { name: '1/2 ч.л. соевого соуса', swap: null },
        { name: 'Соль и перец', swap: null },
        { name: 'Соус из кешью (см. раздел «Соусы»)', swap: null },
    ],
    steps: [
        'Режем мелко лук и смешиваем его в миске с соком лимона, бальзамическим уксусом, оливковым маслом и соевым соусом. Мелко режем петрушку и добавляем в заправку.',
        'Режем кружочками помидоры, заливаем их заправкой и оставляем мариноваться 10–15 мин.',
        'Поджариваем хлеб на сковороде или делаем тосты.',
        'Густо намазываем соусом из кешью, выкладываем помидоры и поливаем сверху остатками заправки.',
    ],
    note: 'Подсолите в случае необходимости — соевый соус уже даёт соль заправке. Рецепт соуса из кешью смотрите в разделе «Соусы».',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

// ─── СУПЫ ─────────────────────────────────────────────────────────────────────

RECIPES['veggie-concentrate'] = {
    id: 'veggie-concentrate', cat: 'mains',
    name: 'Овощной концентрат', emoji: '🫙', time: 60, diff: 'medium', servings: 30,
    kcal: 15, protein: 0, fat: 1, carbs: 2, fiber: 1,
    added: '19 марта 2026',
    tags: ['заготовка'],
    photo: '../images/img-guides/plant-based/concentrat.webp',
    quote: 'Этот концентрат заменит вам все магазинные бульонные кубики. Натуральный, без химии, хранится в морозилке и делает любой суп невероятно ароматным. Готовлю сразу большую порцию!',
    ingredients: [
        { name: '200 гр. стеблей сельдерея (или 150 гр. корня)', swap: null },
        { name: '250 гр. моркови', swap: null },
        { name: '100 гр. лука', swap: null },
        { name: '100 гр. помидоров', swap: null },
        { name: '150 гр. кабачков или цукини', swap: null },
        { name: '1 долька чеснока', swap: null },
        { name: '50–100 гр. грибов', swap: null },
        { name: '2 сухих лавровых листа', swap: null },
        { name: '4 веточки розмарина или зелёного базилика', swap: null },
        { name: '30 гр. петрушки', swap: null },
        { name: '120 гр. крупной соли', swap: null },
        { name: '30 гр. воды', swap: null },
        { name: '1 ст.л. оливкового масла', swap: null },
    ],
    steps: [
        'В комбайне рубим всё до мелких кусочков (позже будем всё это блендерить).',
        'Перекладываем овощи в кастрюлю с антипригарным покрытием или толстым дном.',
        'Перемешиваем, добавляем воду, соль и оливковое масло. Ставим на большой огонь. После закипания воды сразу уменьшаем огонь на минимум и оставляем томиться овощи на 40 мин., периодически помешивая (закрывайте крышкой — овощи могут «выстреливать»).',
        'Взбиваем овощи в комбайне или тщательно пюрируем погружным блендером до однородной пасты, без цельных кусочков.',
        'Остудите получившийся овощной концентрат.',
    ],
    note: 'Должно получиться около 750 мл. пасты. Хранить несколько недель в холодильнике и до полугода в морозилке. Концентрат используем из расчёта 1 ч.л. на 500 мл. воды.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['clear-broth'] = {
    id: 'clear-broth', cat: 'mains',
    name: 'Бульон №1 (светлый)', emoji: '🍵', time: 30, diff: 'easy', servings: 6,
    kcal: 20, protein: 1, fat: 0, carbs: 4, fiber: 1,
    added: '19 марта 2026',
    tags: ['до 30 мин', 'простой', 'без глютена', 'заготовка'],
    photo: '../images/img-guides/plant-based/clear-broth.webp',
    quote: 'Супы — это то, к чему мы исторически привыкли и то, что любим. Без них совсем не могут мой муж и сын. Сочетания сезонных овощей, бобовых и цельнозерновых круп — это лучшее, что вы можете предложить своему организму.',
    ingredients: [
        { name: '200 г. моркови', swap: null },
        { name: '200 г. лука порея или обычного репчатого', swap: null },
        { name: '200 г. стеблей сельдерея', swap: null },
        { name: '3 л. воды', swap: null },
    ],
    steps: [
        'Овощи чистим, моем и нарезаем кубиком примерно по 5 мм.',
        'Берём 3 литра воды, вносим туда наши порезанные овощи (важно: вода должна быть холодной), доводим почти до кипения (вода только должна начать немного бурлить), уменьшаем огонь и томим 20 мин.',
        'Процеживаем бульон.',
    ],
    note: 'Теперь вся польза овощей в вашем бульоне. Хранить в холодильнике 7–10 дней или в морозилке 3–4 месяца.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['dark-broth'] = {
    id: 'dark-broth', cat: 'mains',
    name: 'Бульон №2 (тёмный)', emoji: '🍵', time: 35, diff: 'easy', servings: 6,
    kcal: 25, protein: 1, fat: 0, carbs: 5, fiber: 1,
    added: '19 марта 2026',
    tags: ['простой', 'без глютена', 'заготовка'],
    photo: '../images/img-guides/plant-based/dark-broth.webp',
    quote: 'Супы — это то, к чему мы исторически привыкли и то, что любим. Без них совсем не могут мой муж и сын. Сочетания сезонных овощей, бобовых и цельнозерновых круп — это лучшее, что вы можете предложить своему организму.',
    ingredients: [
        { name: '200 г. моркови', swap: null },
        { name: '200 г. лука порея или обычного репчатого', swap: null },
        { name: '200 г. стеблей сельдерея', swap: null },
        { name: '40 г. соевого соуса', swap: null },
        { name: '1–2 свежие веточки розмарина или тимьяна', swap: null },
        { name: '3 л. воды', swap: null },
    ],
    steps: [
        'Чистим, моем и нарезаем овощи кубиками по 5 мм.',
        'Разогреваем кастрюлю с антипригарным покрытием или толстым дном и помещаем туда овощи. Добавляем 1 ст.л. воды, постоянно помешивая (процесс похож на обжаривание, только вместо масла — вода). Добавляем по мере выпаривания воду по 1 ст.л., до тех пор, пока овощи не станут мягче.',
        'Добавляем соевый соус, тушим 2–3 мин., вводим веточки свежих трав, тушим ещё 1 мин. Вливаем 3 л. воды, доводим почти до кипения, затем делаем минимальную температуру и томим 15–20 мин.',
        'Процеживаем. Теперь вся польза овощей в вашем бульоне.',
    ],
    note: 'Хранить в холодильнике 7–10 дней или в морозилке до 4-х месяцев.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['lentil-soup'] = {
    id: 'lentil-soup', cat: 'mains', free: true,
    name: 'Чечевичный суп', emoji: '🍲', time: 40, diff: 'easy', servings: 4,
    kcal: 220, protein: 13, fat: 3, carbs: 36, fiber: 10,
    added: '19 марта 2026',
    tags: ['простой', 'без глютена', 'бобовые'],
    photo: '../images/img-guides/plant-based/lentil-soup.webp',
    quote: 'Красная чечевица разваривается за 15 минут и даёт кремовую текстуру без блендера. Это один из самых простых и сытных супов, который полюбит вся семья. Обязательно добавьте лимон при подаче!',
    ingredients: [
        { name: '300 гр. красной чечевицы', swap: null },
        { name: '1 средняя луковица', swap: null },
        { name: '1 средняя морковь', swap: null },
        { name: '2 зубчика чеснока', swap: null },
        { name: '2 средние картофелины', swap: null },
        { name: '1 ч.л. молотого кориандра', swap: null },
        { name: '1 ч.л. паприки', swap: null },
        { name: 'Соль/перец по вкусу', swap: null },
        { name: '3 л. воды', swap: null },
        { name: '6 ч.л. овощного концентрата', swap: 'Или 3 л. овощного бульона' },
    ],
    steps: [
        'Замочите чечевицу на 1–2 часа (быстрее приготовится).',
        'Мелко нарезаем лук, морковь, чеснок.',
        'Обжариваем 2 мин. лук в кастрюле на нескольких каплях масла. Добавляем кориандр и паприку, обжариваем вместе с луком 1 мин. до пряного аромата. Добавляем морковь, обжариваем ещё несколько мин. — морковь должна становиться мягче. Добавляем чеснок, обжариваем всё вместе не более 30 сек.',
        'Всыпаем в кастрюлю промытую чечевицу, перемешиваем.',
        'Заливаем водой, доводим до кипения, добавляем овощной концентрат.',
        'Режем кубиком или трём на средней тёрке картофель (отжимаем его от жидкости!), закладываем в суп. Доводим до кипения, солим. Уменьшаем огонь и варим около 20–25 мин. до готовности чечевицы и картофеля.',
        'Подавайте с сухариками (смотрите рецепт с орегано).',
    ],
    note: 'В основной рецепт дополнительно можно вместе с морковью добавить мелко нарезанные 2 стебля сельдерея и 200 гр. томатов в собственном соку. Можно сделать более пряным — добавить вместо кориандра 0,5 ч.л. карри. Можно отдельно отварить мелкую вермишель/рис и добавить порционно каждому в тарелку. Дети с удовольствием едят такой суп.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['borscht'] = {
    id: 'borscht', cat: 'mains',
    name: 'Щи и Борщ', emoji: '🍲', time: 60, diff: 'medium', servings: 6,
    kcal: 180, protein: 8, fat: 2, carbs: 34, fiber: 9,
    added: '19 марта 2026',
    tags: ['средний', 'без глютена'],
    photo: '../images/img-guides/plant-based/borsch.webp',
    quote: 'Я объединила эти два блюда, так как они отличаются только наличием свёклы и разной фасолью.',
    ingredients: [
        { name: '1 средняя луковица', swap: null },
        { name: '1 крупная морковь', swap: null },
        { name: '2 средние свёклы', swap: null },
        { name: '1 ч.л. паприки', swap: null },
        { name: '2 ч.л. томатной пасты', swap: null },
        { name: '200 гр. томатов в собств. соку', swap: null },
        { name: '1 зубчик чеснока', swap: null },
        { name: '2 картофелины', swap: null },
        { name: 'Небольшой вилок капусты', swap: null },
        { name: '1 лимон', swap: null },
        { name: '250 гр. красной фасоли', swap: 'Для щей — белая фасоль' },
        { name: '2,5 л. воды', swap: null },
        { name: '5 ч.л. овощной пасты', swap: 'Или 2,5 л. овощного бульона' },
        { name: 'Свежая зелень', swap: null },
    ],
    steps: [
        'Для насыщенного цвета свёклу лучше запечь отдельно. Духовку разогреваем до 180°C. Свёклу моем, обсушиваем, заворачиваем каждую в пергамент (не в фольгу — она при температуре выделяет алюминий в продукты) и отправляем в духовку. Запекаем от 40 мин. — свёкла должна легко прокалываться.',
        'Мелко нарезаем лук, морковь, чеснок. Обжариваем лук 3 мин., добавляем специи и обжариваем ещё 1 мин., вводим морковь, чеснок, томатную пасту или томаты в собственном соку. Тушим около 10 мин., добавляем готовую свёклу и сок 1/2 лимона. Тушим ещё около 3 мин.',
        'Шинкуем капусту.',
        'В кипящую воду добавляем овощной концентрат и порезанный кубиками или тёртый картофель (отжимаем перед закладкой). Варим 5 мин.',
        'Добавляем капусту и зажарку. Если молодая — даём повариться 5 мин. и вносим зажарку. Доводим до кипения, убавляем огонь, варим около 10 мин. Старую капусту варить 10–15 мин. — пробуйте, капуста не должна развариться.',
        'Красную фасоль помещаем в блендер и пюрируем с небольшим количеством бульона до однородной консистенции, без кусочков. Вводим пюре в суп, даём немного покипеть, чтобы фасоль подружилась со всеми ингредиентами. Готово!',
        'Добавляем сметану из кешью (смотрите рецепт в разделе «Соусы»), любимую рубленную зелень (петрушка, укроп, кинза).',
    ],
    note: 'Для щей повторяем все предыдущие шаги, за исключением свёклы. Пюрируем и добавляем белую фасоль. В щи томатную пасту не кладу — это более лёгкий и свежий суп, не утяжеляйте его. Лучше добавьте томаты в собственном соку или свежие томаты. Зелень и сметана из кешью дополнят щи.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['chickpea-noodle-soup'] = {
    id: 'chickpea-noodle-soup', cat: 'mains',
    name: 'Суп с нутом и лапшой', emoji: '🍜', time: 35, diff: 'easy', servings: 4,
    kcal: 230, protein: 11, fat: 3, carbs: 40, fiber: 7,
    added: '19 марта 2026',
    tags: ['простой', 'бобовые'],
    photo: '../images/img-guides/plant-based/chickpea-noodle-soup.webp',
    quote: 'Нут — король бобовых! Он даёт этому супу сытность и белок, а лапша делает его по-домашнему уютным. Мои дети называют его «суп как у бабушки, только полезный».',
    ingredients: [
        { name: '1 небольшой лук', swap: null },
        { name: '1 небольшая морковь', swap: null },
        { name: '1 картофелина', swap: null },
        { name: '1 банка нута (или 250 гр. отварного)', swap: null },
        { name: '1 ч.л. паприки', swap: null },
        { name: '5 ч.л. овощной пасты', swap: 'Или 2,5 л. овощного бульона' },
        { name: 'Цельнозерновые макароны', swap: null },
    ],
    steps: [
        'Мелко режем лук, морковь трём на мелкой тёрке. Тушим в кастрюле или на сковороде на небольшом количестве масла.',
        'Можно добавить 1 ч.л. томатной пасты или 100 гр. томатов в собств. соку или мелко нарезанные помидоры. Потушите вместе с овощами (этот шаг не обязателен).',
        'Заливаем 2,5 литрами воды. Доводим до кипения, добавляем овощной концентрат. Добавляем картофель, нарезанный кубиками или тёртый на средней тёрке (не забудьте отжать!), убавляем огонь.',
        'Тем временем в блендере или комбайне взбиваем нут. Если берём из банки — используем только нут, без аквафабы (вода, в которой был нут).',
        'Добавляем бульон из нашего супа и взбиваем нут до состояния гладкого пюре, без комочков. Добавляем массу из нута в кастрюлю. Солим. Варим до готовности картофеля.',
        'Отдельно отвариваем цельнозерновые макароны (или прямо в супе). Больше всего подходят самые маленькие макароны или фигурки. Если отвариваете отдельно — разливаете суп по тарелкам и порционно каждому кладёте нужное количество макарон.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['buckwheat-soup'] = {
    id: 'buckwheat-soup', cat: 'mains',
    name: 'Гречневый суп', emoji: '🍲', time: 40, diff: 'easy', servings: 4,
    kcal: 190, protein: 8, fat: 2, carbs: 35, fiber: 5,
    added: '19 марта 2026',
    tags: ['простой', 'без глютена'],
    photo: 'images/recipes/soup-bucket-quinoa/soup-bucket--quinoa-final.webp',
    quote: 'Гречка — это полезная и низкокалорийная крупа, которая содержит в себе и белок, и витамины группы В, и вообще — кладезь различных минералов! Это любимый суп моих детей, поэтому варю я его достаточно часто.',
    ingredients: [
        { name: '1 лук', swap: null },
        { name: '1 морковь', swap: null },
        { name: '2 картофеля', swap: 'Батат или цветная капуста — менее крахмалистый вариант' },
        { name: '1/2 ч.л. сушёного чеснока или 1 зубчик свежего', swap: null },
        { name: '1 ч.л. паприки', swap: null },
        { name: '1 ч.л. томатной пасты', swap: null },
        { name: '1 ч.л. кориандра', swap: null },
        { name: '1 ч.л. соли', swap: null },
        { name: '160 г. сухой гречки', swap: 'Булгур, рис или перловка — на ваш вкус' },
        { name: '2,5 л. воды', swap: null },
        { name: '5 ч.л. овощной пасты', swap: 'Или 2,5 л. готового овощного бульона' },
    ],
    steps: [
        { text: 'Обжариваем в небольшом количестве оливкового масла лук. Добавляем специи и обжариваем ещё 1 мин. Добавляем томатную пасту, перемешиваем. Вводим морковь, тщательно перемешиваем, добавляем пару ложек воды и тушим около 7–9 мин.', photo: 'images/recipes/soup-bucket-quinoa/soup-bucket-quinoa-1.webp' },
        { text: 'Вливаем воду, доводим до кипения, добавляем овощной концентрат. Следом кладём натёртый на тёрке или порезанный кубиками картофель и предварительно промытую в воде гречку. Перемешиваем.', photo: 'images/recipes/soup-bucket-quinoa/soup-bucket-quinoa-2.webp' },
        { text: 'Убавляем огонь и варим до готовности гречки.', photo: 'images/recipes/soup-bucket-quinoa/soup-bucket-quinoa-3.webp' },
        { text: 'Если у вас другие пропорции воды и гречки и вы боитесь сделать слишком густой суп — гречку можно отварить отдельно до готовности.', photo: 'images/recipes/soup-bucket-quinoa/soup-bucket-quinoa-4.webp' },
        { text: 'В этом случае варим суп до готовности картофеля, вводим готовую гречку, доводим до кипения и выключаем. Даём супу настояться 30 мин. и подаём.', photo: 'images/recipes/soup-bucket-quinoa/soup-bucket-quinoa-5.webp' },
    ],
    vkVideo: null,
    addProtein: [
        { name: 'Нут отварной (3 ст.л.)', kcal: 120, protein: 7, fat: 2, carbs: 18, fiber: 4 },
        { name: 'Тофу (50 г)', kcal: 40, protein: 5, fat: 2, carbs: 1, fiber: 0 },
        { name: 'Красная чечевица (2 ст.л. сухой)', kcal: 110, protein: 8, fat: 0, carbs: 18, fiber: 3 },
    ],
    addFat: [
        { name: 'Тыквенные семечки (1 ст.л.)', kcal: 55, protein: 3, fat: 4, carbs: 1, fiber: 0 },
        { name: 'Льняные семечки (1 ч.л.)', kcal: 35, protein: 1, fat: 3, carbs: 2, fiber: 1 },
    ],
    addCarbs: [],
    addFiber: [
        { name: 'Свежая зелень — укроп, петрушка (горсть)', kcal: 5, protein: 0, fat: 0, carbs: 1, fiber: 1 },
        { name: 'Листья шпината (горсть)', kcal: 15, protein: 2, fat: 0, carbs: 2, fiber: 2 },
    ],
};

RECIPES['broccoli-cream-soup'] = {
    id: 'broccoli-cream-soup', cat: 'mains',
    name: 'Крем-суп из брокколи', emoji: '🥦', time: 40, diff: 'easy', servings: 3,
    kcal: 200, protein: 8, fat: 9, carbs: 22, fiber: 5,
    added: '19 марта 2026',
    tags: ['простой', 'без глютена'],
    photo: '../images/img-guides/plant-based/broccoli-cream-soup.webp',
    quote: 'Для того, чтобы крем-суп был вкусным и кремовым, в нём обязательно должны присутствовать жиры. В нашем случае это кешью. Ещё в этот рецепт я добавляю картофель. Получается мягкий вкус и нужная консистенция.',
    ingredients: [
        { name: '1 стакан сырого кешью (60 гр.)', swap: null },
        { name: '350 гр. брокколи', swap: 'Цветная капуста' },
        { name: '1 лук', swap: null },
        { name: '1 л воды', swap: null },
        { name: '2 ч.л. овощного концентрата', swap: null },
        { name: '1 картофель', swap: null },
        { name: 'Соль', swap: null },
    ],
    steps: [
        'Замачиваем кешью минимум на 2 часа в обычной воде (уровень воды 5 см над орехами, можно замочить на ночь).',
        'Разделяем брокколи на соцветия и нарезаем на кусочки по 2–3 см (позже будем её взбивать).',
        'Замоченный кешью промыть, поместить в блендер с 30 мл. воды и взбить до однородной массы. Если у вас мощный блендер — этот шаг можно пропустить, а замоченный кешью просто промыть водой и блендерить уже с отваренными овощами. Если будете использовать погружной блендер — лучше орехи взбить отдельно.',
        'Обжариваем около 3–5 мин. мелко нарезанный лук в небольшом количестве оливкового масла в кастрюле, в которой будем отваривать картофель и брокколи.',
        'Добавляем воду, овощной концентрат и порезанный кубиками картофель. Доводим до кипения. Варим до полуготовности картофеля. Вводим брокколи, доводим до кипения. Уменьшаем огонь и готовим до мягкости брокколи (около 6 мин.). Переливаем суп в кухонный комбайн, добавляем кешью и взбиваем до однородности. Переливаем обратно в кастрюлю, солим. Порционно добавляем свежемолотый перец или хлопья чили.',
        'Если используете погружной блендер: взбитый заранее кешью отправляем в кастрюлю к овощам и пюрируем всё вместе погружным блендером.',
    ],
    note: 'Детям можно отварить отдельно любимые макароны или рис и добавить порционно в суп. Если любите цветную капусту — замените брокколи на неё. Единственное отличие: варите капусту около 10–12 мин. до мягкости.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['rassolnik'] = {
    id: 'rassolnik', cat: 'mains',
    name: 'Рассольник', emoji: '🥒', time: 50, diff: 'medium', servings: 4,
    kcal: 195, protein: 6, fat: 2, carbs: 38, fiber: 4,
    added: '19 марта 2026',
    tags: ['средний'],
    photo: '../images/img-guides/plant-based/rassolnik-soup.webp',
    quote: 'Попробуйте разнообразить суп, каждый раз готовя его с разной крупой. Кроме классической перловки, прекрасно подойдут бурый рис и булгур. Подавайте с мелко нарубленным укропом и/или петрушкой. Вкусно с чайной ложкой соуса из кешью (смотрите мой рецепт в разделе «Соусы») или сметаны.',
    ingredients: [
        { name: '1 лук', swap: null },
        { name: '1 морковь', swap: null },
        { name: '1 стебель сельдерея', swap: null },
        { name: '2 картофеля', swap: null },
        { name: '4 солёных огурца', swap: null },
        { name: '1 ч.л. томатной пасты', swap: null },
        { name: '1/2 ч.л. сушёного чеснока', swap: null },
        { name: '1 ч.л. кориандра', swap: null },
        { name: '1 ч.л. паприки', swap: null },
        { name: 'Соль, перец', swap: null },
        { name: '200 гр. риса или перловки 150 гр.', swap: 'Бурый рис или булгур' },
        { name: '2 л. воды', swap: null },
        { name: '4 ч.л. овощного концентрата', swap: 'Или 2 л. овощного бульона' },
    ],
    steps: [
        'Мелко режем лук, морковь и сельдерей, слегка обжариваем на небольшом количестве оливкового масла на сковороде или непосредственно в кастрюле.',
        'Добавляем специи, томатную пасту, обжариваем с овощами 1 мин.',
        'С солёных огурцов счищаем кожуру, трём на средней тёрке. Добавляем к обжаренным овощам, вливаем немного воды и тушим около 15 минут.',
        'Заливаем остальной водой, добавляем овощной концентрат и нарезанный кубиками или натёртый на средней тёрке картофель (не забываем его отжимать!).',
        'Доводим до кипения и варим до готовности картофеля.',
        'Параллельно отвариваем в большом количестве воды рис или перловку.',
        'По готовности картофеля закладываем в суп крупу, доводим до кипения, перемешиваем и выключаем суп.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['roasted-veg-soup'] = {
    id: 'roasted-veg-soup', cat: 'mains',
    name: 'Суп с печёными овощами', emoji: '🍲', time: 45, diff: 'medium', servings: 4,
    kcal: 185, protein: 7, fat: 3, carbs: 33, fiber: 7,
    added: '19 марта 2026',
    tags: ['средний', 'без глютена'],
    photo: '../images/img-guides/plant-based/roasted-vegetable-soup.webp',
    quote: 'Печёные овощи придают блюду совершенно новый вкус и аромат. Поэтому такой способ приготовления выведет ваш суп на совершенно новый уровень!',
    ingredients: [
        { name: '3 средние картофелины', swap: null },
        { name: '1 средняя морковь', swap: null },
        { name: '200–300 гр. перетёртых томатов или 1 ч.л. томатной пасты', swap: null },
        { name: '1 болгарский перец', swap: null },
        { name: '200–250 гр. готовой красной фасоли', swap: null },
        { name: '2 л. воды', swap: null },
        { name: '4 ч.л. овощного концентрата', swap: 'Или 2 л. овощного бульона' },
        { name: '1 ч.л. сушёного чеснока', swap: null },
        { name: '1 ч.л. копчёной паприки', swap: null },
        { name: '1 ч.л. куркумы', swap: null },
        { name: '1 ч.л. орегано', swap: null },
        { name: 'Соль, перец', swap: null },
    ],
    steps: [
        'Разогреваем духовку до 200°C. Режем картофель, морковь и перец на кубики 1х1 см. Овощи на противень, добавляем немного оливкового масла, специи, тщательно перемешиваем и отправляем в духовку на 20 минут.',
        'Ставим кипятить 2 литра воды. Как закипит — добавляем овощной концентрат, перемешиваем до его полного растворения и закладываем в бульон овощи из духовки.',
        'Добавляем в суп томаты в собственном соку или томатную пасту, 5 мин. провариваем и закладываем готовую фасоль (без жидкости из банки).',
        'Доводим суп до кипения, уменьшаем огонь и томим около 5 минут.',
    ],
    note: 'Если фасоль нужно спрятать — возьмите к ней немного бульона из супа и взбейте всё в блендере до однородного пюре (можно также с томатами в собственном соку) и отправьте их вместе в бульон.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['oregano-croutons'] = {
    id: 'oregano-croutons', cat: 'mains',
    name: 'Сухарики с орегано', emoji: '🍞', time: 25, diff: 'easy', servings: 4,
    kcal: 120, protein: 3, fat: 4, carbs: 18, fiber: 2,
    added: '19 марта 2026',
    tags: ['до 30 мин', 'простой'],
    photo: '../images/img-guides/plant-based/oregano-croutons.webp',
    quote: 'Этот рецепт, который обожает моя семья. Тут ничего необычного, уверена, что и вы так делаете. Такие сухари просто созданы для супов-пюре и бобовых!',
    ingredients: [
        { name: 'Хлеб (лучше цельнозерновой, бездрожжевой, на закваске)', swap: null },
        { name: 'Сухое орегано', swap: null },
        { name: 'Соль', swap: null },
        { name: 'Оливковое масло', swap: null },
    ],
    steps: [
        'Режем хлеб на кубики 1,5–2 см в глубокую миску.',
        'Сбрызгиваем небольшим количеством оливкового масла, перемешиваем руками наши кубики, пропитываем маслом каждый. Добавляем немного соли и орегано.',
        'Опять хорошо перемешиваем (пропитанный маслом хлеб очень хорошо принимает соль и травы).',
        'Отправляем в духовку при 150°C. Время смотрите сами, духовки у всех разные.',
        'После 10–15 минут перемешайте сухарики и допекайте.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['ww-crackers'] = {
    id: 'ww-crackers', cat: 'mains',
    name: 'Крекеры из цельнозерновой муки', emoji: '🫓', time: 30, diff: 'easy', servings: 6,
    kcal: 130, protein: 3, fat: 5, carbs: 19, fiber: 3,
    added: '19 марта 2026',
    tags: ['до 30 мин', 'простой'],
    photo: '../images/img-guides/plant-based/wholegrain-crackers.webp',
    quote: 'Они невероятные, хрустящие, яркие, ароматные и солнечные! Найдите свежий розмарин, с ним крекеры будут просто волшебными!',
    ingredients: [
        { name: '400 гр. цельнозерновой муки', swap: null },
        { name: '1/3 ч.л. разрыхлителя', swap: null },
        { name: '60 гр. оливкового масла', swap: null },
        { name: '170 гр. горячей воды', swap: null },
        { name: 'Щепотка соли в тесто', swap: null },
        { name: 'Щепотка средней соли для посыпки', swap: null },
        { name: '2 ветки свежего розмарина или 1 ч.л. орегано', swap: null },
    ],
    steps: [
        'Смешайте муку, разрыхлитель и соль, нарежьте листики розмарина или всыпьте орегано. Влейте оливковое масло, воду и замесите тесто.',
        'Делим тесто на две части, чтобы комфортно было запекать. Если духовка позволяет, можно испечь за один раз.',
        'Расстилаем пергамент и на нём раскатываем в тонкий пласт наше тесто (толщина около 3 мм).',
        'Круглым ножом для пиццы нарезаем на квадратики примерно 2×2 см. Посыпаем солью.',
        'Запекаем в духовке при 180°C около 15 минут. Крекеры должны зарумяниться, но не сгореть. Время устанавливайте сами, всё зависит от вашей духовки.',
        'Хрустим и добавляем в суп!',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

// ─── ВТОРЫЕ БЛЮДА ────────────────────────────────────────────────────────────

RECIPES['potato-quinoa-cutlets'] = {
    id: 'potato-quinoa-cutlets', cat: 'mains',
    name: 'Картофельные котлеты с киноа', emoji: '🥔', time: 50, diff: 'medium', servings: 4,
    kcal: 200, protein: 6, fat: 4, carbs: 36, fiber: 4,
    added: '19 марта 2026',
    tags: ['средний', 'без глютена'],
    photo: '../images/img-guides/plant-based/potato-patties.webp',
    quote: 'Киноа — это суперфуд, который прекрасно сочетается с картофелем. Котлеты получаются с хрустящей корочкой и нежные внутри. Подавайте со свежими овощами и зеленью!',
    ingredients: [
        { name: '4 средних картофелины', swap: null },
        { name: '4 ст.л. (с горкой) киноа', swap: null },
        { name: '1 средняя луковица', swap: null },
        { name: '1/3 ч.л. куркумы', swap: null },
        { name: '1/2 ч.л. молотого кориандра', swap: null },
        { name: 'Соль, перец', swap: null },
        { name: '1/2 пучка укропа', swap: null },
    ],
    steps: [
        'Отварить картофель в мундире до полуготовности. Остудить, почистить и натереть на средней тёрке.',
        'Отварить киноа до мягкости, допустимо даже немного переварить.',
        'Мелко порезать лук, обжарить 3–5 мин., добавить специи, дождаться потрясающего запаха жареных специй, выключить, дать остыть.',
        'Смешать картофель, киноа, лук со специями и мелко нарубленный укроп.',
        'Влажными руками формируем котлеты, обваливаем в панировочных сухарях.',
        'Обжарить на горячей сковороде с небольшим количеством масла.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['green-lentil-cutlets'] = {
    id: 'green-lentil-cutlets', cat: 'mains',
    name: 'Котлеты из зелёной чечевицы', emoji: '🫘', time: 45, diff: 'medium', servings: 3,
    kcal: 230, protein: 14, fat: 4, carbs: 32, fiber: 10,
    added: '19 марта 2026',
    tags: ['средний', 'без глютена', 'бобовые'],
    photo: '../images/img-guides/plant-based/green-lentil-cutlets.webp',
    quote: 'Из этих ингредиентов получится 6 средних котлет. Они максимально «похожи» на мясные. Ещё котлеты очень вкусны в домашних бургерах. Таких котлет я сразу делаю много, формирую и замораживаю. Потом достаточно просто пожарить их, не размораживая.',
    ingredients: [
        { name: '200 гр. зелёной чечевицы (замачиваем на 3–4 часа, лучше на ночь)', swap: null },
        { name: '1 крупный лук', swap: null },
        { name: '1 крупная или 2 средние моркови', swap: null },
        { name: '1/2 ч.л. сушёного чеснока', swap: null },
        { name: '1/2 ч.л. мускатного ореха', swap: null },
        { name: '1 ч.л. паприки (лучше копчёной)', swap: null },
    ],
    steps: [
        'Мелко режем лук, трём на мелкой тёрке морковь. Обжариваем лук, морковь, добавляем специи. Жарим на маленьком огне 7–10 минут.',
        'Сырую чечевицу промываем и блендируем до кашеобразного состояния. Лучше это делать частями. Получаем массу, похожую на фарш.',
        'Добавляем обжаренные овощи, соль, перец. Накрываем плёнкой и в холодильник на 20–30 мин.',
        'Формируем влажными руками котлеты, панируем в цельнозерновых сухарях и обжариваем с двух сторон (можно без панировки).',
    ],
    note: 'К этим котлетам рекомендую сделать томатную подливу и потушить в ней около 5 минут, добавив 1 ч.л. соуса из кешью. Дольше не нужно, котлеты могут развалиться.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['broccoli-rice-cutlets'] = {
    id: 'broccoli-rice-cutlets', cat: 'mains',
    name: 'Котлеты из брокколи, риса и грибов', emoji: '🥦', time: 45, diff: 'medium', servings: 4,
    kcal: 170, protein: 7, fat: 3, carbs: 28, fiber: 5,
    added: '19 марта 2026',
    tags: ['средний', 'без глютена'],
    photo: '../images/img-guides/plant-based/broccoli-patties.webp',
    quote: 'Брокколи, рис и грибы — это трио, которое превращается в нежнейшие котлеты. Дети даже не догадаются, что внутри столько овощей! Секрет — хорошо отжать брокколи после варки.',
    ingredients: [
        { name: '100 гр. риса (лучше бурый)', swap: null },
        { name: '400 гр. брокколи', swap: null },
        { name: '3 шт. любых грибов (шампиньоны)', swap: null },
        { name: '1 лук', swap: null },
        { name: '1 морковь', swap: null },
        { name: '1/2 ч.л. тимьяна', swap: null },
        { name: 'Соль', swap: null },
    ],
    steps: [
        'Отвариваем рис до готовности.',
        'Отвариваем брокколи 2–4 минуты.',
        'Режем мелко лук, морковь и грибы, обжариваем с несколькими капельками масла вместе с тимьяном и добавляем эту поджарку в измельчённую на комбайне брокколи. Поджарку можно измельчить вместе с брокколи (котлеты будут более однородными).',
        'Смешиваем с рисом и солим.',
        'Формируем котлеты (не тонкими), обваливаем в сухарях и обжариваем.',
        'Переворачивайте очень медленно и аккуратно.',
    ],
    note: 'Если вы не любите грибы, можно без них, но в готовых котлетах грибы не чувствуются.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['chickpea-eggplant-cutlets'] = {
    id: 'chickpea-eggplant-cutlets', cat: 'mains',
    name: 'Котлеты из нута и баклажана', emoji: '🫘', time: 55, diff: 'medium', servings: 4,
    kcal: 240, protein: 12, fat: 5, carbs: 36, fiber: 10,
    added: '19 марта 2026',
    tags: ['средний', 'без глютена', 'бобовые'],
    photo: '../images/img-guides/plant-based/chickpea-eggplant-patties.webp',
    quote: 'Это самые вкусные котлеты по версии моих знакомых-мясоедов. Очень советую за раз приготовить сразу пачку нута. Порционно заморозить его и потом размораживать по мере необходимости. В этом уникальность бобовых: они не теряют своих замечательных свойств после заморозки. Их тоже, как из чечевицы, можно заморозить уже сформированные и жарить не размораживая.',
    ingredients: [
        { name: '600 гр. нута', swap: null },
        { name: '1 средний баклажан', swap: null },
        { name: '1 лук', swap: null },
        { name: '1 крупная морковь', swap: null },
        { name: '1 долька чеснока', swap: null },
        { name: '1–2 ст.л. цельнозерновой муки', swap: 'Нутовая мука' },
        { name: '1 ч.л. кориандра', swap: null },
        { name: '1 ч.л. паприки', swap: null },
        { name: 'Соль', swap: null },
    ],
    steps: [
        'Режем средним кубиком лук, чеснок, морковь, баклажан.',
        'Обжариваем лук минуту, добавляем морковь. Через 3 мин. добавляем чеснок. Через пару минут добавляем баклажан.',
        'На маленьком огне тушим до готовности баклажана.',
        '600 г. нута перекладываем в блендер. Взбиваем. Можно не взбивать совсем однородно — допустимо, чтобы в фарше присутствовали небольшие кусочки нута.',
        'Добавляем к нуту обжаренные овощи, снова немного блендируем.',
        'Добавляем муку, тщательно перемешиваем и ставим под плёнкой в холодильник на 30 минут.',
        'Формируем котлеты. Обваливаем в панировочных сухарях, желательно из цельнозерновой муки (можно обвалять в нутовой муке).',
        'Обжариваем на небольшом количестве масла. Можно на сухой сковороде, так как все ингредиенты уже термически обработаны.',
    ],
    note: 'Из этого количества получается 10 средних котлет. Эти котлеты можно делать без баклажана. Я иногда забываю добавлять муку в фарш, в этом случае их чуть сложнее жарить, но это только вопрос опыта.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['chickpea-meatballs'] = {
    id: 'chickpea-meatballs', cat: 'mains',
    name: 'Тефтели из нута', emoji: '🫘', time: 60, diff: 'medium', servings: 4,
    kcal: 220, protein: 11, fat: 4, carbs: 34, fiber: 8,
    added: '19 марта 2026',
    tags: ['средний', 'без глютена', 'бобовые'],
    photo: '../images/img-guides/plant-based/chickpea-meatballs.webp',
    quote: 'Этот рецепт похож на «Котлеты из нута», но здесь нет баклажана и тефтели мы будем сначала запекать, а потом тушить в томатах. Подавайте с любым гарниром, но я рекомендую с пюре — это что-то с чем-то!',
    ingredients: [
        { name: '400 гр. нута', swap: null },
        { name: '1 лук', swap: null },
        { name: '1 средняя морковь', swap: null },
        { name: '1 ст.л. молотых семян льна + 3 ст.л. воды', swap: null },
        { name: '2 ст.л. цельнозерновой муки', swap: null },
        { name: 'Зелень (петрушка или укроп)', swap: null },
        { name: 'Соль', swap: null },
    ],
    steps: [
        'Молотые семена льна залить тёплой водой, накрыть и оставить на 10–15 мин.',
        'Обжариваем лук, добавляем морковь, поджариваем 5–7 мин.',
        'Нут взбиваем в блендере. Добавляем овощи и зелень, снова блендируем.',
        'Добавляем муку и набухший лён, солим, перемешиваем. Ставим на 30 мин. в холодильник.',
        'Формируем тефтели. Запекаем при 180°C 20–25 мин.',
        'Разогреваем духовку до 180°C. Тефтели выкладываем на пергамент и запекаем 20–25 мин. Готовим подливу: а) Поджарить лук, добавить перетёртые томаты, соль, специи, соус из кешью; б) вылить на сковороду перетёртые томаты, посолить, добавить 1/2 ч.л. сушёного чеснока, 1 ч.л. сушёного лука, соус из кешью.',
        'Даём тефтелям немного остыть, укладываем в кипящийся соус и томим 3–5 мин. с закрытой крышкой.',
    ],
    note: 'Будьте аккуратны при подаче, они очень нежные. Подавайте с пюре!',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['red-lentil-cutlets'] = {
    id: 'red-lentil-cutlets', cat: 'mains',
    name: 'Котлеты из красной чечевицы', emoji: '🫘', time: 35, diff: 'easy', servings: 3,
    kcal: 210, protein: 12, fat: 3, carbs: 33, fiber: 8,
    added: '19 марта 2026',
    tags: ['простой', 'без глютена', 'бобовые'],
    photo: '../images/img-guides/plant-based/red-lentil-cutlets.webp',
    quote: 'Можно использовать красную, жёлтую или оранжевую чечевицу. Очень нежные котлетки, которые понравятся детям!',
    ingredients: [
        { name: '200 гр. красной чечевицы', swap: 'Жёлтая или оранжевая чечевица' },
        { name: '1 кабачок', swap: null },
        { name: '1 лук', swap: null },
        { name: '1 морковь', swap: null },
        { name: '2 ст.л. цельнозерновой муки', swap: null },
        { name: 'Соль/перец', swap: null },
        { name: '1 ч.л. паприки', swap: null },
        { name: '1/2 ч.л. сушёного чеснока', swap: null },
    ],
    steps: [
        'Чечевицу промыть (можно замочить на 1–2 часа).',
        'Отвариваем чечевицу до готовности (около 7–10 минут), но не до состояния каши (воды берём в два раза больше, чем чечевицы; если она не впитала всю воду при варке, лишнюю сливаем, чтобы фарш не был жидким).',
        'Трём морковь и кабачок на мелкой тёрке.',
        'Обжариваем лук, добавляем специи, чеснок, морковь и кабачок. Тушим 5 мин.',
        'Блендируем чечевицу, добавляем тушёные овощи и муку. Овощи можно блендировать вместе с чечевицей, тогда фарш будет более однородным (если вы хотите замаскировать овощи в котлетах).',
        'Обжариваем на небольшом количестве оливкового масла.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['lentil-mushroom-pilaf'] = {
    id: 'lentil-mushroom-pilaf', cat: 'mains',
    name: 'Плов с чечевицей и грибами', emoji: '🍚', time: 50, diff: 'medium', servings: 4,
    kcal: 320, protein: 11, fat: 5, carbs: 58, fiber: 7,
    added: '19 марта 2026',
    tags: ['средний', 'без глютена', 'бобовые'],
    photo: '../images/img-guides/plant-based/plov-lentil.webp',
    quote: 'Плов без мяса? Да, и он потрясающий! Чечевица даёт белок и сытность, грибы — аромат и «мясистость». Это блюдо, которое оценят даже самые убеждённые мясоеды.',
    ingredients: [
        { name: '1 средняя луковица', swap: null },
        { name: '2 средние моркови', swap: null },
        { name: '1 зубчик чеснока', swap: null },
        { name: '60 гр. грибов', swap: null },
        { name: '2 ч.л. томатной пасты', swap: null },
        { name: '1 ч.л. тимьяна', swap: null },
        { name: '1 ч.л. сумах (можно без неё)', swap: null },
        { name: '1/2 ч.л. кумина (зира)', swap: null },
        { name: '1/2 ч.л. куркумы', swap: null },
        { name: '60 г. чечевицы', swap: null },
        { name: '300 г. риса басмати', swap: null },
        { name: '1 ч.л. соли', swap: null },
        { name: '800 г. воды', swap: null },
        { name: '1 ч.л. овощного концентрата', swap: null },
    ],
    steps: [
        'Мелко режем лук, чеснок, трём морковь. Грибы нарезаем крупно.',
        'Обжариваем лук в оливковом масле 3 мин. Добавляем морковь, чеснок, обжариваем ещё 5 мин.',
        'Вводим специи, обжариваем 1 мин. Добавляем грибы, томатную пасту, перемешиваем.',
        'Всыпаем чечевицу и соль, хорошо перемешиваем. Добавляем рис, воду и овощной концентрат. Хорошо перемешиваем, чтобы паста растворилась. Уменьшаем огонь и готовим 30 мин.',
        'Чечевица и рис приготовятся одновременно. Чтобы плов не был сухим, не ждите, пока рис и чечевица впитают всю воду. Выключайте огонь, когда рис и чечевица готовы, а вода в сотейнике ещё немного есть. Плов «дойдёт» под крышкой. Дайте постоять около часа.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['pasta-boloniase'] = {
    id: 'pasta-boloniase', cat: 'mains',
    name: 'Паста с томатами и баклажанами «а-ля болоньезе»', emoji: '🍝', time: 40, diff: 'medium', servings: 3,
    kcal: 360, protein: 10, fat: 8, carbs: 62, fiber: 8,
    added: '19 марта 2026',
    tags: ['средний'],
    photo: '../images/img-guides/plant-based/pasta-boloniase.webp',
    quote: 'Баклажан, измельчённый в блендере, создаёт текстуру, неотличимую от мясного фарша. Добавьте томаты, чеснок, базилик — и это будет одна из лучших паст, что вы пробовали!',
    ingredients: [
        { name: '1 большой баклажан', swap: null },
        { name: '1–2 зубчика чеснока', swap: null },
        { name: '1 красный лук', swap: null },
        { name: '1/2 ч.л. орегано', swap: null },
        { name: '1 веточка розмарина', swap: null },
        { name: '1/2 ч.л. хлопьев перца чили', swap: null },
        { name: '500 г. томатов в собственном соку', swap: null },
        { name: '1 ст.л. лимонного сока', swap: null },
        { name: '300 гр. пасты', swap: null },
        { name: 'Свежий базилик', swap: null },
        { name: '1 ст.л. оливкового масла', swap: null },
        { name: '80 г. оливок (по желанию)', swap: null },
    ],
    steps: [
        'Разогреваем духовку до 200°C.',
        'Баклажан режем мелким кубиком (кожуру лучше оставить, она придаст красивый колер) и посыпаем солью. Оставляем на 10 мин., чтобы баклажан отдал лишнюю воду. Затем промываем кубики водой, сушим бумажным полотенцем и выкладываем в посуду для запекания. Добавляем 3–5 черри (можно без них), оливковое масло, веточку розмарина. Запекаем 20 мин. до готовности баклажана.',
        'В глубокой сковороде на оливковом масле на небольшом огне обжариваем порезанный чеснок и лук около 20 сек. — не дольше, чеснок быстро сгорает.',
        'Добавляем хлопья чили, перемешиваем, добавляем томаты в собственном соку (предварительно помните их вилкой, чтобы не было грубых кусков). Тушим около 10 минут.',
        'Добавляем запечённый баклажан, базилик/орегано, лимонный сок, оливки, тушим ещё 5 мин. Солим.',
        'Отвариваем пасту, добавляем в соус и перемешиваем.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['pasta-carbonara'] = {
    id: 'pasta-carbonara', cat: 'mains',
    name: 'Сливочная паста «а-ля карбонара»', emoji: '🍝', time: 25, diff: 'easy', servings: 2,
    kcal: 380, protein: 22, fat: 12, carbs: 48, fiber: 3,
    added: '19 марта 2026',
    tags: ['до 30 мин', 'простой', 'на спорте'],
    photo: '../images/img-guides/plant-based/pasta-carbonara.webp',
    quote: 'Сливочная паста за 25 минут — это спасение для вечера, когда нет сил готовить долго. Тунец даёт белок, а сливочный соус из кешью — ту самую нежность настоящей карбонары.',
    ingredients: [
        { name: '150–200 гр. консервированного тунца (в собственном соку)', swap: null },
        { name: '1 красный сладкий лук', swap: null },
        { name: '2 ч.л. каперсов', swap: null },
        { name: '3–6 шт. острых маринованных перцев халапеньо', swap: null },
        { name: '100 гр. соуса из кешью', swap: null },
        { name: '100 гр. воды', swap: null },
        { name: '1/2 ч.л. жидкости из-под каперсов', swap: null },
        { name: 'Соль по желанию', swap: null },
    ],
    steps: [
        'Режем тонкими полукольцами лук, обжариваем на 1 ст.л. оливкового масла 5 мин.',
        'Каперсы разрезаем пополам, халапеньо — мелко. Добавляем к луку, делаем маленький огонь. Добавляем соус из кешью, воду и жидкость из-под каперсов, томим 1 мин.',
        'Вводим тунец, перемешиваем 1 мин., солим по желанию.',
        'Отваренную пасту добавляем в сковороду к соусу, перемешиваем и подаём.',
    ],
    note: 'Пасту можно сделать без тунца. В этом случае, можно добавить чуть больше каперсов и жидкости из-под них.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

// ─── СОУСЫ ───────────────────────────────────────────────────────────────────

RECIPES['cashew-sauce'] = {
    id: 'cashew-sauce', cat: 'spreads',
    name: 'Соус из кешью', emoji: '🥛', time: 10, diff: 'easy', servings: 8,
    kcal: 130, protein: 4, fat: 10, carbs: 7, fiber: 1,
    added: '19 марта 2026',
    tags: ['до 15 мин', 'простой', 'без глютена'],
    photo: '../images/img-guides/plant-based/cashew-sauce.webp',
    quote: 'Этот универсальный соус. Можно заправлять салаты, добавлять в супы, в томатные подливы. Я также использую его как основу для сливочной пиццы вместо томатного соуса. Если сделать соус чуть гуще, добавить зелень, то можно использовать его как творожный сыр и намазывать на брускетты. Часто для меня соус из кешью является основой для других соусов.',
    ingredients: [
        { name: '200 гр. необжаренного кешью', swap: null },
        { name: '1 щепотка соли', swap: null },
        { name: 'Сок ½ небольшого лимона', swap: null },
        { name: '1 зубчик чеснока или 1/2 ч.л. сушёного чеснока', swap: null },
        { name: '100–150 гр. воды (в процессе взбивания подливайте для нужной густоты)', swap: null },
    ],
    steps: [
        'Кешью замочить на ночь в холодной воде (не менее 5 часов).',
        'Взбиваем все в блендере для гладкой, почти муссовой консистенции.',
        'Количество лимона, чеснока, соли варьируйте по своему вкусу, я указала граммовку, которую люблю сама.',
    ],
    note: 'Если добавить мелкопорезанные солёные огурцы, укроп, оливки и каперсы — получится «тар-тар». Можно добавить горчицу — подобие «майонеза».',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['cashew-sour-cream'] = {
    id: 'cashew-sour-cream', cat: 'spreads',
    name: 'Сметана из кешью', emoji: '🥛', time: 15, diff: 'medium', servings: 8,
    kcal: 125, protein: 4, fat: 10, carbs: 6, fiber: 1,
    added: '19 марта 2026',
    tags: ['без глютена', 'ферментированный'],
    photo: '../images/img-guides/plant-based/cashew-sour-cream.webp',
    quote: 'Вы не отличите эту сметану от молочной! Белок, полезный жир, микроэлементы — всё в одной ложке. Мы ферментируем кешью, а любой ферментированный продукт — это супереда для полезных бактерий, а значит — для пользы нашего ЖКТ. Добавляем сметану в супы, едим с блинами, панкейками, заправляем салаты — это отличная замена традиционной молочной сметаны!',
    ingredients: [
        { name: '200 гр. необжаренного кешью', swap: null },
        { name: '2 ст.л. сока лимона', swap: null },
        { name: '2 капсулы пробиотика', swap: null },
        { name: '200 гр. воды', swap: null },
    ],
    steps: [
        'Замачиваем кешью на ночь (не менее 5 часов).',
        'Промываем. Добавляем сок лимона, воду и капсулы пробиотика (купить в аптеке или на маркетплейсах, производитель не важен, главное — количество бактерий; я использую «Lactobif 5 млрд.», но можно больше — ферментация пойдёт быстрее).',
        'Взбиваем до гладкости. Перекладываем в банку и оставляем при комнатной температуре на сутки в тёмном шкафчике.',
        'Через сутки перемешиваем, пробуем. Если не хватает ферментации — оставьте ещё на несколько часов.',
        'Готовую сметану храним в холодильнике.',
    ],
    note: 'Следующую партию можно сделать, заменив капсулы на 2 ст.л. оставшейся сметаны.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['caesar-sauce'] = {
    id: 'caesar-sauce', cat: 'spreads',
    name: 'Соус «а-ля Цезарь»', emoji: '🥗', time: 10, diff: 'easy', servings: 6,
    kcal: 145, protein: 4, fat: 11, carbs: 7, fiber: 1,
    added: '19 марта 2026',
    tags: ['до 15 мин', 'простой', 'без глютена'],
    photo: '../images/img-guides/plant-based/sauce-сesar.webp',
    quote: 'Очень интересный и вкусный соус. Подойдёт к любому сочетанию овощей, не только к салату «Цезарь» — пробуйте!',
    ingredients: [
        { name: '170 гр. необжаренного кешью', swap: null },
        { name: '125 гр. воды', swap: null },
        { name: '1 зубчик чеснока', swap: null },
        { name: '2 ч.л. каперсов', swap: null },
        { name: '1 ст.л. соуса «Тамари» или соевый соус без сахара', swap: null },
        { name: '2 ч.л. дижонской горчицы', swap: null },
        { name: 'Соль', swap: null },
        { name: 'Перец', swap: null },
    ],
    steps: [
        'Кешью замочить на 5 мин. в кипятке, или на 5 часов/на ночь. Если есть готовый соус из кешью — использовать его, добавляя чеснок, каперсы и далее по рецепту.',
        'Все грузим в блендер, доводим до гладкости и однородности.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['white-bean-sauce'] = {
    id: 'white-bean-sauce', cat: 'spreads',
    name: 'Соус из белой фасоли', emoji: '🫘', time: 5, diff: 'easy', servings: 6,
    kcal: 110, protein: 5, fat: 7, carbs: 8, fiber: 3,
    added: '19 марта 2026',
    tags: ['до 15 мин', 'простой', 'без глютена', 'бобовые'],
    photo: '../images/img-guides/plant-based/white-bean-sauce.webp',
    quote: 'Этот соус может заменить вам майонез. Очень вкусный сам по себе — можно есть со свежеиспечённым цельнозерновым хлебом, добавлять в любое блюдо, в том числе в качестве подливы или намазки для бургера и питы.',
    ingredients: [
        { name: '2 банки белой фасоли (без добавления сахара) или 400 гр. отварной', swap: null },
        { name: '1 ч.л. горчицы', swap: null },
        { name: '1/2 ч.л. соли', swap: null },
        { name: 'Сок 1/2 лимона', swap: null },
        { name: '100 мл. оливкового масла', swap: null },
    ],
    steps: [
        'Все в блендер (можно пюрировать погружным).',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

RECIPES['roasted-veg-sauce'] = {
    id: 'roasted-veg-sauce', cat: 'spreads',
    name: 'Соус из запечённых овощей', emoji: '🥕', time: 40, diff: 'easy', servings: 6,
    kcal: 70, protein: 2, fat: 4, carbs: 8, fiber: 2,
    added: '19 марта 2026',
    tags: ['простой', 'без глютена'],
    photo: '../images/img-guides/plant-based/Roasted-vegetable-sauce.webp',
    quote: 'Запечённые овощи — это совершенно другой вкус! Томаты становятся сладкими, морковь карамельной, а перец — дымным. Этот соус универсален: к пасте, к крупам, к хлебу.',
    ingredients: [
        { name: '200 гр. помидоров черри', swap: null },
        { name: '2–3 средние морковки (около 400 гр.)', swap: null },
        { name: '1 средний перец', swap: null },
        { name: '2 ст.л. соуса из кешью', swap: null },
        { name: 'Вода', swap: null },
        { name: 'Свежий базилик или сухие специи (орегано, итальянская смесь)', swap: null },
        { name: 'Соль', swap: null },
    ],
    steps: [
        'Черри режем пополам, морковь — тонкой соломкой, перец разрезаем пополам, очищаем от семян.',
        'Сбрызгиваем овощи оливковым маслом, сухими специями, солим. Перемешиваем, выкладываем в форму и в духовку при 180°C на 25–30 мин.',
        'После запекания снимаем кожуру с черри и перца (перец можно положить остывать в пакет — кожура снимается легче).',
        'Все овощи перекладываем в блендер, добавляем соус из кешью, базилик, чуть-чуть воды и пюрируем до кремовой текстуры. Солим по вкусу.',
        'Воду добавляем по мере необходимости, сами регулируем густоту соуса.',
    ],
    note: 'Если использовать черри и морковь, соус получается сладковатый и насыщенный. Если добавите перец — именно он даст больше вкуса и своего аромата соусу.',
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
};

// ─── КАТЕГОРИИ (fallback) ────────────────────────────────────────────────────
const _FALLBACK_CATEGORIES = {
    breakfasts: {
        id: 'breakfasts', name: 'Завтраки', emoji: '🥣', color: '#a8c47a',
        desc: 'Каши, омлеты, бутерброды и сырники для энергичного утра',
        dishes: ['tofu-syrniki', 'nut-omelet', 'tofu-scramble', 'avocado-toast', 'bruschetta-cashew']
    },
    mains: {
        id: 'mains', name: 'Основные блюда', emoji: '🍲', color: '#e8a870',
        desc: 'Сытные обеды и ужины — супы, борщ, котлеты, плов и паста',
        dishes: ['veggie-concentrate', 'clear-broth', 'dark-broth', 'lentil-soup', 'borscht', 'chickpea-noodle-soup', 'buckwheat-soup', 'broccoli-cream-soup', 'rassolnik', 'roasted-veg-soup', 'oregano-croutons', 'ww-crackers', 'potato-quinoa-cutlets', 'green-lentil-cutlets', 'broccoli-rice-cutlets', 'chickpea-eggplant-cutlets', 'chickpea-meatballs', 'red-lentil-cutlets', 'lentil-mushroom-pilaf', 'pasta-boloniase', 'pasta-carbonara']
    },
    pancakes: {
        id: 'pancakes', name: 'Блины / Оладьи', emoji: '🥞', color: '#c8b07a',
        desc: 'Веганские блины и оладьи из цельных продуктов',
        dishes: ['lentil-pancakes', 'lentil-pancakes-gf', 'apple-pear-pancakes']
    },
    spreads: {
        id: 'spreads', name: 'Намазки', emoji: '🫙', color: '#9abcc8',
        desc: 'Хумус, паштеты и соусы — для бутербродов и перекусов',
        dishes: ['hummus', 'bean-paste', 'cashew-sauce', 'cashew-sour-cream', 'caesar-sauce', 'white-bean-sauce', 'roasted-veg-sauce']
    },
    salads: {
        id: 'salads', name: 'Салаты', emoji: '🥗', color: '#7db87d',
        desc: 'Лёгкие салаты — идеальное дополнение для клетчатки',
        dishes: []
    },
    drinks: {
        id: 'drinks', name: 'Напитки', emoji: '🥤', color: '#a8c4e0',
        desc: 'Смузи и растительные напитки',
        dishes: []
    }
};
// Use fallback categories if not loaded from API
if (!Object.keys(CATEGORIES).length) CATEGORIES = Object.assign({}, _FALLBACK_CATEGORIES);

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
    if (filters.gluten)      dishes = dishes.filter(d => (d.tags||[]).includes('без глютена'));
    if (filters.plant)  dishes = dishes.filter(d => !(d.tags||[]).includes('рыбное'));
    if (filters.fish)   dishes = dishes.filter(d => (d.tags||[]).includes('рыбное'));
    if (filters.noSoy)   dishes = dishes.filter(d => !(d.tags||[]).includes('соя'));
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
