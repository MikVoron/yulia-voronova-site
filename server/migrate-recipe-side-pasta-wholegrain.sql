-- Рецепт: Паста цельнозерновая (гарнир)
-- Новый рецепт, ТЗ от 2026-04-25 (пользователь). Категория sides.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-side-pasta-wholegrain.sql
--
-- TODO: фото пока нет — папка images/recipes/side-pasta-wholegrain/ отсутствует, photo=null.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'side-pasta-wholegrain',
  'sides',
  'Паста цельнозерновая',
  '🍝',
  15,
  'easy',
  3,
  false,
  300, 8, 5, 45, 7,
  ARRAY['растительное', 'без сои'],
  NULL,
  'Пасту не нужно промывать водой: так на поверхности лучше остаётся крахмал, и соус потом соединяется с ней более нежно и ровно. Если добавить немного оливкового масла и перемешать, паста будет меньше слипаться и лучше держать текстуру.',
  '[
    {"name": "Паста цельнозерновая — 400 г", "swap": null},
    {"name": "Вода — 4 л", "swap": null},
    {"name": "Соль — 1 ч. л.", "swap": null},
    {"name": "Оливковое масло — 1 ст. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Вскипятите воду.", "photo": null},
    {"text": "Добавьте 1 ч. л. соли.", "photo": null},
    {"text": "Всыпьте пасту в кипящую воду.", "photo": null},
    {"text": "Дождитесь повторного закипания и варите около 8 минут или столько, сколько указано на упаковке.", "photo": null},
    {"text": "Слейте воду.", "photo": null},
    {"text": "Добавьте 1 ст. л. оливкового масла и перемешайте.", "photo": null}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  170,
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
VALUES ('side-pasta-wholegrain', 'sides')
ON CONFLICT DO NOTHING;
