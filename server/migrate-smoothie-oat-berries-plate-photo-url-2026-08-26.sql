-- Use the current SmartPlate host for this recipe's cover/start/final images.
-- Apply:
--   scp server/migrate-smoothie-oat-berries-plate-photo-url-2026-08-26.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql -v ON_ERROR_STOP=1 -d smartplate_db -f /tmp/migrate-smoothie-oat-berries-plate-photo-url-2026-08-26.sql"

BEGIN;

UPDATE recipes
SET photo = 'https://plate.voronova.online/images/recipes/smoothie-oat-berries/smoothie-oat-berries-cover.webp',
    updated_at = now()
WHERE id = 'smoothie-oat-berries'
  AND photo = 'images/recipes/smoothie-oat-berries/smoothie-oat-berries-cover.webp';

DO $guard$
BEGIN
  IF (SELECT photo FROM recipes WHERE id = 'smoothie-oat-berries')
       <> 'https://plate.voronova.online/images/recipes/smoothie-oat-berries/smoothie-oat-berries-cover.webp' THEN
    RAISE EXCEPTION 'Unexpected photo path for smoothie-oat-berries';
  END IF;
END $guard$;

COMMIT;

SELECT id, photo
FROM recipes
WHERE id = 'smoothie-oat-berries';
