-- Рецепт: Оладьи из чечевицы — полная сверка с ТЗ от 2026-04-26 (пользователь).
-- Расхождения, которые поправил:
--   time_min 30 → 20; servings 3 → 4 (12 оладий, 3 = 1 порция); КБЖУ 250/14/3/42/7 → 290/14/3/45/7;
--   ингредиенты: чечевица 200→250 г, молоко 240→300 мл, добавлен мёд 1 ст. л. и масло 1 ч. л.;
--   шаги 3 → 6 (детализация по ТЗ); цитата убрана (в ТЗ нет); name «Оладьи из чечевицы» (без «(без глютена)»);
--   tags по ТЗ: без глютена, растительное, без сои, бобовые;
--   photo путь обновлён + файл скопирован в новую папку;
--   add_protein (йогурт + творог) и add_fiber (ягоды) добавлены — КБЖУ табличные USDA.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-lentil-pancakes-gf.sql

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'lentil-pancakes-gf',
  'pancakes',
  'Оладьи из чечевицы',
  '🥞',
  20,
  'easy',
  4,
  false,
  290, 14, 3, 45, 7,
  ARRAY['без глютена', 'растительное', 'без сои', 'бобовые'],
  'images/recipes/lentil-pancakes-gf/lentil-pancakes-gf-cover.webp',
  NULL,
  '[
    {"name": "Красная чечевица — 250 г", "swap": null},
    {"name": "Овсяное молоко — 300 мл", "swap": "Любое растительное или обычное молоко — 300 мл"},
    {"name": "Соль — щепотка", "swap": null},
    {"name": "Разрыхлитель — 1 ч. л.", "swap": null},
    {"name": "Мёд — 1 ст. л.", "swap": null},
    {"name": "Растительное масло — 1 ч. л. (для смазывания сковороды)", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Замочить чечевицу на ночь или минимум на 3 часа.", "photo": null},
    {"text": "Хорошо промыть чечевицу.", "photo": null},
    {"text": "Смешать все ингредиенты и взбить до однородности.", "photo": null},
    {"text": "Разогреть сковороду и смазать её растительным маслом кисточкой.", "photo": null},
    {"text": "Выкладывать тесто небольшими порциями, формируя оладьи.", "photo": null},
    {"text": "Жарить до подсыхания верхней стороны, затем перевернуть и поджарить вторую сторону.", "photo": null}
  ]'::jsonb,
  '[
    {"name": "Йогурт 2-5%", "amount": "150 г", "kcal": 90, "protein": 10, "fat": 10, "carbs": 10, "fiber": 0},
    {"name": "Творог 5%", "amount": "100 г", "kcal": 121, "protein": 17, "fat": 5, "carbs": 2, "fiber": 0}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[
    {"name": "Горсть ягод", "amount": "80 г", "kcal": 40, "protein": 1, "fat": 0, "carbs": 8, "fiber": 4}
  ]'::jsonb,
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
VALUES ('lentil-pancakes-gf', 'pancakes')
ON CONFLICT DO NOTHING;
