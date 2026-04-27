-- Рецепт: Суп из зелёной чечевицы с пшеном
-- Идемпотентно: точечный INSERT по id, на конфликте — детерминированный UPDATE тех же полей.
-- Повторный запуск даёт тот же итог (без задвоения шагов/ингредиентов, не трогает другие рецепты).

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, portion_grams,
  tags, photo, quote,
  ingredients, steps,
  add_protein, add_carbs,
  is_published, sort_order, is_soup
) VALUES (
  'soup-green-lentil-milletsoup',
  'mains',
  'Суп из зелёной чечевицы с пшеном',
  '🍲',
  45, '45–50 минут', 'medium', 8, false,
  235, 11, 4.5, 37, 8, 400,
  ARRAY['растительный', 'без сои', 'бобовые'],
  'images/recipes/soup-green-lentil-milletsoup/soup-green-lentil-milletsoup-cover.webp',
  'Чтобы суп получился ароматным и насыщенным, дайте ему настояться после выключения огня — так чечевица и пшено лучше раскрывают вкус.',
  '[
    {"name": "Зелёная чечевица (сухая) — 200 г", "swap": null},
    {"name": "Пшено (сухое) — 70 г", "swap": null},
    {"name": "Лук — 1 шт.", "swap": null},
    {"name": "Морковь — 1–2 шт.", "swap": null},
    {"name": "Картофель — 2 средних (≈250 г)", "swap": null},
    {"name": "Сельдерей — 1–2 стебля (по желанию)", "swap": null},
    {"name": "Чеснок — 2 зубчика", "swap": null},
    {"name": "Паприка — 1 ч. л.", "swap": null},
    {"name": "Кориандр — 1 ч. л.", "swap": null},
    {"name": "Тимьян — 1 ч. л.", "swap": null},
    {"name": "Лавровый лист — 1 шт.", "swap": null},
    {"name": "Чёрный перец — по вкусу", "swap": null},
    {"name": "Растительное масло — 1 ст. л.", "swap": null},
    {"name": "Вода — 2,5 л", "swap": null},
    {"name": "Овощной концентрат — 5 ч. л.", "swap": "Можно без него"},
    {"name": "Соль — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Предварительно замочите зелёную чечевицу на ночь или от 3 часов."},
    {"text": "Нарежьте лук, морковь и сельдерей на мелкие кубики. Мелко порежьте чеснок.", "photo": "images/recipes/soup-green-lentil-milletsoup/soup-green-lentil-milletsoup-start.webp"},
    {"text": "Обжарьте лук около 1 минуты. Добавьте чеснок, специи и перемешайте.", "photo": "images/recipes/soup-green-lentil-milletsoup/soup-green-lentil-milletsoup-2.webp"},
    {"text": "Добавьте морковь и сельдерей. Обжарьте овощи в течение 7 минут.", "photo": "images/recipes/soup-green-lentil-milletsoup/soup-green-lentil-milletsoup-3.webp"},
    {"text": "Всыпьте промытую чечевицу, залейте водой и доведите до кипения.", "photo": "images/recipes/soup-green-lentil-milletsoup/soup-green-lentil-milletsoup-4.webp"},
    {"text": "Добавьте овощной концентрат (можно без него) и варите около 15 минут.", "photo": "images/recipes/soup-green-lentil-milletsoup/soup-green-lentil-milletsoup-5.webp"},
    {"text": "Добавьте картофель и промытое пшено. Варите ещё около 15 минут до готовности пшена.", "photo": "images/recipes/soup-green-lentil-milletsoup/soup-green-lentil-milletsoup-7.webp"},
    {"text": "Добавьте чеснок и лавровый лист. Поварите 1 минуту.", "photo": null}
  ]'::jsonb,
  '[
    {"name": "Белое мясо — 50 г", "kcal": 80, "protein": 16, "fat": 2, "carbs": 0, "fiber": 0},
    {"name": "Тофу — 100 г", "kcal": 70, "protein": 10, "fat": 4, "carbs": 2, "fiber": 0},
    {"name": "Соевые бобы эдамаме — 100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5},
    {"name": "Хумус — 40 г", "kcal": 80, "protein": 3.2, "fat": 4.8, "carbs": 6, "fiber": 2, "recipeId": "hummus"},
    {"name": "Свекольный хумус — 40 г", "kcal": 60, "protein": 2.8, "fat": 2.8, "carbs": 7.2, "fiber": 2.4, "recipeId": "beetroot-hummus"}
  ]'::jsonb,
  '[
    {"name": "Цельнозерновой хлеб — 1 ломтик", "kcal": 70, "protein": 3, "fat": 0, "carbs": 15, "fiber": 3}
  ]'::jsonb,
  true, 0, true
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat,
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min,
  time_label = EXCLUDED.time_label,
  difficulty = EXCLUDED.difficulty,
  servings = EXCLUDED.servings,
  is_free = EXCLUDED.is_free,
  kcal = EXCLUDED.kcal,
  protein = EXCLUDED.protein,
  fat = EXCLUDED.fat,
  carbs = EXCLUDED.carbs,
  fiber = EXCLUDED.fiber,
  portion_grams = EXCLUDED.portion_grams,
  tags = EXCLUDED.tags,
  photo = EXCLUDED.photo,
  quote = EXCLUDED.quote,
  ingredients = EXCLUDED.ingredients,
  steps = EXCLUDED.steps,
  add_protein = EXCLUDED.add_protein,
  add_carbs = EXCLUDED.add_carbs,
  is_published = EXCLUDED.is_published,
  sort_order = EXCLUDED.sort_order,
  is_soup = EXCLUDED.is_soup,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('soup-green-lentil-milletsoup', 'mains')
ON CONFLICT DO NOTHING;
