-- Рецепт: Пюре из картофеля и сельдерея (гарнир)
-- Новый рецепт, ТЗ от 2026-04-26 (пользователь). Категория sides.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-side-potato-celery-puree.sql
--
-- TODO: фото нет — папка images/recipes/side-potato-celery-puree/ отсутствует, photo=null.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'side-potato-celery-puree',
  'sides',
  'Пюре из картофеля и сельдерея',
  '🥔',
  30,
  'easy',
  4,
  false,
  211, 4, 0, 48, 5,
  ARRAY['растительное', 'без глютена', 'без сои'],
  NULL,
  'Если хотите сделать вкус глубже и мягче, можно поджарить 1 луковицу на небольшом количестве растительного масла и добавить в пюре — получится более тёплый, домашний вкус с лёгкой сладостью и ароматом. Ваша порция тогда будет немного калорийнее +10 ккал и +1 г жира.',
  '[
    {"name": "Картофель — 800 г", "swap": null},
    {"name": "Корень сельдерея — 250 г", "swap": null},
    {"name": "Вода — чтобы слегка покрывала овощи", "swap": null},
    {"name": "Овощной концентрат — 1 ч. л.", "swap": "Можно без него"},
    {"name": "Мускатный орех — щепотка", "swap": null},
    {"name": "Соль — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Порежьте картофель и сельдерей на небольшие кубики.", "photo": null},
    {"text": "Залейте водой так, чтобы она слегка покрывала овощи.", "photo": null},
    {"text": "Добавьте овощной концентрат (можно без него).", "photo": null},
    {"text": "Варите до готовности картофеля; сельдерей варится немного быстрее. Обычно это занимает около 15–20 минут после закипания.", "photo": null},
    {"text": "Добавьте соль и мускатный орех.", "photo": null},
    {"text": "Пюрируйте до однородности.", "photo": null}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  295,
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
VALUES ('side-potato-celery-puree', 'sides')
ON CONFLICT DO NOTHING;
