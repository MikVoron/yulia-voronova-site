-- Рецепт: Тост с тунцом и авокадо
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-toast-tuna-avocado.sql
--
-- strict / No Guessing. См. docs/ai-recipe-input-contract.md
-- TODO:
--   • фото пока нет — папка images/recipes/toast-tuna-avocado/ отсутствует, photo=NULL.
--     Обложка будет: images/recipes/toast-tuna-avocado/toast-tuna-avocado-cover.webp
--   • sort_order=0 — назначить вручную при публикации.
--   • cat='breakfasts' — подтверждено пользователем (завтрак).
--   • emoji=NULL по правилу проекта.
--   • Хлеб исправлен на 200 г (50 г × 4 порции) по указанию пользователя —
--     все ингредиенты теперь на 4 порции.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, main_ingredients, sort_order
) VALUES (
  'toast-tuna-avocado',
  'breakfasts',
  'Тост с тунцом и авокадо',
  NULL,
  15,
  NULL,
  'easy',
  4,
  false,
  240, 18, 12, 18, 5,
  ARRAY['рыбное', 'без сои'],
  NULL,
  'Этот тост — удачное сочетание сочности, свежести и насыщенного вкуса. Тунец дает белок, авокадо — полезные жиры, а овощи и цельнозерновой хлеб добавляют клетчатку и медленные углеводы. Получается сытный, яркий и очень вкусный тост.',
  '[
    {"name": "Цельнозерновой хлеб: 200 г", "swap": null},
    {"name": "Авокадо: 1 шт", "swap": null},
    {"name": "Тунец консервированный в собственном соку: 150 г (1 банка)", "swap": null},
    {"name": "Томат маленький: 1 шт", "swap": null},
    {"name": "Красный сладкий лук: 1 маленький", "swap": null},
    {"name": "Халапеньо маринованный: 10 г", "swap": "Можно без него"},
    {"name": "Листья салата: 30 г", "swap": null},
    {"name": "Соль: 1/3 ч. л.", "swap": null},
    {"name": "Сок лимона: 1 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Разомните мякоть авокадо вилкой."},
    {"text": "Томат нарежьте маленькими кубиками."},
    {"text": "Добавьте к авокадо томат, соль и сок лимона, перемешайте."},
    {"text": "Выложите на цельнозерновой хлеб листья салата и смесь авокадо с томатом."},
    {"text": "Сверху добавьте колечки красного лука и халапеньо."},
    {"text": "Слейте жидкость из тунца, при необходимости слегка разомните его вилкой и выложите сверху тоста."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  155,
  false,
  ARRAY['tuna'],
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
VALUES ('toast-tuna-avocado', 'breakfasts')
ON CONFLICT DO NOTHING;
