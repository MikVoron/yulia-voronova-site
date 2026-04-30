-- Новая категория «Соусы» (sauces) + перенос 4 рецептов из «Намазки» (spreads).
--
-- Применить на VPS:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--     < server/migrate-sauces-category.sql
--
-- Идемпотентна: повторный запуск даёт тот же результат.

BEGIN;

-- 1. Создать категорию sauces (если ещё нет)
INSERT INTO categories (id, name, emoji, color, description, sort_order)
VALUES (
  'sauces',
  'Соусы',
  '🍶',
  '#d4a574',
  'Кремовые соусы и заправки — из кешью, бобовых и запечённых овощей',
  5
)
ON CONFLICT (id) DO NOTHING;

-- 2. Сдвинуть sort_order последующих категорий, чтобы соусы встали сразу после намазок.
--    UPDATE по id идемпотентен — повторный запуск выставит те же значения.
UPDATE categories SET sort_order = 6 WHERE id = 'salads';
UPDATE categories SET sort_order = 7 WHERE id = 'drinks';
UPDATE categories SET sort_order = 8 WHERE id = 'bases';
UPDATE categories SET sort_order = 9 WHERE id = 'breads';

-- 2b. Обновить описание spreads — больше не содержит соусов.
UPDATE categories
SET description = 'Хумус и паштеты — для бутербродов и перекусов'
WHERE id = 'spreads';

-- 3. Перенести 4 рецепта-соуса: primary cat = 'sauces'
UPDATE recipes
SET cat = 'sauces'
WHERE id IN (
  'cashew-sauce',       -- Соус из кешью
  'caesar-sauce',       -- Соус «а-ля Цезарь»
  'white-bean-sauce',   -- Соус из белой фасоли
  'roasted-veg-sauce'   -- Соус из запечённых овощей
);

-- 4. Удалить старую привязку этих рецептов к spreads (m2m таблица)
DELETE FROM recipe_categories
WHERE category_id = 'spreads'
  AND recipe_id IN (
    'cashew-sauce',
    'caesar-sauce',
    'white-bean-sauce',
    'roasted-veg-sauce'
  );

-- 5. Добавить новую привязку к sauces
INSERT INTO recipe_categories (recipe_id, category_id) VALUES
  ('cashew-sauce',      'sauces'),
  ('caesar-sauce',      'sauces'),
  ('white-bean-sauce',  'sauces'),
  ('roasted-veg-sauce', 'sauces')
ON CONFLICT DO NOTHING;

COMMIT;

-- Проверка
SELECT 'CATEGORIES AFTER:' AS info;
SELECT id, name, emoji, color, sort_order FROM categories ORDER BY sort_order;

SELECT 'SAUCES AFTER:' AS info;
SELECT r.id, r.name, r.cat, array_agg(rc.category_id ORDER BY rc.category_id) AS cats
FROM recipes r
LEFT JOIN recipe_categories rc ON rc.recipe_id = r.id
WHERE r.id IN ('cashew-sauce', 'caesar-sauce', 'white-bean-sauce', 'roasted-veg-sauce')
GROUP BY r.id, r.name, r.cat
ORDER BY r.name;

SELECT 'SPREADS AFTER:' AS info;
SELECT r.id, r.name, r.cat
FROM recipes r
WHERE r.cat = 'spreads' OR r.id IN (SELECT recipe_id FROM recipe_categories WHERE category_id = 'spreads')
ORDER BY r.name;
