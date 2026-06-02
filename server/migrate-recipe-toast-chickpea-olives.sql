-- Рецепт: Тост с нутом, оливками и овощами
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-toast-chickpea-olives.sql
--
-- strict / No Guessing. См. docs/ai-recipe-input-contract.md
-- TODO:
--   • фото пока нет — папка images/recipes/toast-chickpea-olives/ отсутствует, photo=NULL.
--     Обложка будет: images/recipes/toast-chickpea-olives/toast-chickpea-olives-cover.webp
--   • sort_order=0 — назначить вручную при публикации.
--   • cat='breakfasts' — выведено косвенно из цитаты («завтрак или лёгкий перекус»); подтвердить.
--   • emoji=NULL по правилу проекта.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, main_ingredients, sort_order
) VALUES (
  'toast-chickpea-olives',
  'breakfasts',
  'Тост с нутом, оливками и овощами',
  NULL,
  15,
  NULL,
  'easy',
  4,
  false,
  155, 6, 4, 23, 4,
  ARRAY['растительное', 'без сои', 'бобовые'],
  NULL,
  'Этот тост — отличный способ разнообразить рацион вкусной начинкой с ярким сочетанием вкусов: нежный нут, соленые оливки и каперсы, свежесть томата и зелени. Богатый состав даёт белок, клетчатку, витамины и полезные жиры — сытный и полезный завтрак или лёгкий перекус.',
  '[
    {"name": "Цельнозерновой хлеб: 50 г", "swap": null},
    {"name": "Нут отварной: 150 г", "swap": null},
    {"name": "Микс зелени: 40 г", "swap": null},
    {"name": "Оливки без косточек: 40 г", "swap": null},
    {"name": "Халапеньо маринованный: 10 г", "swap": null},
    {"name": "Каперсы соленые: 5 г", "swap": null},
    {"name": "Томат средний: 1 шт (~100 г)", "swap": null},
    {"name": "[Хумус](hummus): 3 ст. л. (~45 г)", "swap": null},
    {"name": "Соль: 1/2 ч. л.", "swap": null},
    {"name": "Сок лимона: 1 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Томат нарежьте четвертинками, оливки разрежьте пополам."},
    {"text": "Мелко порубите всё вместе ножом до однородной массы с небольшой текстурой."},
    {"text": "Добавьте хумус, соль и лимонный сок, хорошо перемешайте."},
    {"text": "Густо намажьте на цельнозерновой хлеб."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  135,
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
VALUES ('toast-chickpea-olives', 'breakfasts')
ON CONFLICT DO NOTHING;
