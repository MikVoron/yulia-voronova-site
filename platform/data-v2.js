/**
 * Platform data v2 — Category-based architecture
 * Категории: Завтраки, Основные блюда, Блины/Оладьи, Намазки, Салаты, Напитки
 */

// ─── AUTH ───────────────────────────────────────────────────────────────────
const Auth = {
    KEY: 'hp_user',
    login(email, name) {
        const user = { email, name: name || email.split('@')[0], joined: Date.now() };
        localStorage.setItem(this.KEY, JSON.stringify(user));
        return user;
    },
    logout() { localStorage.removeItem(this.KEY); Plate.clear(); },
    isLoggedIn() { return !!localStorage.getItem(this.KEY); },
    getUser() { try { return JSON.parse(localStorage.getItem(this.KEY)); } catch { return null; } },
    requireAuth() { if (!this.isLoggedIn()) location.href = 'login.html'; }
};

// ─── MY PLATE ────────────────────────────────────────────────────────────────
const Plate = {
    KEY: 'plate_items',
    HIST: 'plate_history',
    get()  { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch { return []; } },
    set(v) { localStorage.setItem(this.KEY, JSON.stringify(v)); updatePlateIcon(); },
    add(item) { const p = this.get(); p.push({ ...item, addedAt: Date.now() }); this.set(p); },
    remove(idx) { const p = this.get(); p.splice(idx, 1); this.set(p); },
    clear() { localStorage.removeItem(this.KEY); updatePlateIcon(); },
    count() { return this.get().length; },
    totals() {
        return this.get().reduce((t, i) => ({
            kcal:    t.kcal    + (i.kcal    || 0),
            protein: t.protein + (i.protein || 0),
            fat:     t.fat     + (i.fat     || 0),
            carbs:   t.carbs   + (i.carbs   || 0)
        }), { kcal: 0, protein: 0, fat: 0, carbs: 0 });
    },
    saveHistory() {
        const items = this.get();
        if (!items.length) return;
        const h = this.getHistory();
        h.unshift({ date: new Date().toISOString(), items, totals: this.totals() });
        localStorage.setItem(this.HIST, JSON.stringify(h.slice(0, 30)));
        this.clear();
    },
    getHistory() { try { return JSON.parse(localStorage.getItem(this.HIST) || '[]'); } catch { return []; } }
};

function updatePlateIcon() {
    const n = Plate.count();
    document.querySelectorAll('.plate-count').forEach(el => {
        el.textContent = n;
        el.style.display = n > 0 ? 'flex' : 'none';
    });
}

// ─── RECIPE DATA ─────────────────────────────────────────────────────────────
const RECIPES = {};

// Гарниры — для блока «Добавь углеводов»
RECIPES['rice']     = { id: 'rice',     name: 'Рис отварной',     emoji: '🍚', time: 20, diff: 'easy', servings: 2, kcal: 220, protein: 5, fat: 1, carbs: 48, cat: '_sides', ingredients: ['150 г риса', '300 мл воды', '½ ч. л. соли'], steps: ['Промойте рис несколько раз.', 'Залейте холодной водой 1:2.', 'Варите 18 минут под крышкой на слабом огне.', 'Оставьте на 5 минут, не открывая крышку.'], addProtein: [], addFat: [], addCarbs: [], addFiber: [] };
RECIPES['bulgur']   = { id: 'bulgur',   name: 'Булгур',           emoji: '🌾', time: 20, diff: 'easy', servings: 2, kcal: 210, protein: 7, fat: 1, carbs: 44, cat: '_sides', ingredients: ['150 г булгура', '280 мл воды', '½ ч. л. соли'], steps: ['Залейте булгур кипятком в соотношении 1:1,8.', 'Варите 12 минут, помешивая.', 'Снимите с огня и накройте крышкой на 5 минут.'], addProtein: [], addFat: [], addCarbs: [], addFiber: [] };
RECIPES['buckwheat']= { id: 'buckwheat',name: 'Гречка отварная',  emoji: '🥣', time: 20, diff: 'easy', servings: 2, kcal: 200, protein: 7, fat: 2, carbs: 40, cat: '_sides', ingredients: ['150 г гречневой крупы', '300 мл воды', 'Соль'], steps: ['Промойте гречку.', 'Залейте водой 1:2.', 'Варите 15 минут на слабом огне.', 'Укутайте на 10 минут.'], addProtein: [], addFat: [], addCarbs: [], addFiber: [] };
RECIPES['quinoa']   = { id: 'quinoa',   name: 'Киноа',            emoji: '🌱', time: 15, diff: 'easy', servings: 2, kcal: 185, protein: 7, fat: 3, carbs: 34, cat: '_sides', ingredients: ['150 г киноа', '280 мл воды', 'Соль'], steps: ['Промойте киноа — убирает горечь.', 'Залейте водой 1:1,8.', 'Варите 12–15 минут до раскрытия зёрен.'], addProtein: [], addFat: [], addCarbs: [], addFiber: [] };
RECIPES['millet']   = { id: 'millet',   name: 'Пшено',            emoji: '🌾', time: 25, diff: 'easy', servings: 2, kcal: 195, protein: 5, fat: 2, carbs: 40, cat: '_sides', ingredients: ['150 г пшена', '350 мл воды', 'Соль'], steps: ['Промойте пшено до чистой воды.', 'Залейте кипятком 1:2.', 'Варите 20 минут.'], addProtein: [], addFat: [], addCarbs: [], addFiber: [] };
RECIPES['pasta']    = { id: 'pasta',    name: 'Цельнозерновые макароны', emoji: '🍝', time: 12, diff: 'easy', servings: 2, kcal: 240, protein: 9, fat: 2, carbs: 48, cat: '_sides', ingredients: ['200 г цельнозерновых макарон', 'Вода', 'Соль', 'Оливковое масло'], steps: ['Доведите подсоленную воду до кипения.', 'Варите макароны по инструкции (обычно 8–10 мин).', 'Откиньте на дуршлаг, сбрызните маслом.'], addProtein: [], addFat: [], addCarbs: [], addFiber: [] };
RECIPES['seed-mix'] = { id: 'seed-mix', name: 'Микс семян',       emoji: '🌿', time: 5,  diff: 'easy', servings: 4, kcal: 120, protein: 5, fat: 9, carbs: 5, cat: '_sides', ingredients: ['1 ст. л. семян конопли', '1 ст. л. семян льна', '1 ст. л. семян тыквы'], steps: ['Смешайте все семена.', 'Храните в закрытой банке до 2 недель.', 'Добавляйте 1–2 ст. л. к любому блюду.'], addProtein: [], addFat: [], addCarbs: [], addFiber: [] };

