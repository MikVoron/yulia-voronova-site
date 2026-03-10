/**
 * Harvard Plate Constructor — Data Layer
 * Auth (localStorage prototype), recipes, plate state, history
 */

// ─── AUTH ────────────────────────────────────────────────────────────────────
const Auth = {
    KEY: 'hp_user',

    login(email, name) {
        const user = { email, name: name || email.split('@')[0], joined: Date.now() };
        localStorage.setItem(this.KEY, JSON.stringify(user));
        return user;
    },

    logout() {
        localStorage.removeItem(this.KEY);
        PlateState.clear();
    },

    isLoggedIn() {
        return !!localStorage.getItem(this.KEY);
    },

    getUser() {
        try { return JSON.parse(localStorage.getItem(this.KEY)); } catch { return null; }
    },

    requireAuth(redirect = 'login.html') {
        if (!this.isLoggedIn()) window.location.href = redirect;
    }
};

// ─── RECIPES ─────────────────────────────────────────────────────────────────
const RECIPES = {
    vegetables: [
        {
            id: 'v1',
            name: 'Салат с авокадо и томатами черри',
            emoji: '🥑',
            time: 10,
            difficulty: 'easy',
            kcal: 180, protein: 3, fat: 15, carbs: 10,
            tags: ['без глютена', 'малокалорийное'],
            season: 'all',
            color: '#7db87d',
            ingredients: [
                '1 спелый авокадо',
                '150 г томатов черри',
                '½ огурца',
                '1 ст. л. оливкового масла',
                '1 ч. л. лимонного сока',
                'Соль, чёрный перец по вкусу',
                'Листья базилика для подачи'
            ],
            steps: [
                'Авокадо разрежьте пополам, удалите косточку и нарежьте кубиками.',
                'Томаты черри разрежьте пополам.',
                'Огурец нарежьте полукружками.',
                'Смешайте все ингредиенты в миске.',
                'Заправьте оливковым маслом и лимонным соком, посолите, поперчите.',
                'Украсьте листьями базилика перед подачей.'
            ],
            substitutes: ['Авокадо → запечённый нут', 'Томаты черри → болгарский перец'],
            julias_tip: 'Авокадо — источник мононенасыщенных жиров, которые снижают воспаление и поддерживают гормональный баланс. Добавляйте его к каждому приёму пищи!'
        },
        {
            id: 'v2',
            name: 'Тушёный шпинат с чесноком',
            emoji: '🥬',
            time: 15,
            difficulty: 'easy',
            kcal: 65, protein: 4, fat: 4, carbs: 5,
            tags: ['без глютена', 'малокалорийное'],
            season: 'all',
            color: '#5a9e5a',
            ingredients: [
                '200 г свежего шпината',
                '2 зубчика чеснока',
                '1 ст. л. оливкового масла',
                'Щепотка красного перца',
                'Соль по вкусу',
                'Лимонный сок по желанию'
            ],
            steps: [
                'Шпинат промойте и слегка обсушите.',
                'Чеснок мелко нарубите.',
                'Разогрейте масло на сковороде на среднем огне, обжарьте чеснок 1 минуту.',
                'Добавьте шпинат, перемешайте и готовьте 3–4 минуты до увядания.',
                'Посолите, добавьте красный перец и сбрызните лимонным соком.'
            ],
            substitutes: ['Шпинат → мангольд или руккола', 'Оливковое масло → масло авокадо'],
            julias_tip: 'Шпинат — настоящая суперпища: железо, магний, витамины K и C в одном блюде. Тепловая обработка повышает усвояемость железа!'
        },
        {
            id: 'v3',
            name: 'Запечённые овощи с травами',
            emoji: '🫑',
            time: 40,
            difficulty: 'medium',
            kcal: 130, protein: 3, fat: 7, carbs: 16,
            tags: ['без глютена', 'сезонное'],
            season: 'all',
            color: '#e8934a',
            ingredients: [
                '1 цукини',
                '1 болгарский перец',
                '1 небольшой баклажан',
                '200 г томатов черри',
                '2 ст. л. оливкового масла',
                '1 ч. л. сушёного прованского тимьяна',
                'Чеснок, соль, перец'
            ],
            steps: [
                'Разогрейте духовку до 200 °C.',
                'Нарежьте все овощи кусочками примерно одинакового размера.',
                'Выложите на противень, полейте маслом, посыпьте специями и чесноком.',
                'Перемешайте руками, чтобы масло распределилось равномерно.',
                'Запекайте 30–35 минут, перевернув овощи на 15-й минуте.'
            ],
            substitutes: ['Цукини → патиссон', 'Баклажан → грибы шиитаке или вешенки'],
            julias_tip: 'Запекание — лучший способ сохранить клетчатку и антиоксиданты овощей. Разноцветная тарелка = разнообразие фитонутриентов!'
        },
        {
            id: 'v4',
            name: 'Зелёный смузи с огурцом',
            emoji: '🥒',
            time: 5,
            difficulty: 'easy',
            kcal: 90, protein: 3, fat: 1, carbs: 18,
            tags: ['без глютена', 'малокалорийное'],
            season: 'all',
            color: '#a0c878',
            ingredients: [
                '1 огурец',
                '1 яблоко зелёное',
                'Горсть шпината',
                '½ авокадо',
                '200 мл воды или кокосовой воды',
                'Сок ½ лайма',
                'Имбирь по вкусу'
            ],
            steps: [
                'Нарежьте огурец и яблоко.',
                'Сложите все ингредиенты в блендер.',
                'Добавьте воду.',
                'Взбейте до однородной консистенции.',
                'Подавайте сразу — смузи теряет питательные свойства при хранении.'
            ],
            substitutes: ['Яблоко → груша', 'Шпинат → пшеничные ростки'],
            julias_tip: 'Зелёный смузи — быстрый способ получить порцию овощей утром! Добавляйте жиры (авокадо) для лучшего усвоения жирорастворимых витаминов.'
        }
    ],

    grains: [
        {
            id: 'g1',
            name: 'Бурый рис с кунжутом',
            emoji: '🍚',
            time: 30,
            difficulty: 'easy',
            kcal: 220, protein: 5, fat: 4, carbs: 42,
            tags: ['без глютена'],
            season: 'all',
            color: '#c8a06a',
            ingredients: [
                '150 г бурого риса',
                '1 ст. л. кунжутного масла',
                '1 ст. л. кунжутных семян',
                '1 зубчик чеснока',
                'Соевый соус (тамари) 1 ч. л.',
                'Зелёный лук для подачи'
            ],
            steps: [
                'Промойте рис холодной водой несколько раз.',
                'Варите в соотношении 1:2 (рис:вода) около 25–30 минут.',
                'На сухой сковороде обжарьте кунжут 2 минуты до золотистого цвета.',
                'Смешайте готовый рис с кунжутным маслом и тамари.',
                'Посыпьте кунжутом и зелёным луком.'
            ],
            substitutes: ['Бурый рис → киноа или гречка', 'Кунжутное масло → оливковое'],
            julias_tip: 'Бурый рис — цельнозерновой продукт с клетчаткой и магнием. Он медленнее повышает сахар крови, чем белый рис!'
        },
        {
            id: 'g2',
            name: 'Гречневая каша с грибами',
            emoji: '🥣',
            time: 20,
            difficulty: 'easy',
            kcal: 210, protein: 8, fat: 5, carbs: 36,
            tags: ['без глютена'],
            season: 'all',
            color: '#b8864e',
            ingredients: [
                '150 г гречневой крупы',
                '100 г шампиньонов',
                '1 луковица',
                '1 ст. л. растительного масла',
                'Соль, перец',
                'Зелень по вкусу'
            ],
            steps: [
                'Гречку промойте и залейте кипятком в соотношении 1:2.',
                'Варите 15 минут на слабом огне под крышкой.',
                'Лук нарежьте полукольцами, грибы — ломтиками.',
                'Обжарьте лук 5 мин, добавьте грибы и жарьте ещё 7 мин.',
                'Перемешайте гречку с грибной поджаркой, посолите и поперчите.'
            ],
            substitutes: ['Шампиньоны → вешенки или белые грибы', 'Гречка → пшено'],
            julias_tip: 'Гречка — рекордсмен по содержанию рутина: укрепляет сосуды и снижает воспаление. Это псевдозерно, а не злак — подходит при непереносимости глютена!'
        },
        {
            id: 'g3',
            name: 'Цельнозерновой кус-кус с овощами',
            emoji: '🌾',
            time: 20,
            difficulty: 'easy',
            kcal: 250, protein: 8, fat: 6, carbs: 45,
            tags: [],
            season: 'all',
            color: '#d4b96a',
            ingredients: [
                '150 г кус-куса (цельнозернового)',
                '150 мл овощного бульона',
                '1 ст. л. оливкового масла',
                '½ болгарского перца',
                '½ цукини',
                'Петрушка, лимонный сок',
                'Соль, специи (куркума, тмин)'
            ],
            steps: [
                'Кус-кус залейте кипящим бульоном, накройте крышкой на 5 минут.',
                'Разрыхлите вилкой, добавьте масло.',
                'Нарежьте перец и цукини мелкими кубиками, обжарьте 5–7 мин.',
                'Смешайте кус-кус с овощами.',
                'Добавьте специи, петрушку и лимонный сок.'
            ],
            substitutes: ['Кус-кус → перловка или булгур', 'Овощи → любые сезонные'],
            julias_tip: 'Кус-кус быстро готовится и хорошо насыщает. Выбирайте цельнозерновой вариант: в нём вдвое больше клетчатки и питательных веществ!'
        },
        {
            id: 'g4',
            name: 'Овсяная каша с ягодами',
            emoji: '🫐',
            time: 10,
            difficulty: 'easy',
            kcal: 260, protein: 7, fat: 5, carbs: 48,
            tags: ['малокалорийное'],
            season: 'all',
            color: '#c8a890',
            ingredients: [
                '80 г овсяных хлопьев (цельнозерновых)',
                '200 мл воды или растительного молока',
                '100 г замороженных ягод',
                '1 ч. л. семян чиа',
                '1 ч. л. кленового сиропа',
                'Щепотка корицы'
            ],
            steps: [
                'Хлопья залейте водой или растительным молоком в кастрюле.',
                'Варите на среднем огне 5–7 минут, помешивая.',
                'Добавьте корицу, снимите с огня.',
                'Выложите в миску, посыпьте ягодами, семенами чиа.',
                'Сбрызните кленовым сиропом.'
            ],
            substitutes: ['Ягоды → нарезанный банан или груша', 'Кленовый сироп → мёд'],
            julias_tip: 'Бета-глюкан в овсянке — особая клетчатка, которая снижает холестерин и улучшает чувствительность к инсулину. Добавляйте ягоды для витаминов и антиоксидантов!'
        }
    ],

    protein: [
        {
            id: 'p1',
            name: 'Запечённый лосось с лимоном',
            emoji: '🐟',
            time: 25,
            difficulty: 'medium',
            kcal: 290, protein: 32, fat: 16, carbs: 1,
            tags: ['без глютена'],
            season: 'all',
            color: '#e8a07a',
            ingredients: [
                '150 г филе лосося',
                '1 ч. л. оливкового масла',
                'Сок ½ лимона',
                '1 зубчик чеснока',
                'Свежий укроп',
                'Соль, белый перец',
                'Каперсы по желанию'
            ],
            steps: [
                'Разогрейте духовку до 190 °C.',
                'Смешайте масло, лимонный сок и давленый чеснок.',
                'Филе лосося выложите на фольгу, полейте маринадом.',
                'Посолите, поперчите, посыпьте укропом.',
                'Заверните в фольгу и запекайте 18–20 минут.',
                'Подавайте с каперсами и долькой лимона.'
            ],
            substitutes: ['Лосось → форель или треска', 'Укроп → петрушка или тимьян'],
            julias_tip: 'Лосось — лучший источник омега-3 жирных кислот EPA и DHA: они снижают воспаление, улучшают когнитивные функции и поддерживают здоровье сердца. 2 порции рыбы в неделю — норма ВОЗ!'
        },
        {
            id: 'p2',
            name: 'Чечевица тушёная с томатами',
            emoji: '🌱',
            time: 35,
            difficulty: 'easy',
            kcal: 230, protein: 17, fat: 4, carbs: 36,
            tags: ['без глютена', 'малокалорийное'],
            season: 'all',
            color: '#c87868',
            ingredients: [
                '150 г красной чечевицы',
                '1 банка (400 г) консервированных томатов',
                '1 луковица',
                '2 зубчика чеснока',
                '1 ч. л. тмина',
                '½ ч. л. куркумы',
                '1 ст. л. оливкового масла, соль'
            ],
            steps: [
                'Промойте чечевицу холодной водой.',
                'Обжарьте лук с чесноком на масле 5 мин.',
                'Добавьте тмин и куркуму, жарьте ещё 1 мин.',
                'Добавьте чечевицу и томаты, залейте 300 мл воды.',
                'Тушите на среднем огне 25 мин до мягкости.',
                'Посолите, при желании добавьте кокосовые сливки.'
            ],
            substitutes: ['Красная чечевица → зелёная или нут', 'Консервированные томаты → свежие в сезон'],
            julias_tip: 'Чечевица — один из лучших растительных источников белка и железа. Для лучшего усвоения железа сочетайте с витамином C (помидоры, перец, зелень)!'
        },
        {
            id: 'p3',
            name: 'Хумус домашний',
            emoji: '🫘',
            time: 10,
            difficulty: 'easy',
            kcal: 170, protein: 8, fat: 9, carbs: 16,
            tags: ['без глютена'],
            season: 'all',
            color: '#d4b07a',
            ingredients: [
                '1 банка (400 г) нута (варёного или консервированного)',
                '2 ст. л. тахини (кунжутной пасты)',
                'Сок 1 лимона',
                '1 зубчик чеснока',
                '2–3 ст. л. оливкового масла',
                '½ ч. л. тмина',
                'Соль, паприка для подачи'
            ],
            steps: [
                'Слейте жидкость с нута, оставьте несколько ложек.',
                'Измельчите нут в блендере с тахини, лимонным соком, чесноком и тмином.',
                'Добавьте масло и взбивайте до кремообразной текстуры.',
                'Если хумус густой — добавьте воду от нута.',
                'Выложите в миску, сделайте углубление и налейте оливковое масло.',
                'Посыпьте паприкой и при желании зернами нута.'
            ],
            substitutes: ['Нут → белая фасоль', 'Тахини → кунжутные семена (измельчённые)'],
            julias_tip: 'Хумус — идеальный перекус: нут даёт клетчатку и белок, тахини — кальций и здоровые жиры. Используйте как соус к овощам вместо майонеза!'
        },
        {
            id: 'p4',
            name: 'Тофу на гриле с маринадом',
            emoji: '🧊',
            time: 20,
            difficulty: 'easy',
            kcal: 155, protein: 14, fat: 8, carbs: 6,
            tags: ['без глютена', 'малокалорийное'],
            season: 'all',
            color: '#c8a878',
            ingredients: [
                '200 г твёрдого тофу',
                '1 ст. л. соевого соуса (тамари)',
                '1 ч. л. кунжутного масла',
                '1 ч. л. рисового уксуса',
                '1 ч. л. кленового сиропа',
                'Чеснок, имбирь по вкусу',
                'Кунжут, зелёный лук для подачи'
            ],
            steps: [
                'Тофу обсушите бумажным полотенцем и нарежьте ломтями толщиной 1 см.',
                'Смешайте тамари, масло, уксус, сироп, давленый чеснок и имбирь.',
                'Замаринуйте тофу минимум на 10 минут.',
                'Гриль-сковороду разогрейте и смажьте маслом.',
                'Жарьте тофу 3–4 минуты с каждой стороны до золотистых полосок.',
                'Посыпьте кунжутом и зелёным луком.'
            ],
            substitutes: ['Тофу → темпе', 'Кленовый сироп → мёд или финиковая паста'],
            julias_tip: 'Тофу — отличный источник полноценного растительного белка. Изофлавоны сои поддерживают гормональный баланс у женщин и имеют антиоксидантные свойства!'
        }
    ]
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getAllRecipes() {
    return [...RECIPES.vegetables, ...RECIPES.grains, ...RECIPES.protein];
}

function getRecipeById(id) {
    return getAllRecipes().find(r => r.id === id) || null;
}

function getRecipesByCategory(category) {
    return RECIPES[category] || [];
}

function filterRecipes(category, filters = {}) {
    let list = getRecipesByCategory(category);
    if (filters.time) {
        list = list.filter(r => r.time <= filters.time);
    }
    if (filters.difficulty) {
        list = list.filter(r => r.difficulty === filters.difficulty);
    }
    if (filters.tag) {
        list = list.filter(r => r.tags.includes(filters.tag));
    }
    return list;
}

const DIFFICULTY_LABELS = { easy: 'Простой', medium: 'Средний', hard: 'Сложный' };
const CATEGORY_LABELS = { vegetables: 'Овощи и фрукты', grains: 'Злаки', protein: 'Белок' };
const CATEGORY_COLORS = { vegetables: '#7db87d', grains: '#c8a06a', protein: '#c87868' };

// ─── PLATE STATE ─────────────────────────────────────────────────────────────
const PlateState = {
    KEY: 'hp_plate',
    HISTORY_KEY: 'hp_history',

    get() {
        try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch { return {}; }
    },

    set(data) {
        localStorage.setItem(this.KEY, JSON.stringify(data));
    },

    addDish(sector, recipeId) {
        const state = this.get();
        state[sector] = recipeId;
        this.set(state);
    },

    removeDish(sector) {
        const state = this.get();
        delete state[sector];
        this.set(state);
    },

    clear() {
        localStorage.removeItem(this.KEY);
    },

    getMealType() {
        return localStorage.getItem('hp_meal') || 'lunch';
    },

    setMealType(type) {
        localStorage.setItem('hp_meal', type);
    },

    getSelectedRecipes() {
        const state = this.get();
        return {
            vegetables: state.vegetables ? getRecipeById(state.vegetables) : null,
            grains: state.grains ? getRecipeById(state.grains) : null,
            protein: state.protein ? getRecipeById(state.protein) : null
        };
    },

    getTotals() {
        const recipes = this.getSelectedRecipes();
        const totals = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
        Object.values(recipes).forEach(r => {
            if (r) {
                totals.kcal += r.kcal;
                totals.protein += r.protein;
                totals.fat += r.fat;
                totals.carbs += r.carbs;
            }
        });
        return totals;
    },

    isComplete() {
        const state = this.get();
        return !!(state.vegetables && state.grains && state.protein);
    },

    saveToHistory(mealType) {
        const state = this.get();
        if (!state.vegetables && !state.grains && !state.protein) return;

        const history = this.getHistory();
        const entry = {
            id: Date.now(),
            date: new Date().toISOString(),
            mealType,
            dishes: { ...state },
            totals: this.getTotals()
        };
        history.unshift(entry);
        localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
        this.clear();
        return entry;
    },

    getHistory() {
        try { return JSON.parse(localStorage.getItem(this.HISTORY_KEY) || '[]'); } catch { return []; }
    }
};

// ─── WATER CALCULATOR ────────────────────────────────────────────────────────
function calcWater(weightKg) {
    return Math.round(weightKg * 30);
}

// ─── SHOPPING LIST ────────────────────────────────────────────────────────────
function buildShoppingList() {
    const recipes = PlateState.getSelectedRecipes();
    const mealLabels = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин' };
    const mealType = mealLabels[PlateState.getMealType()] || 'Приём пищи';

    let list = `🥗 Список покупок — ${mealType}\n`;
    list += `(Гарвардская тарелка)\n\n`;

    const cats = [
        { key: 'vegetables', label: '🥦 Овощи и фрукты' },
        { key: 'grains', label: '🌾 Злаки' },
        { key: 'protein', label: '🥚 Белок' }
    ];

    cats.forEach(({ key, label }) => {
        const r = recipes[key];
        if (r) {
            list += `${label} — ${r.name}\n`;
            r.ingredients.forEach(ing => { list += `  • ${ing}\n`; });
            list += '\n';
        }
    });

    const totals = PlateState.getTotals();
    list += `────────────────\n`;
    list += `Итого: ${totals.kcal} ккал | Б: ${totals.protein}г | Ж: ${totals.fat}г | У: ${totals.carbs}г`;

    return list;
}

function shareShoppingList() {
    const text = buildShoppingList();
    if (navigator.share) {
        navigator.share({ text }).catch(() => {});
    } else {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Список скопирован в буфер обмена!');
        });
    }
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(message, duration = 2800) {
    let el = document.getElementById('hp-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'hp-toast';
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('visible'), duration);
}
