-- "Овощная тарелка": одна порция весом 200 г.
-- Применить:
--   scp server/migrate-vegetable-plate-servings-2026-08-16.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql -d smartplate_db -f /tmp/migrate-vegetable-plate-servings-2026-08-16.sql"

BEGIN;

UPDATE recipes
SET servings = 1,
    portion_grams = 200,
    updated_at = now()
WHERE id = 'vegetable-plate';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'vegetable-plate'
      AND servings = 1
      AND portion_grams = 200
  ) THEN
    RAISE EXCEPTION 'vegetable-plate must have servings=1 and portion_grams=200';
  END IF;
END $guard$;

COMMIT;

SELECT id, servings, portion_grams
FROM recipes
WHERE id = 'vegetable-plate';