// ─── ЗАВТРАКИ ────────────────────────────────────────────────────────────────
RECIPES['oatmeal'] = {
    id: 'oatmeal', cat: 'breakfasts',
    name: 'Каша овсяная', emoji: '🥣', time: 10, diff: 'easy', servings: 2,
    kcal: 260, protein: 7, fat: 5, carbs: 48,
    tags: ['до 15 мин', 'простой'],
    ingredients: [
        { name: '80 г овсяных хлопьев (цельнозерновых)', swap: 'Можно взять хлопья гречи или ячменя' },
        { name: '200 мл растительного молока', swap: 'Подойдет овсяное, миндальное, кокосовое' },
        { name: '100 г замороженных ягод', swap: null },
        { name: '1 ч. л. семян чиа', swap: null },
        { name: 'Щепотка корицы', swap: null },
        { name: '1 ч. л. кленового сиропа', swap: 'Можно заменить финиковой пастой или мёдом' },
    ],
    steps: [
        'Хлопья залейте молоком в небольшой кастрюле.',
        'Варите на среднем огне 5–7 минут, помешивая.',
        'Добавьте корицу и снимите с огня.',
        'Выложите в миску, сверху — ягоды и семена чиа.',
        'Сбрызните кленовым сиропом.'
    ],
    vkVideo: null,
    addProtein: [
        { name: '150 мл йогурта без сахара', kcal: 85, protein: 7, fat: 2, carbs: 9 },
        { name: '1 вареное яйцо', kcal: 75, protein: 6, fat: 5, carbs: 0 },
        { name: '30 г твёрдого сыра', kcal: 100, protein: 7, fat: 8, carbs: 0 },
    ],
    addFat: [
        { name: '30 г орехов (грецкие, миндаль)', kcal: 180, protein: 4, fat: 16, carbs: 4 },
        { name: 'Микс семян (конопля, лён, тыква)', kcal: 60, protein: 2, fat: 4, carbs: 2, recipeId: 'seed-mix' },
        { name: '½ авокадо', kcal: 120, protein: 1, fat: 10, carbs: 6 },
    ],
    addCarbs: [],
    addFiber: [
        { name: '1 свежее яблоко', kcal: 70, protein: 0, fat: 0, carbs: 18 },
        { name: '100 г свежих ягод', kcal: 50, protein: 1, fat: 0, carbs: 12 },
    ],
    tip: 'Бета-глюкан в овсянке снижает холестерин и улучшает чувствительность к инсулину. Добавляйте ягоды — антиоксиданты усиливают эффект!'
};

RECIPES['millet-porridge'] = {
    id: 'millet-porridge', cat: 'breakfasts',
    name: 'Каша пшенная', emoji: '🌾', time: 25, diff: 'easy', servings: 2,
    kcal: 240, protein: 6, fat: 4, carbs: 46,
    tags: ['простой'],
    ingredients: [
        { name: '100 г пшена', swap: null },
        { name: '250 мл растительного молока', swap: 'Можно на воде' },
        { name: '1 ч. л. сливочного масла (или кокосового)', swap: null },
        { name: 'Соль, сахар по вкусу', swap: null },
    ],
    steps: [
        'Пшено промойте несколько раз до чистой воды.',
        'Залейте молоком, доведите до кипения.',
        'Варите 20 минут на слабом огне, помешивая.',
        'Добавьте масло, посолите, подсластите по вкусу.',
    ],
    vkVideo: null,
    addProtein: [
        { name: '150 мл йогурта без сахара', kcal: 85, protein: 7, fat: 2, carbs: 9 },
        { name: '1 вареное яйцо', kcal: 75, protein: 6, fat: 5, carbs: 0 },
        { name: '30 г твёрдого сыра', kcal: 100, protein: 7, fat: 8, carbs: 0 },
    ],
    addFat: [
        { name: 'Микс семян', kcal: 60, protein: 2, fat: 4, carbs: 2, recipeId: 'seed-mix' },
        { name: '30 г орехов', kcal: 180, protein: 4, fat: 16, carbs: 4 },
    ],
    addCarbs: [],
    addFiber: [
        { name: '100 г свежих ягод', kcal: 50, protein: 1, fat: 0, carbs: 12 },
        { name: '1 груша', kcal: 60, protein: 0, fat: 0, carbs: 15 },
    ],
    tip: 'Пшено богато магнием и витамином B6 — важными для нервной системы. В отличие от большинства злаков, оно ощелачивает организм!'
};

