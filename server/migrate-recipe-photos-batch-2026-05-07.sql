-- Attach converted recipe photos to existing production recipes.
-- Applies only root photo and steps[].photo; does not change text, nutrition,
-- categories, publication state, ingredients, add-ons, or videos.
--
-- Apply:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-photos-batch-2026-05-07.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_step_photo(p_steps jsonb, p_step int, p_photo jsonb)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT CASE
    WHEN p_steps IS NULL
      OR jsonb_typeof(p_steps) <> 'array'
      OR p_step < 1
      OR p_step > jsonb_array_length(p_steps)
    THEN p_steps
    ELSE jsonb_set(
      p_steps,
      ARRAY[(p_step - 1)::text],
      CASE
        WHEN jsonb_typeof(p_steps -> (p_step - 1)) = 'object' THEN
          jsonb_set(p_steps -> (p_step - 1), '{photo}', p_photo, true)
        WHEN jsonb_typeof(p_steps -> (p_step - 1)) = 'string' THEN
          jsonb_build_object('text', p_steps ->> (p_step - 1), 'photo', p_photo)
        ELSE
          p_steps -> (p_step - 1)
      END,
      false
    )
  END;
$$;

UPDATE recipes
SET
  photo = 'images/recipes/bean-meatballs/bean-meatballs-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          steps,
          3,
          '"images/recipes/bean-meatballs/bean-meatballs-3.webp"'::jsonb
        ),
        4,
        '["images/recipes/bean-meatballs/bean-meatballs-4-1.webp","images/recipes/bean-meatballs/bean-meatballs-4-2.webp"]'::jsonb
      ),
      5,
      '"images/recipes/bean-meatballs/bean-meatballs-5.webp"'::jsonb
    ),
    7,
    '"images/recipes/bean-meatballs/bean-meatballs-7.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'bean-meatballs';

UPDATE recipes
SET
  photo = 'images/recipes/cabbage-salmon-pie/cabbage-salmon-pie-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          pg_temp.set_step_photo(
            pg_temp.set_step_photo(
              steps,
              3,
              '["images/recipes/cabbage-salmon-pie/cabbage-salmon-pie-3-1.webp","images/recipes/cabbage-salmon-pie/cabbage-salmon-pie-3-2.webp"]'::jsonb
            ),
            4,
            '"images/recipes/cabbage-salmon-pie/cabbage-salmon-pie-4.webp"'::jsonb
          ),
          7,
          '"images/recipes/cabbage-salmon-pie/cabbage-salmon-pie-7.webp"'::jsonb
        ),
        8,
        '"images/recipes/cabbage-salmon-pie/cabbage-salmon-pie-8.webp"'::jsonb
      ),
      9,
      '"images/recipes/cabbage-salmon-pie/cabbage-salmon-pie-9.webp"'::jsonb
    ),
    10,
    '["images/recipes/cabbage-salmon-pie/cabbage-salmon-pie-10-1.webp","images/recipes/cabbage-salmon-pie/cabbage-salmon-pie-10-2.webp"]'::jsonb
  ),
  updated_at = now()
WHERE id = 'cabbage-salmon-pie';

UPDATE recipes
SET
  photo = 'images/recipes/carrot-cucumber-pepper-salad/carrot-cucumber-pepper-salad-cover.webp',
  updated_at = now()
WHERE id = 'carrot-cucumber-pepper-salad';

