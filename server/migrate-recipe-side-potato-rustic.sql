-- Рецепт: Запечённая картошка по-деревенски (гарнир)
-- Новый рецепт, ТЗ от 2026-04-26 (пользователь). Категория sides.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-side-potato-rustic.sql
--
-- TODO: фото пока нет — папка images/recipes/side-potato-rustic/ отсутствует, photo=null.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'side-potato-rustic',
  'sides',
  'Запечённая картошка по-деревенски',
  '🥔',
  35,
  'easy',
  5,
  false,
  275, 6, 6, 52, 6,
  ARRAY['растительное', 'без глютена', 'без сои'],
  NULL,
  'Предварительное отваривание делает картофель мягким внутри и помогает получить румяную корочку снаружи — именно тот самый эффект «по-деревенски». Для более хрустящей корочки можно включить режим гриля на 5 минут.',
  '[
    {"name": "Картофель — 1,5 кг", "swap": null},
    {"name": "Оливковое масло — 2 ст. л.", "swap": null},
    {"name": "Соль — 1 ч. л.", "swap": null},
    {"name": "Паприка — 1/2 ч. л.", "swap": null},
    {"name": "Кориандр — 1/2 ч. л.", "swap": null},
    {"name": "Хмели-сунели — 1 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Нарежьте картофель дольками.", "photo": null},
    {"text": "Отварите в кипящей воде 5 минут, слейте воду и дайте немного остыть.", "photo": null},
    {"text": "Добавьте масло и специи.", "photo": null},
    {"text": "Хорошо перемешайте.", "photo": null},
    {"text": "Выложите на противень с пергаментом в один слой.", "photo": null},
    {"text": "Запекайте при 200 °C около 25 минут до румяной корочки.", "photo": null}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  300,
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
VALUES ('side-potato-rustic', 'sides')
ON CONFLICT DO NOTHING;
