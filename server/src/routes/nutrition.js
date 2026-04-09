const { authenticate, requireAdmin } = require('../middleware');

// USDA FoodData Central nutrient IDs
const NUTRIENT_IDS = {
  kcal: 1008,    // Energy (kcal)
  protein: 1003, // Protein (g)
  fat: 1004,     // Total lipid / fat (g)
  carbs: 1005,   // Carbohydrate, by difference (g)
  fiber: 1079    // Fiber, total dietary (g)
};

// Common Russian measure → grams conversion
const MEASURE_GRAMS = {
  'г': 1, 'гр': 1, 'грамм': 1,
  'кг': 1000, 'килограмм': 1000,
  'мл': 1, 'миллилитр': 1,
  'л': 1000, 'литр': 1000,
  'ст.л.': 15, 'ст. л.': 15, 'столовая ложка': 15, 'столовой ложки': 15, 'столовых ложек': 15,
  'ч.л.': 5, 'ч. л.': 5, 'чайная ложка': 5, 'чайной ложки': 5, 'чайных ложек': 5,
  'стакан': 250, 'стакана': 250, 'стаканов': 250,
  'щепотка': 1, 'щепотки': 1,
  'шт': null, 'шт.': null, 'штука': null, 'штуки': null, 'штук': null,
  'зубчик': 5, 'зубчика': 5, 'зубчиков': 5,
  'пучок': 30, 'пучка': 30, 'пучков': 30,
  'горсть': 30, 'горсти': 30,
  'ломтик': 30, 'ломтика': 30, 'ломтиков': 30,
  'кусок': 50, 'куска': 50, 'кусков': 50,
  'банка': 400, 'банки': 400
};

