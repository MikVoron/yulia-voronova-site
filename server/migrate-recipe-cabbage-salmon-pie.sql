-- Рецепт: Пирог с капустой и сёмгой
-- Новый рецепт, ТЗ от 2026-04-26 (пользователь). Категория mains.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-cabbage-salmon-pie.sql
--
-- TODO: КБЖУ в ТЗ не указано! kcal/protein/fat/carbs/fiber = 0 (БД дефолты), нужно подтверждение.
-- TODO: фото нет — папка images/recipes/cabbage-salmon-pie/ отсутствует, photo=null.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'cabbage-salmon-pie',
  'mains',
  'Пирог с капустой и сёмгой',
  '🥧',
  75,
  '1 час 15 минут',
  'medium',
  8,
  false,
  0, 0, 0, 0, 0,
  ARRAY['рыбное', 'без сои'],
  NULL,
  'Этот пирог хорош тем, что получается одновременно сытным и лёгким по вкусу — капуста даёт сочность, рыба — мягкую насыщенность, а цельнозерновое тесто делает его более питательным. В одном кусочке пирога — баланс и вкус.',
  '[
    {"name": "Капуста — 500 г", "swap": null},
    {"name": "Сёмга — 500 г", "swap": "Любая жирная рыба — 500 г"},
    {"name": "Лук — 1 средний", "swap": null},
    {"name": "Морковь — 1 средняя", "swap": null},
    {"name": "Укроп — 20 г", "swap": null},
    {"name": "Соль — 0,5 ч. л.", "swap": null},
    {"name": "Паприка сушёная — 0,5 ч. л.", "swap": null},
    {"name": "Кориандр сушёный — 0,5 ч. л.", "swap": null},
    {"name": "Чили — на кончике ч. л. (по желанию)", "swap": null},
    {"name": "Куркума — на кончике ч. л.", "swap": null},
    {"name": "Растительное масло — 1 ч. л.", "swap": null},
    {"name": "— Тесто —", "swap": null},
    {"name": "Цельнозерновая мука — 300 г", "swap": null},
    {"name": "Разрыхлитель — 5 г", "swap": null},
    {"name": "Соль — 0,5 ч. л.", "swap": null},
    {"name": "Оливковое масло — 30 г", "swap": null},
    {"name": "Овсяное молоко — 300 мл", "swap": "Соевое молоко или вода — 300 мл"}
  ]'::jsonb,
  '[
    {"text": "Промойте сёмгу и отправьте запекаться в духовку при 200 °C на 20 минут.", "photo": null},
    {"text": "Мелко нарежьте лук, морковь натрите на мелкой тёрке, нашинкуйте достаточно мелко капусту.", "photo": null},
    {"text": "Обжарьте лук 1 минуту, добавьте морковь и специи, обжаривайте ещё 1 минуту.", "photo": null},
    {"text": "Добавьте капусту, перемешайте, посолите и тушите до готовности капусты, примерно 12–15 минут.", "photo": null},
    {"text": "Смешайте муку, разрыхлитель и соль.", "photo": null},
    {"text": "Добавьте оливковое масло и молоко, замесите достаточно жидкое тесто.", "photo": null},
    {"text": "Готовую рыбу разделайте на небольшие кусочки.", "photo": null},
    {"text": "Добавьте рыбу и укроп к капусте, перемешайте и остудите.", "photo": null},
    {"text": "Смажьте форму растительным маслом и вылейте половину теста (форма около 23 см).", "photo": null},
    {"text": "Сверху выложите всю начинку и залейте второй половиной теста.", "photo": null},
    {"text": "Запекайте в духовке при 200 °C примерно 45–50 минут до золотистой корочки.", "photo": null}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  230,
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
VALUES ('cabbage-salmon-pie', 'mains')
ON CONFLICT DO NOTHING;
