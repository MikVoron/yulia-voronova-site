-- Recipes 69-75 from user text, with clarifications confirmed 2026-06-29.
-- strict / No Guessing:
--   * all recipes remain unpublished Pro drafts; emoji is deferred and photos follow the canonical WebP contract;
--   * recipe 69 keeps the confirmed 8 portions x 25 g and is not linked to a header ingredient;
--   * recipe 70 is a cutlet recipe and recipe 73 also carries the visible "бобовые" tag;
--   * recipe 71 is breakfast, has portion_grams=180, and soy -> cow milk changes per-serving KBZHU;
--   * recipe 74 temporarily keeps 2 portions x 170 g for later manual correction;
--   * recipe 75 is 5 portions x 300 g; honey replacements keep the same amount and KBZHU;
--   * eggplant is added to the shared Ingredients -> Vegetables catalog.
-- Apply:
--   scp server/migrate-recipes-69-75-breads-cutlets-breakfast-main-salads-2026-06-29.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipes-69-75-breads-cutlets-breakfast-main-salads-2026-06-29.sql"

BEGIN;

INSERT INTO ingredient_catalog (id, name, group_id, sort_order)
VALUES ('eggplant', 'Баклажаны', 'vegetables', 1000)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  group_id = EXCLUDED.group_id,
  sort_order = EXCLUDED.sort_order;

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote, note,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order, auto_addons, is_soup, main_ingredients,
  dietary_flags, dietary_verified
) VALUES (
  'ww-crackers',
  'breads',
  'Крекеры из цельнозерновой муки',
  NULL,
  40,
  NULL,
  'easy',
  8,
  false,
  198, 7, 5, 37, 5,
  ARRAY['растительное', 'без сои'],
  'images/recipes/ww-crackers/ww-crackers-cover.webp',
  'Эти крекеры получаются хрустящими, ароматными и отлично подходят и для перекуса, и к супу.',
  NULL,
  '[
    {"name": "Цельнозерновая мука: 400 г", "swap": null, "dietary_flags": ["gluten"]},
    {"name": "Разрыхлитель: 1/2 ч. л.", "swap": null},
    {"name": "Оливковое масло: 30 г", "swap": null},
    {"name": "Соль: 1 ч. л.", "swap": null},
    {"name": "Орегано: 1 ч. л.", "swap": null},
    {"name": "Горячая вода: 170 г", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Смешайте муку, разрыхлитель, соль и орегано.", "photo": "images/recipes/ww-crackers/ww-crackers-1.webp"},
    {"text": "Влейте оливковое масло и горячую воду, замесите тесто.", "photo": "images/recipes/ww-crackers/ww-crackers-2.webp"},
    {"text": "Разделите тесто на 2 части.", "photo": "images/recipes/ww-crackers/ww-crackers-3.webp"},
    {"text": "Раскатайте одну часть на пергаменте в тонкий пласт толщиной 2–3 мм."},
    {"text": "Нарежьте на квадратики круглым ножом для пиццы.", "photo": "images/recipes/ww-crackers/ww-crackers-5.webp"},
    {"text": "Выпекайте при 180 °C около 15 минут.", "photo": "images/recipes/ww-crackers/ww-crackers-6.webp"},
    {"text": "Повторите со второй частью теста."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  25,
  false,
  0,
  '{}'::jsonb,
  false,
  ARRAY[]::text[],
  ARRAY['gluten'],
  true
),
(
  'cutlets-green-lentils-rice',
  'cutlets',
  'Котлеты из зеленой чечевицы с рисом',
  NULL,
  40,
  NULL,
  'medium',
  8,
  false,
  142, 6, 2, 26, 4,
  ARRAY['растительное', 'без сои', 'бобовые', 'без глютена'],
  'images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-cover.webp',
  'Лучше обжарьте столько котлет, сколько нужно сейчас, а остальные заморозьте — потом их можно готовить прямо из морозилки, без разморозки. Котлеты получаются вкусные, сытные и хорошо подходят к любому гарниру.',
  NULL,
  '[
    {"name": "Зелёная чечевица (сухая): 250 г", "swap": null},
    {"name": "Рис (сухой): 100 г", "swap": null},
    {"name": "Кабачок: 120 г", "swap": null},
    {"name": "Лук: 1 средний", "swap": null},
    {"name": "Чеснок: 1 зубчик", "swap": null},
    {"name": "Соль: 1 ч. л.", "swap": null},
    {"name": "Мускатный орех: 1/4 ч. л.", "swap": null},
    {"name": "Паприка: 1 ч. л.", "swap": null},
    {"name": "Растительное масло для жарки: 1 ст. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Чечевицу замочите на ночь или минимум на 3 часа."},
    {"text": "Хорошо промойте рис, отварите до готовности и остудите.", "photo": "images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-2.webp"},
    {"text": "Промойте чечевицу, засыпьте в комбайн вместе с луком и чесноком и пробейте до однородной консистенции.", "photo": "images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-3.webp"},
    {"text": "Кабачок натрите на мелкой тёрке и отожмите.", "photo": "images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-4.webp"},
    {"text": "Смешайте чечевицу, рис, кабачок, специи и соль.", "photo": ["images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-5-1.webp", "images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-5-2.webp"]},
    {"text": "Сформируйте котлеты и обжарьте их на растительном масле с двух сторон до румяности.", "photo": ["images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-6-1.webp", "images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-6-2.webp"]}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  90,
  false,
  0,
  '{}'::jsonb,
  false,
  ARRAY['green-lentils', 'rice', 'zucchini'],
  ARRAY[]::text[],
  true
),
(
  'millet-porridge',
  'breakfasts',
  'Каша пшенная',
  NULL,
  30,
  NULL,
  'easy',
  4,
  false,
  162, 6, 4, 26, 2,
  ARRAY['растительное', 'без глютена'],
  'images/recipes/millet-porridge/millet-porridge-cover.webp',
  'Эту кашу можно сделать сладкой — добавьте немного подсластителя или банан по вкусу. Я обычно варю кашу вечером, а утром остаётся только разогреть её и добавить любимый топпинг.',
  NULL,
  '[
    {"name": "Пшено: 170 г", "swap": null},
    {"name": "Вода: 340 г", "swap": null},
    {
      "name": "Соевое молоко: 340 г",
      "swap": "Коровье молоко 2,5%: 340 г",
      "swap_options": [
        {"name": "Коровье молоко 2,5%: 340 г", "dietary_flags": ["milk"]}
      ],
      "swap_nutrition": {
        "original": {"kcal": 28, "protein": 3, "fat": 2, "carbs": 1, "fiber": 0},
        "replacement": {"kcal": 45, "protein": 3, "fat": 2, "carbs": 4, "fiber": 0}
      }
    },
    {"name": "Соль — щепотка", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Хорошо промойте пшено и залейте кипятком на 10–15 минут, чтобы убрать возможную горечь.", "photo": "images/recipes/millet-porridge/millet-porridge-1.webp"},
    {"text": "Слейте воду, добавьте 340 г воды, доведите до кипения и варите на маленьком огне 10 минут.", "photo": ["images/recipes/millet-porridge/millet-porridge-2-1.webp", "images/recipes/millet-porridge/millet-porridge-2-2.webp"]},
    {"text": "Затем влейте молоко, снова доведите до кипения и варите ещё 20 минут на слабом огне.", "photo": ["images/recipes/millet-porridge/millet-porridge-3-1.webp", "images/recipes/millet-porridge/millet-porridge-3-2.webp"]},
    {"text": "После приготовления оставьте кашу под крышкой на 10 минут, чтобы она стала мягче и гуще."}
  ]'::jsonb,
  '[
    {"name": "Йогурт 2–5%", "amount": "150 г", "kcal": 95, "protein": 7.5, "fat": 2.5, "carbs": 10.5, "fiber": 0}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[
    {"name": "Ягоды", "amount": "80 г", "kcal": 32, "protein": 1, "fat": 0, "carbs": 7, "fiber": 3}
  ]'::jsonb,
  180,
  false,
  0,
  '{}'::jsonb,
  false,
  ARRAY['millet'],
  ARRAY[]::text[],
  true
),
(
  'chicken-green-lentils-tomato',
  'mains',
  'Курица с зеленой чечевицей в томате',
  NULL,
  45,
  NULL,
  'medium',
  4,
  false,
  319, 27, 10, 24, 5,
  ARRAY['без глютена', 'бобовые', 'без сои'],
  'images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-cover.webp',
  'Получается густое, ароматное блюдо с мягкой чечевицей и насыщенной томатной подливой. Если хочется более жидкий соус, можно добавить ещё немного воды. Хорошо сочетается с рисом, булгуром или пастой.',
  NULL,
  '[
    {"name": "Курица (бедро или грудка): 400 г", "swap": null, "dietary_flags": ["meat"]},
    {"name": "Зелёная чечевица: 70 г", "swap": null},
    {"name": "Лук: 1 крупный", "swap": null},
    {"name": "Морковь: 1 средняя", "swap": null},
    {"name": "Чеснок: 2 зубчика", "swap": null},
    {"name": "Протёртые томаты или свежие: 250 г", "swap": null},
    {"name": "Томатная паста: 1 ст. л.", "swap": null},
    {"name": "Вода: 200 мл", "swap": null},
    {"name": "Соль: 1 ч. л.", "swap": null},
    {"name": "Паприка: 1 ч. л.", "swap": null},
    {"name": "Молотый кориандр: 1/2 ч. л.", "swap": null},
    {"name": "Оливковое масло: 1 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "На 1 ч. л. масла обжарьте лук и морковь 3–5 минут до мягкости.", "photo": "images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-1.webp"},
    {"text": "Добавьте курицу и готовьте 3–4 минуты, пока кусочки побелеют.", "photo": "images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-2.webp"},
    {"text": "Добавьте промытую зелёную чечевицу, паприку и кориандр.", "photo": "images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-3.webp"},
    {"text": "Добавьте томатную пасту и перемешивайте около минуты вместе с курицей и чечевицей.", "photo": "images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-4.webp"},
    {"text": "Влейте протёртые томаты и воду.", "photo": "images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-5.webp"},
    {"text": "Накройте крышкой и тушите на слабом огне около 30 минут, пока чечевица не станет мягкой.", "photo": "images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-6.webp"},
    {"text": "За 5 минут до конца добавьте измельченный чеснок.", "photo": "images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-7.webp"}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  320,
  false,
  0,
  '{"carbs": {"fromCategory": "sides"}, "fiber": {"fromCategory": "salads"}}'::jsonb,
  false,
  ARRAY['green-lentils', 'chicken'],
  ARRAY['meat'],
  true
),
(
  'cutlets-chicken-red-lentils',
  'cutlets',
  'Куриные котлеты с красной чечевицей',
  NULL,
  45,
  NULL,
  'medium',
  8,
  false,
  125, 17, 2, 9, 2,
  ARRAY['без глютена', 'без сои', 'бобовые'],
  'images/recipes/cutlets-chicken-red-lentils/cutlets-chicken-red-lentils-cover.webp',
  'Нежные куриные котлеты с чечевицей получаются сочными, хорошо держат форму и отлично подходят к любому гарниру. Замороженные котлеты удобно запекать сразу без размораживания — просто немного увеличьте время приготовления.',
  NULL,
  '[
    {"name": "Грудка куриная: 500 г", "swap": null, "dietary_flags": ["meat"]},
    {"name": "Красная чечевица: 100 г", "swap": null},
    {"name": "Лук: 1 шт.", "swap": null},
    {"name": "Чеснок: 1 зубчик", "swap": null},
    {"name": "Соль: 1 ч. л.", "swap": null},
    {"name": "Паприка: 1/2 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Промойте чечевицу и залейте водой примерно 1:2. Варите около 10 минут, пока она полностью не приготовится и вода не впитается.", "photo": ["images/recipes/cutlets-chicken-red-lentils/cutlets-chicken-red-lentils-1-1.webp", "images/recipes/cutlets-chicken-red-lentils/cutlets-chicken-red-lentils-1-2.webp"]},
    {"text": "Куриную грудку прокрутите вместе с луком и чесноком в мясорубке или комбайне."},
    {"text": "Смешайте фарш, чечевицу, специи и соль.", "photo": "images/recipes/cutlets-chicken-red-lentils/cutlets-chicken-red-lentils-3.webp"},
    {"text": "Хорошо вымесите фарш 3–5 минут до однородности. При желании уберите его в холодильник на 15 минут.", "photo": "images/recipes/cutlets-chicken-red-lentils/cutlets-chicken-red-lentils-4.webp"},
    {"text": "Влажными руками сформируйте котлеты и выложите на противень, застеленный бумагой для выпечки.", "photo": "images/recipes/cutlets-chicken-red-lentils/cutlets-chicken-red-lentils-5.webp"},
    {"text": "Лишние котлеты можно сразу заморозить на будущее и запечь в другой день."},
    {"text": "Запекайте в разогретой до 180 °C духовке около 25 минут. За 3–5 минут до конца можно включить верхний нагрев или гриль для лёгкой золотистой корочки."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  90,
  false,
  0,
  '{}'::jsonb,
  false,
  ARRAY['red-lentils', 'chicken'],
  ARRAY['meat'],
  true
),
(
  'salad-seasonal-vegetables-soy-dressing',
  'salads',
  'Салат из сезонных овощей с соевой заправкой',
  NULL,
  10,
  NULL,
  'easy',
  2,
  false,
  116, 3, 6, 15, 4,
  ARRAY['растительное'],
  'images/recipes/salad-seasonal-vegetables-soy-dressing/salad-seasonal-vegetables-soy-dressing-cover.webp',
  'Берите любую сезонную зелень — такая заправка особенно хорошо сочетается с рукколой, кресс-салатом (горькой зеленью) и шпинатом. Для более яркой подачи можно взять жёлтый болгарский перец, а после заправки дать салату постоять 5 минут, но не дольше, чтобы зелень осталась свежей.',
  NULL,
  '[
    {"name": "Зелень (руккола, кресс-салат, шпинат, салатные листья): 60 г", "swap": null},
    {"name": "Помидор: 2 средних", "swap": null},
    {"name": "Огурец: 1 крупный", "swap": null},
    {"name": "Болгарский перец: 1 средний", "swap": null},
    {"name": "Соевый соус: 1 ст. л.", "swap": null},
    {"name": "Лимонный сок: 1 ст. л.", "swap": null},
    {"name": "Оливковое масло: 2 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Промойте и хорошо обсушите зелень, крупные листья можно порвать руками."},
    {"text": "Огурец нарежьте полукружьями, помидоры — дольками, перец — соломкой."},
    {"text": "Смешайте овощи с зеленью в большой миске."},
    {"text": "Отдельно соедините соевый соус, лимонный сок и оливковое масло."},
    {"text": "Полейте салат заправкой и аккуратно перемешайте прямо перед подачей."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  170,
  false,
  0,
  '{}'::jsonb,
  false,
  ARRAY['tomatoes'],
  ARRAY[]::text[],
  true
),
(
  'salad-warm-eggplant-vegetables',
  'salads',
  'Тёплый салат из баклажанов с овощами',
  NULL,
  55,
  NULL,
  'medium',
  5,
  false,
  146, 3, 3, 26, 9,
  ARRAY['без глютена', 'растительное', 'без сои'],
  'images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-cover.webp',
  'Это блюдо вкусно и в тёплом, и в холодном виде. Получается много клетчатки и мягкий овощной вкус — хороший вариант, если хочется именно тушёные овощи, а не салат в сыром виде.',
  NULL,
  '[
    {"name": "Баклажаны: 850 г", "swap": null},
    {"name": "Кабачок: 150 г", "swap": null},
    {"name": "Морковь: 250 г", "swap": null},
    {"name": "Болгарский перец красный: 200 г", "swap": null},
    {"name": "Томаты: 450 г", "swap": null},
    {"name": "Лук: 1 крупный", "swap": null},
    {"name": "Соль: 2 ч. л.", "swap": null},
    {
      "name": "Мёд: 1 ч. л.",
      "swap": "Сахар: 1 ч. л.; Сироп: 1 ч. л.",
      "dietary_flags": ["animal_products"],
      "swap_options": [
        {"name": "Сахар: 1 ч. л.", "dietary_flags": []},
        {"name": "Сироп: 1 ч. л.", "dietary_flags": []}
      ]
    },
    {"name": "Растительное масло: 1 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Помойте и обсушите баклажаны и перец, выложите на противень с пергаментом целиком и запеките до мягкости примерно 20–30 минут при 180 °C.", "photo": ["images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-1-1.webp", "images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-1-2.webp"]},
    {"text": "Остудите овощи и снимите кожуру с перцев и баклажанов полностью или частично по желанию."},
    {"text": "Нарежьте все овощи небольшими кубиками.", "photo": "images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-3.webp"},
    {"text": "Поджарьте лук на растительном масле в течение 3 минут.", "photo": "images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-4.webp"},
    {"text": "Добавьте морковь и кабачок, перемешайте и тушите ещё около 5 минут.", "photo": "images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-5.webp"},
    {"text": "Добавьте запечённые баклажаны и перец, перемешайте, накройте крышкой и тушите ещё 20–30 минут до полной готовности овощей.", "photo": "images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-6.webp"},
    {"text": "В конце добавьте мёд и перемешайте.", "photo": "images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-7.webp"}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  300,
  false,
  0,
  '{}'::jsonb,
  false,
  ARRAY['eggplant', 'zucchini', 'carrot', 'tomatoes'],
  ARRAY['animal_products'],
  true
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat,
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min,
  time_label = EXCLUDED.time_label,
  difficulty = EXCLUDED.difficulty,
  servings = EXCLUDED.servings,
  is_free = EXCLUDED.is_free,
  kcal = EXCLUDED.kcal,
  protein = EXCLUDED.protein,
  fat = EXCLUDED.fat,
  carbs = EXCLUDED.carbs,
  fiber = EXCLUDED.fiber,
  tags = EXCLUDED.tags,
  photo = EXCLUDED.photo,
  quote = EXCLUDED.quote,
  note = EXCLUDED.note,
  ingredients = EXCLUDED.ingredients,
  steps = EXCLUDED.steps,
  add_protein = EXCLUDED.add_protein,
  add_fat = EXCLUDED.add_fat,
  add_carbs = EXCLUDED.add_carbs,
  add_fiber = EXCLUDED.add_fiber,
  portion_grams = EXCLUDED.portion_grams,
  is_published = EXCLUDED.is_published,
  sort_order = EXCLUDED.sort_order,
  auto_addons = EXCLUDED.auto_addons,
  is_soup = EXCLUDED.is_soup,
  main_ingredients = EXCLUDED.main_ingredients,
  dietary_flags = EXCLUDED.dietary_flags,
  dietary_verified = EXCLUDED.dietary_verified,
  updated_at = now();

DELETE FROM recipe_categories
WHERE recipe_id IN (
  'ww-crackers',
  'cutlets-green-lentils-rice',
  'millet-porridge',
  'chicken-green-lentils-tomato',
  'cutlets-chicken-red-lentils',
  'salad-seasonal-vegetables-soy-dressing',
  'salad-warm-eggplant-vegetables'
);

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES
  ('ww-crackers', 'breads'),
  ('cutlets-green-lentils-rice', 'cutlets'),
  ('millet-porridge', 'breakfasts'),
  ('chicken-green-lentils-tomato', 'mains'),
  ('cutlets-chicken-red-lentils', 'cutlets'),
  ('salad-seasonal-vegetables-soy-dressing', 'salads'),
  ('salad-warm-eggplant-vegetables', 'salads');

COMMIT;