UPDATE recipes
SET
  photo = 'images/recipes/celeriac-apple-salad/celeriac-apple-salad-cover.webp',
  steps = pg_temp.set_step_photo(
    steps,
    3,
    '"images/recipes/celeriac-apple-salad/celeriac-apple-salad-3.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'celeriac-apple-salad';

UPDATE recipes
SET
  photo = 'images/recipes/chickpea-sweet-potato-cutlets/chickpea-sweet-potato-cutlets-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          pg_temp.set_step_photo(
            pg_temp.set_step_photo(
              pg_temp.set_step_photo(
                pg_temp.set_step_photo(
                  steps,
                  1,
                  '"images/recipes/chickpea-sweet-potato-cutlets/chickpea-sweet-potato-cutlets-1.webp"'::jsonb
                ),
                3,
                '"images/recipes/chickpea-sweet-potato-cutlets/chickpea-sweet-potato-cutlets-3.webp"'::jsonb
              ),
              4,
              '"images/recipes/chickpea-sweet-potato-cutlets/chickpea-sweet-potato-cutlets-4.webp"'::jsonb
            ),
            5,
            '"images/recipes/chickpea-sweet-potato-cutlets/chickpea-sweet-potato-cutlets-5.webp"'::jsonb
          ),
          6,
          '"images/recipes/chickpea-sweet-potato-cutlets/chickpea-sweet-potato-cutlets-6.webp"'::jsonb
        ),
        7,
        '["images/recipes/chickpea-sweet-potato-cutlets/chickpea-sweet-potato-cutlets-7-1.webp","images/recipes/chickpea-sweet-potato-cutlets/chickpea-sweet-potato-cutlets-7-2.webp"]'::jsonb
      ),
      8,
      '"images/recipes/chickpea-sweet-potato-cutlets/chickpea-sweet-potato-cutlets-8.webp"'::jsonb
    ),
    9,
    '"images/recipes/chickpea-sweet-potato-cutlets/chickpea-sweet-potato-cutlets-9.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'chickpea-sweet-potato-cutlets';

UPDATE recipes
SET
  photo = 'images/recipes/hummus/hummus-cover.webp',
  steps = pg_temp.set_step_photo(
    steps,
    1,
    '["images/recipes/hummus/hummus-1-1.webp","images/recipes/hummus/hummus-1-2.webp"]'::jsonb
  ),
  updated_at = now()
WHERE id = 'hummus';

UPDATE recipes
SET
  photo = 'images/recipes/lentil-pancakes-gf/lentil-pancakes-gf-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        steps,
        3,
        '["images/recipes/lentil-pancakes-gf/lentil-pancakes-gf-3-1.webp","images/recipes/lentil-pancakes-gf/lentil-pancakes-gf-3-2.webp"]'::jsonb
      ),
      5,
      '"images/recipes/lentil-pancakes-gf/lentil-pancakes-gf-5.webp"'::jsonb
    ),
    6,
    '"images/recipes/lentil-pancakes-gf/lentil-pancakes-gf-6.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'lentil-pancakes-gf';

UPDATE recipes
SET
  photo = 'images/recipes/mung-bean-soup/mung-bean-soup-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          pg_temp.set_step_photo(
            steps,
            3,
            '"images/recipes/mung-bean-soup/mung-bean-soup-3.webp"'::jsonb
          ),
          4,
          '"images/recipes/mung-bean-soup/mung-bean-soup-4.webp"'::jsonb
        ),
        5,
        '"images/recipes/mung-bean-soup/mung-bean-soup-5.webp"'::jsonb
      ),
      6,
      '"images/recipes/mung-bean-soup/mung-bean-soup-6.webp"'::jsonb
    ),
    7,
    '"images/recipes/mung-bean-soup/mung-bean-soup-7.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'mung-bean-soup';

UPDATE recipes
SET
  photo = 'images/recipes/oregano-croutons/oregano-croutons-cover.webp',
  steps = pg_temp.set_step_photo(
    steps,
    1,
    '"images/recipes/oregano-croutons/oregano-croutons-1.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'oregano-croutons';

UPDATE recipes
SET
  photo = 'images/recipes/pasta-tomato-roasted-peppers/pasta-tomato-roasted-peppers-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          steps,
          1,
          '"images/recipes/pasta-tomato-roasted-peppers/pasta-tomato-roasted-peppers-1.webp"'::jsonb
        ),
        6,
        '"images/recipes/pasta-tomato-roasted-peppers/pasta-tomato-roasted-peppers-6.webp"'::jsonb
      ),
      7,
      '"images/recipes/pasta-tomato-roasted-peppers/pasta-tomato-roasted-peppers-7.webp"'::jsonb
    ),
    9,
    '"images/recipes/pasta-tomato-roasted-peppers/pasta-tomato-roasted-peppers-9.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'pasta-tomato-roasted-peppers';

