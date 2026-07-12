-- Attach converted recipe photos to 6 existing production recipes.
-- Applies ONLY root `photo` and `steps[].photo` (+ updated_at).
-- Does NOT change name, cat, recipe_categories, tags, servings, portion_grams,
-- kcal/protein/fat/carbs/fiber, note, quote, ingredients, add_*, auto_addons,
-- is_soup, access_level, is_free, is_published, main_ingredients or video fields.
--
-- Recipes (all already published in production):
--   carrot-pancakes, red-lentil-falafel, salad-olivier-tofu,
--   soup-lentil-carrot, spread-white-bean, tofu-scramble
--
-- Convention (see ai-recipe-input-contract.md / migrate-recipe-photos-convention.sql):
--   root photo  -> {id}-cover.webp
--   {id}-start.webp / {id}-final.webp are rendered by the frontend automatically
--     and MUST NOT appear in steps[].photo.
--   {id}-N.webp   -> steps[N-1].photo
--   {id}-N-1.webp,{id}-N-2.webp -> steps[N-1].photo = JSON array (dash style, as in
--     migrate-recipe-photos-batch-2026-05-07.sql).
--
-- Apply:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-photos-batch-2026-05-25-new-recipes.sql

BEGIN;

-- ── Preflight: all 6 recipes must exist, else abort before any data change ──
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
  FROM recipes
  WHERE id IN (
    'carrot-pancakes',
    'red-lentil-falafel',
    'salad-olivier-tofu',
    'soup-lentil-carrot',
    'spread-white-bean',
    'tofu-scramble'
  );
  IF n <> 6 THEN
    RAISE EXCEPTION 'Expected 6 target recipes, found %. Aborting (no rows changed).', n;
  END IF;
END;
$$;

-- ── Helper: set only steps[p_step-1].photo, leaving step text intact ──
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

-- ── 1. carrot-pancakes — steps 1,2,3,4,5,7,8 (step 6 = no photo) ──
UPDATE recipes
SET
  photo = 'images/recipes/carrot-pancakes/carrot-pancakes-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          pg_temp.set_step_photo(
            pg_temp.set_step_photo(
              pg_temp.set_step_photo(
                steps,
                1, '"images/recipes/carrot-pancakes/carrot-pancakes-1.webp"'::jsonb
              ),
              2, '"images/recipes/carrot-pancakes/carrot-pancakes-2.webp"'::jsonb
            ),
            3, '"images/recipes/carrot-pancakes/carrot-pancakes-3.webp"'::jsonb
          ),
          4, '"images/recipes/carrot-pancakes/carrot-pancakes-4.webp"'::jsonb
        ),
        5, '"images/recipes/carrot-pancakes/carrot-pancakes-5.webp"'::jsonb
      ),
      7, '"images/recipes/carrot-pancakes/carrot-pancakes-7.webp"'::jsonb
    ),
    8, '"images/recipes/carrot-pancakes/carrot-pancakes-8.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'carrot-pancakes';

-- ── 2. red-lentil-falafel — steps 1,2,3,4,5 (step 6 = no photo) ──
UPDATE recipes
SET
  photo = 'images/recipes/red-lentil-falafel/red-lentil-falafel-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          pg_temp.set_step_photo(
            steps,
            1, '"images/recipes/red-lentil-falafel/red-lentil-falafel-1.webp"'::jsonb
          ),
          2, '"images/recipes/red-lentil-falafel/red-lentil-falafel-2.webp"'::jsonb
        ),
        3, '"images/recipes/red-lentil-falafel/red-lentil-falafel-3.webp"'::jsonb
      ),
      4, '"images/recipes/red-lentil-falafel/red-lentil-falafel-4.webp"'::jsonb
    ),
    5, '"images/recipes/red-lentil-falafel/red-lentil-falafel-5.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'red-lentil-falafel';

-- ── 3. salad-olivier-tofu — steps 1,2 (step 3 = no photo) ──
UPDATE recipes
SET
  photo = 'images/recipes/salad-olivier-tofu/salad-olivier-tofu-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      steps,
      1, '"images/recipes/salad-olivier-tofu/salad-olivier-tofu-1.webp"'::jsonb
    ),
    2, '"images/recipes/salad-olivier-tofu/salad-olivier-tofu-2.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'salad-olivier-tofu';