RECIPES['tofu-scramble'] = {
    id: 'tofu-scramble', cat: 'breakfasts',
    name: 'Тофу скрэмбл', emoji: '🍳', time: 15, diff: 'easy', servings: 2,
    kcal: 185, protein: 14, fat: 11, carbs: 6,
    tags: ['до 15 мин', 'простой', 'без глютена'],
    ingredients: [
        { name: '200 г твёрдого тофу', swap: 'Нут варёный (200 г) — другая текстура, но тоже вкусно' },
        { name: '¼ ч. л. куркумы', swap: null },
        { name: '¼ ч. л. чёрной соли (кала намак)', swap: 'Обычная морская соль — без яичного аромата' },
        { name: '1 ст. л. пищевых дрожжей', swap: null },
        { name: '½ болгарского перца', swap: null },
        { name: '1 ст. л. оливкового масла', swap: null },
    ],
    steps: [
        'Тофу раскрошите руками или вилкой.',
        'Перец нарежьте мелкими кубиками.',
        'Разогрейте масло, обжарьте перец 2 мин.',
        'Добавьте тофу, куркуму, кала намак и дрожжи.',
        'Жарьте 5–7 минут, помешивая. Подавайте горячим.',
    ],
    vkVideo: null,
    addProtein: [
        { name: '30 г твёрдого сыра', kcal: 100, protein: 7, fat: 8, carbs: 0 },
    ],
    addFat: [
        { name: '½ авокадо', kcal: 120, protein: 1, fat: 10, carbs: 6 },
        { name: '30 г орехов', kcal: 180, protein: 4, fat: 16, carbs: 4 },
    ],
    addCarbs: [
        { name: 'Цельнозерновой тост', kcal: 100, protein: 3, fat: 1, carbs: 20 },
    ],
    addFiber: [
        { name: 'Салат из помидоров и огурцов', kcal: 40, protein: 1, fat: 1, carbs: 8 },
    ],
    tip: 'Кала намак (чёрная соль) содержит серу — именно она даёт аромат "яйца". Добавляйте в конце, чтобы аромат не улетел!'
};

RECIPES['tofu-syrniki'] = {
    id: 'tofu-syrniki', cat: 'breakfasts',
    name: 'Сырники из тофу', emoji: '🥞', time: 30, diff: 'medium', servings: 2,
    kcal: 220, protein: 14, fat: 8, carbs: 24,
    tags: ['до 30 мин', 'средний'],
    ingredients: [
        { name: '200 г мягкого тофу', swap: null },
        { name: '3 ст. л. рисовой муки', swap: 'Можно овсяную или нутовую муку' },
        { name: '1 ст. л. кокосового сахара', swap: 'Мёд, кленовый сироп' },
        { name: '½ ч. л. ванили', swap: null },
        { name: 'Щепотка соли', swap: null },
        { name: 'Масло для жарки', swap: null },
    ],
    steps: [
        'Тофу обсушите и раскрошите в блендере до гладкой массы.',
        'Смешайте с мукой, сахаром, ванилью и солью.',
        'Сформируйте лепёшки диаметром 5–6 см.',
        'Обжарьте на масле 3–4 мин с каждой стороны до золотистой корочки.',
    ],
    vkVideo: null,
    addProtein: [
        { name: '150 мл растительного йогурта', kcal: 60, protein: 3, fat: 2, carbs: 7 },
    ],
    addFat: [
        { name: 'Ореховая паста (30 г)', kcal: 180, protein: 5, fat: 15, carbs: 7 },
    ],
    addCarbs: [],
    addFiber: [
        { name: '100 г свежих ягод', kcal: 50, protein: 1, fat: 0, carbs: 12 },
    ],
    tip: 'Мягкий тофу по текстуре похож на творог. Рисовая мука делает сырники нежнее — не переусердствуйте, чтобы тесто не стало резиновым!'
};

RECIPES['nut-omelet'] = {
    id: 'nut-omelet', cat: 'breakfasts',
    name: 'Нутовый омлет', emoji: '🍳', time: 20, diff: 'easy', servings: 2,
    kcal: 195, protein: 11, fat: 7, carbs: 24,
    tags: ['до 30 мин', 'простой', 'без глютена'],
    ingredients: [
        { name: '100 г нутовой муки', swap: 'Гороховая мука' },
        { name: '200 мл воды', swap: null },
        { name: '¼ ч. л. куркумы', swap: null },
        { name: '¼ ч. л. чёрного перца', swap: null },
        { name: 'Соль по вкусу', swap: null },
        { name: 'Начинка: шпинат, помидоры, грибы', swap: 'Любые овощи по сезону' },
    ],
    steps: [
        'Нутовую муку смешайте с водой, куркумой, перцем и солью — получится жидкое тесто.',
        'Оставьте на 10 минут набухнуть.',
        'Разогрейте сковороду, смажьте маслом.',
        'Вылейте тесто, сверху положите начинку.',
        'Закройте крышкой, готовьте 5–7 минут.',
    ],
    vkVideo: null,
    addProtein: [
        { name: '30 г твёрдого сыра натёртого', kcal: 100, protein: 7, fat: 8, carbs: 0 },
    ],
    addFat: [
        { name: '½ авокадо', kcal: 120, protein: 1, fat: 10, carbs: 6 },
    ],
    addCarbs: [
        { name: 'Цельнозерновой тост', kcal: 100, protein: 3, fat: 1, carbs: 20 },
    ],
    addFiber: [
        { name: 'Свежие томаты с зеленью', kcal: 35, protein: 1, fat: 0, carbs: 7 },
    ],
    tip: 'Нутовая мука содержит в 2 раза больше белка, чем пшеничная! Это незаменимый ингредиент для растительных «яичных» блюд.'
};

RECIPES['sandwiches'] = {
    id: 'sandwiches', cat: 'breakfasts',
    name: 'Здоровые бутерброды', emoji: '🥪', time: 10, diff: 'easy', servings: 2,
    kcal: 180, protein: 6, fat: 8, carbs: 22,
    tags: ['до 15 мин', 'простой'],
    isSublist: true,
    subItems: ['hummus', 'guacamole', 'tuna-greens', 'bean-paste', 'lentil-paste'],
    ingredients: [
        { name: '4 ломтика цельнозернового хлеба', swap: 'Ржаные хлебцы, крекеры без сахара' },
        { name: 'Намазка на выбор', swap: null },
        { name: 'Листья салата, огурец, помидор', swap: null },
    ],
    steps: [
        'Выберите намазку из предложенных вариантов ниже.',
        'Намажьте на ломтики хлеба.',
        'Добавьте свежие овощи по вкусу.',
    ],
    vkVideo: null,
    addProtein: [],
    addFat: [],
    addCarbs: [],
    addFiber: [],
    tip: 'Цельнозерновой хлеб вместо белого — это в 2 раза больше клетчатки и микроэлементов. Выбирайте хлеб, где мука стоит первой в составе!'
};

