-- Рецепт: Котлеты из сёмги с цветной капустой
-- Новый рецепт, ТЗ от 2026-04-25 (пользователь). Категория cutlets.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-salmon-cauliflower-cutlets.sql
--
-- TODO: фото пока нет — папка images/recipes/salmon-cauliflower-cutlets/ отсутствует, photo=null.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber, auto_addons,
  portion_grams, is_published, sort_order
) VALUES (
  'salmon-cauliflower-cutlets',
  'cutlets',
  'Котлеты из сёмги с цветной капустой',
  '🐟',
  45,
  '40–45 минут',
  'easy',
  10,
  false,
  140, 14, 8, 2, 1,
  ARRAY['рыбное', 'без глютена', 'без сои'],
  NULL,
  'Приготовьте столько котлет, сколько вам нужно на один приём пищи, остальное заморозьте. Для этого оберните пищевой плёнкой разделочную доску, выложите котлеты и уберите в морозилку. После заморозки котлеты легко отходят от доски — переложите их в пакет. Готовить можно прямо из заморозки, сразу в духовке.',
  '[
    {"name": "Сёмга филе — 600 г", "swap": null},
    {"name": "Цветная капуста — 250 г", "swap": null},
    {"name": "Лук — 1 средний", "swap": null},
    {"name": "Укроп — 20 г", "swap": "Петрушка — 20 г"},
    {"name": "Соль — 1 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Разберите цветную капусту на соцветия.", "photo": null},
    {"text": "Отварите её 3 минуты до состояния al dente.", "photo": null},
    {"text": "Слейте воду и остудите.", "photo": null},
    {"text": "Разогрейте духовку до 180 °C.", "photo": null},
    {"text": "Нарежьте рыбу на средние кусочки.", "photo": null},
    {"text": "Прокрутите через мясорубку или измельчите в комбайне рыбу, лук, зелень и цветную капусту.", "photo": null},
    {"text": "Добавьте соль и перемешайте.", "photo": null},
    {"text": "Сформируйте котлеты.", "photo": null},
    {"text": "Выложите на противень с пергаментом.", "photo": null},
    {"text": "Запекайте 25 минут.", "photo": null}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"carbs": {"fromCategory": "sides"}, "fiber": {"fromCategory": "salads"}}'::jsonb,
  97,
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
  auto_addons = EXCLUDED.auto_addons,
  portion_grams = EXCLUDED.portion_grams,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('salmon-cauliflower-cutlets', 'cutlets')
ON CONFLICT DO NOTHING;
