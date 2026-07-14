-- Repair the published recipe's missing cover and per-step photo references.
-- The referenced WebP files are already served from voronova.online.
BEGIN;

WITH current_recipe AS (
  SELECT id, steps
  FROM recipes
  WHERE id = 'salad-warm-eggplant-vegetables'
), repaired_steps AS (
  SELECT id, jsonb_build_array(
    jsonb_build_object('text', steps ->> 0, 'photo', jsonb_build_array(
      'images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-1-1.webp',
      'images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-1-2.webp'
    )),
    steps -> 1,
    jsonb_build_object('text', steps ->> 2, 'photo', 'images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-3.webp'),
    jsonb_build_object('text', steps ->> 3, 'photo', 'images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-4.webp'),
    jsonb_build_object('text', steps ->> 4, 'photo', 'images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-5.webp'),
    jsonb_build_object('text', steps ->> 5, 'photo', 'images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-6.webp'),
    jsonb_build_object('text', steps ->> 6, 'photo', 'images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-7.webp')
  ) AS steps
  FROM current_recipe
)
UPDATE recipes AS r
SET photo = 'images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-cover.webp',
    steps = repaired_steps.steps,
    updated_at = now()
FROM repaired_steps
WHERE r.id = repaired_steps.id;

COMMIT;
