-- Исправляет привязку фото шагов для уже применённой миграции изображений.
-- Production хранит исходные steps как строки; только шаги 2–5 становятся объектами {text, photo}.
-- Применить после migrate-recipe-wholegrain-wheat-pancakes-images-2026-08-19.sql.

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'wholegrain-wheat-pancakes'
      AND jsonb_typeof(steps) = 'array'
      AND jsonb_array_length(steps) = 5
      AND photo = 'images/recipes/wholegrain-wheat-pancakes/wholegrain-wheat-pancakes-cover.webp'
  ) THEN
    RAISE EXCEPTION 'wholegrain-wheat-pancakes must have the expected cover and five steps before the photo repair';
  END IF;
END $guard$;

UPDATE recipes
SET steps = (
      SELECT jsonb_agg(
        CASE step_number
          WHEN 2 THEN CASE WHEN jsonb_typeof(step) = 'object'
            THEN step || jsonb_build_object('photo', 'images/recipes/wholegrain-wheat-pancakes/wholegrain-wheat-pancakes-2.webp')
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', 'images/recipes/wholegrain-wheat-pancakes/wholegrain-wheat-pancakes-2.webp')
          END
          WHEN 3 THEN CASE WHEN jsonb_typeof(step) = 'object'
            THEN step || jsonb_build_object('photo', 'images/recipes/wholegrain-wheat-pancakes/wholegrain-wheat-pancakes-3.webp')
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', 'images/recipes/wholegrain-wheat-pancakes/wholegrain-wheat-pancakes-3.webp')
          END
          WHEN 4 THEN CASE WHEN jsonb_typeof(step) = 'object'
            THEN step || jsonb_build_object('photo', 'images/recipes/wholegrain-wheat-pancakes/wholegrain-wheat-pancakes-4.webp')
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', 'images/recipes/wholegrain-wheat-pancakes/wholegrain-wheat-pancakes-4.webp')
          END
          WHEN 5 THEN CASE WHEN jsonb_typeof(step) = 'object'
            THEN step || jsonb_build_object('photo', 'images/recipes/wholegrain-wheat-pancakes/wholegrain-wheat-pancakes-5.webp')
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', 'images/recipes/wholegrain-wheat-pancakes/wholegrain-wheat-pancakes-5.webp')
          END
          ELSE step
        END
        ORDER BY step_number
      )
      FROM jsonb_array_elements(steps) WITH ORDINALITY AS step_data(step, step_number)
    ),
    updated_at = now()
WHERE id = 'wholegrain-wheat-pancakes';

COMMIT;

SELECT id, photo,
       steps -> 1 ->> 'photo' AS step_2_photo,
       steps -> 2 ->> 'photo' AS step_3_photo,
       steps -> 3 ->> 'photo' AS step_4_photo,
       steps -> 4 ->> 'photo' AS step_5_photo
FROM recipes
WHERE id = 'wholegrain-wheat-pancakes';
