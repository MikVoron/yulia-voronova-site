-- Рецепт: Суп из чечевицы с булгуром
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-soup-red-lentil-bulgur.sql
--
-- TODO:
--   • фото пока нет — папка images/recipes/soup-red-lentil-bulgur/ отсутствует, photo=null
--   • sort_order=0 — назначить вручную при публикации

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order, is_soup
) VALUES (
  'soup-red-lentil-bulgur',
  'mains',
  'Суп из чечевицы с булгуром',
  NULL,
  40,
  NULL,
  'medium',
  8,
  false,
  184, 10, 2, 33, 6,
  ARRAY['растительное', 'без сои', 'бобовые'],
  NULL,
  'Суп уже сам по себе получается сытным и с хорошей порцией белка. Но если вам нужно более плотное и еще более белковое решение, можно добавить к нему что-то из белковой группы.',
  '[
    {"name": "Красная чечевица — 250 г", "swap": null},
    {"name": "Булгур мелкий/средний — 70 г", "swap": null},
    {"name": "Лук — 1 шт.", "swap": null},
    {"name": "Морковь — 1 шт.", "swap": null},
    {"name": "Картофель — 1 шт.", "swap": null},
    {"name": "Чеснок — 3 зубчика", "swap": null},
    {"name": "Томатная паста — 1 ст. л.", "swap": null},
    {"name": "Оливковое масло — 1 ст. л.", "swap": null},
    {"name": "Паприка сладкая молотая — 1 ч. л.", "swap": null},
    {"name": "Куркума — 1/2 ч. л.", "swap": null},
    {"name": "Кориандр молотый — 1/2 ч. л.", "swap": null},
    {"name": "Соль — по вкусу", "swap": null},
    {"name": "[Овощной концентрат](veggie-concentrate) — 5 ч. л.", "swap": "Можно без него"},
    {"name": "Вода — 2,5 л", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Мелко нарежьте лук, морковь и чеснок. Морковь можно натереть на мелкой стороне терки."},
    {"text": "Обжарьте лук на растительном масле 1 минуту."},
    {"text": "Добавьте морковь и тушите около 3 минут."},
    {"text": "Добавьте чеснок и специи, перемешайте."},
    {"text": "Затем добавьте томатную пасту и снова перемешайте."},
    {"text": "Засыпьте промытую чечевицу, булгур и картофель, порезанный на кубики. Залейте водой, добавьте овощной концентрат (можно без него)."},
    {"text": "После закипания варите суп до готовности булгура и чечевицы около 25 минут. В конце посолите по вкусу."}
  ]'::jsonb,
  '[
    {"name": "Белое мясо", "amount": "50 г", "kcal": 80, "protein": 16, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Твёрдый тофу", "amount": "100 г", "kcal": 78, "protein": 9, "fat": 5, "carbs": 2, "fiber": 1},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  400,
  false,
  0,
  true
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
  is_soup = EXCLUDED.is_soup,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('soup-red-lentil-bulgur', 'mains')
ON CONFLICT DO NOTHING;