// Common Russian → English food name translations for better USDA matching
const FOOD_TRANSLATIONS = {
  'тофу': 'tofu',
  'рис': 'rice',
  'гречка': 'buckwheat',
  'овсянка': 'oats',
  'овсяные хлопья': 'oats rolled',
  'курица': 'chicken breast',
  'куриная грудка': 'chicken breast raw',
  'куриное филе': 'chicken breast raw',
  'говядина': 'beef',
  'свинина': 'pork',
  'лосось': 'salmon',
  'тунец': 'tuna',
  'треска': 'cod',
  'креветки': 'shrimp',
  'яйцо': 'egg whole raw',
  'яйца': 'egg whole raw',
  'молоко': 'milk whole',
  'кефир': 'kefir',
  'творог': 'cottage cheese',
  'сыр': 'cheese cheddar',
  'сливочное масло': 'butter',
  'оливковое масло': 'olive oil',
  'подсолнечное масло': 'sunflower oil',
  'растительное масло': 'vegetable oil',
  'кокосовое масло': 'coconut oil',
  'мука': 'wheat flour',
  'сахар': 'sugar',
  'мёд': 'honey',
  'мед': 'honey',
  'соль': 'salt',
  'перец': 'black pepper',
  'чеснок': 'garlic raw',
  'лук': 'onion raw',
  'лук репчатый': 'onion raw',
  'морковь': 'carrot raw',
  'картофель': 'potato raw',
  'помидор': 'tomato raw',
  'помидоры': 'tomato raw',
  'огурец': 'cucumber raw',
  'огурцы': 'cucumber raw',
  'капуста': 'cabbage raw',
  'брокколи': 'broccoli raw',
  'шпинат': 'spinach raw',
  'авокадо': 'avocado raw',
  'банан': 'banana raw',
  'яблоко': 'apple raw',
  'лимон': 'lemon raw',
  'нут': 'chickpeas',
  'фасоль': 'kidney beans',
  'чечевица': 'lentils',
  'макароны': 'pasta dry',
  'спагетти': 'spaghetti dry',
  'хлеб': 'bread white',
  'базилик': 'basil fresh',
  'петрушка': 'parsley fresh',
  'укроп': 'dill fresh',
  'имбирь': 'ginger root raw',
  'соевый соус': 'soy sauce',
  'томатная паста': 'tomato paste',
  'сливки': 'cream',
  'сметана': 'sour cream',
  'йогурт': 'yogurt plain',
  'миндаль': 'almonds',
  'грецкий орех': 'walnuts',
  'кешью': 'cashews',
  'арахис': 'peanuts',
  'семена чиа': 'chia seeds',
  'семена льна': 'flaxseed',
  'кунжут': 'sesame seeds',
  'какао': 'cocoa powder',
  'шоколад': 'chocolate dark',
  // --- Овощи (расширение) ---
  'баклажан': 'eggplant raw',
  'кабачок': 'zucchini raw',
  'цукини': 'zucchini raw',
  'болгарский перец': 'bell pepper raw',
  'сладкий перец': 'bell pepper raw',
  'свёкла': 'beetroot raw',
  'свекла': 'beetroot raw',
  'руккола': 'arugula raw',
  'кольраби': 'kohlrabi raw',
  'зелёный лук': 'green onion raw',
  'лук порей': 'leek raw',
  'сельдерей': 'celery raw',
  'стебель сельдерея': 'celery raw',
  'стебли сельдерея': 'celery raw',
  'кукуруза': 'corn sweet raw',
  'горошек': 'green peas',
  'зелёный горошек': 'green peas',
  'капуста белокочанная': 'cabbage raw',
  'томаты в собственном соку': 'tomatoes canned',
  'помидоры черри': 'tomato raw',
  'кинза': 'cilantro fresh',
  // --- Грибы ---
  'шампиньоны': 'mushrooms white raw',
  'грибы': 'mushrooms white raw',
  'грибы шампиньоны': 'mushrooms white raw',
  // --- Бобовые (расширение) ---
  'белая фасоль': 'white beans',
  'красная фасоль': 'kidney beans',
  'зелёная чечевица': 'lentils green',
  'зеленая чечевица': 'lentils green',
  'красная чечевица': 'lentils red',
  'нут варёный': 'chickpeas cooked',
  // --- Крупы (расширение) ---
  'пшено': 'millet raw',
  'киноа': 'quinoa raw',
  'бурый рис': 'brown rice raw',
  'рис басмати': 'basmati rice raw',
  'перловка': 'barley pearled raw',
  'булгур': 'bulgur dry',
  // --- Мука (расширение) ---
  'цельнозерновая мука': 'whole wheat flour',
  'нутовая мука': 'chickpea flour',
  // --- Орехи/семена (расширение) ---
  'семечки подсолнечника': 'sunflower seeds',
  'тахини': 'tahini',
  // --- Специи (расширение) ---
  'паприка': 'paprika',
  'кориандр': 'coriander ground',
  'куркума': 'turmeric ground',
  'кумин': 'cumin ground',
  'орегано': 'oregano dried',
  'тимьян': 'thyme dried',
  'лавровый лист': 'bay leaf dried',
  'мускатный орех': 'nutmeg ground',
  'перец чили': 'chili pepper raw',
  'розмарин': 'rosemary fresh',
  'сумах': 'sumac',
  // --- Соусы/прочее (расширение) ---
  'горчица': 'mustard prepared',
  'дижонская горчица': 'mustard dijon',
  'каперсы': 'capers',
  'оливки': 'olives',
  'тамари': 'tamari',
  'пищевые дрожжи': 'nutritional yeast',
  // --- Фрукты (расширение) ---
  'груша': 'pear raw',
  'финики': 'dates medjool',
  // --- Молочные (расширение) ---
  'растительное молоко': 'oat milk',
  'овсяное молоко': 'oat milk',
  // --- Вода ---
  'вода': 'water'
};