// ─── ОСНОВНЫЕ БЛЮДА ─────────────────────────────────────────────────────────
RECIPES['borscht'] = {
    id: 'borscht', cat: 'mains',
    name: 'Борщ', emoji: '🍲', time: 60, diff: 'medium', servings: 4,
    kcal: 180, protein: 6, fat: 5, carbs: 28,
    tags: ['до 1 часа', 'средний'],
    ingredients: [
        { name: '2 средних свёклы', swap: null },
        { name: '½ кочана капусты', swap: null },
        { name: '2 картофелины', swap: 'Батат для более низкого гликемического индекса' },
        { name: '1 морковь', swap: null },
        { name: '1 луковица', swap: null },
        { name: '2 ст. л. томатной пасты', swap: '2 свежих помидора' },
        { name: '1,5 л овощного бульона', swap: 'Вода с лавровым листом и перцем горошком' },
        { name: 'Чеснок, соль, перец, лавровый лист', swap: null },
        { name: '1 ст. л. яблочного уксуса', swap: null },
    ],
    steps: [
        'Свёклу натрите на тёрке, обжарьте 5 мин с уксусом — так сохранит цвет.',
        'Лук и морковь обжарьте 5 мин, добавьте томатную пасту.',
        'Бульон доведите до кипения, добавьте картофель, варите 10 мин.',
        'Добавьте капусту, варите ещё 10 мин.',
        'Добавьте свёклу и зажарку. Варите 15 мин.',
        'Посолите, добавьте чеснок. Настоять 15 мин.',
    ],
    vkVideo: null,
    addProtein: [
        { name: '80 г фасоли консервированной', kcal: 95, protein: 6, fat: 0, carbs: 17 },
        { name: '100 г тофу кубиками', kcal: 75, protein: 8, fat: 4, carbs: 2 },
        { name: '100 г отварного белого мяса курицы или индейки', kcal: 110, protein: 22, fat: 2, carbs: 0 },
    ],
    addFat: [
        { name: '1 ст. л. льняного масла (в тарелку)', kcal: 90, protein: 0, fat: 10, carbs: 0 },
    ],
    addCarbs: [],
    addFiber: [
        { name: 'Ломтик ржаного хлеба', kcal: 80, protein: 3, fat: 1, carbs: 16 },
    ],
    tip: 'Свёкла содержит бетаин — он поддерживает работу печени и снижает уровень гомоцистеина. Добавляйте уксус при жарке, чтобы сохранить яркий цвет!'
};

RECIPES['lentil-cutlets'] = {
    id: 'lentil-cutlets', cat: 'mains',
    name: 'Котлеты из чечевицы', emoji: '🍱', time: 40, diff: 'medium', servings: 4,
    kcal: 245, protein: 14, fat: 7, carbs: 34,
    tags: ['до 1 часа', 'средний', 'без глютена'],
    ingredients: [
        { name: '200 г красной чечевицы', swap: 'Зелёная или коричневая чечевица' },
        { name: '1 луковица', swap: null },
        { name: '2 зубчика чеснока', swap: null },
        { name: '50 г овсяных хлопьев (как связующий)', swap: 'Нутовая мука — получится без глютена' },
        { name: '1 ч. л. тмина', swap: null },
        { name: '½ ч. л. куркумы', swap: null },
        { name: '1 ч. л. паприки', swap: null },
        { name: '2 ст. л. оливкового масла', swap: null },
    ],
    steps: [
        'Чечевицу промойте, залейте водой 1:2, варите 15 мин до мягкости.',
        'Слейте воду, разомните чечевицу вилкой.',
        'Лук и чеснок мелко нарубите, обжарьте 5 мин.',
        'Смешайте чечевицу, лук, хлопья, специи. Дайте постоять 10 мин.',
        'Сформируйте котлеты, обжарьте 4 мин с каждой стороны.',
    ],
    vkVideo: null,
    addProtein: [],
    addFat: [],
    addCarbs: [
        { name: 'Рис отварной',  kcal: 220, protein: 5, fat: 1, carbs: 48, recipeId: 'rice' },
        { name: 'Булгур',        kcal: 210, protein: 7, fat: 1, carbs: 44, recipeId: 'bulgur' },
        { name: 'Гречка отварная', kcal: 200, protein: 7, fat: 2, carbs: 40, recipeId: 'buckwheat' },
        { name: 'Киноа',         kcal: 185, protein: 7, fat: 3, carbs: 34, recipeId: 'quinoa' },
        { name: 'Пшено',         kcal: 195, protein: 5, fat: 2, carbs: 40, recipeId: 'millet' },
        { name: 'Цельнозерновые макароны', kcal: 240, protein: 9, fat: 2, carbs: 48, recipeId: 'pasta' },
    ],
    addFiber: [
        { name: 'Салат из сезонных овощей', kcal: 50, protein: 1, fat: 2, carbs: 8, catLink: 'salads' },
        { name: 'Тушёные овощи с травами',  kcal: 80, protein: 2, fat: 4, carbs: 10 },
    ],
    tip: 'Чечевица — один из лучших источников растительного белка и железа. Сочетайте с витамином C (помидоры, перец) для лучшего усвоения железа!'
};

