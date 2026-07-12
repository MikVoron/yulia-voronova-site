BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.recipe_steps_with_photos(
  source_steps jsonb,
  photo_map jsonb
) RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_agg(
    CASE
      WHEN photo_map ? ord::text THEN
        jsonb_set(base_step, '{photo}', photo_map -> ord::text, true)
      ELSE
        base_step
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(source_steps) WITH ORDINALITY AS s(step_item, ord)
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN jsonb_typeof(step_item) = 'object' THEN step_item - 'photo'
        ELSE jsonb_build_object('text', step_item #>> '{}')
      END AS base_step
  ) normalized;
$$;

UPDATE recipes
SET
  photo = 'images/recipes/salad-caesar-chickpea-cashew/salad-caesar-chickpea-cashew-cover.webp',
  steps = pg_temp.recipe_steps_with_photos(
    steps,
    '{
      "3": "images/recipes/salad-caesar-chickpea-cashew/salad-caesar-chickpea-cashew-3.webp",
      "4": "images/recipes/salad-caesar-chickpea-cashew/salad-caesar-chickpea-cashew-4.webp"
    }'::jsonb
  ),
  updated_at = now()
WHERE id = 'salad-caesar-chickpea-cashew';

UPDATE recipes
SET
  photo = 'images/recipes/side-potato-zucchini/side-potato-zucchini-cover.webp',
  steps = pg_temp.recipe_steps_with_photos(
    steps,
    '{
      "2": "images/recipes/side-potato-zucchini/side-potato-zucchini-2.webp",
      "3": "images/recipes/side-potato-zucchini/side-potato-zucchini-3.webp",
      "4": "images/recipes/side-potato-zucchini/side-potato-zucchini-4.webp",
      "5": "images/recipes/side-potato-zucchini/side-potato-zucchini-5.webp"
    }'::jsonb
  ),
  updated_at = now()
WHERE id = 'side-potato-zucchini';

UPDATE recipes
SET
  photo = NULL,
  steps = pg_temp.recipe_steps_with_photos(
    steps,
    '{
      "2": "images/recipes/soup-red-lentil-bulgur/soup-red-lentil-bulgur-2.webp",
      "3": "images/recipes/soup-red-lentil-bulgur/soup-red-lentil-bulgur-3.webp",
      "4": "images/recipes/soup-red-lentil-bulgur/soup-red-lentil-bulgur-4.webp",
      "5": "images/recipes/soup-red-lentil-bulgur/soup-red-lentil-bulgur-5.webp",
      "6": [
        "images/recipes/soup-red-lentil-bulgur/soup-red-lentil-bulgur-6.1.webp",
        "images/recipes/soup-red-lentil-bulgur/soup-red-lentil-bulgur-6.2.webp"
      ]
    }'::jsonb
  ),
  updated_at = now()
WHERE id = 'soup-red-lentil-bulgur';

UPDATE recipes
SET
  photo = 'images/recipes/chickpea-noodle-soup/chickpea-noodle-soup-cover.webp',
  steps = pg_temp.recipe_steps_with_photos(
    steps,
    '{
      "2": "images/recipes/chickpea-noodle-soup/chickpea-noodle-soup-2.webp",
      "3": "images/recipes/chickpea-noodle-soup/chickpea-noodle-soup-3.webp",
      "5": "images/recipes/chickpea-noodle-soup/chickpea-noodle-soup-5.webp",
      "7": "images/recipes/chickpea-noodle-soup/chickpea-noodle-soup-7.webp",
      "8": "images/recipes/chickpea-noodle-soup/chickpea-noodle-soup-8.webp"
    }'::jsonb
  ),
  updated_at = now()
WHERE id = 'chickpea-noodle-soup';

COMMIT;