// Built-in nutrition data per 100g (USDA SR Legacy reference values)
// Used as offline fallback when USDA API is unavailable
const BUILTIN_NUTRITION = {
  // --- Крупы и зерновые ---
  'tofu':                { kcal: 76,  protein: 8.1,  fat: 4.8,  carbs: 1.9,  fiber: 0.3 },
  'rice':                { kcal: 365, protein: 7.1,  fat: 0.7,  carbs: 80,   fiber: 1.3 },
  'buckwheat':           { kcal: 343, protein: 13.3, fat: 3.4,  carbs: 71.5, fiber: 10 },
  'oats':                { kcal: 389, protein: 16.9, fat: 6.9,  carbs: 66.3, fiber: 10.6 },
  'oats rolled':         { kcal: 379, protein: 13.2, fat: 6.5,  carbs: 67.7, fiber: 10.1 },
  'wheat flour':         { kcal: 364, protein: 10.3, fat: 1,    carbs: 76.3, fiber: 2.7 },
  'pasta dry':           { kcal: 371, protein: 13.0, fat: 1.5,  carbs: 74.7, fiber: 3.2 },
  'spaghetti dry':       { kcal: 371, protein: 13.0, fat: 1.5,  carbs: 74.7, fiber: 3.2 },
  'bread white':         { kcal: 265, protein: 9.4,  fat: 3.3,  carbs: 49.2, fiber: 2.7 },
  // --- Мясо и птица ---
  'chicken breast':      { kcal: 120, protein: 22.5, fat: 2.6,  carbs: 0,    fiber: 0 },
  'chicken breast raw':  { kcal: 120, protein: 22.5, fat: 2.6,  carbs: 0,    fiber: 0 },
  'beef':                { kcal: 250, protein: 17.2, fat: 20,   carbs: 0,    fiber: 0 },
  'pork':                { kcal: 242, protein: 17.3, fat: 18.9, carbs: 0,    fiber: 0 },
  // --- Рыба и морепродукты ---
  'salmon':              { kcal: 208, protein: 20.4, fat: 13.4, carbs: 0,    fiber: 0 },
  'tuna':                { kcal: 144, protein: 23.3, fat: 4.9,  carbs: 0,    fiber: 0 },
  'cod':                 { kcal: 82,  protein: 17.8, fat: 0.7,  carbs: 0,    fiber: 0 },
  'shrimp':              { kcal: 99,  protein: 24,   fat: 0.3,  carbs: 0.2,  fiber: 0 },
  // --- Яйца и молочные ---
  'egg whole raw':       { kcal: 143, protein: 12.6, fat: 9.5,  carbs: 0.7,  fiber: 0 },
  'milk whole':          { kcal: 61,  protein: 3.2,  fat: 3.3,  carbs: 4.8,  fiber: 0 },
  'kefir':               { kcal: 56,  protein: 3.3,  fat: 2,    carbs: 5,    fiber: 0 },
  'cottage cheese':      { kcal: 98,  protein: 11.1, fat: 4.3,  carbs: 3.4,  fiber: 0 },
  'cheese cheddar':      { kcal: 403, protein: 24.9, fat: 33.1, carbs: 1.3,  fiber: 0 },
  'sour cream':          { kcal: 193, protein: 2.1,  fat: 19.4, carbs: 3.4,  fiber: 0 },
  'cream':               { kcal: 340, protein: 2.1,  fat: 36.1, carbs: 2.8,  fiber: 0 },
  'yogurt plain':        { kcal: 63,  protein: 5.3,  fat: 1.6,  carbs: 7.0,  fiber: 0 },
  // --- Масла ---
  'butter':              { kcal: 717, protein: 0.9,  fat: 81.1, carbs: 0.1,  fiber: 0 },
  'olive oil':           { kcal: 884, protein: 0,    fat: 100,  carbs: 0,    fiber: 0 },
  'sunflower oil':       { kcal: 884, protein: 0,    fat: 100,  carbs: 0,    fiber: 0 },
  'vegetable oil':       { kcal: 884, protein: 0,    fat: 100,  carbs: 0,    fiber: 0 },
  'coconut oil':         { kcal: 862, protein: 0,    fat: 100,  carbs: 0,    fiber: 0 },
  // --- Овощи ---
  'garlic raw':          { kcal: 149, protein: 6.4,  fat: 0.5,  carbs: 33.1, fiber: 2.1 },
  'onion raw':           { kcal: 40,  protein: 1.1,  fat: 0.1,  carbs: 9.3,  fiber: 1.7 },
  'carrot raw':          { kcal: 41,  protein: 0.9,  fat: 0.2,  carbs: 9.6,  fiber: 2.8 },
  'potato raw':          { kcal: 77,  protein: 2,    fat: 0.1,  carbs: 17.5, fiber: 2.2 },
  'tomato raw':          { kcal: 18,  protein: 0.9,  fat: 0.2,  carbs: 3.9,  fiber: 1.2 },
  'cucumber raw':        { kcal: 15,  protein: 0.7,  fat: 0.1,  carbs: 3.6,  fiber: 0.5 },
  'cabbage raw':         { kcal: 25,  protein: 1.3,  fat: 0.1,  carbs: 5.8,  fiber: 2.5 },
  'broccoli raw':        { kcal: 34,  protein: 2.8,  fat: 0.4,  carbs: 6.6,  fiber: 2.6 },
  'spinach raw':         { kcal: 23,  protein: 2.9,  fat: 0.4,  carbs: 3.6,  fiber: 2.2 },
  'avocado raw':         { kcal: 160, protein: 2,    fat: 14.7, carbs: 8.5,  fiber: 6.7 },
  // --- Фрукты ---
  'banana raw':          { kcal: 89,  protein: 1.1,  fat: 0.3,  carbs: 22.8, fiber: 2.6 },
  'apple raw':           { kcal: 52,  protein: 0.3,  fat: 0.2,  carbs: 13.8, fiber: 2.4 },
  'lemon raw':           { kcal: 29,  protein: 1.1,  fat: 0.3,  carbs: 9.3,  fiber: 2.8 },
  // --- Бобовые ---
  'chickpeas':           { kcal: 364, protein: 19,   fat: 6.0,  carbs: 61,   fiber: 17.4 },
  'kidney beans':        { kcal: 333, protein: 23.6, fat: 0.8,  carbs: 60,   fiber: 24.9 },
  'lentils':             { kcal: 352, protein: 24.6, fat: 1.1,  carbs: 63.4, fiber: 10.7 },
  // --- Зелень и специи ---
  'basil fresh':         { kcal: 23,  protein: 3.2,  fat: 0.6,  carbs: 2.7,  fiber: 1.6 },
  'parsley fresh':       { kcal: 36,  protein: 3,    fat: 0.8,  carbs: 6.3,  fiber: 3.3 },
  'dill fresh':          { kcal: 43,  protein: 3.5,  fat: 1.1,  carbs: 7,    fiber: 2.1 },
  'ginger root raw':     { kcal: 80,  protein: 1.8,  fat: 0.8,  carbs: 17.8, fiber: 2 },
  'black pepper':        { kcal: 251, protein: 10.4, fat: 3.3,  carbs: 64,   fiber: 25.3 },
  'salt':                { kcal: 0,   protein: 0,    fat: 0,    carbs: 0,    fiber: 0 },
  // --- Сладкое ---
  'sugar':               { kcal: 387, protein: 0,    fat: 0,    carbs: 100,  fiber: 0 },
  'honey':               { kcal: 304, protein: 0.3,  fat: 0,    carbs: 82.4, fiber: 0.2 },
  'cocoa powder':        { kcal: 228, protein: 19.6, fat: 13.7, carbs: 57.9, fiber: 33.2 },
  'chocolate dark':      { kcal: 546, protein: 4.9,  fat: 31.3, carbs: 59.4, fiber: 7 },
  // --- Соусы ---
  'soy sauce':           { kcal: 53,  protein: 8.1,  fat: 0.6,  carbs: 4.9,  fiber: 0.8 },
  'tomato paste':        { kcal: 82,  protein: 4.3,  fat: 0.5,  carbs: 18.9, fiber: 4.1 },
  // --- Орехи и семена ---
  'almonds':             { kcal: 579, protein: 21.2, fat: 49.9, carbs: 21.6, fiber: 12.5 },
  'walnuts':             { kcal: 654, protein: 15.2, fat: 65.2, carbs: 13.7, fiber: 6.7 },
  'cashews':             { kcal: 553, protein: 18.2, fat: 43.9, carbs: 30.2, fiber: 3.3 },
  'peanuts':             { kcal: 567, protein: 25.8, fat: 49.2, carbs: 16.1, fiber: 8.5 },
  'chia seeds':          { kcal: 486, protein: 16.5, fat: 30.7, carbs: 42.1, fiber: 34.4 },
  'flaxseed':            { kcal: 534, protein: 18.3, fat: 42.2, carbs: 28.9, fiber: 27.3 },
  'sesame seeds':        { kcal: 573, protein: 17.7, fat: 49.7, carbs: 23.5, fiber: 11.8 },
  'sunflower seeds':     { kcal: 584, protein: 20.8, fat: 51.5, carbs: 20,   fiber: 8.6 },
  'tahini':              { kcal: 595, protein: 17,   fat: 53.8, carbs: 21.2, fiber: 9.3 },
  // --- Овощи (расширение) ---
  'eggplant raw':        { kcal: 25,  protein: 1,    fat: 0.2,  carbs: 5.9,  fiber: 3 },
  'zucchini raw':        { kcal: 17,  protein: 1.2,  fat: 0.3,  carbs: 3.1,  fiber: 1 },
  'bell pepper raw':     { kcal: 26,  protein: 1,    fat: 0.3,  carbs: 6.0,  fiber: 2.1 },
  'beetroot raw':        { kcal: 43,  protein: 1.6,  fat: 0.2,  carbs: 9.6,  fiber: 2.8 },
  'arugula raw':         { kcal: 25,  protein: 2.6,  fat: 0.7,  carbs: 3.7,  fiber: 1.6 },
  'kohlrabi raw':        { kcal: 27,  protein: 1.7,  fat: 0.1,  carbs: 6.2,  fiber: 3.6 },
  'green onion raw':     { kcal: 32,  protein: 1.8,  fat: 0.2,  carbs: 7.3,  fiber: 2.6 },
  'leek raw':            { kcal: 61,  protein: 1.5,  fat: 0.3,  carbs: 14.2, fiber: 1.8 },
  'celery raw':          { kcal: 14,  protein: 0.7,  fat: 0.2,  carbs: 3,    fiber: 1.6 },
  'corn sweet raw':      { kcal: 86,  protein: 3.3,  fat: 1.4,  carbs: 19.0, fiber: 2.7 },
  'green peas':          { kcal: 81,  protein: 5.4,  fat: 0.4,  carbs: 14.5, fiber: 5.7 },
  'tomatoes canned':     { kcal: 32,  protein: 1.6,  fat: 0.3,  carbs: 7.3,  fiber: 1.9 },
  'cilantro fresh':      { kcal: 23,  protein: 2.1,  fat: 0.5,  carbs: 3.7,  fiber: 2.8 },
  'olives':              { kcal: 115, protein: 0.8,  fat: 10.7, carbs: 6.3,  fiber: 3.2 },
  // --- Грибы ---
  'mushrooms white raw': { kcal: 22,  protein: 3.1,  fat: 0.3,  carbs: 3.3,  fiber: 1 },
  // --- Бобовые (расширение) ---
  'white beans':         { kcal: 333, protein: 23.4, fat: 0.9,  carbs: 60.3, fiber: 15.2 },
  'lentils green':       { kcal: 352, protein: 24.6, fat: 1.1,  carbs: 63.4, fiber: 10.7 },
  'lentils red':         { kcal: 358, protein: 23.9, fat: 1.1,  carbs: 63.1, fiber: 10.8 },
  'chickpeas cooked':    { kcal: 164, protein: 8.9,  fat: 2.6,  carbs: 27.4, fiber: 7.6 },
  'chickpea flour':      { kcal: 387, protein: 22.4, fat: 6.7,  carbs: 58,   fiber: 10.8 },
  // --- Крупы (расширение) ---
  'millet raw':          { kcal: 378, protein: 11,   fat: 4.2,  carbs: 72.9, fiber: 8.5 },
  'quinoa raw':          { kcal: 368, protein: 14.1, fat: 6.1,  carbs: 64.2, fiber: 7 },
  'brown rice raw':      { kcal: 370, protein: 7.9,  fat: 2.9,  carbs: 77.2, fiber: 3.5 },
  'basmati rice raw':    { kcal: 360, protein: 7.1,  fat: 0.6,  carbs: 79.9, fiber: 1.3 },
  'barley pearled raw':  { kcal: 352, protein: 9.9,  fat: 1.2,  carbs: 77.7, fiber: 15.6 },
  'bulgur dry':          { kcal: 342, protein: 12.3, fat: 1.3,  carbs: 75.9, fiber: 12.5 },
  'whole wheat flour':   { kcal: 340, protein: 13.2, fat: 2.5,  carbs: 72,   fiber: 10.7 },
  // --- Специи (расширение) ---
  'paprika':             { kcal: 282, protein: 14.1, fat: 13,   carbs: 54,   fiber: 34.9 },
  'coriander ground':    { kcal: 298, protein: 12.4, fat: 17.8, carbs: 55,   fiber: 41.9 },
  'turmeric ground':     { kcal: 354, protein: 7.8,  fat: 9.9,  carbs: 64.9, fiber: 21.1 },
  'cumin ground':        { kcal: 375, protein: 17.8, fat: 22.3, carbs: 44.2, fiber: 10.5 },
  'oregano dried':       { kcal: 265, protein: 9,    fat: 4.3,  carbs: 68.9, fiber: 42.5 },
  'thyme dried':         { kcal: 276, protein: 9.1,  fat: 7.4,  carbs: 63.9, fiber: 37 },
  'bay leaf dried':      { kcal: 313, protein: 7.6,  fat: 8.4,  carbs: 75,   fiber: 26.3 },
  'nutmeg ground':       { kcal: 525, protein: 5.8,  fat: 36.3, carbs: 49.3, fiber: 20.8 },
  'chili pepper raw':    { kcal: 40,  protein: 1.9,  fat: 0.4,  carbs: 8.8,  fiber: 1.5 },
  'rosemary fresh':      { kcal: 131, protein: 3.3,  fat: 5.9,  carbs: 20.7, fiber: 14.1 },
  'sumac':               { kcal: 239, protein: 5,    fat: 8.5,  carbs: 44,   fiber: 27 },
  // --- Соусы/прочее (расширение) ---
  'mustard prepared':    { kcal: 60,  protein: 3.7,  fat: 3.3,  carbs: 5.8,  fiber: 4 },
  'mustard dijon':       { kcal: 66,  protein: 4.4,  fat: 3.5,  carbs: 5.6,  fiber: 3 },
  'capers':              { kcal: 23,  protein: 2.4,  fat: 0.9,  carbs: 1.7,  fiber: 3.2 },
  'tamari':              { kcal: 60,  protein: 10.5, fat: 0.1,  carbs: 5.6,  fiber: 0.8 },
  'nutritional yeast':   { kcal: 325, protein: 50,   fat: 4,    carbs: 36,   fiber: 26 },
  // --- Фрукты (расширение) ---
  'pear raw':            { kcal: 57,  protein: 0.4,  fat: 0.1,  carbs: 15.2, fiber: 3.1 },
  'dates medjool':       { kcal: 277, protein: 1.8,  fat: 0.2,  carbs: 75,   fiber: 6.7 },
  // --- Молочные (расширение) ---
  'oat milk':            { kcal: 47,  protein: 1,    fat: 1.5,  carbs: 8,    fiber: 0.8 },
  // --- Вода ---
  'water':               { kcal: 0,   protein: 0,    fat: 0,    carbs: 0,    fiber: 0 },
};

