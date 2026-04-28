-- Переименовать recipe id: soup-green-lentil-milletsoup -> green-lentil-millet-soup
--
-- Что меняет:
--   • recipes.id (PK)
--   • recipes.photo + recipes.steps — пути к файлам
--   • recipe_categories.recipe_id (FK ON DELETE CASCADE: удаляем + вставляем)
--   • user_favorites.recipe_id (TEXT без FK, UPDATE для консистентности данных)
--
-- Применить:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--     < server/migrate-recipe-green-lentil-millet-soup-rename.sql
--
-- Предварительно: доставить файлы images/recipes/green-lentil-millet-soup/ на VPS
-- и убедиться, что старая папка soup-green-lentil-milletsoup/ удалена.
-- Картинки уже в main на GitHub — тянутся при деплое фронтенда.

BEGIN;

-- 1. Снять FK (recipe_categories → recipes)
DELETE FROM recipe_categories WHERE recipe_id = 'soup-green-lentil-milletsoup';

-- 2. Переименовать PK и обновить photo + steps
UPDATE recipes
SET
  id     = 'green-lentil-millet-soup',
  photo  = 'images/recipes/green-lentil-millet-soup/green-lentil-millet-soup-cover.webp',
  steps  = '[
    {"text": "Предварительно замочите зелёную чечевицу на ночь или от 3 часов."},
    {"text": "Нарежьте лук, морковь и сельдерей на мелкие кубики. Мелко порежьте чеснок.", "photo": null},
    {"text": "Обжарьте лук около 1 минуты. Добавьте чеснок, специи и перемешайте.", "photo": "images/recipes/green-lentil-millet-soup/green-lentil-millet-soup-3.webp"},
    {"text": "Добавьте морковь и сельдерей. Обжарьте овощи в течение 7 минут.", "photo": "images/recipes/green-lentil-millet-soup/green-lentil-millet-soup-4.webp"},
    {"text": "Всыпьте промытую чечевицу, залейте водой и доведите до кипения.", "photo": "images/recipes/green-lentil-millet-soup/green-lentil-millet-soup-5.webp"},
    {"text": "Добавьте овощной концентрат (можно без него) и варите около 15 минут.", "photo": "images/recipes/green-lentil-millet-soup/green-lentil-millet-soup-6.webp"},
    {"text": "Добавьте картофель и промытое пшено. Варите ещё около 15 минут до готовности пшена.", "photo": "images/recipes/green-lentil-millet-soup/green-lentil-millet-soup-7.webp"},
    {"text": "Добавьте чеснок и лавровый лист. Поварите 1 минуту.", "photo": null}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'soup-green-lentil-milletsoup';

-- 3. Восстановить FK
INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('green-lentil-millet-soup', 'mains')
ON CONFLICT DO NOTHING;

-- 4. Пользовательские данные (нет FK, но обновляем для консистентности)
UPDATE user_favorites
SET recipe_id = 'green-lentil-millet-soup'
WHERE recipe_id = 'soup-green-lentil-milletsoup';

COMMIT;
