-- Рецепт: Тост с хумусом
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-toast-hummus.sql
--
-- strict / No Guessing. См. docs/ai-recipe-input-contract.md
-- TODO:
--   • фото пока нет — папка images/recipes/toast-hummus/ отсутствует, photo=NULL.
--     Обложка будет: images/recipes/toast-hummus/toast-hummus-cover.webp
--   • sort_order=0 — назначить вручную при публикации.
--   • cat='breakfasts' — подтверждено пользователем (завтрак).
--   • servings=1 — подтверждено пользователем.
--   • emoji=NULL по правилу проекта (emoji в карточках рецептов не используем).

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, main_ingredients, sort_order
) VALUES (
  'toast-hummus',
  'breakfasts',
  'Тост с хумусом',
  NULL,
  5,
  NULL,
  'easy',
  1,
  false,
  170, 8, 3, 27, 5,
  ARRAY['растительное', 'без сои', 'бобовые'],
  NULL,
  'Разнообразьте свой завтрак новыми бутербродами: приготовьте хумус сами или используйте готовый. Нут дает белок и клетчатку, а кунжутная паста (тахини) - полезные жиры. В сочетании с цельнозерновым хлебом получится сбалансированный завтрак.',
  '[
    {"name": "Цельнозерновой хлеб: 25 г", "swap": null},
    {"name": "[Хумус](hummus): 50 г", "swap": null},
    {"name": "Зелень — по желанию", "swap": null},
    {"name": "Острый перец — по желанию", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Намажьте на хлеб хумус, украсьте сверху любимой зеленью и посыпьте острым перцем при желании."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  75,
  false,
  ARRAY['chickpeas'],
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
  main_ingredients = EXCLUDED.main_ingredients,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('toast-hummus', 'breakfasts')
ON CONFLICT DO NOTHING;
