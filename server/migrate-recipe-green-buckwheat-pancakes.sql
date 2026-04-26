-- Рецепт: Блины из зелёной гречки
-- Новый рецепт, ТЗ от 2026-04-26 (пользователь). Категория pancakes.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-green-buckwheat-pancakes.sql
--
-- TODO: фото пока нет — папка images/recipes/green-buckwheat-pancakes/ отсутствует, photo=null.
-- TODO: portion_grams не указан в ТЗ — поставлен NULL. Подтвердить (~80–100 г / блин на 8 блинов).
-- ВНИМАНИЕ: КБЖУ для add_protein/add_fiber взяты из табличных USDA — нужно подтверждение пользователя.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'green-buckwheat-pancakes',
  'pancakes',
  'Блины из зелёной гречки',
  '🥞',
  20,
  '20 минут (без замачивания)',
  'easy',
  8,
  false,
  133, 5, 2, 27, 4,
  ARRAY['растительное', 'без глютена', 'без сои'],
  NULL,
  'Блины из зелёной гречки — это более насыщенный по составу вариант привычного блюда, с клетчаткой и долгой сытостью.',
  '[
    {"name": "Зелёная гречка — 320 г", "swap": null},
    {"name": "Спелый банан — 1 шт.", "swap": "Можно без него (для несладких блинов)"},
    {"name": "Овсяное молоко — 200 мл", "swap": "Соевое или обычное молоко — 200 мл"},
    {"name": "Газированная вода — 200 мл", "swap": null},
    {"name": "Растительное масло — 1 ч. л.", "swap": null},
    {"name": "Соль — 0,5 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Замочите гречку на 4–8 часов (или на ночь), чтобы она стала мягче и легче измельчалась в блендере.", "photo": null},
    {"text": "Хорошо промойте гречку и вместе с бананом, молоком и солью взбейте до гладкой консистенции. По желанию можно добавить 1 ст. л. лимонного сока.", "photo": null},
    {"text": "Перед жаркой аккуратно влейте газированную воду и перемешайте — тесто должно быть как жидкая сметана.", "photo": null},
    {"text": "Разогрейте сковороду, смажьте маслом и вылейте тонкий слой теста.", "photo": null},
    {"text": "Жарьте на среднем огне до появления дырочек, затем аккуратно переверните. Не торопитесь — верх блина должен слегка подсохнуть.", "photo": null}
  ]'::jsonb,
  '[
    {"name": "Йогурт 2-5%", "amount": "150 г", "kcal": 90, "protein": 10, "fat": 10, "carbs": 10, "fiber": 0},
    {"name": "Творог 5%", "amount": "100 г", "kcal": 121, "protein": 17, "fat": 5, "carbs": 2, "fiber": 0},
    {"name": "Белое мясо", "amount": "100 г", "kcal": 165, "protein": 31, "fat": 4, "carbs": 0, "fiber": 0},
    {"name": "Слабосолёная жирная рыба", "amount": "80 г", "kcal": 160, "protein": 18, "fat": 10, "carbs": 0, "fiber": 0},
    {"name": "Тунец консервированный", "amount": "80 г", "kcal": 95, "protein": 21, "fat": 1, "carbs": 0, "fiber": 0}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[
    {"name": "Горсть ягод", "amount": "80 г", "kcal": 40, "protein": 1, "fat": 0, "carbs": 8, "fiber": 4},
    {"name": "Зелень", "amount": "20–30 г", "kcal": 10, "protein": 1, "fat": 0, "carbs": 2, "fiber": 1},
    {"name": "Свежие овощи", "amount": "100–150 г", "kcal": 30, "protein": 1, "fat": 0, "carbs": 6, "fiber": 2}
  ]'::jsonb,
  NULL,
  false,
  0
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat,
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min,
  time_label = EXCLUDED.time_label,
  difficulty = EXCLUDED.difficulty,
  servings = EXCLUDED.servings,
  kcal = EXCLUDED.kcal,
  protein = EXCLUDED.protein,
  fat = EXCLUDED.fat,
  carbs = EXCLUDED.carbs,
  fiber = EXCLUDED.fiber,
  tags = EXCLUDED.tags,
  photo = EXCLUDED.photo,
  quote = EXCLUDED.quote,
  ingredients = EXCLUDED.ingredients,
  steps = EXCLUDED.steps,
  add_protein = EXCLUDED.add_protein,
  add_fat = EXCLUDED.add_fat,
  add_carbs = EXCLUDED.add_carbs,
  add_fiber = EXCLUDED.add_fiber,
  portion_grams = EXCLUDED.portion_grams,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('green-buckwheat-pancakes', 'pancakes')
ON CONFLICT DO NOTHING;
