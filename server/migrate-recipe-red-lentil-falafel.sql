-- Рецепт: Фалафель из красной чечевицы (новый)
-- Источник: текст пользователя (strict / No-Guessing по docs/ai-recipe-input-contract.md).
-- Категория: cutlets (решение пользователя) → добавки приходят через category-level правило
--   котлет (Углеводы ← sides, Клетчатка ← salads). Recipe-level auto_addons НЕ задаётся:
--   требование «добавки как у котлет» выполняется самой категорией cutlets.
-- ВСЕ ручные add_* пустые ([]), чтобы не дублировать авто-добавки.
-- tags: «бобовое» нормализован → каноническое «бобовые».
-- Решения пользователя: is_published=true. portion_grams=140 (дан).
-- note='1 порция = 3 фалафеля' — сохранение подтверждено пользователем.
-- emoji=NULL, photo=NULL (не подтверждены).
-- Guard: падает, если id уже существует (без молчаливого overwrite).
-- Применить (на VPS, НЕ через pipe из PowerShell — кириллица!):
--   scp server/migrate-recipe-red-lentil-falafel.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipe-red-lentil-falafel.sql"

BEGIN;

-- Guard: не перезаписывать существующий рецепт
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM recipes WHERE id = 'red-lentil-falafel') THEN
    RAISE EXCEPTION 'Recipe red-lentil-falafel already exists — aborting (no overwrite).';
  END IF;
END $$;

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote, note,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  main_ingredients, portion_grams, is_published, sort_order
) VALUES (
  'red-lentil-falafel',
  'cutlets',
  'Фалафель из красной чечевицы',
  NULL,
  35,
  'easy',
  3,
  false,
  245, 12, 5, 34, 8,
  ARRAY['растительное', 'бобовые', 'без сои'],
  NULL,
  'Фалафель из красной чечевицы получается более нежным, чем классический вариант из нута, а ещё готовится очень быстро и без лишних сложностей. У него мягкая текстура, приятный пряный вкус и удобный формат для заворачивания в лаваш или питу.',
  '1 порция = 3 фалафеля',
  '[
    {"name": "Красная чечевица — 200 г", "swap": null},
    {"name": "Лук репчатый — 1 шт.", "swap": null},
    {"name": "Чеснок — 3 зубчика", "swap": null},
    {"name": "Петрушка свежая — 10 г", "swap": null},
    {"name": "Соль — 1 ч. л.", "swap": null},
    {"name": "Карри — 1/3 ч. л.", "swap": null},
    {"name": "Нутовая мука — 2 ст. л.", "swap": null},
    {"name": "Оливковое масло — 1 ст. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Предварительно замочите чечевицу в холодной воде на 1 час.", "photo": null},
    {"text": "Промойте чечевицу и пробейте в блендере с луком, чесноком, специями и зеленью.", "photo": null},
    {"text": "Добавьте в массу муку и хорошо перемешайте.", "photo": null},
    {"text": "Смазывайте руки оливковым маслом и формируйте небольшие шарики.", "photo": null},
    {"text": "Выложите фалафель в форму, застеленную пергаментом.", "photo": null},
    {"text": "Выпекайте при температуре 180 градусов около 25 минут.", "photo": null}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  ARRAY['red-lentils'],
  140,
  true,
  0
);

-- recipe_categories: полная пересинхронизация только для этого id
DELETE FROM recipe_categories WHERE recipe_id = 'red-lentil-falafel';
INSERT INTO recipe_categories (recipe_id, category_id) VALUES ('red-lentil-falafel', 'cutlets');

COMMIT;
