-- Рецепт: Котлеты из трески и цветной капусты
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-cutlets-cod-cauliflower.sql
--
-- strict / No Guessing. См. docs/ai-recipe-input-contract.md
-- TODO:
--   • фото пока нет — папка images/recipes/cutlets-cod-cauliflower/ отсутствует, photo=NULL.
--     Обложка будет: images/recipes/cutlets-cod-cauliflower/cutlets-cod-cauliflower-cover.webp
--   • sort_order=0 — назначить вручную при публикации.
--   • emoji=NULL по правилу проекта.
--   • main_ingredients не задан: «треска» в исходнике не помечена как главный ингредиент
--     и слага для трески нет в platform/ingredients.js (есть только salmon, tuna).
--
-- КБЖУ (на 1 котлету) обновлены пользователем до целых: 64 / 11 / 1 / 3 / 1.
-- auto_addons на уровне рецепта НЕ задаём — для категории cutlets слоты
--   «Углеводы←sides» и «Клетчатка←salads» приходят системным правилом категории.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'cutlets-cod-cauliflower',
  'cutlets',
  'Котлеты из трески и цветной капусты',
  NULL,
  35,
  NULL,
  'easy',
  10,
  false,
  64, 11, 1, 3, 1,
  ARRAY['рыбное', 'без глютена'],
  NULL,
  'Лёгкие и нежные котлеты с мягким вкусом. Треска даёт хороший белок, а цветная капуста делает текстуру сочнее и добавляет овощей в рацион. Нравятся детям — мягкие, без выраженного рыбного вкуса. Овсяную муку можно сделать самим — просто измельчить овсяные хлопья в том же количестве.',
  '[
    {"name": "Треска (филе): 500 г", "swap": null},
    {"name": "Цветная капуста: 250 г", "swap": null},
    {"name": "Репчатый лук: 1 небольшой", "swap": null},
    {"name": "Овсяная мука: 25 г", "swap": null},
    {"name": "Соль: 1 ч. л.", "swap": null},
    {"name": "Петрушка: 20 г", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Разберите цветную капусту на соцветия. Отварите в кипящей воде 3 минуты, затем откиньте на дуршлаг, полностью остудите и хорошо отожмите."},
    {"text": "Измельчите треску, цветную капусту и лук."},
    {"text": "Добавьте овсяную муку, мелко порезанную зелень и соль. Перемешайте."},
    {"text": "Оставьте массу на 10 минут, чтобы овсяная мука впитала лишнюю влагу."},
    {"text": "Сформируйте котлеты, выложите на противень с бумагой для выпечки и запекайте при 180 градусах 20–25 минут."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  80,
  false,
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
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('cutlets-cod-cauliflower', 'cutlets')
ON CONFLICT DO NOTHING;
