-- Attach WebP photos for recipes 64-68 and refresh soup-red-lentil-bulgur cover/final assets.
-- Keeps recipe text intact. The frontend derives -start.webp and -final.webp from the cover path,
-- so only numbered step files are stored in steps[].photo.
--
-- Apply:
--   scp server/migrate-recipe-photos-batch-2026-06-16-v2.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipe-photos-batch-2026-06-16-v2.sql"

BEGIN;

UPDATE recipes AS r
SET
  photo = v.photo,
  is_published = true,
  updated_at = now()
FROM (VALUES
  ('pasta-shrimp-cauliflower-cashew', 'images/recipes/pasta-shrimp-cauliflower-cashew/pasta-shrimp-cauliflower-cashew-cover.webp'),
  ('green-shakshuka', 'images/recipes/green-shakshuka/green-shakshuka-cover.webp'),
  ('wholegrain-flour-pancakes', 'images/recipes/wholegrain-flour-pancakes/wholegrain-flour-pancakes-cover.webp'),
  ('cutlets-chicken-mung-zucchini', 'images/recipes/cutlets-chicken-mung-zucchini/cutlets-chicken-mung-zucchini-cover.webp'),
  ('lentil-crackers', 'images/recipes/lentil-crackers/lentil-crackers-cover.webp'),
  ('soup-red-lentil-bulgur', 'images/recipes/soup-red-lentil-bulgur/soup-red-lentil-bulgur-cover.webp')
) AS v(id, photo)
WHERE r.id = v.id;

CREATE OR REPLACE FUNCTION pg_temp.attach_recipe_step_photo(p_recipe_id text, p_step_no int, p_photo jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE recipes
  SET
    steps = (
      SELECT jsonb_agg(
        CASE
          WHEN ord = p_step_no THEN
            CASE
              WHEN jsonb_typeof(step) = 'object'
                THEN step || jsonb_build_object('photo', p_photo)
              ELSE jsonb_build_object('text', step #>> '{}', 'photo', p_photo)
            END
          ELSE step
        END
        ORDER BY ord
      )
      FROM jsonb_array_elements(steps) WITH ORDINALITY AS s(step, ord)
    ),
    updated_at = now()
  WHERE id = p_recipe_id
    AND jsonb_typeof(steps) = 'array';
END;
$$;

SELECT pg_temp.attach_recipe_step_photo('pasta-shrimp-cauliflower-cashew', 1, to_jsonb('images/recipes/pasta-shrimp-cauliflower-cashew/pasta-shrimp-cauliflower-cashew-1.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('pasta-shrimp-cauliflower-cashew', 2, to_jsonb('images/recipes/pasta-shrimp-cauliflower-cashew/pasta-shrimp-cauliflower-cashew-2.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('pasta-shrimp-cauliflower-cashew', 3, jsonb_build_array(
  'images/recipes/pasta-shrimp-cauliflower-cashew/pasta-shrimp-cauliflower-cashew-3-1.webp',
  'images/recipes/pasta-shrimp-cauliflower-cashew/pasta-shrimp-cauliflower-cashew-3-2.webp'
));
SELECT pg_temp.attach_recipe_step_photo('pasta-shrimp-cauliflower-cashew', 4, jsonb_build_array(
  'images/recipes/pasta-shrimp-cauliflower-cashew/pasta-shrimp-cauliflower-cashew-4-1.webp',
  'images/recipes/pasta-shrimp-cauliflower-cashew/pasta-shrimp-cauliflower-cashew-4-2.webp'
));
SELECT pg_temp.attach_recipe_step_photo('pasta-shrimp-cauliflower-cashew', 5, to_jsonb('images/recipes/pasta-shrimp-cauliflower-cashew/pasta-shrimp-cauliflower-cashew-5.webp'::text));

SELECT pg_temp.attach_recipe_step_photo('green-shakshuka', 1, to_jsonb('images/recipes/green-shakshuka/green-shakshuka-1.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('green-shakshuka', 2, to_jsonb('images/recipes/green-shakshuka/green-shakshuka-2.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('green-shakshuka', 3, to_jsonb('images/recipes/green-shakshuka/green-shakshuka-3.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('green-shakshuka', 4, to_jsonb('images/recipes/green-shakshuka/green-shakshuka-4.webp'::text));

SELECT pg_temp.attach_recipe_step_photo('wholegrain-flour-pancakes', 1, to_jsonb('images/recipes/wholegrain-flour-pancakes/wholegrain-flour-pancakes-1.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('wholegrain-flour-pancakes', 2, to_jsonb('images/recipes/wholegrain-flour-pancakes/wholegrain-flour-pancakes-2.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('wholegrain-flour-pancakes', 3, to_jsonb('images/recipes/wholegrain-flour-pancakes/wholegrain-flour-pancakes-3.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('wholegrain-flour-pancakes', 6, jsonb_build_array(
  'images/recipes/wholegrain-flour-pancakes/wholegrain-flour-pancakes-6-1.webp',
  'images/recipes/wholegrain-flour-pancakes/wholegrain-flour-pancakes-6-2.webp'
));

SELECT pg_temp.attach_recipe_step_photo('cutlets-chicken-mung-zucchini', 1, to_jsonb('images/recipes/cutlets-chicken-mung-zucchini/cutlets-chicken-mung-zucchini-1.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('cutlets-chicken-mung-zucchini', 3, to_jsonb('images/recipes/cutlets-chicken-mung-zucchini/cutlets-chicken-mung-zucchini-3.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('cutlets-chicken-mung-zucchini', 4, to_jsonb('images/recipes/cutlets-chicken-mung-zucchini/cutlets-chicken-mung-zucchini-4.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('cutlets-chicken-mung-zucchini', 5, to_jsonb('images/recipes/cutlets-chicken-mung-zucchini/cutlets-chicken-mung-zucchini-5.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('cutlets-chicken-mung-zucchini', 6, to_jsonb('images/recipes/cutlets-chicken-mung-zucchini/cutlets-chicken-mung-zucchini-6.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('cutlets-chicken-mung-zucchini', 7, to_jsonb('images/recipes/cutlets-chicken-mung-zucchini/cutlets-chicken-mung-zucchini-7.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('cutlets-chicken-mung-zucchini', 8, to_jsonb('images/recipes/cutlets-chicken-mung-zucchini/cutlets-chicken-mung-zucchini-8.webp'::text));

SELECT pg_temp.attach_recipe_step_photo('lentil-crackers', 1, to_jsonb('images/recipes/lentil-crackers/lentil-crackers-1.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('lentil-crackers', 3, jsonb_build_array(
  'images/recipes/lentil-crackers/lentil-crackers-3-1.webp',
  'images/recipes/lentil-crackers/lentil-crackers-3-2.webp'
));
SELECT pg_temp.attach_recipe_step_photo('lentil-crackers', 5, to_jsonb('images/recipes/lentil-crackers/lentil-crackers-5.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('lentil-crackers', 7, jsonb_build_array(
  'images/recipes/lentil-crackers/lentil-crackers-7-1.webp',
  'images/recipes/lentil-crackers/lentil-crackers-7-2.webp'
));
SELECT pg_temp.attach_recipe_step_photo('lentil-crackers', 8, to_jsonb('images/recipes/lentil-crackers/lentil-crackers-8.webp'::text));

COMMIT;
