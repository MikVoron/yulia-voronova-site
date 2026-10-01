-- Фото для «Тосты с сардинами и печёными томатами».
-- cover/start/final — системные медиа; нумерованные файлы — фото шагов.
-- Рецепт остаётся неопубликованным: публикация не была запрошена.

BEGIN;

DO $guard$
DECLARE
  step_count INTEGER;
  existing_photo TEXT;
BEGIN
  SELECT jsonb_array_length(steps), photo
  INTO step_count, existing_photo
  FROM recipes
  WHERE id = 'toast-sardines-roasted-tomatoes'
    AND name = 'Тосты с сардинами и печёными томатами'
    AND cat = 'breakfasts';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expected recipe toast-sardines-roasted-tomatoes was not found';
  END IF;

  IF step_count <> 7 THEN
    RAISE EXCEPTION 'Expected 7 recipe steps, found %', step_count;
  END IF;

  IF existing_photo IS NOT NULL THEN
    RAISE EXCEPTION 'Recipe already has a cover photo: %', existing_photo;
  END IF;
END $guard$;

UPDATE recipes AS r
SET
  photo = 'images/recipes/toast-sardines-roasted-tomatoes/toast-sardines-roasted-tomatoes-cover.webp',
  steps = (
    WITH step_photos(step_no, photo_value) AS (
      VALUES
        (1, to_jsonb('images/recipes/toast-sardines-roasted-tomatoes/toast-sardines-roasted-tomatoes-1.webp'::text)),
        (2, to_jsonb('images/recipes/toast-sardines-roasted-tomatoes/toast-sardines-roasted-tomatoes-2.webp'::text)),
        (4, to_jsonb('images/recipes/toast-sardines-roasted-tomatoes/toast-sardines-roasted-tomatoes-4.webp'::text)),
        (5, '["images/recipes/toast-sardines-roasted-tomatoes/toast-sardines-roasted-tomatoes-5.1.webp", "images/recipes/toast-sardines-roasted-tomatoes/toast-sardines-roasted-tomatoes-5.2.webp"]'::jsonb)
    )
    SELECT jsonb_agg(
      CASE
        WHEN mapped.photo_value IS NULL THEN source.step
        WHEN jsonb_typeof(source.step) = 'object'
          THEN (source.step - 'photo') || jsonb_build_object('photo', mapped.photo_value)
        WHEN jsonb_typeof(source.step) = 'string'
          THEN jsonb_build_object('text', source.step #>> '{}', 'photo', mapped.photo_value)
        ELSE source.step
      END
      ORDER BY source.step_no
    )
    FROM jsonb_array_elements(r.steps) WITH ORDINALITY AS source(step, step_no)
    LEFT JOIN step_photos AS mapped ON mapped.step_no = source.step_no
  ),
  updated_at = now()
WHERE r.id = 'toast-sardines-roasted-tomatoes'
  AND r.name = 'Тосты с сардинами и печёными томатами'
  AND r.cat = 'breakfasts';

COMMIT;

SELECT
  id,
  is_published,
  photo,
  jsonb_array_length(steps) AS step_count,
  steps->0->'photo' AS step_1_photo,
  steps->1->'photo' AS step_2_photo,
  steps->3->'photo' AS step_4_photo,
  steps->4->'photo' AS step_5_photos,
  steps->2->'photo' AS step_3_photo,
  steps->5->'photo' AS step_6_photo,
  steps->6->'photo' AS step_7_photo
FROM recipes
WHERE id = 'toast-sardines-roasted-tomatoes';
