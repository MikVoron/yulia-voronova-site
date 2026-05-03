-- Три новых рецепта-супа: red-lentil-mushroom-soup, buckwheat-quinoa-soup, shchi-white-beans.
-- Все cat='mains', is_soup=true (хлеб + сухарики прилетают автоматом через is_soup-правило).
-- add_carbs намеренно пуст — не дублирует хлеб/сухарики, т. к. они идут через is_soup.
-- Применить:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-three-soups.sql

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Суп-пюре из чечевицы и грибов
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free, is_published, is_soup,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, sort_order
) VALUES (
  'red-lentil-mushroom-soup',
  'mains',
  'Суп-пюре из чечевицы и грибов',
  '🥣',
  40, 'medium', 8, false, true, true,
  210, 14, 2.5, 34, 16,
  ARRAY['растительное', 'бобовые'],
  NULL,
  'Добавляйте лимонный сок в конце — он усиливает вкус и делает суп ярче. И не обязательно пюрировать до идеально гладкой текстуры — небольшие кусочки делают суп интереснее.',
  '[
    {"name": "Красная чечевица — 380 г", "swap": null},
    {"name": "Шампиньоны — 400 г", "swap": null},
    {"name": "Лук — 1 шт.", "swap": null},
    {"name": "Морковь — 2 шт.", "swap": null},
    {"name": "Оливковое масло — 1 ст. л.", "swap": null},
    {"name": "Вода — 2,5 л", "swap": null},
    {"name": "Лавровый лист — 2 шт.", "swap": null},
    {"name": "Тимьян или розмарин — 0,5 ч. л.", "swap": null},
    {"name": "Кориандр молотый — 0,5 ч. л.", "swap": null},
    {"name": "Паприка сладкая — 0,5 ч. л.", "swap": null},
    {"name": "Соль — по вкусу", "swap": null},
    {"name": "Соевый соус или тамари — 1 ст. л.", "swap": null},
    {"name": "Лимонный сок — 1 ст. л.", "swap": null}
  ]'::jsonb,
  '[
    "Нарежьте лук, морковь и грибы крупно. Чечевицу промойте.",
    "Обжарьте лук и морковь на оливковом масле около 5 минут.",
    "Добавьте специи и перемешайте.",
    "Добавьте грибы и тушите под крышкой около 10 минут.",
    "Добавьте соевый соус, чечевицу и лавровый лист.",
    "Залейте водой и варите около 20 минут до готовности.",
    "Добавьте соль и лимонный сок.",
    "Пюрируйте до кремовой текстуры."
  ]'::jsonb,
  '[
    {"name": "Белое мясо", "amount": "50 г", "kcal": 80, "protein": 16, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Твердый тофу", "amount": "100 г", "kcal": 78, "protein": 9, "fat": 5, "carbs": 2, "fiber": 1},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5},
    {"name": "Хумус", "amount": "40 г", "kcal": 75, "protein": 3, "fat": 3, "carbs": 10, "fiber": 3, "recipeId": "hummus"},
    {"name": "Хумус со свёклой", "amount": "40 г", "kcal": 52, "protein": 2, "fat": 2, "carbs": 8, "fiber": 2, "recipeId": "beetroot-hummus"}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  450, 0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('red-lentil-mushroom-soup', 'mains')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Суп с гречкой и киноа
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free, is_published, is_soup,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, sort_order
) VALUES (
  'buckwheat-quinoa-soup',
  'mains',
  'Суп с гречкой и киноа',
  '🥣',
  45, 'medium', 8, false, true, true,
  141, 4.9, 2.3, 26.7, 4.0,
  ARRAY['растительное', 'без глютена', 'без сои'],
  NULL,
  'Если вы боитесь, что суп получится слишком густым, гречку и киноа можно отварить отдельно (есть рецепт, смотри гарниры). Затем сварить суп до готовности картофеля, добавить готовые крупы, довести до кипения и дать настояться 30 минут — вкус станет только лучше.',
  '[
    {"name": "Гречка — 150 г", "swap": null},
    {"name": "Киноа — 40 г", "swap": null},
    {"name": "Лук — 1 средний", "swap": null},
    {"name": "Морковь — 1 средняя", "swap": null},
    {"name": "Картофель — 1 шт.", "swap": null},
    {"name": "Сельдерей (стебли) — 2 шт.", "swap": null},
    {"name": "Шампиньоны — 3 шт.", "swap": "можно без них"},
    {"name": "Чеснок — 2 зубчика", "swap": null},
    {"name": "Томатная паста — 1 ст. л.", "swap": null},
    {"name": "Растительное масло — 1 ст. л.", "swap": null},
    {"name": "Вода — 2,5 л", "swap": null},
    {"name": "Овощной концентрат — 5 ч. л.", "swap": "можно без него"},
    {"name": "Соль — 1 ч. л.", "swap": null},
    {"name": "Паприка — 1 ч. л.", "swap": null},
    {"name": "Тимьян — 1 ч. л.", "swap": null},
    {"name": "Кориандр — 1 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    "Нарежьте все овощи мелкими кубиками.",
    "Обжарьте лук и чеснок на масле 1 минуту.",
    "Добавьте морковь и сельдерей, тушите 2 минуты.",
    "Добавьте специи, перемешайте.",
    "Добавьте томатную пасту, перемешайте.",
    "Добавьте гречку и киноа, перемешайте.",
    "Влейте воду.",
    "Добавьте картофель, грибы и овощной концентрат (можно без него).",
    "Накройте крышкой и варите 20–30 минут до готовности круп."
  ]'::jsonb,
  '[
    {"name": "Белое мясо готовое", "amount": "70 г", "kcal": 112, "protein": 22, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Тофу", "amount": "130 г", "kcal": 91, "protein": 13, "fat": 5, "carbs": 3, "fiber": 0},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  420, 0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('buckwheat-quinoa-soup', 'mains')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Щи с белой фасолью
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free, is_published, is_soup,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, sort_order
) VALUES (
  'shchi-white-beans',
  'mains',
  'Щи с белой фасолью',
  '🥣',
  45, 'medium', 8, false, true, true,
  227, 11, 5, 38, 10,
  ARRAY['без глютена', 'растительное', 'без сои', 'бобовые'],
  NULL,
  'Фасоль в щи можно класть целой. Детям может больше нравиться пюрированный вариант. Идеально варить на овощном бульоне и каждому класть порционно белое мясо или тофу — так удобнее и вкуснее.',
  '[
    {"name": "Лук — 1 шт.", "swap": null},
    {"name": "Морковь — 2 шт.", "swap": null},
    {"name": "Сельдерей — 1 палочка", "swap": null},
    {"name": "Сладкий перец — 1 шт.", "swap": null},
    {"name": "Томаты в собственном соку — 200 г", "swap": "Свежие томаты"},
    {"name": "Чеснок — 2 зубчика", "swap": null},
    {"name": "Белокочанная капуста — 400 г", "swap": null},
    {"name": "Белая отварная фасоль — 500 г", "swap": "Консервированная белая фасоль"},
    {"name": "Картофель — 1 шт.", "swap": null},
    {"name": "Кориандр — 1 ч. л.", "swap": null},
    {"name": "Лимонный сок — 2 ст. л.", "swap": null},
    {"name": "Соль — 2 ч. л.", "swap": null},
    {"name": "Вода — 2 л", "swap": null},
    {"name": "Овощной концентрат — 4 ч. л.", "swap": "можно без него"},
    {"name": "Петрушка — 30 г", "swap": "Любая зелень"}
  ]'::jsonb,
  '[
    "Нарежьте мелкими кубиками морковь, лук, сельдерей и сладкий перец.",
    "На 1 ст. л. растительного масла обжарьте лук в течение 1 минуты, затем добавьте морковь, сельдерей и перец. Тушите все вместе около 5 минут.",
    "Добавьте чеснок и специи, перемешайте, затем добавьте томаты. Тушите еще 1 минуту.",
    "Добавьте воду, капусту и картофель.",
    "Добавьте овощной концентрат, если используете.",
    "Доведите до кипения, затем варите на среднем огне до готовности овощей и капусты.",
    "Фасоль залейте небольшим количеством бульона из супа и проблендируйте.",
    "Верните пюре в кастрюлю, добавьте лимонный сок, соль и зелень.",
    "Перемешайте, дайте минуту покипеть — готово."
  ]'::jsonb,
  '[
    {"name": "Белое мясо", "amount": "50 г", "kcal": 80, "protein": 16, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Твердый тофу", "amount": "100 г", "kcal": 78, "protein": 9, "fat": 5, "carbs": 2, "fiber": 1},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5},
    {"name": "Хумус", "amount": "40 г", "kcal": 75, "protein": 3, "fat": 3, "carbs": 10, "fiber": 3, "recipeId": "hummus"},
    {"name": "Хумус со свёклой", "amount": "40 г", "kcal": 52, "protein": 2, "fat": 2, "carbs": 8, "fiber": 2, "recipeId": "beetroot-hummus"}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  400, 0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('shchi-white-beans', 'mains')
ON CONFLICT DO NOTHING;
