-- Рецепт: Оливье из тофу и соуса из белой фасоли
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-salad-olivier-tofu.sql
--
-- Категория: salads. Маринад для тофу вынесен ТОЛЬКО в quote (в шагах и ингредиентах его нет — по решению автора).
-- TODO:
--   • фото пока нет — папка images/recipes/salad-olivier-tofu/ отсутствует, photo=null
--   • клетчатка на порцию не указана автором → fiber=null (не рассчитываем, не придумываем)
--   • main_ingredients содержит 'tofu' — слаг нужно завести в platform/ingredients.js (см. отдельный diff, не применён)
--   • sort_order=0 — назначить вручную при публикации

BEGIN;

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order, is_soup, main_ingredients
) VALUES (
  'salad-olivier-tofu',
  'salads',
  'Оливье из тофу и соуса из белой фасоли',
  NULL,
  25,
  NULL,
  'easy',
  6,
  false,
  276, 13, 10, 35, NULL,
  ARRAY['растительное', 'бобовые', 'без глютена'],
  NULL,
  'Копчёный тофу можно дополнительно замариновать для более яркого вкуса: нарежьте его кубиками, залейте соусом и оставьте примерно на 30 минут перед добавлением в салат. Так вкус получится более насыщенным и выразительным. Состав маринада: соевый соус или тамари — 2 ч. л., дижонская горчица — 1/2 ч. л., лимонный сок или яблочный уксус — 1/2 ч. л., копчёная паприка — 1/4 ч. л.',
  '[
    {"name": "Копчёный тофу — 200 г", "swap": null},
    {"name": "Картофель отварной или запечённый — 400 г", "swap": null},
    {"name": "Морковь отварная или запечённая — 170 г", "swap": null},
    {"name": "Зелёный горошек замороженный — 200 г", "swap": "Консервированный горошек"},
    {"name": "Солёные или маринованные огурцы — 150 г", "swap": null},
    {"name": "Авокадо — 170 г", "swap": null},
    {"name": "Соус: белая фасоль отварная — 300 г", "swap": "Консервированная белая фасоль"},
    {"name": "Соус: дижонская горчица — 2 ч. л.", "swap": null},
    {"name": "Соус: лимонный сок — 2 ст. л.", "swap": null},
    {"name": "Соус: оливковое масло — 1 ст. л.", "swap": null},
    {"name": "Соус: соль кала намак — 1 ч. л.", "swap": null},
    {"name": "Соус: вода — 3 ст. л. (до желаемой густоты)", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Порежьте на мелкие кубики тофу и овощи."},
    {"text": "Пробейте в блендере белую фасоль, горчицу, лимонный сок, оливковое масло, соль и воду до нужной консистенции."},
    {"text": "Смешайте овощи, тофу и фасолевый соус."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  250,
  true,
  0,
  false,
  ARRAY['tofu', 'white-beans']
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
  is_published = EXCLUDED.is_published,
  is_soup = EXCLUDED.is_soup,
  main_ingredients = EXCLUDED.main_ingredients,
  updated_at = now();

-- Полная синхронизация категорий: рецепт уже существует после upsert выше → FK безопасен.
DELETE FROM recipe_categories WHERE recipe_id = 'salad-olivier-tofu';
INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('salad-olivier-tofu', 'salads');

COMMIT;
