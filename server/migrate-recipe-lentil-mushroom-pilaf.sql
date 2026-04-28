-- Рецепт: Плов с чечевицей и грибами
-- Сверка с ТЗ от 2026-04-25 (пользователь): обновление КБЖУ, веса порции, тегов,
-- ингредиентов (овощной концентрат отдельной строкой), шагов, цитаты, add_fiber.
--
-- ВАЖНО: steps[].photo синхронизированы с server/migrate-recipe-photos-convention.sql
-- (start/N/final convention). Не расходиться с этим файлом по фото-путям.
-- Cover (recipes.photo) осознанно указывает на -final.webp — на диске нет -cover.webp.
--
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-pilaf-lentils-mushrooms.sql

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber, auto_addons,
  portion_grams, is_published, sort_order
) VALUES (
  'lentil-mushroom-pilaf',
  'mains',
  'Плов с чечевицей и грибами',
  '🍚',
  45,
  'medium',
  4,
  false,
  417, 16, 4, 77, 7,
  ARRAY['растительное', 'без сои', 'бобовые'],
  'images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-final.webp',
  'Не выпаривайте воду полностью. Оставьте немного жидкости, выключите огонь и дайте плову настояться под крышкой около 30 минут. За это время он впитает остатки влаги и не будет сухим.',
  '[
    {"name": "Рис басмати — 250 г", "swap": "Рис жасмин"},
    {"name": "Красная чечевица — 130 г", "swap": null},
    {"name": "Шампиньоны — 2 шт.", "swap": null},
    {"name": "Морковь — 2 шт.", "swap": null},
    {"name": "Лук — 1 шт.", "swap": null},
    {"name": "Чеснок — 2 зубчика", "swap": null},
    {"name": "Томатная паста — 2 ч. л.", "swap": null},
    {"name": "Тимьян — 1 ч. л.", "swap": null},
    {"name": "Кумин — 1/2 ч. л.", "swap": null},
    {"name": "Куркума — 1/4 ч. л.", "swap": null},
    {"name": "Вода — 900 мл", "swap": null},
    {"name": "Овощной концентрат — 1 ч. л.", "swap": "Можно без него"},
    {"name": "Соль — 1 ч. л. (по вкусу)", "swap": null},
    {"name": "Оливковое масло — 1 ст. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Лук нарежьте и обжарьте на оливковом масле 1 минуту.", "photo": null},
    {"text": "Добавьте тёртую морковь и жарьте ещё 2 минуты.", "photo": "images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-2.webp"},
    {"text": "Добавьте чеснок и специи, перемешайте.", "photo": null},
    {"text": "Добавьте грибы и готовьте 1 минуту.", "photo": "images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-4.webp"},
    {"text": "Добавьте томатную пасту, перемешайте.", "photo": null},
    {"text": "Всыпьте рис и чечевицу, перемешайте.", "photo": "images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-6.webp"},
    {"text": "Влейте воду, добавьте овощной концентрат (можно без него), посолите.", "photo": "images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-7.webp"},
    {"text": "Доведите до кипения, накройте крышкой и готовьте на слабом огне 25 минут.", "photo": null},
    {"text": "В конце попробуйте и при необходимости досолите.", "photo": null},
    {"text": "Выключите огонь и дайте настояться под крышкой 10 минут.", "photo": null}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"fiber": {"fromCategory": "salads"}}'::jsonb,
  420,
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
  auto_addons = EXCLUDED.auto_addons,
  portion_grams = EXCLUDED.portion_grams,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('lentil-mushroom-pilaf', 'mains')
ON CONFLICT DO NOTHING;
