-- Publish requested recipes and remove legacy category-guide cover.
-- Apply:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-publish-requested-recipes-2026-06-12.sql

BEGIN;

UPDATE recipes
SET
  is_published = true,
  access_level = COALESCE(access_level, 'trial'),
  updated_at = now()
WHERE id = 'side-potato-zucchini';

UPDATE recipes
SET
  photo = NULL,
  img_position = NULL,
  updated_at = now()
WHERE id = 'chickpea-noodle-soup';

COMMIT;

SELECT id, name, cat, is_published, access_level, photo, sort_order
FROM recipes
WHERE id IN (
  'side-potato-zucchini',
  'salad-caesar-chickpea-cashew',
  'chickpea-noodle-soup',
  'soup-red-lentil-bulgur'
)
ORDER BY id;
