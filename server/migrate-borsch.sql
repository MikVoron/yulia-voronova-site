-- Рецепт: Борщ с красной фасолью
-- Применить на VPS: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-borsch.sql
--
-- Формат ingredients: {name, swap} — name содержит граммовку/количество,
-- swap — текст альтернативы (null если замены нет). Это общий формат БД,
-- совместимый с рендером в platform/recipe.html (см. ing.name / ing.swap).
--
-- Формат step.photo: string | string[] | true | null (см. CLAUDE.md, раздел «Рецепты»).

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_carbs,
  portion_grams, is_published, sort_order
) VALUES (
  'borscht-red-beans',
  'mains',
  'Борщ с красной фасолью',
  '🥣',
  45,
  'medium',
  10,
  false,
  123, 6, 2, 23, 6,
  ARRAY['без глютена', 'растительное', 'без сои', 'бобовые'],
  'images/recipes/borscht-red-beans/borsch-cover.webp',
  'Фасоль в борщ можно положить целой. Моему сыну так не нравится, поэтому я её пюрирую. Люблю варить борщ на овощном бульоне и добавлять белок порционно — белое мясо, если едите, или тофу. Вкусно с цельнозерновым хлебом, намазанным хумусом.',
  '[
    {"name": "Вода — 3 л", "swap": null},
    {"name": "Картофель — 2 средние", "swap": null},
    {"name": "Белокочанная капуста — 800 г", "swap": null},
    {"name": "Красная фасоль — 350 г (отварная или консервированная)", "swap": null},
    {"name": "Свёкла — 3 средние (запечённая или отварная)", "swap": null},
    {"name": "Лук — 1 крупный", "swap": null},
    {"name": "Морковь — 2 средние", "swap": null},
    {"name": "Сельдерей — 2 стебля", "swap": null},
    {"name": "Оливковое масло — 1 ст. л.", "swap": null},
    {"name": "Томатная паста — 2 ст. л.", "swap": "Томаты в собственном соку — 200 г"},
    {"name": "Паприка — 1 ч. л.", "swap": null},
    {"name": "Кориандр — 1/2 ч. л.", "swap": null},
    {"name": "Лавровый лист — 2 шт.", "swap": null},
    {"name": "Чеснок — 2 зубчика", "swap": null},
    {"name": "Лимонный сок — 1 ст. л.", "swap": null},
    {"name": "Укроп — 25 г", "swap": "Петрушка"},
    {"name": "Соль — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Лук мелко нарежьте, сельдерей и картофель нарежьте кубиками, морковь натрите, зелень порубите."},
    {"text": "В кипящую воду добавьте картофель, капусту и лавровый лист.", "photo": "images/recipes/borscht-red-beans/borsch-2.webp"},
    {"text": "Добавьте овощной концентрат (можно без него) и варите 10 минут."},
    {"text": "На сковороде разогрейте масло. Обжарьте лук 1 минуту.", "photo": "images/recipes/borscht-red-beans/borsch-4.webp"},
    {"text": "Добавьте морковь и сельдерей, готовьте ещё 5 минут.", "photo": "images/recipes/borscht-red-beans/borsch-5.webp"},
    {"text": "Добавьте половину зелени и специи, перемешайте.", "photo": "images/recipes/borscht-red-beans/borsch-6.webp"},
    {"text": "Добавьте томатную пасту, перемешайте."},
    {"text": "Переложите зажарку в кастрюлю, варите 10 минут.", "photo": "images/recipes/borscht-red-beans/borsch-8.webp"},
    {"text": "Свёклу натрите и добавьте в суп.", "photo": "images/recipes/borscht-red-beans/borsch-9.webp"},
    {"text": "Добавьте чеснок и лимонный сок.", "photo": ["images/recipes/borscht-red-beans/borsch-10.1.webp", "images/recipes/borscht-red-beans/borsch-10.2.webp"]},
    {"text": "Фасоль пробейте блендером с 1–2 половниками бульона.", "photo": "images/recipes/borscht-red-beans/borsch-11.webp"},
    {"text": "Добавьте фасоль в суп, перемешайте.", "photo": "images/recipes/borscht-red-beans/borsch-12.webp"},
    {"text": "Добавьте оставшуюся зелень.", "photo": "images/recipes/borscht-red-beans/borsch-13.webp"},
    {"text": "Попробуйте и посолите."}
  ]'::jsonb,
  '[
    {"name": "Белое мясо", "amount": "50 г", "kcal": 80, "protein": 16, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Твердый тофу", "amount": "100 г", "kcal": 78, "protein": 9, "fat": 5, "carbs": 2, "fiber": 1},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5},
    {"name": "Хумус", "amount": "40 г", "kcal": 75, "protein": 3, "fat": 3, "carbs": 10, "fiber": 3, "recipeId": "hummus"},
    {"name": "Хумус со свёклой", "amount": "40 г", "kcal": 52, "protein": 2, "fat": 2, "carbs": 8, "fiber": 2, "recipeId": "beetroot-hummus"}
  ]'::jsonb,
  '[]'::jsonb,  -- add_carbs пуст: хлеб + сухарики прилетают автоматом через флаг is_soup (см. migrate-is-soup-flag.sql)
  400,
  false,
  1
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat,
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min,
  difficulty = EXCLUDED.difficulty,
  servings = EXCLUDED.servings,
  is_free = EXCLUDED.is_free,
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
  add_carbs = EXCLUDED.add_carbs,
  portion_grams = EXCLUDED.portion_grams,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('borscht-red-beans', 'mains')
ON CONFLICT DO NOTHING;