RECIPES['pilaf'] = {
    id: 'pilaf', cat: 'mains',
    name: 'Плов', emoji: '🍚', time: 60, diff: 'medium', servings: 4,
    kcal: 310, protein: 8, fat: 9, carbs: 52,
    tags: ['до 1 часа', 'средний'],
    ingredients: [
        { name: '200 г длиннозёрного риса', swap: 'Бурый рис — дольше готовится, но полезнее' },
        { name: '200 г нута варёного', swap: 'Фасоль' },
        { name: '2 моркови', swap: null },
        { name: '2 луковицы', swap: null },
        { name: '4 зубчика чеснока', swap: null },
        { name: '2 ст. л. растительного масла', swap: null },
        { name: 'Зира, куркума, барбарис, соль', swap: null },
    ],
    steps: [
        'Рис замочите на 30 мин, промойте.',
        'Лук и морковь обжарьте до золотистого цвета.',
        'Добавьте специи, нут, перемешайте.',
        'Выложите рис ровным слоем, залейте горячей водой на 1–2 см выше риса.',
        'Воткните головку чеснока в центр.',
        'Готовьте под крышкой 25–30 мин на слабом огне.',
    ],
    vkVideo: null,
    addProtein: [
        { name: '100 г тофу жареного', kcal: 75, protein: 8, fat: 4, carbs: 2 },
    ],
    addFat: [],
    addCarbs: [],
    addFiber: [
        { name: 'Свежий салат из огурцов и зелени', kcal: 30, protein: 1, fat: 1, carbs: 6 },
    ],
    tip: 'Зира (кумин) улучшает пищеварение и снижает вздутие — идеальная специя для блюд с бобовыми!'
};

RECIPES['buckwheat-tofu'] = {
    id: 'buckwheat-tofu', cat: 'mains',
    name: 'Гречка с овощами и тофу', emoji: '🥘', time: 35, diff: 'easy', servings: 2,
    kcal: 290, protein: 18, fat: 10, carbs: 36,
    tags: ['до 30 мин', 'простой', 'без глютена'],
    ingredients: [
        { name: '150 г гречки', swap: null },
        { name: '200 г твёрдого тофу', swap: 'Темпе' },
        { name: '1 болгарский перец', swap: null },
        { name: '1 цукини', swap: null },
        { name: '1 луковица', swap: null },
        { name: '2 ст. л. соевого соуса (тамари)', swap: null },
        { name: '1 ст. л. кунжутного масла', swap: 'Оливковое масло' },
    ],
    steps: [
        'Гречку отварите (1:2, 15 мин).',
        'Тофу нарежьте кубиками, обжарьте до корочки.',
        'Овощи нарежьте, обжарьте 7–10 мин.',
        'Добавьте тамари и кунжутное масло, перемешайте.',
        'Смешайте гречку с овощами и тофу.',
    ],
    vkVideo: null,
    addProtein: [],
    addFat: [
        { name: 'Кунжут (1 ст. л.)', kcal: 50, protein: 1, fat: 4, carbs: 2 },
    ],
    addCarbs: [],
    addFiber: [
        { name: 'Квашеная капуста (100 г)', kcal: 20, protein: 1, fat: 0, carbs: 4 },
    ],
    tip: 'Тофу лучше обжаривать после маринования. Даже 15 минут в тамари + кунжутное масло дают насыщенный вкус!'
};

// ─── БЛИНЫ / ОЛАДЬИ ─────────────────────────────────────────────────────────
RECIPES['ww-pancakes'] = {
    id: 'ww-pancakes', cat: 'pancakes',
    name: 'Блины с цельнозерновой мукой', emoji: '🥞', time: 30, diff: 'medium', servings: 4,
    kcal: 195, protein: 6, fat: 5, carbs: 32,
    tags: ['до 30 мин', 'средний'],
    ingredients: [
        { name: '150 г цельнозерновой муки', swap: 'Мука из спельты' },
        { name: '300 мл растительного молока', swap: null },
        { name: '1 ст. л. льняных семян + 3 ст. л. воды (замена яйца)', swap: null },
        { name: '1 ст. л. оливкового масла', swap: null },
        { name: 'Щепотка соли, ½ ч. л. разрыхлителя', swap: null },
    ],
    steps: [
        'Льняные семена замочите в воде на 5 мин — получится «льняное яйцо».',
        'Смешайте муку, молоко, льняное яйцо, масло, соль и разрыхлитель.',
        'Перемешайте до однородности, оставьте на 5 мин.',
        'Жарьте на антипригарной сковороде по 2 мин с каждой стороны.',
    ],
    vkVideo: null,
    addProtein: [
        { name: '150 мл растительного йогурта', kcal: 60, protein: 3, fat: 2, carbs: 7 },
        { name: '30 г орехов', kcal: 180, protein: 4, fat: 16, carbs: 4 },
    ],
    addFat: [
        { name: 'Ореховая паста (30 г)', kcal: 180, protein: 5, fat: 15, carbs: 7 },
        { name: '½ авокадо', kcal: 120, protein: 1, fat: 10, carbs: 6 },
    ],
    addCarbs: [],
    addFiber: [
        { name: 'Свежие ягоды (100 г)', kcal: 50, protein: 1, fat: 0, carbs: 12 },
    ],
    addTopping: 'Можно добавить: йогурт без сахара 150 г или твёрдый сыр 30 г',
    tip: 'Льняное «яйцо» — отличный связующий: смешайте 1 ст. л. молотых семян + 3 ст. л. воды и оставьте на 5–10 мин до гелеобразной консистенции.'
};

