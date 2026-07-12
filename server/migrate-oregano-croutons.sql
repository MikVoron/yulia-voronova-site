-- Рецепт: Сухарики из цельнозернового хлеба с орегано
-- Обновление существующего рецепта oregano-croutons.
-- Применить на VPS:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-oregano-croutons.sql

UPDATE recipes
SET
  name = 'Сухарики из цельнозернового хлеба с орегано',
  cat = 'breads',
  emoji = '🥖',
  time_min = 25,
  difficulty = 'easy',
  servings = 15,
  portion_grams = 35,
  kcal = 110,
  protein = 3,
  fat = 2,
  carbs = 19,
  fiber = 3,
  tags = ARRAY['растительное', 'без яиц', 'без молока'],
  quote = 'Эти сухарики удобно использовать как хлебную добавку к супу: одна порция по объёму и насыщению заменяет примерно один кусок хлеба, но даёт более хрустящую текстуру и яркий аромат орегано.',
  ingredients = '[
    {"name": "Цельнозерновой хлеб — 550 г", "swap": null},
    {"name": "Оливковое масло — 2 ст. л.", "swap": null},
    {"name": "Соль — 1 ст. л.", "swap": null},
    {"name": "Орегано — 2 ст. л.", "swap": null}
  ]'::jsonb,
  steps = '[
    "Нарежьте хлеб кубиками.",
    "Смешайте с оливковым маслом, солью и орегано.",
    "Выложите на противень.",
    "Запекайте при 150°C до сухариков, периодически перемешивая."
  ]'::jsonb,
  add_protein = '[]'::jsonb,
  add_fat = '[]'::jsonb,
  add_carbs = '[]'::jsonb,
  add_fiber = '[]'::jsonb,
  updated_at = now()
WHERE id = 'oregano-croutons';

-- Sanity: если категорийная связка отсутствует — добавить
INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('oregano-croutons', 'breads')
ON CONFLICT DO NOTHING;
