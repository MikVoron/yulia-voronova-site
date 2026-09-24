-- Фото для шага 11 рецепта «Зелёная гречка с индейкой и овощами».
-- Применить после загрузки green-buckwheat-turkey-vegetables-11.webp:
-- ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipe-green-buckwheat-turkey-vegetables-step-11-photo-2026-09-24.sql"

BEGIN;

DO $guard$
DECLARE
  step_count INTEGER;
BEGIN
  SELECT jsonb_array_length(steps)
  INTO step_count
  FROM recipes
  WHERE id = 'green-buckwheat-turkey-vegetables'
    AND name = 'Зелёная гречка с индейкой и овощами';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expected recipe green-buckwheat-turkey-vegetables was not found';
  END IF;

  IF step_count <> 11 THEN
    RAISE EXCEPTION 'Expected 11 recipe steps, found %', step_count;
  END IF;
END $guard$;

UPDATE recipes AS r
SET
  steps = (
    SELECT jsonb_agg(
      CASE
        WHEN source.step_no <> 11 THEN source.step
        WHEN jsonb_typeof(source.step) = 'object'
          THEN (source.step - 'photo') || jsonb_build_object(
            'photo',
            'images/recipes/green-buckwheat-turkey-vegetables/green-buckwheat-turkey-vegetables-11.webp'
          )
        WHEN jsonb_typeof(source.step) = 'string'
          THEN jsonb_build_object(
            'text', source.step #>> '{}',
            'photo', 'images/recipes/green-buckwheat-turkey-vegetables/green-buckwheat-turkey-vegetables-11.webp'
          )
        ELSE source.step
      END
      ORDER BY source.step_no
    )
    FROM jsonb_array_elements(r.steps) WITH ORDINALITY AS source(step, step_no)
  ),
  updated_at = now()
WHERE r.id = 'green-buckwheat-turkey-vegetables'
  AND r.name = 'Зелёная гречка с индейкой и овощами';

COMMIT;

SELECT
  r.id,
  r.steps -> 10 ->> 'photo' AS step_11_photo
FROM recipes AS r
WHERE r.id = 'green-buckwheat-turkey-vegetables';
