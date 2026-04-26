-- Рецепт: Котлеты из нута и грибов с укропом
-- Новый рецепт, ТЗ от 2026-04-25 (пользователь). Категория cutlets.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-cutlets-chickpea-mushroom-dill.sql

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber, auto_addons,
  portion_grams, is_published, sort_order
) VALUES (
  'cutlets-chickpea-mushroom-dill',
  'cutlets',
  'Котлеты из нута и грибов с укропом',
  '🫓',
  45,
  '40–50 минут',
  'medium',
  8,
  false,
  150, 7, 3, 15, 4,
  ARRAY['растительное', 'без сои', 'бобовые', 'без глютена'],
  'images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-cover.webp',
  'Можно сделать котлеты впрок и заморозить — потом готовить без разморозки. И не обязательно измельчать массу до полностью гладкой текстуры: небольшие кусочки делают вкус интереснее.',
  '[
    {"name": "Варёный нут — 400 г", "swap": "Консервированный нут — 400 г"},
    {"name": "Морковь — 2 шт.", "swap": null},
    {"name": "Лук — 1 шт.", "swap": null},
    {"name": "Шампиньоны — 3 шт.", "swap": null},
    {"name": "Укроп — 20–30 г", "swap": null},
    {"name": "Мука нутовая — 3 ст. л.", "swap": null},
    {"name": "Кориандр — 1 ч. л.", "swap": null},
    {"name": "Куркума — 1/4 ч. л.", "swap": null},
    {"name": "Соль — 1 ч. л. (по вкусу)", "swap": null},
    {"name": "Оливковое масло — немного для жарки", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Нарежьте лук, морковь и грибы средним кубиком.", "photo": "images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-start.webp"},
    {"text": "Мелко нарежьте укроп.", "photo": null},
    {"text": "Обжарьте лук и морковь около 5 минут.", "photo": null},
    {"text": "Добавьте специи и перемешайте.", "photo": "images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-4.webp"},
    {"text": "Добавьте грибы, перемешайте, накройте крышкой и тушите 7–10 минут.", "photo": "images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-5.webp"},
    {"text": "Остудите овощи и добавьте к нуту.", "photo": "images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-6.webp"},
    {"text": "Измельчите погружным блендером или в комбайне.", "photo": null},
    {"text": "Добавьте соль, муку и зелень, тщательно перемешайте.", "photo": "images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-8.webp"},
    {"text": "Накройте и уберите в холодильник на 15–30 минут.", "photo": null},
    {"text": "Сформируйте котлеты.", "photo": "images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-10.webp"},
    {"text": "При желании обваляйте в панировке или готовьте сразу.", "photo": null},
    {"text": "Обжарьте на небольшом количестве оливкового масла до румяной корочки.", "photo": "images/recipes/cutlets-chickpea-mushroom-dill/cutlets-chickpea-mushroom-dill-final.webp"}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"carbs": {"fromCategory": "sides"}, "fiber": {"fromCategory": "salads"}}'::jsonb,
  90,
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
VALUES ('cutlets-chickpea-mushroom-dill', 'cutlets')
ON CONFLICT DO NOTHING;
