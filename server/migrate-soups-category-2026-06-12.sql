-- Separate soups from hot dishes and keep soup auto-addons behavior.
--
-- Apply on VPS:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--     < server/migrate-soups-category-2026-06-12.sql
--
-- Idempotent: repeated runs keep the same category names and recipe bindings.

BEGIN;

-- 1. Create the new category and rename the old "Основные блюда" category.
INSERT INTO categories (id, name, emoji, color, description, sort_order)
VALUES (
  'soups',
  'Супы',
  '🍲',
  '#d97706',
  'Супы, борщи, щи и бульонные блюда',
  2
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  color = EXCLUDED.color,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

UPDATE categories
SET
  name = 'Горячее',
  description = 'Сытные горячие блюда для обеда и ужина — плов, паста и другие вторые блюда',
  sort_order = 3
WHERE id = 'mains';

-- Keep the visible order stable after inserting soups near the top.
UPDATE categories SET sort_order = 1 WHERE id = 'breakfasts';
UPDATE categories SET sort_order = 4 WHERE id = 'cutlets';
UPDATE categories SET sort_order = 5 WHERE id = 'salads';
UPDATE categories SET sort_order = 6 WHERE id = 'sides';
UPDATE categories SET sort_order = 7 WHERE id = 'pancakes';
UPDATE categories SET sort_order = 8 WHERE id = 'spreads';
UPDATE categories SET sort_order = 9 WHERE id = 'sauces';
UPDATE categories SET sort_order = 10 WHERE id = 'bases';
UPDATE categories SET sort_order = 11 WHERE id = 'breads';
UPDATE categories SET sort_order = 12 WHERE id = 'drinks';

-- 2. Detect all current soups. is_soup is the existing project marker, while
--    id/name matching catches old or manually inserted soup records.
CREATE TEMP TABLE _soups_to_move AS
SELECT id
FROM recipes
WHERE is_soup = true
   OR id LIKE 'soup-%'
   OR id LIKE '%-soup'
   OR id LIKE '%-soup-%'
   OR name ILIKE '%суп%'
   OR name ILIKE '%борщ%'
   OR name ILIKE '%щи%'
   OR name ILIKE '%уха%'
   OR name ILIKE '%рассольник%';

-- 3. Make soups the primary category. Keep is_soup=true as legacy metadata for
--    old clients and compatibility checks; new UI no longer requires admins to
--    set it manually.
UPDATE recipes
SET cat = 'soups',
    is_soup = true,
    updated_at = now()
WHERE id IN (SELECT id FROM _soups_to_move);

DELETE FROM recipe_categories
WHERE category_id = 'mains'
  AND recipe_id IN (SELECT id FROM _soups_to_move);

INSERT INTO recipe_categories (recipe_id, category_id)
SELECT id, 'soups' FROM _soups_to_move
ON CONFLICT DO NOTHING;

COMMIT;

-- Verification
SELECT 'CATEGORIES AFTER:' AS info;
SELECT id, name, sort_order FROM categories ORDER BY sort_order;

SELECT 'SOUPS AFTER:' AS info;
SELECT r.id, r.name, r.cat, r.is_soup, array_agg(rc.category_id ORDER BY rc.category_id) AS cats
FROM recipes r
LEFT JOIN recipe_categories rc ON rc.recipe_id = r.id
WHERE r.id IN (SELECT id FROM _soups_to_move)
GROUP BY r.id, r.name, r.cat, r.is_soup
ORDER BY r.name;