/**
 * Parse a Russian ingredient string like "300 г тофу" or "2 ст.л. оливкового масла"
 * Returns { amount_g, query, raw }
 */
function parseIngredient(nameStr) {
  const raw = nameStr.trim();
  const result = { raw, query: raw, amount_g: null, confidence: 'low' };

  // Try pattern: NUMBER UNIT REST  (e.g. "300 г тофу", "2 ст.л. масла")
  const match = raw.match(/^(\d+(?:[.,]\d+)?)\s*(г|гр|грамм|кг|килограмм|мл|миллилитр|л|литр|ст\.?\s*л\.?|столов\S*|ч\.?\s*л\.?|чайн\S*|стакан\S*|щепот\S*|шт\.?|штук\S*|зубч\S*|пучо?к?\S*|горст\S*|ломти\S*|кусо?к?\S*|банк\S*)\s+(.+)$/i);

  if (match) {
    const num = parseFloat(match[1].replace(',', '.'));
    const unitRaw = match[2].toLowerCase().replace(/\s+/g, '');
    const foodName = match[3].trim();

    // Find matching unit
    let grams = null;
    for (const [unit, g] of Object.entries(MEASURE_GRAMS)) {
      if (unitRaw === unit.replace(/\s+/g, '') || unitRaw.startsWith(unit.replace(/\s+/g, '').slice(0, 3))) {
        grams = g;
        break;
      }
    }

    if (grams !== null) {
      result.amount_g = Math.round(num * grams);
      result.confidence = 'high';
    } else {
      // Unit like "шт" — unknown weight
      result.amount_g = null;
      result.confidence = 'low';
    }
    result.query = foodName;
  } else {
    // Try pattern: "Продукт — 250 г" (name first, then dash + amount)
    const dashMatch = raw.match(/^(.+?)\s*[—–-]\s*(\d+(?:[.,]\d+)?)\s*(г|гр|грамм|кг|мл|л|ст\.?\s*л\.?|ч\.?\s*л\.?|шт\.?)\s*\.?\s*$/i);
    if (dashMatch) {
      const foodName = dashMatch[1].trim();
      const num = parseFloat(dashMatch[2].replace(',', '.'));
      const unitRaw = dashMatch[3].toLowerCase().replace(/\s+/g, '');

      let grams = null;
      for (const [unit, g] of Object.entries(MEASURE_GRAMS)) {
        if (unitRaw === unit.replace(/\s+/g, '') || unitRaw.startsWith(unit.replace(/\s+/g, '').slice(0, 3))) {
          grams = g;
          break;
        }
      }
      if (grams !== null) {
        result.amount_g = Math.round(num * grams);
        result.confidence = 'high';
      }
      result.query = foodName;
    } else {
      // Try pattern: just NUMBER + REST (e.g. "3 помидора")
      const simpleMatch = raw.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
      if (simpleMatch) {
        result.query = simpleMatch[2].trim();
        result.confidence = 'low';
      }
    }
  }

  // Clean query: remove parenthetical, "по вкусу", trailing qualifiers
  result.query = result.query
    .replace(/\([^)]*\)/g, '')           // (не шелковый, без добавок)
    .replace(/\s+по вкусу\s*/gi, '')
    .replace(/\s+по желанию\s*/gi, '')
    .replace(/\s+или\s+.*/gi, '')        // "или 2 свежих томата"
    .replace(/\s+\+\s+.*/gi, '')         // "+ 3 ст.л. воды"
    .replace(/\s*«[^»]*»\s*/g, '')       // «Тамари»
    .trim();

  // Translate to English for better USDA matching
  const queryLower = result.query.toLowerCase().replace(/ё/g, 'е');
  // Strip common Russian adjective/noun suffixes for fuzzy matching
  const queryStem = queryLower
    .replace(/\s*(молотого|молотый|молотая|молотые|сушёного|сушеного|сушёный|сушеный|копчёной|копченой|копчёная|сладкой|сладкий|варёной|варёный|варёного|варёная|красной|красная|красный|красного|зелёной|зелёная|зелёный|зелёного|белой|белая|белый|белого|свежий|свежая|свежего|свежей|готовой|готовая|готовый|цельнозерновой|цельнозерновая|нутовой|нутовая|растительного|растительное|овсяного|овсяное|дижонской|дижонская|солёных|солёный|пищевые|пищевых)\s*/g, ' ')
    .replace(/\s+/g, ' ').trim();
  // Longer keys first everywhere for best match (e.g. "белая фасоль" before "фасоль")
  const sortedTranslations = Object.entries(FOOD_TRANSLATIONS).sort((a, b) => b[0].length - a[0].length);
  // 1. Exact match on queryLower (preserves adjectives like "белая", "красная")
  for (const [ru, en] of sortedTranslations) {
    const ruNorm = ru.replace(/ё/g, 'е');
    if (queryLower === ruNorm) { result.queryEn = en; break; }
  }
  // 2. Exact match on queryStem (adjectives stripped)
  if (!result.queryEn) {
    for (const [ru, en] of sortedTranslations) {
      const ruNorm = ru.replace(/ё/g, 'е');
      if (queryStem === ruNorm) { result.queryEn = en; break; }
    }
  }
  // 3. Substring match (longest key first)
  if (!result.queryEn) {
    for (const [ru, en] of sortedTranslations) {
      const ruNorm = ru.replace(/ё/g, 'е');
      if (queryLower.includes(ruNorm) || queryStem.includes(ruNorm)) {
        result.queryEn = en;
        break;
      }
    }
  }

  return result;
}

