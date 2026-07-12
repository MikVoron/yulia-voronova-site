-- Рецепт: Салат с нутом, перцем и солеными огурцами
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-salad-chickpea-pepper-pickles.sql
--
-- strict / No Guessing. См. docs/ai-recipe-input-contract.md
-- TODO:
--   • фото пока нет — папка images/recipes/salad-chickpea-pepper-pickles/ отсутствует, photo=NULL.
--     Обложка будет: images/recipes/salad-chickpea-pepper-pickles/salad-chickpea-pepper-pickles-cover.webp
--   • sort_order=0 — назначить вручную при публикации.
--   • emoji=NULL по правилу проекта.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'salad-chickpea-pepper-pickles',
  'salads',
  'Салат с нутом, перцем и солеными огурцами',
  NULL,
  20,
  NULL,
  'easy',
  2,
  false,
  285, 13, 8, 42, 11,
  ARRAY['растительное', 'без глютена', 'бобовые', 'без сои'],
  NULL,
  'Необычный, сытный и очень вкусный салат. Много клетчатки из бобовых и овощей, растительный белок, плюс яркие вкусы от каперсов и огурцов.',
  '[
    {"name": "Нут варёный: 250 г", "swap": null},
    {"name": "Солёные огурцы: 2 средних (~100 г)", "swap": null},
    {"name": "Красный болгарский перец: 1 крупный (~150 г)", "swap": null},
    {"name": "Каперсы: 10 г", "swap": null},
    {"name": "Зелёный лук: 10 г", "swap": null},
    {"name": "Кинза: 10 г", "swap": "Можно без неё"},
    {"name": "Белая фасоль: 130 г", "swap": null},
    {"name": "Оливковое масло: 1 ст. л. (~15 г)", "swap": null},
    {"name": "Горчица: 1/2 ч. л. (~2.5 г)", "swap": null},
    {"name": "Лимонный сок: 1 ч. л. (~5 г)", "swap": null},
    {"name": "Соль: 1/3 ч. л.", "swap": null},
    {"name": "Вода для фасолевого соуса: 4–6 ст. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Белую фасоль с горчицей, оливковым маслом, лимонным соком и водой взбейте в блендере до кремовой текстуры. Посолите."},
    {"text": "Нут порубите ножом, оставив небольшие кусочки."},
    {"text": "Перец и огурцы нарежьте мелкими кубиками."},
    {"text": "Измельчите каперсы, зелёный лук и кинзу."},
    {"text": "Смешайте все ингредиенты, добавьте фасолевый соус, хорошо перемешайте."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  280,
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
VALUES ('salad-chickpea-pepper-pickles', 'salads')
ON CONFLICT DO NOTHING;
