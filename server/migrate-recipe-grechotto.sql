-- Рецепт: Гречотто
-- Сверка с ТЗ от 2026-04-25 (пользователь): обновление КБЖУ, цитаты, шагов (10 пронумерованных),
-- ингредиентов (овощной концентрат отдельной строкой), добавление add_protein (пармезан).
-- ВНИМАНИЕ: дрожжи (15 г, 78 г белка) из ТЗ не добавлены — белок 78 г при весе 15 г это опечатка
-- (реальное значение пищ. дрожжей ≈ 7-8 г белка/15 г). Нужно подтверждение пользователя.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-grechotto.sql

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber, auto_addons,
  portion_grams, is_published, sort_order
) VALUES (
  'grechotto',
  'mains',
  'Гречотто',
  '🍴',
  35,
  'medium',
  5,
  false,
  388, 18, 6, 73, 13,
  ARRAY['без глютена', 'растительное', 'без сои', 'бобовые'],
  'images/recipes/grechotto/grechotto-cover.webp',
  'При обжарке моркови можно добавить мелко порезанный стебель сельдерея — он даст больше аромата и объёма без лишней нагрузки по КБЖУ. В конце можно посыпать блюдо тёртым пармезаном или неактивными пищевыми дрожжами, перемешать и сразу подавать.',
  '[
    {"name": "Гречка — 350 г", "swap": null},
    {"name": "Белая фасоль отварная — 300 г", "swap": "Консервированная белая фасоль — 300 г"},
    {"name": "Грибы шампиньоны — 150 г", "swap": "Грибы вешенки — 150 г"},
    {"name": "Лук — 1 шт.", "swap": null},
    {"name": "Морковь — 2 шт. (средние)", "swap": null},
    {"name": "Оливковое масло — 1 ст. л.", "swap": null},
    {"name": "Вода — 900 мл", "swap": null},
    {"name": "Овощной концентрат — 2 ч. л.", "swap": "Можно без него"},
    {"name": "Орегано — 1 ч. л.", "swap": null},
    {"name": "Кориандр — 1 ч. л.", "swap": null},
    {"name": "Соль — 1 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Лук мелко нарежьте, морковь натрите на тёрке, грибы нарежьте средними кусочками.", "photo": "images/recipes/grechotto/grechotto-start.webp"},
    {"text": "Обжарьте лук на оливковом масле около 1 минуты.", "photo": "images/recipes/grechotto/grechotto-1.webp"},
    {"text": "Добавьте морковь и обжаривайте ещё 1–2 минуты.", "photo": "images/recipes/grechotto/grechotto-2.webp"},
    {"text": "Добавьте грибы и специи, перемешайте и готовьте около 1 минуты.", "photo": "images/recipes/grechotto/grechotto-3.webp"},
    {"text": "Гречку промойте и добавьте к овощам, перемешайте.", "photo": "images/recipes/grechotto/grechotto-4.webp"},
    {"text": "Влейте воду, добавьте овощной концентрат (можно без него) и соль.", "photo": null},
    {"text": "Доведите до кипения, накройте крышкой и готовьте на слабом огне 15–20 минут.", "photo": "images/recipes/grechotto/grechotto-5.webp"},
    {"text": "Фасоль пробейте блендером с 100 мл воды до кремовой консистенции.", "photo": "images/recipes/grechotto/grechotto-6.webp"},
    {"text": "Когда гречка готова, добавьте пюре из фасоли и перемешайте.", "photo": "images/recipes/grechotto/grechotto-7.webp"},
    {"text": "Дайте постоять под крышкой 5–10 минут. Можно посыпать тёртым пармезаном или неактивными пищевыми дрожжами.", "photo": "images/recipes/grechotto/grechotto-final.webp"}
  ]'::jsonb,
  '[
    {"name": "Пармезан", "amount": "10 г", "kcal": 43, "protein": 4, "fat": 3, "carbs": 0, "fiber": 0}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"fiber": {"fromCategory": "salads"}}'::jsonb,
  320,
  false,
  0
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat,
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min,
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
  note = NULL,
  ingredients = EXCLUDED.ingredients,
  steps = EXCLUDED.steps,
  add_protein = EXCLUDED.add_protein,
  add_fat = EXCLUDED.add_fat,
  add_carbs = EXCLUDED.add_carbs,
  add_fiber = EXCLUDED.add_fiber,
  auto_addons = EXCLUDED.auto_addons,
  portion_grams = EXCLUDED.portion_grams,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('grechotto', 'mains')
ON CONFLICT DO NOTHING;