/**
 * Look up nutrition from built-in table by English query key.
 * Returns { food, nutrients } or null if not found.
 */
function lookupBuiltin(queryEn) {
  if (!queryEn) return null;
  const key = queryEn.toLowerCase();
  // Exact match
  if (BUILTIN_NUTRITION[key]) {
    return {
      food: { description: key + ' (built-in)', fdcId: null, dataType: 'BuiltIn' },
      nutrients: { ...BUILTIN_NUTRITION[key] }
    };
  }
  // Partial match: "chicken breast raw" → try "chicken breast" → "chicken"
  for (const [k, v] of Object.entries(BUILTIN_NUTRITION)) {
    if (key.includes(k) || k.includes(key)) {
      return {
        food: { description: k + ' (built-in)', fdcId: null, dataType: 'BuiltIn' },
        nutrients: { ...v }
      };
    }
  }
  return null;
}

/**
 * Search USDA FoodData Central for a food item
 */
async function searchUSDA(query, apiKey) {
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('dataType', 'SR Legacy,Foundation');
  url.searchParams.set('pageSize', '5');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`USDA API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Extract nutrition per 100g from a USDA food item
 */
function extractNutrients(food) {
  const nutrients = {};
  for (const [key, id] of Object.entries(NUTRIENT_IDS)) {
    const found = (food.foodNutrients || []).find(n => n.nutrientId === id);
    nutrients[key] = found ? Math.round(found.value * 10) / 10 : 0;
  }
  return nutrients;
}

async function nutritionRoutes(fastify) {

  // POST /admin/nutrition/calculate — calculate КБЖУ for a list of ingredients via USDA
  fastify.post('/admin/nutrition/calculate', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { ingredients, servings } = req.body || {};

    if (!ingredients || !Array.isArray(ingredients) || !ingredients.length) {
      return reply.status(400).send({ error: 'Массив ингредиентов обязателен' });
    }

    const apiKey = process.env.USDA_API_KEY || null;

    const portionCount = parseInt(servings) || 1;
    const items = [];
    const warnings = [];
    const total = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };

    for (const ingr of ingredients) {
      const nameStr = typeof ingr === 'string' ? ingr : (ingr.name || '');
      if (!nameStr.trim()) continue;

      const parsed = parseIngredient(nameStr);
      const itemResult = {
        original: parsed.raw,
        amount_g: parsed.amount_g,
        matched: null,
        fdcId: null,
        confidence: 'not_found',
        nutrition: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
        alternatives: []
      };

      try {
        // 1. Try built-in table first (works offline, no API needed)
        const builtin = lookupBuiltin(parsed.queryEn);
        let bestFood = null;
        let per100g = null;

        if (builtin) {
          bestFood = builtin.food;
          per100g = builtin.nutrients;
          itemResult.alternatives = [{ fdcId: null, description: builtin.food.description, dataType: 'BuiltIn' }];
        } else if (apiKey) {
          // 2. Fallback to USDA API (only if key is configured)
          const queries = parsed.queryEn ? [parsed.queryEn, parsed.query] : [parsed.query];
          for (const q of queries) {
            const data = await searchUSDA(q, apiKey);
            if (data.foods && data.foods.length > 0) {
              bestFood = data.foods[0];
              per100g = extractNutrients(bestFood);
              itemResult.alternatives = data.foods.slice(0, 3).map(f => ({
                fdcId: f.fdcId,
                description: f.description,
                dataType: f.dataType
              }));
              break;
            }
          }
        }

        if (bestFood && per100g) {
          itemResult.matched = bestFood.description;
          itemResult.fdcId = bestFood.fdcId;

          if (parsed.amount_g && parsed.amount_g > 0) {
            // Calculate for actual weight
            const factor = parsed.amount_g / 100;
            itemResult.nutrition = {
              kcal: Math.round(per100g.kcal * factor),
              protein: Math.round(per100g.protein * factor * 10) / 10,
              fat: Math.round(per100g.fat * factor * 10) / 10,
              carbs: Math.round(per100g.carbs * factor * 10) / 10,
              fiber: Math.round(per100g.fiber * factor * 10) / 10
            };
            itemResult.confidence = parsed.confidence === 'high' ? 'high' : 'medium';
          } else {
            // Weight unknown — show per 100g as reference, flag as needs review
            itemResult.nutrition = per100g;
            itemResult.amount_g = 100;
            itemResult.confidence = 'medium';
            warnings.push(parsed.raw + ' — вес не определён, показано на 100г');
          }

          // Accumulate total
          for (const key of Object.keys(total)) {
            total[key] += itemResult.nutrition[key];
          }
        } else {
          itemResult.confidence = 'not_found';
          warnings.push(parsed.raw + ' — не найдено в USDA');
        }
      } catch (err) {
        fastify.log.error(err, 'USDA search failed for: ' + parsed.query);
        // On API failure, try built-in as last resort (in case it wasn't tried due to missing queryEn)
        const fallback = lookupBuiltin(parsed.queryEn);
        if (fallback) {
          const per100g = fallback.nutrients;
          itemResult.matched = fallback.food.description;
          itemResult.fdcId = null;
          if (parsed.amount_g && parsed.amount_g > 0) {
            const factor = parsed.amount_g / 100;
            itemResult.nutrition = {
              kcal: Math.round(per100g.kcal * factor),
              protein: Math.round(per100g.protein * factor * 10) / 10,
              fat: Math.round(per100g.fat * factor * 10) / 10,
              carbs: Math.round(per100g.carbs * factor * 10) / 10,
              fiber: Math.round(per100g.fiber * factor * 10) / 10
            };
            itemResult.confidence = 'medium';
          } else {
            itemResult.nutrition = per100g;
            itemResult.amount_g = 100;
            itemResult.confidence = 'medium';
          }
          for (const key of Object.keys(total)) {
            total[key] += itemResult.nutrition[key];
          }
          warnings.push(parsed.raw + ' — USDA недоступен, данные из встроенной таблицы');
        } else {
          itemResult.confidence = 'not_found';
          warnings.push(parsed.raw + ' — ошибка поиска USDA');
        }
      }

      items.push(itemResult);
    }

    // Round totals
    for (const key of Object.keys(total)) {
      total[key] = Math.round(total[key] * 10) / 10;
    }

    // Per serving
    const per_serving = {};
    for (const key of Object.keys(total)) {
      per_serving[key] = Math.round(total[key] / portionCount * 10) / 10;
    }
    per_serving.kcal = Math.round(per_serving.kcal);

    return { total, per_serving, items, warnings, servings: portionCount };
  });
}

module.exports = nutritionRoutes;
