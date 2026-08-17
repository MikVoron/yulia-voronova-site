-- "Бульон овощной тёмный" готовится объёмом 3 л, а не порциями.
-- Применить:
--   scp server/migrate-dark-vegetable-broth-yield-2026-08-17.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql -d smartplate_db -f /tmp/migrate-dark-vegetable-broth-yield-2026-08-17.sql"

BEGIN;

UPDATE recipes
SET servings = NULL,
    portion_grams = NULL,
    updated_at = now()
WHERE id = 'dark-vegetable-broth';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'dark-vegetable-broth'
      AND servings IS NULL
      AND portion_grams IS NULL
  ) THEN
    RAISE EXCEPTION 'dark-vegetable-broth must not have servings or portion_grams';
  END IF;
END $guard$;

COMMIT;

SELECT id, servings, portion_grams
FROM recipes
WHERE id = 'dark-vegetable-broth';