RECIPES['green-buckwheat-pancakes'] = {
    id: 'green-buckwheat-pancakes', cat: 'pancakes',
    name: 'Блины из зелёной гречки', emoji: '💚', time: 25, diff: 'easy', servings: 4,
    kcal: 180, protein: 7, fat: 4, carbs: 30,
    tags: ['до 30 мин', 'простой', 'без глютена'],
    ingredients: [
        { name: '150 г зелёной гречки', swap: null },
        { name: '200 мл воды', swap: null },
        { name: '1 ч. л. оливкового масла', swap: null },
        { name: 'Щепотка соли', swap: null },
    ],
    steps: [
        'Гречку замочите на 6–8 часов (или на ночь), промойте.',
        'Взбейте в блендере с водой до однородного теста.',
        'Добавьте масло и соль, перемешайте.',
        'Жарьте на сухой антипригарной сковороде по 2–3 мин с каждой стороны.',
    ],
    vkVideo: null,
    addProtein: [
        { name: 'Намазка из хумуса', kcal: 170, protein: 8, fat: 9, carbs: 16, recipeId: 'hummus' },
        { name: 'Тунец с зеленью', kcal: 140, protein: 20, fat: 5, carbs: 2, recipeId: 'tuna-greens' },
        { name: 'Намазка из чечевицы', kcal: 130, protein: 8, fat: 3, carbs: 18, recipeId: 'lentil-paste' },
        { name: 'Шоколадная паста', kcal: 200, protein: 4, fat: 14, carbs: 16 },
        { name: 'Йогурт без сахара 150 г', kcal: 85, protein: 7, fat: 2, carbs: 9 },
        { name: 'Твёрдый сыр 30 г', kcal: 100, protein: 7, fat: 8, carbs: 0 },
    ],
    addFat: [],
    addCarbs: [],
    addFiber: [],
    tip: 'Зелёная гречка — живой продукт! В ней сохранены ферменты и витамины, разрушающиеся при термической обработке. Замачивание «активирует» зерно.'
};

RECIPES['lentil-fritters'] = {
    id: 'lentil-fritters', cat: 'pancakes',
    name: 'Оладьи из чечевицы', emoji: '🟤', time: 30, diff: 'easy', servings: 4,
    kcal: 200, protein: 12, fat: 5, carbs: 28,
    tags: ['до 30 мин', 'простой', 'без глютена'],
    ingredients: [
        { name: '200 г красной чечевицы', swap: null },
        { name: '½ луковицы', swap: null },
        { name: '1 зубчик чеснока', swap: null },
        { name: '½ ч. л. тмина', swap: null },
        { name: 'Соль, перец', swap: null },
        { name: 'Оливковое масло для жарки', swap: null },
    ],
    steps: [
        'Чечевицу замочите на 2–4 часа, промойте.',
        'Взбейте в блендере с луком, чесноком и специями.',
        'Тесто должно быть густым.',
        'Жарьте ложкой на масле по 3–4 мин с каждой стороны.',
    ],
    vkVideo: null,
    addProtein: [
        { name: 'Хумус', kcal: 170, protein: 8, fat: 9, carbs: 16, recipeId: 'hummus' },
        { name: '150 мл йогурта', kcal: 85, protein: 7, fat: 2, carbs: 9 },
    ],
    addFat: [],
    addCarbs: [],
    addFiber: [
        { name: 'Свежий огурец + зелень', kcal: 20, protein: 1, fat: 0, carbs: 4 },
    ],
    tip: 'Чечевицу не обязательно варить — замоченная сырая легче переваривается и сохраняет больше фитонутриентов!'
};

RECIPES['oat-fritters'] = {
    id: 'oat-fritters', cat: 'pancakes',
    name: 'Оладьи из овсянки', emoji: '🥞', time: 20, diff: 'easy', servings: 2,
    kcal: 210, protein: 7, fat: 5, carbs: 35,
    tags: ['до 30 мин', 'простой'],
    ingredients: [
        { name: '100 г овсяных хлопьев', swap: null },
        { name: '150 мл растительного молока', swap: null },
        { name: '1 ст. л. льняных семян + 3 ст. л. воды', swap: null },
        { name: '½ ч. л. разрыхлителя', swap: null },
        { name: '1 ч. л. кленового сиропа', swap: null },
    ],
    steps: [
        'Хлопья замочите в молоке на 5 мин.',
        'Смешайте с льняным яйцом, разрыхлителем и сиропом.',
        'Жарьте на слабом огне 3–4 мин с каждой стороны.',
    ],
    vkVideo: null,
    addProtein: [
        { name: '150 мл растительного йогурта', kcal: 60, protein: 3, fat: 2, carbs: 7 },
    ],
    addFat: [
        { name: 'Ореховая паста', kcal: 180, protein: 5, fat: 15, carbs: 7 },
    ],
    addCarbs: [],
    addFiber: [
        { name: 'Свежие ягоды', kcal: 50, protein: 1, fat: 0, carbs: 12 },
    ],
    tip: 'Для пышных оладий важна температура: ставьте на холодную сковороду и разогревайте вместе — тесто не прилипнет!'
};

