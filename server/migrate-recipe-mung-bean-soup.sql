-- Рецепт: Суп из маша
-- Новый рецепт, ТЗ от 2026-04-26 (пользователь). Категория mains, is_soup=true.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-mung-bean-soup.sql
--
-- TODO: фото нет — папка images/recipes/mung-bean-soup/ отсутствует, photo=null.
-- add_protein: полные КБЖУ для «Готовое белое мясо 70 г» и «Тофу 130 г» подтверждены пользователем 2026-04-27.
-- add_carbs пуст: хлеб + сухарики прилетают автоматом через флаг is_soup (как в borsch).

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  is_soup, portion_grams, is_published, sort_order
) VALUES (
  'mung-bean-soup',
  'mains',
  'Суп из маша',
  '🥣',
  40,
  'medium',
  8,
  false,
  93, 4, 2, 16, 5,
  ARRAY['без глютена', 'растительное', 'без сои', 'бобовые'],
  NULL,
  'Маш — один из самых недооценённых бобовых: у него мягкий вкус, нежная текстура и он быстро варится. А картофель при желании можно натереть на крупной тёрке — только слегка отжать перед добавлением в суп, многим детям так больше нравится.',
  '[
    {"name": "Маш — 230 г", "swap": null},
    {"name": "Лук — 1 крупный", "swap": null},
    {"name": "Морковь — 2 шт.", "swap": null},
    {"name": "Болгарский перец — 1 крупный", "swap": null},
    {"name": "Томаты в собственном соку — 150–200 г", "swap": "2 свежих помидора"},
    {"name": "Картофель — 1 шт.", "swap": null},
    {"name": "Чеснок — 2 зубчика", "swap": null},
    {"name": "Кориандр — 0,5 ч. л.", "swap": null},
    {"name": "Паприка — 1 ч. л.", "swap": "Копчёная паприка"},
    {"name": "Растительное масло — 1 ст. л.", "swap": null},
    {"name": "Кинза — 40–60 г", "swap": "Петрушка — 40–60 г"},
    {"name": "Вода — 2,5 л", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Замочите маш на ночь или минимум на 3 часа.", "photo": null},
    {"text": "Мелко нарежьте лук и чеснок, морковь натрите на мелкой тёрке, перец нарежьте кубиками.", "photo": null},
    {"text": "Обжарьте лук и чеснок на масле в течение 1 минуты.", "photo": null},
    {"text": "Добавьте специи и мелко порезанную кинзу, перемешайте.", "photo": null},
    {"text": "Добавьте морковь и перец, обжарьте около 1 минуты.", "photo": null},
    {"text": "Добавьте томаты в собственном соку, накройте крышкой и потушите овощи около 5 минут.", "photo": null},
    {"text": "Всыпьте в кастрюлю промытый маш и картофель, порезанный на кубики, добавьте воду.", "photo": null},
    {"text": "Накройте крышкой и варите суп до готовности маша, примерно 25 минут после закипания.", "photo": null}
  ]'::jsonb,
  '[
    {"name": "Готовое белое мясо", "amount": "70 г", "kcal": 112, "protein": 22, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Тофу", "amount": "130 г", "kcal": 91, "protein": 13, "fat": 5, "carbs": 3, "fiber": 0},
    {"name": "Эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  true,
  400,
  true,
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
  is_soup = EXCLUDED.is_soup,
  portion_grams = EXCLUDED.portion_grams,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('mung-bean-soup', 'mains')
ON CONFLICT DO NOTHING;
