-- Убрать плейсхолдеры у шагов без переданных фото.
-- photo=true отображает пустой блок «Фото шага»; отсутствие поля не рендерится.

BEGIN;

DO $guard$
DECLARE
  step_count INTEGER;
  step_3_photo JSONB;
  step_6_photo JSONB;
  step_7_photo JSONB;
BEGIN
  SELECT
    jsonb_array_length(steps),
    steps->2->'photo',
    steps->5->'photo',
    steps->6->'photo'
  INTO step_count, step_3_photo, step_6_photo, step_7_photo
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

  IF step_3_photo IS DISTINCT FROM 'true'::jsonb
     OR step_6_photo IS DISTINCT FROM 'true'::jsonb
     OR step_7_photo IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'Expected photo placeholders on steps 3, 6, and 7';
  END IF;
END $guard$;

UPDATE recipes AS r
SET
  steps = (
    SELECT jsonb_agg(
      CASE
        WHEN source.step_no IN (3, 6, 7) AND jsonb_typeof(source.step) = 'object'
          THEN source.step - 'photo'
        ELSE source.step
      END
      ORDER BY source.step_no
    )
    FROM jsonb_array_elements(r.steps) WITH ORDINALITY AS source(step, step_no)
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
  steps->2->'photo' AS step_3_photo,
  steps->5->'photo' AS step_6_photo,
  steps->6->'photo' AS step_7_photo
FROM recipes
WHERE id = 'toast-sardines-roasted-tomatoes';
