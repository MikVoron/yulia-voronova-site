-- Рецепт: Гречка с киноа (гарнир)
-- Новый рецепт, ТЗ от 2026-04-25 (пользователь). Категория sides (отдельный гарнир,
-- не путать с buckwheat-quinoa-soup в mains — это разные рецепты).
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-side-buckwheat-quinoa.sql

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'side-buckwheat-quinoa',
  'sides',
  'Гречка с киноа',
  '🌾',
  25,
  'easy',
  4,
  false,
  200, 6, 5, 31, 4,
  ARRAY['растительное', 'без сои', 'без глютена'],
  'images/recipes/side-buckwheat-quinoa/side-buckwheat-quinoa-cover.webp',
  'Киноа дополняет гречку по аминокислотному составу, делая блюдо более сбалансированным. Они хорошо сочетаются и готовятся вместе одновременно.',
  '[
    {"name": "Гречка — 150 г", "swap": null},
    {"name": "Киноа — 90 г", "swap": null},
    {"name": "Вода — 530 мл", "swap": null},
    {"name": "Соль — 0,5 ч. л. (по вкусу)", "swap": "1 ч. л. овощного концентрата"},
    {"name": "Оливковое масло — 1 ст. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Хорошо промойте киноа в дуршлаге под проточной водой 1–2 минуты. При необходимости можно ненадолго замочить, чтобы убрать горечь.", "photo": "images/recipes/side-buckwheat-quinoa/side-buckwheat-quinoa-start.webp"},
    {"text": "Промойте гречку холодной водой.", "photo": null},
    {"text": "В кастрюлю налейте воду, доведите до кипения и посолите (вместо соли можно добавить 1 ч. л. овощного концентрата).", "photo": null},
    {"text": "Всыпьте гречку и киноа, перемешайте один раз.", "photo": "images/recipes/side-buckwheat-quinoa/side-buckwheat-quinoa-4.webp"},
    {"text": "Доведите до кипения, уменьшите огонь до минимума и накройте крышкой.", "photo": null},
    {"text": "Варите 15 минут, крышку не открывайте.", "photo": null},
    {"text": "Выключите огонь и оставьте под крышкой ещё на 10 минут.", "photo": null},
    {"text": "В конце добавьте 1 ст. л. оливкового масла и аккуратно перемешайте.", "photo": "images/recipes/side-buckwheat-quinoa/side-buckwheat-quinoa-final.webp"}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  210,
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
VALUES ('side-buckwheat-quinoa', 'sides')
ON CONFLICT DO NOTHING;
