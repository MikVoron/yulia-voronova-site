-- Attach the WebP photos for «Паста с грибами и копчёным тофу».
-- The recipe remains a draft: publication state and all non-photo data are preserved.
-- Apply:
--   scp server/migrate-recipe-pasta-mushrooms-smoked-tofu-images-2026-08-12.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql -v ON_ERROR_STOP=1 smartplate_db -f /tmp/migrate-recipe-pasta-mushrooms-smoked-tofu-images-2026-08-12.sql"

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM recipes
    WHERE id = 'pasta-mushrooms-smoked-tofu'
      AND jsonb_array_length(steps) = 9
  ) THEN
    RAISE EXCEPTION 'Expected draft pasta-mushrooms-smoked-tofu with 9 steps';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.attach_recipe_images(
  p_recipe_id text,
  p_cover text,
  p_step_photos jsonb
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE recipes
  SET
    photo = p_cover,
    steps = (
      SELECT jsonb_agg(
        CASE
          WHEN p_step_photos ? ord::text THEN
            CASE
              WHEN jsonb_typeof(step) = 'object' THEN
                step || jsonb_build_object('photo', p_step_photos -> ord::text)
              ELSE
                jsonb_build_object('text', step #>> '{}', 'photo', p_step_photos -> ord::text)
            END
          ELSE step
        END
        ORDER BY ord
      )
      FROM jsonb_array_elements(steps) WITH ORDINALITY AS s(step, ord)
    ),
    updated_at = now()
  WHERE id = p_recipe_id;
END;
$$;

SELECT pg_temp.attach_recipe_images(
  'pasta-mushrooms-smoked-tofu',
  'images/recipes/pasta-mushrooms-smoked-tofu/pasta-mushrooms-smoked-tofu-cover.webp',
  '{
    "3": "images/recipes/pasta-mushrooms-smoked-tofu/pasta-mushrooms-smoked-tofu-3.webp",
    "4": "images/recipes/pasta-mushrooms-smoked-tofu/pasta-mushrooms-smoked-tofu-4.webp",
    "5": "images/recipes/pasta-mushrooms-smoked-tofu/pasta-mushrooms-smoked-tofu-5.webp",
    "6": "images/recipes/pasta-mushrooms-smoked-tofu/pasta-mushrooms-smoked-tofu-6.webp",
    "7": "images/recipes/pasta-mushrooms-smoked-tofu/pasta-mushrooms-smoked-tofu-7.webp",
    "8": "images/recipes/pasta-mushrooms-smoked-tofu/pasta-mushrooms-smoked-tofu-8.webp"
  }'::jsonb
);

COMMIT;

SELECT
  id,
  photo,
  is_published,
  jsonb_array_length(steps) AS step_count,
  ARRAY(
    SELECT ord::text || ':' || COALESCE(step->>'photo', '')
    FROM jsonb_array_elements(steps) WITH ORDINALITY AS s(step, ord)
    WHERE step ? 'photo'
    ORDER BY ord
  ) AS numbered_step_photos
FROM recipes
WHERE id = 'pasta-mushrooms-smoked-tofu';