UPDATE recipes
SET
  photo = 'images/recipes/red-lentil-mushroom-soup/red-lentil-mushroom-soup-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          steps,
          2,
          '"images/recipes/red-lentil-mushroom-soup/red-lentil-mushroom-soup-2.webp"'::jsonb
        ),
        3,
        '"images/recipes/red-lentil-mushroom-soup/red-lentil-mushroom-soup-3.webp"'::jsonb
      ),
      4,
      '"images/recipes/red-lentil-mushroom-soup/red-lentil-mushroom-soup-4.webp"'::jsonb
    ),
    6,
    '"images/recipes/red-lentil-mushroom-soup/red-lentil-mushroom-soup-6.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'red-lentil-mushroom-soup';

UPDATE recipes
SET
  photo = 'images/recipes/red-lentil-vegetable-soup/red-lentil-vegetable-soup-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          steps,
          3,
          '"images/recipes/red-lentil-vegetable-soup/red-lentil-vegetable-soup-3.webp"'::jsonb
        ),
        4,
        '"images/recipes/red-lentil-vegetable-soup/red-lentil-vegetable-soup-4.webp"'::jsonb
      ),
      5,
      '"images/recipes/red-lentil-vegetable-soup/red-lentil-vegetable-soup-5.webp"'::jsonb
    ),
    7,
    '"images/recipes/red-lentil-vegetable-soup/red-lentil-vegetable-soup-7.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'red-lentil-vegetable-soup';

UPDATE recipes
SET
  photo = 'images/recipes/salmon-cauliflower-cutlets/salmon-cauliflower-cutlets-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          steps,
          1,
          '"images/recipes/salmon-cauliflower-cutlets/salmon-cauliflower-cutlets-1.webp"'::jsonb
        ),
        6,
        '"images/recipes/salmon-cauliflower-cutlets/salmon-cauliflower-cutlets-6.webp"'::jsonb
      ),
      7,
      '"images/recipes/salmon-cauliflower-cutlets/salmon-cauliflower-cutlets-7.webp"'::jsonb
    ),
    8,
    '"images/recipes/salmon-cauliflower-cutlets/salmon-cauliflower-cutlets-8.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'salmon-cauliflower-cutlets';

UPDATE recipes
SET
  photo = 'images/recipes/shchi-white-beans/shchi-white-beans-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          pg_temp.set_step_photo(
            pg_temp.set_step_photo(
              steps,
              2,
              '"images/recipes/shchi-white-beans/shchi-white-beans-2.webp"'::jsonb
            ),
            3,
            '["images/recipes/shchi-white-beans/shchi-white-beans-3-1.webp","images/recipes/shchi-white-beans/shchi-white-beans-3-2.webp"]'::jsonb
          ),
          4,
          '"images/recipes/shchi-white-beans/shchi-white-beans-4.webp"'::jsonb
        ),
        5,
        '"images/recipes/shchi-white-beans/shchi-white-beans-5.webp"'::jsonb
      ),
      7,
      '["images/recipes/shchi-white-beans/shchi-white-beans-7-1.webp","images/recipes/shchi-white-beans/shchi-white-beans-7-2.webp"]'::jsonb
    ),
    8,
    '"images/recipes/shchi-white-beans/shchi-white-beans-8.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'shchi-white-beans';

COMMIT;

SELECT
  id,
  photo,
  jsonb_array_length(steps) AS steps_count,
  (
    SELECT count(*)
    FROM jsonb_array_elements(steps) AS s(step)
    WHERE jsonb_typeof(s.step) = 'object'
      AND s.step ? 'photo'
      AND s.step->'photo' IS NOT NULL
      AND s.step->>'photo' <> ''
      AND s.step->>'photo' <> 'null'
  ) AS steps_with_photo
FROM recipes
WHERE id IN (
  'bean-meatballs',
  'cabbage-salmon-pie',
  'carrot-cucumber-pepper-salad',
  'celeriac-apple-salad',
  'chickpea-sweet-potato-cutlets',
  'hummus',
  'lentil-pancakes-gf',
  'mung-bean-soup',
  'oregano-croutons',
  'pasta-tomato-roasted-peppers',
  'red-lentil-mushroom-soup',
  'red-lentil-vegetable-soup',
  'salmon-cauliflower-cutlets',
  'shchi-white-beans'
)
ORDER BY id;
