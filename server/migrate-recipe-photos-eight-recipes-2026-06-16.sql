-- Attach WebP photos for 8 recipes after the 2026-06-13 recipe migrations.
-- This migration is intentionally surgical: it updates only cover photos and
-- numbered step photos. The -start.webp and -final.webp files are rendered by
-- the frontend from the cover path and must not be stored in steps.
--
-- Apply:
--   scp server/migrate-recipe-photos-eight-recipes-2026-06-16.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipe-photos-eight-recipes-2026-06-16.sql"

BEGIN;

UPDATE recipes
SET
  photo = 'images/recipes/toast-white-bean-spread/toast-white-bean-spread-cover.webp',
  updated_at = now()
WHERE id = 'toast-white-bean-spread';

UPDATE recipes
SET
  photo = 'images/recipes/spread-red-lentil/spread-red-lentil-cover.webp',
  steps = jsonb_set(
    jsonb_set(
      jsonb_set(
        steps,
        '{0,photo}',
        to_jsonb('images/recipes/spread-red-lentil/spread-red-lentil-1.webp'::text),
        true
      ),
      '{1,photo}',
      to_jsonb('images/recipes/spread-red-lentil/spread-red-lentil-2.webp'::text),
      true
    ),
    '{2,photo}',
    to_jsonb('images/recipes/spread-red-lentil/spread-red-lentil-3.webp'::text),
    true
  ),
  updated_at = now()
WHERE id = 'spread-red-lentil';

UPDATE recipes
SET
  photo = 'images/recipes/toast-red-lentil-spread/toast-red-lentil-spread-cover.webp',
  updated_at = now()
WHERE id = 'toast-red-lentil-spread';

UPDATE recipes
SET
  photo = 'images/recipes/cutlets-salmon-cod-broccoli/cutlets-salmon-cod-broccoli-cover.webp',
  steps = jsonb_set(
    jsonb_set(
      steps,
      '{2,photo}',
      to_jsonb('images/recipes/cutlets-salmon-cod-broccoli/cutlets-salmon-cod-broccoli-3.webp'::text),
      true
    ),
    '{3,photo}',
    to_jsonb('images/recipes/cutlets-salmon-cod-broccoli/cutlets-salmon-cod-broccoli-4.webp'::text),
    true
  ),
  updated_at = now()
WHERE id = 'cutlets-salmon-cod-broccoli';

UPDATE recipes
SET
  photo = 'images/recipes/salad-radish-kohlrabi-cucumber-yogurt/salad-radish-kohlrabi-cucumber-yogurt-cover.webp',
  updated_at = now()
WHERE id = 'salad-radish-kohlrabi-cucumber-yogurt';

UPDATE recipes
SET
  photo = 'images/recipes/vegetable-plate/vegetable-plate-cover.webp',
  updated_at = now()
WHERE id = 'vegetable-plate';

UPDATE recipes
SET
  photo = 'images/recipes/oat-pancakes/oat-pancakes-cover.webp',
  steps = jsonb_set(
    jsonb_set(
      steps,
      '{2,photo}',
      to_jsonb('images/recipes/oat-pancakes/oat-pancakes-3.webp'::text),
      true
    ),
    '{3,photo}',
    to_jsonb(ARRAY[
      'images/recipes/oat-pancakes/oat-pancakes-4-1.webp',
      'images/recipes/oat-pancakes/oat-pancakes-4-2.webp'
    ]::text[]),
    true
  ),
  updated_at = now()
WHERE id = 'oat-pancakes';

UPDATE recipes
SET
  photo = 'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-cover.webp',
  steps = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            steps,
            '{1,photo}',
            to_jsonb('images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-2.webp'::text),
            true
          ),
          '{2,photo}',
          to_jsonb('images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-3.webp'::text),
          true
        ),
        '{3,photo}',
        to_jsonb('images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-4.webp'::text),
        true
      ),
      '{4,photo}',
      to_jsonb('images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-5.webp'::text),
      true
    ),
    '{6,photo}',
    to_jsonb(ARRAY[
      'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-7-1.webp',
      'images/recipes/bulgur-chicken-red-lentils/bulgur-chicken-red-lentils-7-2.webp'
    ]::text[]),
    true
  ),
  updated_at = now()
WHERE id = 'bulgur-chicken-red-lentils';

COMMIT;
