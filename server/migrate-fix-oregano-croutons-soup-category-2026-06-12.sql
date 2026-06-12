-- Keep oregano croutons as a bread add-on after the soups category migration.
--
-- Apply on VPS:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--     < server/migrate-fix-oregano-croutons-soup-category-2026-06-12.sql

BEGIN;

UPDATE recipes
SET cat = 'breads',
    is_soup = false,
    updated_at = now()
WHERE id = 'oregano-croutons';

DELETE FROM recipe_categories
WHERE recipe_id = 'oregano-croutons'
  AND category_id = 'soups';

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('oregano-croutons', 'breads')
ON CONFLICT DO NOTHING;

COMMIT;

SELECT r.id, r.name, r.cat, r.is_soup, array_agg(rc.category_id ORDER BY rc.category_id) AS cats
FROM recipes r
LEFT JOIN recipe_categories rc ON rc.recipe_id = r.id
WHERE r.id = 'oregano-croutons'
GROUP BY r.id, r.name, r.cat, r.is_soup;
