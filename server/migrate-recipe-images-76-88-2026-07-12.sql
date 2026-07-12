-- Attach the July 12 WebP asset batch to existing recipe cards.
-- Keeps recipe content and publication state intact; updates only card covers
-- and the explicitly numbered step photos.
--
-- Apply:
--   scp server/migrate-recipe-images-76-88-2026-07-12.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipe-images-76-88-2026-07-12.sql"

BEGIN;

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

SELECT pg_temp.attach_recipe_images('baked-oatmeal-apples-cinnamon',
  'images/recipes/baked-oatmeal-apples-cinnamon/baked-oatmeal-apples-cinnamon-cover.webp',
  '{"3":"images/recipes/baked-oatmeal-apples-cinnamon/baked-oatmeal-apples-cinnamon-3.webp","4":"images/recipes/baked-oatmeal-apples-cinnamon/baked-oatmeal-apples-cinnamon-4.webp","5":"images/recipes/baked-oatmeal-apples-cinnamon/baked-oatmeal-apples-cinnamon-5.webp","6":"images/recipes/baked-oatmeal-apples-cinnamon/baked-oatmeal-apples-cinnamon-6.webp"}'::jsonb);
SELECT pg_temp.attach_recipe_images('dark-vegetable-broth',
  'images/recipes/dark-vegetable-broth/dark-vegetable-broth-cover.webp',
  '{"1":"images/recipes/dark-vegetable-broth/dark-vegetable-broth-1.webp","2":"images/recipes/dark-vegetable-broth/dark-vegetable-broth-2.webp","5":"images/recipes/dark-vegetable-broth/dark-vegetable-broth-5.webp","6":"images/recipes/dark-vegetable-broth/dark-vegetable-broth-6.webp"}'::jsonb);
SELECT pg_temp.attach_recipe_images('light-vegetable-broth',
  'images/recipes/light-vegetable-broth/light-vegetable-broth-cover.webp',
  '{"1":"images/recipes/light-vegetable-broth/light-vegetable-broth-1.webp","2":"images/recipes/light-vegetable-broth/light-vegetable-broth-2.webp","3":"images/recipes/light-vegetable-broth/light-vegetable-broth-3.webp"}'::jsonb);
SELECT pg_temp.attach_recipe_images('oat-rice-bread',
  'images/recipes/oat-rice-bread/oat-rice-bread-cover.webp',
  '{"1":"images/recipes/oat-rice-bread/oat-rice-bread-1.webp","5":"images/recipes/oat-rice-bread/oat-rice-bread-5.webp"}'::jsonb);
SELECT pg_temp.attach_recipe_images('oatmeal',
  'images/recipes/oatmeal/oatmeal-cover.webp', '{}');
SELECT pg_temp.attach_recipe_images('red-bean-spread',
  'images/recipes/red-bean-spread/red-bean-spread-cover.webp',
  '{"2":"images/recipes/red-bean-spread/red-bean-spread-2.webp","3":"images/recipes/red-bean-spread/red-bean-spread-3.webp","5":"images/recipes/red-bean-spread/red-bean-spread-5.webp","6":"images/recipes/red-bean-spread/red-bean-spread-6.webp"}'::jsonb);
SELECT pg_temp.attach_recipe_images('red-lentil-bread',
  'images/recipes/red-lentil-bread/red-lentil-bread-cover.webp',
  '{"3":"images/recipes/red-lentil-bread/red-lentil-bread-3.webp","4":"images/recipes/red-lentil-bread/red-lentil-bread-4.webp","6":"images/recipes/red-lentil-bread/red-lentil-bread-6.webp"}'::jsonb);
SELECT pg_temp.attach_recipe_images('roasted-carrot-tomato-sauce',
  'images/recipes/roasted-carrot-tomato-sauce/roasted-carrot-tomato-sauce-cover.webp',
  '{"1":"images/recipes/roasted-carrot-tomato-sauce/roasted-carrot-tomato-sauce-1.webp","2":"images/recipes/roasted-carrot-tomato-sauce/roasted-carrot-tomato-sauce-2.webp","4":"images/recipes/roasted-carrot-tomato-sauce/roasted-carrot-tomato-sauce-4.webp"}'::jsonb);
SELECT pg_temp.attach_recipe_images('seabass-capers-pepper-salsa',
  'images/recipes/seabass-capers-pepper-salsa/seabass-capers-pepper-salsa-cover.webp',
  '{"3":"images/recipes/seabass-capers-pepper-salsa/seabass-capers-pepper-salsa-3.webp","5":"images/recipes/seabass-capers-pepper-salsa/seabass-capers-pepper-salsa-5.webp","6":"images/recipes/seabass-capers-pepper-salsa/seabass-capers-pepper-salsa-6.webp","7":"images/recipes/seabass-capers-pepper-salsa/seabass-capers-pepper-salsa-7.webp"}'::jsonb);
SELECT pg_temp.attach_recipe_images('stewed-chickpeas-tomato',
  'images/recipes/stewed-chickpeas-tomato/stewed-chickpeas-tomato-cover.webp',
  '{"2":"images/recipes/stewed-chickpeas-tomato/stewed-chickpeas-tomato-2.webp","3":"images/recipes/stewed-chickpeas-tomato/stewed-chickpeas-tomato-3.webp","4":"images/recipes/stewed-chickpeas-tomato/stewed-chickpeas-tomato-4.webp","5":"images/recipes/stewed-chickpeas-tomato/stewed-chickpeas-tomato-5.webp","6":"images/recipes/stewed-chickpeas-tomato/stewed-chickpeas-tomato-6.webp","7":["images/recipes/stewed-chickpeas-tomato/stewed-chickpeas-tomato-7-1.webp","images/recipes/stewed-chickpeas-tomato/stewed-chickpeas-tomato-7-2.webp"],"8":"images/recipes/stewed-chickpeas-tomato/stewed-chickpeas-tomato-8.webp"}'::jsonb);
SELECT pg_temp.attach_recipe_images('sun-dried-tomato-cashew-sauce',
  'images/recipes/sun-dried-tomato-cashew-sauce/sun-dried-tomato-cashew-sauce-cover.webp',
  '{"1":"images/recipes/sun-dried-tomato-cashew-sauce/sun-dried-tomato-cashew-sauce-1.webp","3":"images/recipes/sun-dried-tomato-cashew-sauce/sun-dried-tomato-cashew-sauce-3.webp"}'::jsonb);
SELECT pg_temp.attach_recipe_images('toast-red-bean-spread',
  'images/recipes/toast-red-bean-spread/toast-red-bean-spread-cover.webp', '{}');
SELECT pg_temp.attach_recipe_images('white-bean-sauce',
  'images/recipes/white-bean-sauce/white-bean-sauce-cover.webp',
  '{"1":"images/recipes/white-bean-sauce/white-bean-sauce-1.webp"}'::jsonb);

COMMIT;

-- Verification after applying on production:
SELECT id, photo, is_published, jsonb_array_length(steps) AS step_count
FROM recipes
WHERE id IN (
  'baked-oatmeal-apples-cinnamon', 'dark-vegetable-broth', 'light-vegetable-broth',
  'oat-rice-bread', 'oatmeal', 'red-bean-spread', 'red-lentil-bread',
  'roasted-carrot-tomato-sauce', 'seabass-capers-pepper-salsa', 'stewed-chickpeas-tomato',
  'sun-dried-tomato-cashew-sauce', 'toast-red-bean-spread', 'white-bean-sauce'
)
ORDER BY id;
