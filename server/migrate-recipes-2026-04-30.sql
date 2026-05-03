-- Партия рецептов от 2026-04-30
-- 4 новых + 1 обновление существующего (red-lentil-cutlets).
-- На этом этапе фото нет — photo = NULL во всех записях.
-- Применить:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipes-2026-04-30.sql
--
-- Замечания по тегам (расхождение с ТЗ — намеренно):
-- 1. Булгур (side-bulgur): в ТЗ указано "без глютена", но булгур — это пшеница,
--    содержащая глютен. Тег "без глютена" исключён ради безопасности (целиакия).
-- 2. Салат с сельдереем и яблоком (celeriac-apple-salad): в ТЗ указано "растительное",
--    но в заправке йогурт 2–5% (молочный). Тег "растительное" исключён.
--    Если нужно — заменить на растительный йогурт и вернуть тег.

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Котлеты из нута и батата (новый)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote, note,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber, auto_addons,
  portion_grams, is_published, sort_order
) VALUES (
  'chickpea-sweet-potato-cutlets',
  'cutlets',
  'Котлеты из нута и батата',
  '🍠',
  40,
  '40–50 минут',
  'medium',
  8,
  false,
  144, 5, 3, 25, 6,
  ARRAY['растительное', 'без сои', 'бобовые', 'без глютена'],
  NULL,
  'Батат придаёт этим котлетам нежность и мягкую сладость, а нут — сытность и плотную структуру.',
  'Если нет овсяной муки, её можно легко сделать самостоятельно: измельчите такое же количество хлопьев в блендере до муки. Рекомендую котлеты сделать впрок и заморозить — потом готовить их без разморозки.',
  '[
    {"name": "Батат — 400 г", "swap": null},
    {"name": "Нут отваренный — 350 г", "swap": "Консервированный нут"},
    {"name": "Лук — 1 средний", "swap": null},
    {"name": "Чеснок — 1 зубчик", "swap": null},
    {"name": "Овсяная мука — 3 ст. л.", "swap": null},
    {"name": "Псиллиум — 1 ст. л.", "swap": null},
    {"name": "Копчёная паприка — 1 ч. л.", "swap": null},
    {"name": "Кориандр — 0,5 ч. л.", "swap": null},
    {"name": "Куркума — 0,5 ч. л.", "swap": null},
    {"name": "Соль — 1 ч. л.", "swap": null},
    {"name": "Растительное масло — немного для жарки", "swap": null}
  ]'::jsonb,
  '[
    "Помойте батат и отправьте запекаться целиком в духовку при 200°C до мягкости, примерно на 30 минут.",
    "Мелко нарежьте лук и чеснок.",
    "Слегка обжарьте лук и чеснок на небольшом количестве растительного масла около 3 минут.",
    "Добавьте специи, перемешайте в течение 1 минуты, выключите и остудите овощи.",
    "Измельчите нут в комбайне: можно мелко, можно оставить небольшие кусочки.",
    "Остудите батат, затем вилкой отделите мякоть и разомните её.",
    "Смешайте нут, батат, овсяную муку, псиллиум и соль.",
    "Сформируйте небольшие котлеты.",
    "Обжарьте с двух сторон до румяности по 1 минуте."
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"carbs": {"fromCategory": "sides"}, "fiber": {"fromCategory": "salads"}}'::jsonb,
  90,
  true,
  0
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat, name = EXCLUDED.name, emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min, time_label = EXCLUDED.time_label, difficulty = EXCLUDED.difficulty,
  servings = EXCLUDED.servings,
  kcal = EXCLUDED.kcal, protein = EXCLUDED.protein, fat = EXCLUDED.fat,
  carbs = EXCLUDED.carbs, fiber = EXCLUDED.fiber,
  tags = EXCLUDED.tags, photo = EXCLUDED.photo,
  quote = EXCLUDED.quote, note = EXCLUDED.note,
  ingredients = EXCLUDED.ingredients, steps = EXCLUDED.steps,
  add_protein = EXCLUDED.add_protein, add_fat = EXCLUDED.add_fat,
  add_carbs = EXCLUDED.add_carbs, add_fiber = EXCLUDED.add_fiber,
  auto_addons = EXCLUDED.auto_addons,
  portion_grams = EXCLUDED.portion_grams,
  is_published = EXCLUDED.is_published,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('chickpea-sweet-potato-cutlets', 'cutlets')
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. Булгур (новый, гарнир — попадёт в add_carbs у котлет через fromCategory: sides)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'side-bulgur',
  'sides',
  'Булгур',
  '🌾',
  20,
  '20 минут',
  'easy',
  4,
  false,
  170, 5, 1, 35, 3,
  ARRAY['растительное', 'без сои'],
  NULL,
  'Булгур — очень недооцененная крупа, он обладает приятной текстурой, хорошо насыщает и приносит в рацион больше клетчатки и растительного белка, чем кажется на первый взгляд.',
  '[
    {"name": "Булгур — 300 г", "swap": null},
    {"name": "Вода для варки — 600 мл", "swap": null},
    {"name": "Соль — 1 ч. л.", "swap": null},
    {"name": "Оливковое масло — 1 ст. л.", "swap": null}
  ]'::jsonb,
  '[
    "Вскипятите воду, добавьте соль.",
    "Всыпьте в кипящую воду промытый булгур.",
    "Варите около 15 минут до полного впитывания воды.",
    "В конце добавьте 1 ст. л. оливкового масла и аккуратно перемешайте.",
    "Дайте настояться несколько минут."
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  170,
  true,
  0
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat, name = EXCLUDED.name, emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min, time_label = EXCLUDED.time_label, difficulty = EXCLUDED.difficulty,
  servings = EXCLUDED.servings,
  kcal = EXCLUDED.kcal, protein = EXCLUDED.protein, fat = EXCLUDED.fat,
  carbs = EXCLUDED.carbs, fiber = EXCLUDED.fiber,
  tags = EXCLUDED.tags, photo = EXCLUDED.photo, quote = EXCLUDED.quote,
  ingredients = EXCLUDED.ingredients, steps = EXCLUDED.steps,
  portion_grams = EXCLUDED.portion_grams,
  is_published = EXCLUDED.is_published,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('side-bulgur', 'sides')
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. Салат с корнем сельдерея и яблоком (новый)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'celeriac-apple-salad',
  'salads',
  'Салат с корнем сельдерея и яблоком',
  '🥗',
  10,
  '10 минут',
  'easy',
  3,
  false,
  60, 2, 2, 10, 4,
  ARRAY['без глютена', 'без сои'],
  NULL,
  'В рецепте удачно соединяются хруст корня сельдерея, сладость яблока и свежесть укропа. Получается салат с ярким вкусом, хорошей клетчаткой и лёгкой заправкой. Яблоко можно взять одно сладкое, другое кислое для баланса.',
  '[
    {"name": "Корень сельдерея — 300 г", "swap": null},
    {"name": "Яблоко кисло-сладкое — 2 шт.", "swap": null},
    {"name": "Укроп — 30 г", "swap": null},
    {"name": "Йогурт 2–5% — 3 ст. л.", "swap": null},
    {"name": "Горчица — 1 ч. л.", "swap": null},
    {"name": "Лимонный сок — 1 ч. л.", "swap": null},
    {"name": "Соль и перец — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    "Натри корень сельдерея на крупной тёрке.",
    "Яблоко нарежь или натри и сразу сбрызни лимонным соком.",
    "Добавь мелко нарезанный укроп.",
    "Смешай йогурт, горчицу, лимонный сок, соль и перец.",
    "Заправь салат и оставь на 5–10 минут, чтобы вкус стал мягче."
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  180,
  true,
  0
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat, name = EXCLUDED.name, emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min, time_label = EXCLUDED.time_label, difficulty = EXCLUDED.difficulty,
  servings = EXCLUDED.servings,
  kcal = EXCLUDED.kcal, protein = EXCLUDED.protein, fat = EXCLUDED.fat,
  carbs = EXCLUDED.carbs, fiber = EXCLUDED.fiber,
  tags = EXCLUDED.tags, photo = EXCLUDED.photo, quote = EXCLUDED.quote,
  ingredients = EXCLUDED.ingredients, steps = EXCLUDED.steps,
  portion_grams = EXCLUDED.portion_grams,
  is_published = EXCLUDED.is_published,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('celeriac-apple-salad', 'salads')
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 4. Уха из лосося (новый, суп — is_soup автоматически добавляет хлеб + сухарики в add_carbs)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, is_soup, sort_order
) VALUES (
  'salmon-ukha',
  'mains',
  'Уха из лосося',
  '🍲',
  40,
  '40 минут',
  'easy',
  8,
  false,
  230, 20, 10, 15, 2,
  ARRAY['рыбное', 'без сои'],
  NULL,
  'Такая уха получается лёгкой, но сытной, в ней есть и белок из рыбы, и клетчатка из овощей, и мелкие макароны, которые так нравятся детям. Они точно оценят этот суп!',
  '[
    {"name": "Сёмга суповой набор (голова + хвост) — 800 г", "swap": "Форель, кета, горбуша, нерка, кижуч"},
    {"name": "Кабачок — 1 шт.", "swap": null},
    {"name": "Лук — 1 шт.", "swap": null},
    {"name": "Морковь — 1 шт.", "swap": null},
    {"name": "Палочка сельдерея — 1 шт.", "swap": null},
    {"name": "Укроп — 30 г", "swap": null},
    {"name": "Лавровый лист — 1 шт.", "swap": null},
    {"name": "Соль — 2 ч. л.", "swap": null},
    {"name": "Картофель — 1 шт.", "swap": null},
    {"name": "Мелкие цельнозерновые макароны — 50 г", "swap": null},
    {"name": "Вода — 2,5 л", "swap": null}
  ]'::jsonb,
  '[
    "Хорошо промойте рыбу, залейте водой и поставьте на огонь.",
    "Когда закипит, добавьте лавровый лист, целую луковицу и снимите пену.",
    "Варите рыбу около 20 минут.",
    "Мелко нарежьте или измельчите в комбайне кабачок, морковь и сельдерей, картофель нарежьте кубиками.",
    "Достаньте рыбу и лук, в суп забросьте овощи и добавьте соль.",
    "Варите ещё около 10 минут.",
    "Отделите рыбу от костей, филе верните в суп.",
    "Добавьте мелко порезанный укроп.",
    "Варите ещё около 1 минуты и снимайте с огня."
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  400,
  true,
  true,
  0
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat, name = EXCLUDED.name, emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min, time_label = EXCLUDED.time_label, difficulty = EXCLUDED.difficulty,
  servings = EXCLUDED.servings,
  kcal = EXCLUDED.kcal, protein = EXCLUDED.protein, fat = EXCLUDED.fat,
  carbs = EXCLUDED.carbs, fiber = EXCLUDED.fiber,
  tags = EXCLUDED.tags, photo = EXCLUDED.photo, quote = EXCLUDED.quote,
  ingredients = EXCLUDED.ingredients, steps = EXCLUDED.steps,
  portion_grams = EXCLUDED.portion_grams,
  is_published = EXCLUDED.is_published,
  is_soup = EXCLUDED.is_soup,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('salmon-ukha', 'mains')
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. Котлеты из красной чечевицы (ОБНОВЛЕНИЕ существующего red-lentil-cutlets)
-- Старая версия: 200 г чечевицы, 3 порции, цельнозерновая мука, 230 ккал.
-- Новая версия от пользователя: 300 г чечевицы, 8 котлет по 90 г, нутовая мука,
-- кориандр + куркума, тушение овощей под крышкой, фарш через комбайн.
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber, auto_addons,
  portion_grams, is_published, sort_order
) VALUES (
  'red-lentil-cutlets',
  'cutlets',
  'Котлеты из красной чечевицы',
  '🫘',
  40,
  '40 минут',
  'medium',
  8,
  false,
  171, 11, 2, 28, 6,
  ARRAY['растительное', 'без сои', 'бобовые', 'без глютена'],
  NULL,
  'Красная чечевица делает эти котлеты сытными, нежными по текстуре и очень удобными в приготовлении — их можно заморозить и потом готовить сразу, без разморозки.',
  '[
    {"name": "Красная чечевица — 300 г", "swap": "Жёлтая или оранжевая чечевица"},
    {"name": "Лук — 1 средний", "swap": null},
    {"name": "Морковь — 1 средняя", "swap": null},
    {"name": "Нутовая мука — 2 ст. л.", "swap": "Рисовая или цельнозерновая мука"},
    {"name": "Паприка — 1 ч. л.", "swap": "Копчёная паприка"},
    {"name": "Кориандр — 1 ч. л.", "swap": null},
    {"name": "Куркума — 1/4 ч. л.", "swap": null},
    {"name": "Соль — 1 ч. л.", "swap": null},
    {"name": "Вода — 10 мл", "swap": null},
    {"name": "Растительное масло — немного для жарки", "swap": null}
  ]'::jsonb,
  '[
    "Чечевицу замочите на ночь или минимум на 3 часа.",
    "Нарежьте лук и морковь небольшими кубиками.",
    "Обжарьте лук и морковь на небольшом количестве растительного масла около 1 минуты.",
    "Добавьте специи, перемешайте, влейте воду, накройте крышкой и тушите 5–7 минут.",
    "Промойте чечевицу, засыпьте в комбайн вместе с потушенными овощами и пробейте до однородной консистенции.",
    "Добавьте муку и соль, перемешайте.",
    "Сформируйте котлеты и обжарьте их на 1 ст. л. растительного масла с одной стороны до румяности.",
    "Переверните, накройте сковороду крышкой и обжарьте с другой стороны до готовности."
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"carbs": {"fromCategory": "sides"}, "fiber": {"fromCategory": "salads"}}'::jsonb,
  90,
  true,
  27
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat, name = EXCLUDED.name, emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min, time_label = EXCLUDED.time_label, difficulty = EXCLUDED.difficulty,
  servings = EXCLUDED.servings,
  kcal = EXCLUDED.kcal, protein = EXCLUDED.protein, fat = EXCLUDED.fat,
  carbs = EXCLUDED.carbs, fiber = EXCLUDED.fiber,
  tags = EXCLUDED.tags, photo = EXCLUDED.photo, quote = EXCLUDED.quote,
  ingredients = EXCLUDED.ingredients, steps = EXCLUDED.steps,
  add_protein = EXCLUDED.add_protein, add_fat = EXCLUDED.add_fat,
  add_carbs = EXCLUDED.add_carbs, add_fiber = EXCLUDED.add_fiber,
  auto_addons = EXCLUDED.auto_addons,
  portion_grams = EXCLUDED.portion_grams,
  is_published = EXCLUDED.is_published,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('red-lentil-cutlets', 'cutlets')
ON CONFLICT DO NOTHING;

COMMIT;
