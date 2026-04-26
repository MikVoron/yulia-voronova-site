-- Рецепт: Бурый рис (гарнир)
-- Новый рецепт, ТЗ от 2026-04-25 (пользователь). Категория sides.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-side-brown-rice.sql
--
-- TODO: portion_grams не указан в ТЗ. Поставлен NULL — нужно подтверждение пользователя.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'side-brown-rice',
  'sides',
  'Бурый рис',
  '🍚',
  25,
  'easy',
  4,
  false,
  170, 5, 1, 35, 3,
  ARRAY['растительное', 'без сои', 'без глютена'],
  'images/recipes/side-brown-rice/side-brown-rice-cover.webp',
  'Замачивание делает рис мягче, ускоряет варку и помогает добиться более ровной, приятной текстуры. И даже простые гарниры становятся лучше, если дать им немного времени постоять после приготовления.',
  '[
    {"name": "Бурый рис — 240 г", "swap": null},
    {"name": "Вода для варки — 600 мл", "swap": null},
    {"name": "Соль — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Замочите рис в холодной воде минимум на 60 минут, чтобы он стал мягче и быстрее сварился. Оптимально оставить на 2–4 часа, тогда он сварится более равномерно. Для максимально мягкой текстуры можно замочить на 6–8 часов или на ночь.", "photo": "images/recipes/side-brown-rice/side-brown-rice-start.webp"},
    {"text": "Слейте воду после замачивания и промойте рис.", "photo": null},
    {"text": "Залейте рис водой, добавьте соль.", "photo": null},
    {"text": "Варите 25 минут, если рис был замочен. Если рис не замачивать, варите 35–45 минут.", "photo": null},
    {"text": "При желании можно залить большим количеством воды и потом слить, как макароны.", "photo": "images/recipes/side-brown-rice/side-brown-rice-final.webp"}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
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
  ingredients = EXCLUDED.ingredients,
  steps = EXCLUDED.steps,
  add_protein = EXCLUDED.add_protein,
  add_fat = EXCLUDED.add_fat,
  add_carbs = EXCLUDED.add_carbs,
  add_fiber = EXCLUDED.add_fiber,
  portion_grams = EXCLUDED.portion_grams,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('side-brown-rice', 'sides')
ON CONFLICT DO NOTHING;
