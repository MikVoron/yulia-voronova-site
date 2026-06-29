-- Attach canonical WebP cover and step photos to recipes 69-75.
-- This migration deliberately preserves is_published and all unrelated fields.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.attach_recipe_step_photo(
  recipe_id text,
  step_number integer,
  photo_value jsonb
) RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE recipes
  SET steps = jsonb_set(steps, ARRAY[(step_number - 1)::text, 'photo'], photo_value, true),
      updated_at = now()
  WHERE id = recipe_id;
END;
$function$;

UPDATE recipes
SET photo = 'images/recipes/' || id || '/' || id || '-cover.webp',
    updated_at = now()
WHERE id IN (
  'ww-crackers',
  'cutlets-green-lentils-rice',
  'millet-porridge',
  'chicken-green-lentils-tomato',
  'cutlets-chicken-red-lentils',
  'salad-seasonal-vegetables-soy-dressing',
  'salad-warm-eggplant-vegetables'
);

SELECT pg_temp.attach_recipe_step_photo('ww-crackers', 1, to_jsonb('images/recipes/ww-crackers/ww-crackers-1.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('ww-crackers', 2, to_jsonb('images/recipes/ww-crackers/ww-crackers-2.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('ww-crackers', 3, to_jsonb('images/recipes/ww-crackers/ww-crackers-3.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('ww-crackers', 5, to_jsonb('images/recipes/ww-crackers/ww-crackers-5.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('ww-crackers', 6, to_jsonb('images/recipes/ww-crackers/ww-crackers-6.webp'::text));

SELECT pg_temp.attach_recipe_step_photo('cutlets-green-lentils-rice', 2, to_jsonb('images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-2.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('cutlets-green-lentils-rice', 3, to_jsonb('images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-3.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('cutlets-green-lentils-rice', 4, to_jsonb('images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-4.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('cutlets-green-lentils-rice', 5, '["images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-5-1.webp", "images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-5-2.webp"]'::jsonb);
SELECT pg_temp.attach_recipe_step_photo('cutlets-green-lentils-rice', 6, '["images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-6-1.webp", "images/recipes/cutlets-green-lentils-rice/cutlets-green-lentils-rice-6-2.webp"]'::jsonb);

SELECT pg_temp.attach_recipe_step_photo('millet-porridge', 1, to_jsonb('images/recipes/millet-porridge/millet-porridge-1.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('millet-porridge', 2, '["images/recipes/millet-porridge/millet-porridge-2-1.webp", "images/recipes/millet-porridge/millet-porridge-2-2.webp"]'::jsonb);
SELECT pg_temp.attach_recipe_step_photo('millet-porridge', 3, '["images/recipes/millet-porridge/millet-porridge-3-1.webp", "images/recipes/millet-porridge/millet-porridge-3-2.webp"]'::jsonb);

SELECT pg_temp.attach_recipe_step_photo('chicken-green-lentils-tomato', 1, to_jsonb('images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-1.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('chicken-green-lentils-tomato', 2, to_jsonb('images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-2.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('chicken-green-lentils-tomato', 3, to_jsonb('images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-3.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('chicken-green-lentils-tomato', 4, to_jsonb('images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-4.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('chicken-green-lentils-tomato', 5, to_jsonb('images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-5.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('chicken-green-lentils-tomato', 6, to_jsonb('images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-6.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('chicken-green-lentils-tomato', 7, to_jsonb('images/recipes/chicken-green-lentils-tomato/chicken-green-lentils-tomato-7.webp'::text));

SELECT pg_temp.attach_recipe_step_photo('cutlets-chicken-red-lentils', 1, '["images/recipes/cutlets-chicken-red-lentils/cutlets-chicken-red-lentils-1-1.webp", "images/recipes/cutlets-chicken-red-lentils/cutlets-chicken-red-lentils-1-2.webp"]'::jsonb);
SELECT pg_temp.attach_recipe_step_photo('cutlets-chicken-red-lentils', 3, to_jsonb('images/recipes/cutlets-chicken-red-lentils/cutlets-chicken-red-lentils-3.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('cutlets-chicken-red-lentils', 4, to_jsonb('images/recipes/cutlets-chicken-red-lentils/cutlets-chicken-red-lentils-4.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('cutlets-chicken-red-lentils', 5, to_jsonb('images/recipes/cutlets-chicken-red-lentils/cutlets-chicken-red-lentils-5.webp'::text));

SELECT pg_temp.attach_recipe_step_photo('salad-warm-eggplant-vegetables', 1, '["images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-1-1.webp", "images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-1-2.webp"]'::jsonb);
SELECT pg_temp.attach_recipe_step_photo('salad-warm-eggplant-vegetables', 3, to_jsonb('images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-3.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('salad-warm-eggplant-vegetables', 4, to_jsonb('images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-4.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('salad-warm-eggplant-vegetables', 5, to_jsonb('images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-5.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('salad-warm-eggplant-vegetables', 6, to_jsonb('images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-6.webp'::text));
SELECT pg_temp.attach_recipe_step_photo('salad-warm-eggplant-vegetables', 7, to_jsonb('images/recipes/salad-warm-eggplant-vegetables/salad-warm-eggplant-vegetables-7.webp'::text));

COMMIT;
