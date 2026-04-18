-- Рецепт: Суп из зелёной чечевицы с пшеном

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, portion_grams,
  tags, photo, quote,
  ingredients, steps,
  add_protein, add_carbs,
  is_published, sort_order
) VALUES (
  'soup-green-lentil-milletsoup',
  'mains',
  'Суп из зелёной чечевицы с пшеном',
  '🍲',
  48, 'medium', 8, false,
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
    {"name": "Лавровый лист — 1–2 шт.", "swap": null},
    {"name": "Чёрный перец — по вкусу", "swap": null},
    {"name": "Растительное масло — немного для обжарки", "swap": null},
    {"name": "Вода — 2,5 л", "swap": null},
    {"name": "Овощной концентрат — 5 ч. л.", "swap": "можно без него"},
    {"name": "Соль — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    "Нарежьте лук, морковь и сельдерей.",
    {"text": "Обжарьте лук 1 минуту, добавьте специи и перемешайте.", "photo": "images/recipes/soup-green-lentil-milletsoup/soup-green-lentil-milletsoup-2.webp"},
    {"text": "Добавьте морковь и сельдерей, потушите около 5–7 минут.", "photo": "images/recipes/soup-green-lentil-milletsoup/soup-green-lentil-milletsoup-3.webp"},
    {"text": "Влейте 2,5 литра воды и доведите до кипения.", "photo": "images/recipes/soup-green-lentil-milletsoup/soup-green-lentil-milletsoup-4.webp"},
    {"text": "Добавьте овощной концентрат (можно без него).", "photo": "images/recipes/soup-green-lentil-milletsoup/soup-green-lentil-milletsoup-5.webp"},
    "Добавьте промытую зелёную чечевицу и варите 15 минут.",
    {"text": "Добавьте картофель и промытое пшено. Варите ещё 15–20 минут.", "photo": "images/recipes/soup-green-lentil-milletsoup/soup-green-lentil-milletsoup-7.webp"},
    {"text": "Добавьте чеснок и лавровый лист. Варите 5 минут и дайте настояться 10–15 минут.", "photo": "images/recipes/soup-green-lentil-milletsoup/soup-green-lentil-milletsoup-final.webp"}
  ]'::jsonb,
  '[
    {"name": "Белое мясо — 50 г", "kcal": 60, "protein": 12, "fat": 0, "carbs": 0, "fiber": 0},
    {"name": "Тофу — 100 г", "kcal": 70, "protein": 10, "fat": 0, "carbs": 0, "fiber": 0},
    {"name": "Хумус — 40 г", "kcal": 80, "protein": 3.2, "fat": 4.8, "carbs": 6, "fiber": 2, "recipeId": "hummus"},
    {"name": "Свекольный хумус — 40 г", "kcal": 60, "protein": 2.8, "fat": 2.8, "carbs": 7.2, "fiber": 2.4, "recipeId": "beetroot-hummus"}
  ]'::jsonb,
  '[
    {"name": "Цельнозерновой хлеб — 1 ломтик", "kcal": 70, "protein": 3, "fat": 0, "carbs": 15, "fiber": 3}
  ]'::jsonb,
  true, 0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('soup-green-lentil-milletsoup', 'mains')
ON CONFLICT DO NOTHING;