// ─── НАМАЗКИ ────────────────────────────────────────────────────────────────
RECIPES['hummus'] = {
    id: 'hummus', cat: 'spreads',
    name: 'Хумус домашний', emoji: '🫘', time: 10, diff: 'easy', servings: 6,
    kcal: 170, protein: 8, fat: 9, carbs: 16,
    tags: ['до 15 мин', 'простой', 'без глютена'],
    ingredients: [
        { name: '400 г нута варёного (или консервированного)', swap: null },
        { name: '2 ст. л. тахини', swap: 'Кунжутные семена, измельчённые в кашу' },
        { name: 'Сок 1 лимона', swap: null },
        { name: '1 зубчик чеснока', swap: null },
        { name: '3 ст. л. оливкового масла', swap: null },
        { name: '½ ч. л. тмина', swap: null },
        { name: 'Соль, паприка для подачи', swap: null },
    ],
    steps: [
        'Слейте жидкость с нута, оставьте несколько ложек.',
        'Взбейте нут с тахини, лимонным соком, чесноком и тмином.',
        'Добавьте масло, взбивайте до кремообразной текстуры.',
        'Если густой — добавьте воду от нута.',
        'Выложите, сделайте углубление, налейте масло, посыпьте паприкой.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
    tip: 'Хумус — идеальный перекус: нут даёт клетчатку и белок, тахини — кальций. Используйте как соус к овощам вместо майонеза!'
};

RECIPES['guacamole'] = {
    id: 'guacamole', cat: 'spreads',
    name: 'Гуакамоле', emoji: '🥑', time: 10, diff: 'easy', servings: 4,
    kcal: 140, protein: 2, fat: 12, carbs: 8,
    tags: ['до 15 мин', 'простой', 'без глютена'],
    ingredients: [
        { name: '2 спелых авокадо', swap: null },
        { name: 'Сок ½ лайма', swap: 'Лимон' },
        { name: '½ помидора', swap: null },
        { name: '¼ красного лука', swap: null },
        { name: 'Кинза, соль, перец чили', swap: 'Петрушка вместо кинзы' },
    ],
    steps: [
        'Авокадо разомните вилкой — не до пюре, оставьте кусочки.',
        'Добавьте сок лайма, мелко нарезанные помидор и лук.',
        'Добавьте кинзу, соль и чили по вкусу.',
        'Подавайте сразу — авокадо быстро темнеет.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
    tip: 'Косточка авокадо в миске замедляет окисление. Но лучший способ — лимонный сок: он блокирует ферменты окисления!'
};

RECIPES['tuna-greens'] = {
    id: 'tuna-greens', cat: 'spreads',
    name: 'Тунец с зеленью', emoji: '🐟', time: 5, diff: 'easy', servings: 4,
    kcal: 140, protein: 20, fat: 5, carbs: 2,
    tags: ['до 15 мин', 'простой', 'без глютена'],
    ingredients: [
        { name: '1 банка тунца в собственном соку (180 г)', swap: 'Лосось консервированный' },
        { name: '1 ст. л. растительного майонеза или йогурта', swap: null },
        { name: 'Зелёный лук, петрушка', swap: null },
        { name: 'Соль, лимонный сок', swap: null },
    ],
    steps: [
        'Слейте жидкость с тунца.',
        'Разомните вилкой.',
        'Добавьте майонез/йогурт, зелень, лимонный сок, соль.',
        'Перемешайте.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
    tip: 'Тунец в собственном соку — самый диетический. Богат омега-3 и витамином D!'
};

RECIPES['bean-paste'] = {
    id: 'bean-paste', cat: 'spreads',
    name: 'Паштет из фасоли', emoji: '🫘', time: 10, diff: 'easy', servings: 6,
    kcal: 120, protein: 7, fat: 3, carbs: 18,
    tags: ['до 15 мин', 'простой', 'без глютена'],
    ingredients: [
        { name: '400 г белой фасоли варёной', swap: 'Нут или чёрная фасоль' },
        { name: '2 ст. л. оливкового масла', swap: null },
        { name: '1 зубчик чеснока', swap: null },
        { name: 'Розмарин или тимьян', swap: null },
        { name: 'Лимонный сок, соль', swap: null },
    ],
    steps: [
        'Все ингредиенты измельчите в блендере.',
        'Добавьте воду от фасоли для нужной консистенции.',
        'Подавайте с цельнозерновым хлебом.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
    tip: 'Белая фасоль богата клетчаткой и калием — поддерживает сердце и стабилизирует сахар крови!'
};

RECIPES['lentil-paste'] = {
    id: 'lentil-paste', cat: 'spreads',
    name: 'Паштет из чечевицы', emoji: '🟤', time: 30, diff: 'easy', servings: 6,
    kcal: 130, protein: 8, fat: 3, carbs: 18,
    tags: ['до 30 мин', 'простой', 'без глютена'],
    ingredients: [
        { name: '200 г зелёной чечевицы', swap: 'Красная чечевица' },
        { name: '1 луковица', swap: null },
        { name: '1 морковь', swap: null },
        { name: '2 ст. л. оливкового масла', swap: null },
        { name: 'Тмин, кориандр, соль', swap: null },
    ],
    steps: [
        'Чечевицу отварите 20–25 мин до мягкости.',
        'Лук и морковь обжарьте до мягкости.',
        'Взбейте всё в блендере.',
        'Добавьте специи и масло.',
    ],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
    tip: 'Чечевица содержит пребиотики — питание для полезных бактерий кишечника. Регулярное употребление улучшает микробиом!'
};

// ─── САЛАТЫ ─────────────────────────────────────────────────────────────────
RECIPES['greek-salad'] = {
    id: 'greek-salad', cat: 'salads',
    name: 'Греческий салат', emoji: '🥗', time: 10, diff: 'easy', servings: 2,
    kcal: 160, protein: 5, fat: 11, carbs: 12,
    tags: ['до 15 мин', 'простой'],
    ingredients: [
        { name: '200 г томатов черри', swap: null },
        { name: '1 огурец', swap: null },
        { name: '½ красного лука', swap: null },
        { name: '100 г оливок', swap: null },
        { name: '80 г тофу-фета (или обычная фета)', swap: 'Брынза' },
        { name: '2 ст. л. оливкового масла', swap: null },
        { name: 'Орегано, соль', swap: null },
    ],
    steps: ['Нарежьте все ингредиенты.', 'Перемешайте с маслом и орегано.'],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
    tip: 'Оливки — источник олеиновой кислоты и полифенолов. Они улучшают усвоение жирорастворимых витаминов из овощей!'
};

RECIPES['avocado-salad'] = {
    id: 'avocado-salad', cat: 'salads',
    name: 'Салат с авокадо', emoji: '🥑', time: 10, diff: 'easy', servings: 2,
    kcal: 210, protein: 3, fat: 17, carbs: 13,
    tags: ['до 15 мин', 'простой', 'без глютена'],
    ingredients: [
        { name: '1 авокадо', swap: null },
        { name: '200 г томатов черри', swap: null },
        { name: '½ огурца', swap: null },
        { name: '1 ст. л. оливкового масла', swap: null },
        { name: 'Лимонный сок, соль, перец', swap: null },
        { name: 'Базилик или кинза', swap: null },
    ],
    steps: ['Нарежьте авокадо кубиками.', 'Смешайте все ингредиенты.', 'Заправьте маслом и лимонным соком.'],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
    tip: 'Авокадо — источник мононенасыщенных жиров, которые снижают воспаление и поддерживают гормональный баланс!'
};

RECIPES['tabbouleh'] = {
    id: 'tabbouleh', cat: 'salads',
    name: 'Табуле', emoji: '🌿', time: 20, diff: 'easy', servings: 4,
    kcal: 130, protein: 3, fat: 5, carbs: 20,
    tags: ['до 30 мин', 'простой'],
    ingredients: [
        { name: '100 г булгура', swap: 'Кус-кус или киноа' },
        { name: 'Большой пучок петрушки', swap: null },
        { name: '½ пучка мяты', swap: null },
        { name: '2 помидора', swap: null },
        { name: '3 ст. л. оливкового масла', swap: null },
        { name: 'Сок 1 лимона, соль', swap: null },
    ],
    steps: ['Булгур залейте кипятком 1:1, накройте на 15 мин.', 'Мелко нарубите зелень и помидоры.', 'Смешайте с булгуром, заправьте маслом и лимоном.'],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
    tip: 'Петрушка — рекордсмен по витамину K и C. В 100 г петрушки витамина C в 3 раза больше, чем в апельсине!'
};

// ─── НАПИТКИ ─────────────────────────────────────────────────────────────────
RECIPES['green-smoothie'] = {
    id: 'green-smoothie', cat: 'drinks',
    name: 'Зелёный смузи', emoji: '🥤', time: 5, diff: 'easy', servings: 1,
    kcal: 160, protein: 4, fat: 7, carbs: 22,
    tags: ['до 15 мин', 'простой', 'без глютена'],
    ingredients: [
        { name: '1 огурец', swap: null },
        { name: '1 зелёное яблоко', swap: 'Груша' },
        { name: 'Горсть шпината', swap: 'Руккола' },
        { name: '½ авокадо', swap: null },
        { name: '200 мл воды или кокосовой воды', swap: null },
        { name: 'Сок ½ лайма, кусочек имбиря', swap: null },
    ],
    steps: ['Сложите всё в блендер.', 'Взбейте до однородной консистенции.', 'Подавайте сразу.'],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
    tip: 'Зелёный смузи — быстрый способ получить порцию овощей утром. Добавляйте жиры (авокадо) для лучшего усвоения жирорастворимых витаминов!'
};

RECIPES['oat-milk'] = {
    id: 'oat-milk', cat: 'drinks',
    name: 'Овсяное молоко', emoji: '🥛', time: 10, diff: 'easy', servings: 4,
    kcal: 60, protein: 2, fat: 1, carbs: 12,
    tags: ['до 15 мин', 'простой'],
    ingredients: [
        { name: '100 г овсяных хлопьев', swap: null },
        { name: '600 мл воды', swap: null },
        { name: '1 финик (по желанию)', swap: null },
        { name: 'Щепотка соли', swap: null },
    ],
    steps: ['Хлопья залейте водой на 15–20 мин (не дольше — будет слизистым).', 'Взбейте в блендере.', 'Процедите через марлю или мешочек для орехового молока.'],
    vkVideo: null,
    addProtein: [], addFat: [], addCarbs: [], addFiber: [],
    tip: 'Домашнее овсяное молоко без сахара, стабилизаторов и пальмового масла. Отжимки используйте в выпечку!'
};

// ─── КАТЕГОРИИ ───────────────────────────────────────────────────────────────
const CATEGORIES = {
    breakfasts: {
        id: 'breakfasts', name: 'Завтраки', emoji: '🥣', color: '#a8c47a',
        desc: 'Каши, омлеты, бутерброды и сырники для энергичного утра',
        dishes: ['oatmeal', 'millet-porridge', 'tofu-scramble', 'tofu-syrniki', 'nut-omelet', 'sandwiches']
    },
    mains: {
        id: 'mains', name: 'Основные блюда', emoji: '🍲', color: '#e8a870',
        desc: 'Сытные обеды и ужины — борщ, плов, котлеты',
        dishes: ['borscht', 'lentil-cutlets', 'pilaf', 'buckwheat-tofu']
    },
    pancakes: {
        id: 'pancakes', name: 'Блины / Оладьи', emoji: '🥞', color: '#c8b07a',
        desc: 'Веганские блины и оладьи из цельных продуктов',
        dishes: ['ww-pancakes', 'green-buckwheat-pancakes', 'lentil-fritters', 'oat-fritters']
    },
    spreads: {
        id: 'spreads', name: 'Намазки', emoji: '🫙', color: '#9abcc8',
        desc: 'Хумус, гуакамоле, паштеты — для бутербродов и перекусов',
        dishes: ['hummus', 'guacamole', 'tuna-greens', 'bean-paste', 'lentil-paste']
    },
    salads: {
        id: 'salads', name: 'Салаты', emoji: '🥗', color: '#7db87d',
        desc: 'Лёгкие салаты — идеальное дополнение для клетчатки',
        dishes: ['greek-salad', 'avocado-salad', 'tabbouleh']
    },
    drinks: {
        id: 'drinks', name: 'Напитки', emoji: '🥤', color: '#a8c4e0',
        desc: 'Смузи и растительные напитки',
        dishes: ['green-smoothie', 'oat-milk']
    }
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getRecipe(id)     { return RECIPES[id] || null; }
function getCategory(id)   { return CATEGORIES[id] || null; }
function getCategoryDishes(catId, filters = {}) {
    const cat = CATEGORIES[catId];
    if (!cat) return [];
    let dishes = cat.dishes.map(id => RECIPES[id]).filter(Boolean);
    if (filters.time)       dishes = dishes.filter(d => d.time <= filters.time);
    if (filters.difficulty) dishes = dishes.filter(d => d.diff === filters.difficulty);
    if (filters.tag)        dishes = dishes.filter(d => (d.tags||[]).includes(filters.tag));
    return dishes;
}

const DIFF_LABELS = { easy: 'Простой', medium: 'Средний', hard: 'Сложный' };

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