-- ── 4. soup-lentil-carrot — steps 2,3,4,5,7(array),8 (steps 1,6 = no photo) ──
UPDATE recipes
SET
  photo = 'images/recipes/soup-lentil-carrot/soup-lentil-carrot-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          pg_temp.set_step_photo(
            pg_temp.set_step_photo(
              steps,
              2, '"images/recipes/soup-lentil-carrot/soup-lentil-carrot-2.webp"'::jsonb
            ),
            3, '"images/recipes/soup-lentil-carrot/soup-lentil-carrot-3.webp"'::jsonb
          ),
          4, '"images/recipes/soup-lentil-carrot/soup-lentil-carrot-4.webp"'::jsonb
        ),
        5, '"images/recipes/soup-lentil-carrot/soup-lentil-carrot-5.webp"'::jsonb
      ),
      7, '["images/recipes/soup-lentil-carrot/soup-lentil-carrot-7-1.webp","images/recipes/soup-lentil-carrot/soup-lentil-carrot-7-2.webp"]'::jsonb
    ),
    8, '"images/recipes/soup-lentil-carrot/soup-lentil-carrot-8.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'soup-lentil-carrot';

-- ── 5. spread-white-bean — step 3 only (steps 1,2,4 = no photo) ──
UPDATE recipes
SET
  photo = 'images/recipes/spread-white-bean/spread-white-bean-cover.webp',
  steps = pg_temp.set_step_photo(
    steps,
    3, '"images/recipes/spread-white-bean/spread-white-bean-3.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'spread-white-bean';

-- ── 6. tofu-scramble — steps 2,3,4,5,6 (steps 1,7 = no photo); replaces old cover ──
UPDATE recipes
SET
  photo = 'images/recipes/tofu-scramble/tofu-scramble-cover.webp',
  steps = pg_temp.set_step_photo(
    pg_temp.set_step_photo(
      pg_temp.set_step_photo(
        pg_temp.set_step_photo(
          pg_temp.set_step_photo(
            steps,
            2, '"images/recipes/tofu-scramble/tofu-scramble-2.webp"'::jsonb
          ),
          3, '"images/recipes/tofu-scramble/tofu-scramble-3.webp"'::jsonb
        ),
        4, '"images/recipes/tofu-scramble/tofu-scramble-4.webp"'::jsonb
      ),
      5, '"images/recipes/tofu-scramble/tofu-scramble-5.webp"'::jsonb
    ),
    6, '"images/recipes/tofu-scramble/tofu-scramble-6.webp"'::jsonb
  ),
  updated_at = now()
WHERE id = 'tofu-scramble';

-- ── In-transaction guard (BEFORE COMMIT): verify cover + exact per-recipe
--    steps_with_photo, plus soup-lentil-carrot step 7 = JSON array of length 2.
--    Any mismatch RAISES -> transaction rolls back, no data persisted. ──
DO $$
DECLARE
  expected CONSTANT jsonb := '{
    "carrot-pancakes": 7,
    "red-lentil-falafel": 5,
    "salad-olivier-tofu": 2,
    "soup-lentil-carrot": 6,
    "spread-white-bean": 1,
    "tofu-scramble": 5
  }'::jsonb;
  rid   text;
  want  int;
  got   int;
  cover text;
  s7    jsonb;
BEGIN
  -- exactly 6 rows must carry their own -cover.webp
  FOR rid, cover IN
    SELECT id, photo FROM recipes
    WHERE id IN (
      'carrot-pancakes','red-lentil-falafel','salad-olivier-tofu',
      'soup-lentil-carrot','spread-white-bean','tofu-scramble'
    )
  LOOP
    IF cover IS DISTINCT FROM 'images/recipes/' || rid || '/' || rid || '-cover.webp' THEN
      RAISE EXCEPTION 'Recipe % has unexpected cover photo: %. Rolling back.', rid, cover;
    END IF;

    -- exact count of steps carrying a non-empty photo
    want := (expected ->> rid)::int;
    SELECT count(*) INTO got
    FROM recipes r, jsonb_array_elements(r.steps) AS s(step)
    WHERE r.id = rid
      AND jsonb_typeof(s.step) = 'object'
      AND s.step ? 'photo'
      AND s.step->'photo' IS NOT NULL
      AND s.step->>'photo' <> ''
      AND s.step->>'photo' <> 'null';
    IF got <> want THEN
      RAISE EXCEPTION 'Recipe % expected % steps with photo, got %. Rolling back.', rid, want, got;
    END IF;
  END LOOP;

  -- soup-lentil-carrot: step 7 photo must be a JSON array of length 2
  SELECT steps -> 6 -> 'photo' INTO s7 FROM recipes WHERE id = 'soup-lentil-carrot';
  IF s7 IS NULL OR jsonb_typeof(s7) <> 'array' OR jsonb_array_length(s7) <> 2 THEN
    RAISE EXCEPTION 'soup-lentil-carrot step 7 photo must be a 2-element array, got %. Rolling back.', s7;
  END IF;
END;
$$;

COMMIT;

-- ── Read-only verification report ──
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
  'carrot-pancakes',
  'red-lentil-falafel',
  'salad-olivier-tofu',
  'soup-lentil-carrot',
  'spread-white-bean',
  'tofu-scramble'
)
ORDER BY id;
