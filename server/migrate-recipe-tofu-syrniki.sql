-- Рецепт: Сырники из тофу
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-tofu-syrniki.sql
--
-- strict / No Guessing. См. docs/ai-recipe-input-contract.md
-- НОВАЯ карточка: в проде рецепта сырников не было (проверено 2026-06-02 — id tofu-syrniki
--   отсутствовал, упоминания в guide-plant-based.html / docs — это карточка гайда, не рецепт).
-- TODO:
--   • фото пока нет — папка images/recipes/tofu-syrniki/ отсутствует, photo=NULL.
--     Обложка будет: images/recipes/tofu-syrniki/tofu-syrniki-cover.webp
--   • sort_order=0 — назначить вручную при публикации.
--   • cat='breakfasts' — выбрано пользователем.
--   • emoji=NULL по правилу проекта.
--   • fiber=2 — в тексте было 2.3 г, округлено до 2 по решению пользователя
--     (колонки КБЖУ в БД — integer, см. migrate-recipe-bean-meatballs.sql).

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, main_ingredients, sort_order
) VALUES (
  'tofu-syrniki',
  'breakfasts',
  'Сырники из тофу',
  NULL,
  20,
  NULL,
  'easy',
  8,
  false,
  120, 11, 6, 11, 2,
  ARRAY['растительное', 'бобовые'],
  NULL,
  'Соевые продукты, такие как тофу, отличный источник полноценного растительного белка со всеми незаменимыми аминокислотами. Эти сырники не разваливаются при жарке, очень просты в приготовлении и получаются невероятно вкусными и нежными. Отличный способ разнообразить рацион растительными продуктами!',
  '[
    {"name": "Тофу: 500 г", "swap": null},
    {"name": "Сок лимона: 1 ст. л.", "swap": null},
    {"name": "Цедра: 1/2 лимона", "swap": null},
    {"name": "Мука цельнозерновая: 3 ст. л.", "swap": "Безглютеновая мука"},
    {"name": "Мёд: 1 ч. л.", "swap": "Можно без него или заменить на любой подсластитель по вкусу"},
    {"name": "Банан спелый: 1 шт", "swap": null},
    {"name": "Изюм: 2 ст. л.", "swap": null},
    {"name": "Растительное масло для жарки: 1 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Залейте изюм горячей водой на 10 минут для мягкости (необязательно)."},
    {"text": "Разомните тофу и банан вилкой или воспользуйтесь блендером до однородности."},
    {"text": "Добавьте муку и хорошо перемешайте."},
    {"text": "Добавьте цедру, сок лимона, мёд, изюм (его можно порезать мельче) и перемешайте."},
    {"text": "Сформируйте сырники и обжарьте до румяной корочки с двух сторон на растительном масле."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  80,
  false,
  ARRAY['tofu'],
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
VALUES ('tofu-syrniki', 'breakfasts')
ON CONFLICT DO NOTHING;
