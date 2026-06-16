-- Robustly attach numbered step photos for the 8 recipe-photo rollout.
-- The previous cover-photo migration intentionally kept recipe text intact,
-- but production may store steps as strings or object-shaped rows depending on
-- their source migration. This preserves each step text and only adds photo
-- fields to steps that have matching numbered WebP files.
--
-- Apply:
--   scp server/migrate-recipe-step-photos-eight-recipes-2026-06-16.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipe-step-photos-eight-recipes-2026-06-16.sql"

BEGIN;

UPDATE recipes
SET
  steps = (
    SELECT jsonb_agg(
      CASE ord
        WHEN 1 THEN
          CASE
            WHEN jsonb_typeof(step) = 'object'
              THEN step || jsonb_build_object('photo', 'images/recipes/spread-red-lentil/spread-red-lentil-1.webp')
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', 'images/recipes/spread-red-lentil/spread-red-lentil-1.webp')
          END
        WHEN 2 THEN
          CASE
            WHEN jsonb_typeof(step) = 'object'
              THEN step || jsonb_build_object('photo', 'images/recipes/spread-red-lentil/spread-red-lentil-2.webp')
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', 'images/recipes/spread-red-lentil/spread-red-lentil-2.webp')
          END
        WHEN 3 THEN
          CASE
            WHEN jsonb_typeof(step) = 'object'
              THEN step || jsonb_build_object('photo', 'images/recipes/spread-red-lentil/spread-red-lentil-3.webp')
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', 'images/recipes/spread-red-lentil/spread-red-lentil-3.webp')
          END
        ELSE step
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(steps) WITH ORDINALITY AS s(step, ord)
  ),
  updated_at = now()
WHERE id = 'spread-red-lentil';

UPDATE recipes
SET
  steps = (
    SELECT jsonb_agg(
      CASE ord
        WHEN 3 THEN
          CASE
            WHEN jsonb_typeof(step) = 'object'
              THEN step || jsonb_build_object('photo', 'images/recipes/cutlets-salmon-cod-broccoli/cutlets-salmon-cod-broccoli-3.webp')
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', 'images/recipes/cutlets-salmon-cod-broccoli/cutlets-salmon-cod-broccoli-3.webp')
          END
        WHEN 4 THEN
          CASE
            WHEN jsonb_typeof(step) = 'object'
              THEN step || jsonb_build_object('photo', 'images/recipes/cutlets-salmon-cod-broccoli/cutlets-salmon-cod-broccoli-4.webp')
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', 'images/recipes/cutlets-salmon-cod-broccoli/cutlets-salmon-cod-broccoli-4.webp')
          END
        ELSE step
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(steps) WITH ORDINALITY AS s(step, ord)
  ),
  updated_at = now()
WHERE id = 'cutlets-salmon-cod-broccoli';

UPDATE recipes
SET
  steps = (
    SELECT jsonb_agg(
      CASE ord
        WHEN 3 THEN
          CASE
            WHEN jsonb_typeof(step) = 'object'
              THEN step || jsonb_build_object('photo', 'images/recipes/oat-pancakes/oat-pancakes-3.webp')
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', 'images/recipes/oat-pancakes/oat-pancakes-3.webp')
          END
        WHEN 4 THEN
          CASE
            WHEN jsonb_typeof(step) = 'object'
              THEN step || jsonb_build_object('photo', jsonb_build_array(
                'images/recipes/oat-pancakes/oat-pancakes-4-1.webp',
                'images/recipes/oat-pancakes/oat-pancakes-4-2.webp'
              ))
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', jsonb_build_array(
              'images/recipes/oat-pancakes/oat-pancakes-4-1.webp',
              'images/recipes/oat-pancakes/oat-pancakes-4-2.webp'
            ))
          END
        ELSE step
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(steps) WITH ORDINALITY AS s(step, ord)
  ),
  updated_at = now()
WHERE id = 'oat-pancakes';

UPDATE recipes
SET
  steps = (
    SELECT jsonb_agg(
      CASE ord
        WHEN 2 THEN
          CASE
            WHEN jsonb_typeof(step) = 'object'
              THEN step || jsonb_build_object('photo', 'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-2.webp')
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', 'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-2.webp')
          END
        WHEN 3 THEN
          CASE
            WHEN jsonb_typeof(step) = 'object'
              THEN step || jsonb_build_object('photo', 'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-3.webp')
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', 'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-3.webp')
          END
        WHEN 4 THEN
          CASE
            WHEN jsonb_typeof(step) = 'object'
              THEN step || jsonb_build_object('photo', 'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-4.webp')
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', 'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-4.webp')
          END
        WHEN 5 THEN
          CASE
            WHEN jsonb_typeof(step) = 'object'
              THEN step || jsonb_build_object('photo', 'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-5.webp')
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', 'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-5.webp')
          END
        WHEN 7 THEN
          CASE
            WHEN jsonb_typeof(step) = 'object'
              THEN step || jsonb_build_object('photo', jsonb_build_array(
                'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-7-1.webp',
                'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-7-2.webp'
              ))
            ELSE jsonb_build_object('text', step #>> '{}', 'photo', jsonb_build_array(
              'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-7-1.webp',
              'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-7-2.webp'
            ))
          END
        ELSE step
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(steps) WITH ORDINALITY AS s(step, ord)
  ),
  updated_at = now()
WHERE id = 'bulgur-chicken-red-lentils';

COMMIT;
