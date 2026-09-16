-- Фото для «Куриные наггетсы в кукурузной панировке».
-- Все пути соответствуют фактически сконвертированным пользовательским WebP.
-- cover/start/final рендерятся фронтендом отдельно; в steps назначены только шаговые фото.

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM recipes WHERE id = 'cutlets-chicken-nuggets-cornflakes'
  ) THEN
    RAISE EXCEPTION 'Recipe cutlets-chicken-nuggets-cornflakes is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM recipes
    WHERE id = 'cutlets-chicken-nuggets-cornflakes'
      AND photo IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Recipe cutlets-chicken-nuggets-cornflakes already has a cover photo';
  END IF;

  IF EXISTS (
    SELECT 1 FROM recipes
    WHERE id = 'cutlets-chicken-nuggets-cornflakes'
      AND jsonb_array_length(steps) <> 8
  ) THEN
    RAISE EXCEPTION 'Recipe cutlets-chicken-nuggets-cornflakes has unexpected step count';
  END IF;
END $guard$;

UPDATE recipes
SET
  photo = 'images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-cover.webp',
  steps = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              steps,
              '{0,photo}',
              to_jsonb('images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-1.webp'::text),
              true
            ),
            '{1,photo}',
            to_jsonb('images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-2.webp'::text),
            true
          ),
          '{3,photo}',
          '["images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-4.1.webp", "images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-4.2.webp"]'::jsonb,
          true
        ),
        '{4,photo}',
        to_jsonb('images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-5.webp'::text),
        true
      ),
      '{5,photo}',
      to_jsonb('images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-6.webp'::text),
      true
    ),
    '{6,photo}',
    to_jsonb('images/recipes/cutlets-chicken-nuggets-cornflakes/cutlets-chicken-nuggets-cornflakes-7.webp'::text),
    true
  ),
  updated_at = now()
WHERE id = 'cutlets-chicken-nuggets-cornflakes';

COMMIT;

SELECT id, photo, steps->0->'photo' AS step_1_photo,
       steps->1->'photo' AS step_2_photo,
       steps->3->'photo' AS step_4_photo,
       steps->4->'photo' AS step_5_photo,
       steps->5->'photo' AS step_6_photo,
       steps->6->'photo' AS step_7_photo
FROM recipes
WHERE id = 'cutlets-chicken-nuggets-cornflakes';
