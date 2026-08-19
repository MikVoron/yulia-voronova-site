-- Фото для «Блины из цельнозерновой муки» (wholegrain-wheat-pancakes).
-- Меняет только photo и steps[].photo; публикацию и остальные поля не затрагивает.
-- -start.webp и -final.webp выводятся фронтендом автоматически и в steps не записываются.
-- Применить:
--   scp server/migrate-recipe-wholegrain-wheat-pancakes-images-2026-08-19.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql -d smartplate_db -f /tmp/migrate-recipe-wholegrain-wheat-pancakes-images-2026-08-19.sql"

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'wholegrain-wheat-pancakes'
      AND jsonb_typeof(steps) = 'array'
      AND jsonb_array_length(steps) = 5
      AND photo IS NULL
  ) THEN
    RAISE EXCEPTION 'wholegrain-wheat-pancakes must exist with five steps and no existing cover photo';
  END IF;
END $guard$;

UPDATE recipes
SET photo = 'images/recipes/wholegrain-wheat-pancakes/wholegrain-wheat-pancakes-cover.webp',
    steps = (
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
       steps -> 4 ->> 'photo' AS step_5_photo,
       is_published
FROM recipes
WHERE id = 'wholegrain-wheat-pancakes';
