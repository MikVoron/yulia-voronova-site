-- Рецепт: Капуста с чечевицей, рисом и запечённой сёмгой
-- Новый рецепт, ТЗ от 2026-04-25 (пользователь). Категория mains.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-cabbage-rice-lentils-salmon.sql

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'cabbage-rice-lentils-salmon',
  'mains',
  'Капуста с чечевицей, рисом и запечённой сёмгой',
  '🐟',
  50,
  'medium',
  5,
  false,
  370, 17, 9, 45, 14,
  ARRAY['бобовые', 'рыбное'],
  'images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-cover.webp',
  'Это блюдо можно приготовить без рыбы — просто увеличьте чечевицу до 220 г. Получится полноценное сбалансированное рагу, не перегруженное бобовыми. Блюдо богато клетчаткой и белком, хорошо насыщает и может использоваться как полноценный приём пищи.',
  '[
    {"name": "Капуста — 600 г", "swap": null},
    {"name": "Чечевица зелёная сухая — 150 г", "swap": null},
    {"name": "Рис длиннозерный сухой — 100 г", "swap": null},
    {"name": "Лук — 1 шт.", "swap": null},
    {"name": "Чеснок — 2 зубчика", "swap": null},
    {"name": "Томатная паста — 1 ч. л.", "swap": null},
    {"name": "Томаты в собственном соку — 200 г", "swap": "Свежие томаты — 200 г"},
    {"name": "Вода — 500 мл", "swap": null},
    {"name": "Сёмга — 200 г", "swap": "Любая жирная рыба — 200 г"},
    {"name": "Паприка — 2 ч. л.", "swap": null},
    {"name": "Тимьян — 0,5 ч. л.", "swap": null},
    {"name": "Соевый соус или тамари — 1 ст. л.", "swap": null},
    {"name": "Лимонный сок — 1 ч. л.", "swap": null},
    {"name": "Укроп — 15–20 г", "swap": null},
    {"name": "Оливковое масло — 2 ст. л.", "swap": null},
    {"name": "Соль — по вкусу", "swap": null},
    {"name": "Перец — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Нарежьте капусту средними кусками.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-start.webp"},
    {"text": "Смешайте её с маслом, 1 ч. л. паприки и солью.", "photo": null},
    {"text": "Выложите капусту и рыбу на противень и запекайте при 200°C около 25 минут.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-3.webp"},
    {"text": "Нарежьте лук, измельчите чеснок.", "photo": null},
    {"text": "Обжарьте лук около 3 минут.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-5.webp"},
    {"text": "Добавьте чеснок и обжаривайте ещё около 30 секунд.", "photo": null},
    {"text": "Добавьте специи, перемешайте.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-7.webp"},
    {"text": "Добавьте томатную пасту и обжарьте 1 минуту.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-8.webp"},
    {"text": "Добавьте томаты, чечевицу и рис.", "photo": null},
    {"text": "Влейте воду и перемешайте.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-10.webp"},
    {"text": "Накройте крышкой и варите 20 минут, до готовности чечевицы и риса.", "photo": null},
    {"text": "Вытащите готовую рыбу и капусту из духовки.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-12.webp"},
    {"text": "Аккуратно вмешайте запечённую капусту.", "photo": null},
    {"text": "Разделите рыбу на крупные куски, выложите сверху и аккуратно перемешайте.", "photo": null},
    {"text": "Добавьте соевый соус или соль.", "photo": "images/recipes/cabbage-rice-lentils-salmon/cabbage-rice-lentils-salmon-15.webp"},
    {"text": "Посыпьте укропом готовое блюдо.", "photo": null}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  380,
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
VALUES ('cabbage-rice-lentils-salmon', 'mains')
ON CONFLICT DO NOTHING;
